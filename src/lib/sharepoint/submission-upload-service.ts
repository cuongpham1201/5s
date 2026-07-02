/**
 * Submission upload orchestration (Phase 3.0) — app-only Graph writes.
 *
 * Order: create/patch Data_Submissions header (SyncStatus=uploading) → upload
 * photo pairs to the 5S library → create/patch Data_SubmissionPhotos rows →
 * patch header SyncStatus=uploaded → write Data_SyncLogs. On failure the header
 * is marked "failed" and a failed sync log is written; client keeps local blobs.
 *
 * All writes are idempotent (upsert by SubmissionId / PhotoId) so retries with
 * the same SubmissionId never duplicate rows and overwrite the same files.
 */
import { DATA_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, getAllListItems, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { ensureSubmissionFolder, uploadPhotoPair, downloadFromImgPath } from "./photo-upload-service";
import { detectImageType, edgeHex, bytesRoundTripOk } from "./image-bytes";
import { trace } from "@/lib/debug/trace";
import { ulog } from "@/lib/debug/upload-log";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { SubmissionStatus, SyncStatus } from "@/types/sharepoint";

const ilog = (action: string, data: Record<string, unknown>) => trace("[5S_IMAGE_DEBUG]", action, data);

export interface UploadPhotoInput {
  seqNo: number;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  original: ArrayBuffer;
  watermarked: ArrayBuffer;
  contentType?: string;
}

export interface UploadSubmissionInput {
  submissionId: string;
  departmentCode: string;
  areaCode: string;
  areaName: string;
  reporterName: string;
  reporterEmail: string;
  submittedAt: string; // ISO
  submissionDate: string; // YYYY-MM-DD (VN)
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  status?: SubmissionStatus;
  photos: UploadPhotoInput[];
  queueId?: string;
  attemptCount?: number;
}

export interface UploadResult {
  submissionId: string;
  syncStatus: SyncStatus;
  photos: Array<{ seqNo: number; watermarkedPath: string; originalPath: string }>;
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  return { client, siteId: site.id };
}

async function requireList(client: SharePointGraphClient, siteId: string, name: string): Promise<string> {
  const id = await findListId(client, siteId, name);
  if (!id) throw new Error(`List ${name} chưa tồn tại — chạy provision trước.`);
  return id;
}

async function findItemIdByField(
  client: SharePointGraphClient,
  siteId: string,
  listId: string,
  fieldKey: string,
  value: string,
): Promise<string | null> {
  // PAGINATED lookup (P0): a single $top=999 page missed items ≥ #1000, so the
  // upsert POSTed a DUPLICATE row instead of PATCHing the existing one.
  const items = await getAllListItems<GraphListItem>(
    client,
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  const hit = items.find((it) => (it.fields as Record<string, unknown>)[fieldKey] === value);
  return hit?.id ?? null;
}

// ---- header ----

export async function upsertSubmissionHeader(
  input: Pick<
    UploadSubmissionInput,
    | "submissionId" | "departmentCode" | "areaCode" | "areaName" | "reporterName"
    | "reporterEmail" | "submittedAt" | "submissionDate" | "latitude" | "longitude" | "address"
  > & { photoCount: number; status: SubmissionStatus; syncStatus: SyncStatus },
): Promise<void> {
  const { client, siteId } = await ctx();
  const listId = await requireList(client, siteId, DATA_LISTS.submissions);
  const fields = {
    Title: input.submissionId,
    SubmissionId: input.submissionId,
    DepartmentCode: input.departmentCode,
    AreaCode: input.areaCode,
    AreaName: input.areaName,
    ReporterName: input.reporterName,
    ReporterEmail: input.reporterEmail,
    PhotoCount: input.photoCount,
    SubmissionDate: input.submissionDate,
    SubmittedAt: input.submittedAt,
    Latitude: input.latitude,
    Longitude: input.longitude,
    Address: input.address,
    Status: input.status,
    SyncStatus: input.syncStatus,
  };
  const existingId = await findItemIdByField(client, siteId, listId, "SubmissionId", input.submissionId);
  if (existingId) {
    await client.patch(`/sites/${siteId}/lists/${listId}/items/${existingId}/fields`, fields);
  } else {
    await client.post(`/sites/${siteId}/lists/${listId}/items`, { fields });
  }
}

export async function updateSubmissionSyncStatus(submissionId: string, status: SyncStatus): Promise<void> {
  const { client, siteId } = await ctx();
  const listId = await requireList(client, siteId, DATA_LISTS.submissions);
  const id = await findItemIdByField(client, siteId, listId, "SubmissionId", submissionId);
  if (id) await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { SyncStatus: status });
}

// ---- photo rows ----

async function upsertPhotoRow(
  client: SharePointGraphClient,
  siteId: string,
  listId: string,
  rec: {
    photoId: string; submissionId: string; seqNo: number;
    originalPath: string; watermarkedPath: string;
    captureTime: string; latitude: number | null; longitude: number | null; address: string | null;
  },
): Promise<void> {
  const fields = {
    Title: rec.photoId,
    PhotoId: rec.photoId,
    SubmissionId: rec.submissionId,
    SeqNo: rec.seqNo,
    OriginalPhotoUrl: rec.originalPath,
    WatermarkedPhotoUrl: rec.watermarkedPath,
    CaptureTime: rec.captureTime,
    Latitude: rec.latitude,
    Longitude: rec.longitude,
    Address: rec.address,
  };
  const existingId = await findItemIdByField(client, siteId, listId, "PhotoId", rec.photoId);
  if (existingId) {
    await client.patch(`/sites/${siteId}/lists/${listId}/items/${existingId}/fields`, fields);
  } else {
    await client.post(`/sites/${siteId}/lists/${listId}/items`, { fields });
  }
}

// ---- sync log ----

export async function writeSyncLog(
  queueId: string,
  submissionId: string,
  status: "queued" | "uploading" | "uploaded" | "failed" | "cancelled",
  attemptCount: number,
  message: string,
): Promise<void> {
  try {
    const { client, siteId } = await ctx();
    const listId = await findListId(client, siteId, DATA_LISTS.syncLogs);
    if (!listId) return;
    await client.post(`/sites/${siteId}/lists/${listId}/items`, {
      fields: {
        Title: `${submissionId}-${status}`,
        QueueId: queueId || submissionId,
        SubmissionId: submissionId,
        Status: status,
        AttemptCount: attemptCount,
        Message: message.slice(0, 250),
        Timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Sync logs are best-effort; never fail the upload because of logging.
  }
}

// ---- orchestrator (Phase R1 — simple, per-photo, never throws on photo error) ----

export interface PhotoUploadResult {
  ok: boolean;
  submissionId: string;
  uploadedPhotoCount: number;
  failedPhotoCount: number;
  photos: Array<{ seqNo: number; originalPath: string; watermarkedPath: string }>;
  errors: Array<{ seqNo: number; errorCode: string; message: string }>;
}

/**
 * Upload each photo pair INDEPENDENTLY: detect type → Graph PUT → upsert the
 * Data_SubmissionPhotos row immediately. A failure on one photo records an error
 * for that photo and continues (never fails the whole submission). NO verify
 * download-back, NO base64. Data_SubmissionPhotos is the source of truth; the
 * Data_Submissions header is written best-effort afterwards (optional log only).
 *
 *   uploadedPhotoCount >= 1  → ok:true
 *   uploadedPhotoCount === 0 → ok:false (caller keeps local blobs for retry)
 */
export async function uploadSubmissionPhotos(input: UploadSubmissionInput): Promise<PhotoUploadResult> {
  const queueId = input.queueId ?? input.submissionId;
  const attempt = input.attemptCount ?? 1;
  const { client, siteId } = await ctx();
  const photoListId = await requireList(client, siteId, DATA_LISTS.submissionPhotos);
  const { driveId, folder } = await ensureSubmissionFolder(input.submissionId, input.submittedAt, input.departmentCode);

  const photos: PhotoUploadResult["photos"] = [];
  const errors: PhotoUploadResult["errors"] = [];

  for (const p of input.photos) {
    const oType = detectImageType(p.original);
    const wType = detectImageType(p.watermarked);
    if (!oType || !wType) {
      errors.push({ seqNo: p.seqNo, errorCode: "BAD_FILE", message: `Ảnh #${p.seqNo} không phải JPEG/PNG/WEBP.` });
      ulog("server.failed", { submissionId: input.submissionId, seq: p.seqNo, step: "detect", errorCode: "BAD_FILE" });
      continue;
    }
    let res: Awaited<ReturnType<typeof uploadPhotoPair>>;
    try {
      ulog("server.graph.upload.start", { submissionId: input.submissionId, seq: p.seqNo, originalBytes: p.original.byteLength, watermarkedBytes: p.watermarked.byteLength });
      res = await uploadPhotoPair({
        client, driveId, folder, seqNo: p.seqNo,
        original: p.original, watermarked: p.watermarked,
        originalExt: oType.ext, watermarkedExt: wType.ext, originalType: oType.mime, watermarkedType: wType.mime,
      });
      ulog("server.graph.upload.done", { submissionId: input.submissionId, seq: p.seqNo });
    } catch (ue) {
      errors.push({ seqNo: p.seqNo, errorCode: "GRAPH_UPLOAD_FAILED", message: (ue as Error)?.message ?? "Graph upload lỗi" });
      ulog("server.failed", { submissionId: input.submissionId, seq: p.seqNo, step: "graph.upload", message: (ue as Error)?.message ?? "error" });
      continue;
    }
    const photoId = `${input.submissionId}-P${String(p.seqNo).padStart(2, "0")}`;
    try {
      await upsertPhotoRow(client, siteId, photoListId, {
        photoId, submissionId: input.submissionId, seqNo: p.seqNo,
        originalPath: res.originalPath, watermarkedPath: res.watermarkedPath,
        captureTime: p.capturedAt, latitude: p.latitude, longitude: p.longitude, address: p.address,
      });
      ulog("server.photoRow.upsert.done", { submissionId: input.submissionId, seq: p.seqNo });
    } catch (re) {
      errors.push({ seqNo: p.seqNo, errorCode: "PHOTO_ROW_FAILED", message: (re as Error)?.message ?? "Lưu dòng ảnh lỗi" });
      ulog("server.failed", { submissionId: input.submissionId, seq: p.seqNo, step: "photoRow.upsert", message: (re as Error)?.message ?? "error" });
      continue;
    }
    photos.push({ seqNo: p.seqNo, originalPath: res.originalPath, watermarkedPath: res.watermarkedPath });
  }

  const ok = photos.length > 0;
  // Best-effort header + sync log. Optional metadata only — NEVER source of truth,
  // and a failure here must not change the upload outcome.
  try {
    await upsertSubmissionHeader({
      submissionId: input.submissionId, departmentCode: input.departmentCode, areaCode: input.areaCode,
      areaName: input.areaName, reporterName: input.reporterName, reporterEmail: input.reporterEmail,
      submittedAt: input.submittedAt, submissionDate: input.submissionDate,
      latitude: input.latitude, longitude: input.longitude, address: input.address,
      photoCount: photos.length, status: input.status ?? "complete", syncStatus: ok ? "uploaded" : "failed",
    });
  } catch (he) {
    ulog("server.header:warn", { submissionId: input.submissionId, message: (he as Error)?.message ?? "header optional" });
  }
  await writeSyncLog(queueId, input.submissionId, ok ? "uploaded" : "failed", attempt,
    ok ? `Đã tải ${photos.length} ảnh (${errors.length} lỗi).` : `Không tải được ảnh nào (${errors.length} lỗi).`);

  ulog(ok ? "server.done" : "server.failed", { submissionId: input.submissionId, uploadedPhotoCount: photos.length, failedPhotoCount: errors.length });
  return { ok, submissionId: input.submissionId, uploadedPhotoCount: photos.length, failedPhotoCount: errors.length, photos, errors };
}

// ---- orchestrator (legacy multipart/JSON path via runSyncIntake — DEPRECATED) ----

/** @deprecated Phase R1 replaced this with uploadSubmissionPhotos (per-photo, no
 * verify-download-back). Kept only for the legacy /api/sync/* routes, which the
 * client no longer calls. Do not use in new code. */
export async function processSubmissionUpload(input: UploadSubmissionInput): Promise<UploadResult> {
  const queueId = input.queueId ?? input.submissionId;
  const attempt = input.attemptCount ?? 1;
  const status: SubmissionStatus = input.status ?? "complete";
  let headerCreated = false;
  try {
    await upsertSubmissionHeader({
      submissionId: input.submissionId,
      departmentCode: input.departmentCode,
      areaCode: input.areaCode,
      areaName: input.areaName,
      reporterName: input.reporterName,
      reporterEmail: input.reporterEmail,
      submittedAt: input.submittedAt,
      submissionDate: input.submissionDate,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      photoCount: input.photos.length,
      status,
      syncStatus: "uploading",
    });
    headerCreated = true;
    await writeSyncLog(queueId, input.submissionId, "uploading", attempt, `Bắt đầu tải ${input.photos.length} ảnh.`);

    const { driveId, folder } = await ensureSubmissionFolder(input.submissionId, input.submittedAt, input.departmentCode);
    const { client, siteId } = await ctx();
    const photoListId = await requireList(client, siteId, DATA_LISTS.submissionPhotos);

    const uploaded: UploadResult["photos"] = [];
    for (const p of input.photos) {
      // 1) Detect REAL image type from bytes (refuse mislabeled / non-image).
      const oType = detectImageType(p.original);
      const wType = detectImageType(p.watermarked);
      const oEdge = edgeHex(p.original);
      const wEdge = edgeHex(p.watermarked);
      ilog("upload.detect", {
        submissionId: input.submissionId, seq: p.seqNo,
        originalBytes: p.original.byteLength, originalMime: oType?.mime ?? "UNKNOWN", originalFirst: oEdge.first, originalLast: oEdge.last,
        watermarkedBytes: p.watermarked.byteLength, watermarkedMime: wType?.mime ?? "UNKNOWN", watermarkedFirst: wEdge.first, watermarkedLast: wEdge.last,
      });
      if (!oType || !wType) {
        throw new Error(`Ảnh #${p.seqNo} không hợp lệ (không phải JPEG/PNG/WEBP). Vui lòng chụp lại.`);
      }

      // 2) Upload using the REAL extension + content-type.
      const res = await uploadPhotoPair({
        client, driveId, folder, seqNo: p.seqNo,
        original: p.original, watermarked: p.watermarked,
        originalExt: oType.ext, watermarkedExt: wType.ext,
        originalType: oType.mime, watermarkedType: wType.mime,
      });

      // 3) Integrity check (BEST-EFFORT, non-fatal). A successful Graph PUT means
      //    the bytes are stored; a failed or disagreeing read-back (transient
      //    Graph GET, eventual consistency right after PUT, proxy/Cloudflare
      //    timeout) must NOT fail the whole submission — that was the HTTP_502
      //    that left iPhone uploads stuck despite the file being present. We log a
      //    warning and proceed to record the photo row.
      try {
        const [dlO, dlW] = await Promise.all([
          downloadFromImgPath(client, driveId, res.originalPath),
          downloadFromImgPath(client, driveId, res.watermarkedPath),
        ]);
        const okO = bytesRoundTripOk(p.original, dlO.data) && !!detectImageType(dlO.data);
        const okW = bytesRoundTripOk(p.watermarked, dlW.data) && !!detectImageType(dlW.data);
        ilog("upload.verify", {
          submissionId: input.submissionId, seq: p.seqNo,
          originalUploaded: p.original.byteLength, originalDownloaded: dlO.data.byteLength, originalOk: okO,
          watermarkedUploaded: p.watermarked.byteLength, watermarkedDownloaded: dlW.data.byteLength, watermarkedOk: okW,
        });
        if (!okO || !okW) {
          ilog("upload.verify:warn", { submissionId: input.submissionId, seq: p.seqNo, reason: "byte mismatch after PUT (non-fatal)", originalOk: okO, watermarkedOk: okW });
        }
      } catch (ve) {
        ilog("upload.verify:warn", { submissionId: input.submissionId, seq: p.seqNo, reason: "verify read-back failed (non-fatal)", message: (ve as Error)?.message ?? "error" });
      }

      const photoId = `${input.submissionId}-P${String(p.seqNo).padStart(2, "0")}`;
      await upsertPhotoRow(client, siteId, photoListId, {
        photoId,
        submissionId: input.submissionId,
        seqNo: p.seqNo,
        originalPath: res.originalPath,
        watermarkedPath: res.watermarkedPath,
        captureTime: p.capturedAt,
        latitude: p.latitude,
        longitude: p.longitude,
        address: p.address,
      });
      uploaded.push({ seqNo: p.seqNo, originalPath: res.originalPath, watermarkedPath: res.watermarkedPath });
    }

    // Never mark a submission synced without at least one stored photo row
    // (keeps the Phase-1 reporting rule: "đã chụp" = ≥1 photo line).
    if (uploaded.length === 0) {
      throw new Error("Không có ảnh nào tải lên thành công.");
    }

    await updateSubmissionSyncStatus(input.submissionId, "uploaded");
    await writeSyncLog(queueId, input.submissionId, "uploaded", attempt, `Đã tải ${uploaded.length} ảnh.`);
    return { submissionId: input.submissionId, syncStatus: "uploaded", photos: uploaded };
  } catch (e) {
    const msg = (e as Error)?.message ?? "Lỗi không xác định";
    if (headerCreated) {
      try { await updateSubmissionSyncStatus(input.submissionId, "failed"); } catch { /* ignore */ }
    }
    await writeSyncLog(queueId, input.submissionId, "failed", attempt, msg);
    throw e;
  }
}
