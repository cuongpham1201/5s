import { NextResponse, type NextRequest } from "next/server";
import { listAreasByDepartmentCode } from "@/lib/sharepoint/area-service";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { processSubmissionUpload, type UploadPhotoInput } from "@/lib/sharepoint/submission-upload-service";
import { vnDateKey } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTOS = 20;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

interface MetaPhoto {
  seqNo: number;
  capturedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}
interface SyncMeta {
  submissionId: string;
  departmentCode: string;
  areaCode: string;
  areaName: string;
  reporterName: string;
  reporterEmail: string;
  submittedAt: string;
  queueId?: string;
  attemptCount?: number;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  photos: MetaPhoto[];
}

/**
 * POST /api/sync/submission (multipart/form-data)
 * fields: meta=<JSON SyncMeta>, original_<seq>=<blob>, watermarked_<seq>=<blob>
 * Server-side upload to SharePoint (app-only Graph). Graph token never leaves server.
 */
/** Structured error response (client stores message in queue.lastError). */
function fail(errorCode: string, message: string, status: number) {
  return NextResponse.json({ ok: false, errorCode, message, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const me = await resolveRequestUser(req);
  const sessionEmail = me?.email?.toLowerCase();
  if (!sessionEmail) return fail("UNAUTHORIZED", "Chưa đăng nhập", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_MULTIPART", "multipart/form-data bắt buộc", 400);
  }

  let meta: SyncMeta;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return fail("BAD_META", "meta JSON không hợp lệ", 400);
  }

  // --- validation ---
  if (!meta.submissionId || !meta.departmentCode || !meta.areaCode) {
    return fail("MISSING_META", "thiếu submissionId/departmentCode/areaCode", 400);
  }
  if ((meta.reporterEmail ?? "").toLowerCase() !== sessionEmail) {
    return fail("EMAIL_MISMATCH", "email không khớp người dùng đăng nhập", 403);
  }
  if (!Array.isArray(meta.photos) || meta.photos.length === 0) {
    return fail("NO_PHOTOS", "cần ít nhất 1 ảnh", 400);
  }
  if (meta.photos.length > MAX_PHOTOS) {
    return fail("TOO_MANY_PHOTOS", `tối đa ${MAX_PHOTOS} ảnh mỗi lần gửi`, 400);
  }
  if (!me?.departmentResolved || !me.departmentCode) {
    return fail("DEPT_UNRESOLVED", "chưa xác định được phòng ban của bạn", 400);
  }
  if (meta.departmentCode !== me.departmentCode) {
    return fail("DEPT_MISMATCH", `không thể gửi cho phòng ban khác (${meta.departmentCode} ≠ ${me.departmentCode})`, 403);
  }
  try {
    const deptAreas = await listAreasByDepartmentCode(me.departmentCode);
    if (deptAreas.length > 0 && !deptAreas.some((a) => a.code === meta.areaCode)) {
      return fail("AREA_NOT_IN_DEPT", `khu vực ${meta.areaCode} không thuộc phòng ban ${me.departmentCode}`, 403);
    }
  } catch {
    // Non-fatal: if the area list can't be read, proceed (area is a label).
  }

  // Collect photo blobs.
  const photos: UploadPhotoInput[] = [];
  for (const mp of meta.photos) {
    const orig = form.get(`original_${mp.seqNo}`);
    const wm = form.get(`watermarked_${mp.seqNo}`);
    if (!(orig instanceof Blob) || !(wm instanceof Blob)) {
      return fail("MISSING_FILE", `thiếu file ảnh cho seq ${mp.seqNo}`, 400);
    }
    if ((orig.type && !ALLOWED_MIME.has(orig.type)) || (wm.type && !ALLOWED_MIME.has(wm.type))) {
      return fail("BAD_MIME", `loại ảnh không hợp lệ (${orig.type || "?"}/${wm.type || "?"})`, 400);
    }
    photos.push({
      seqNo: mp.seqNo,
      capturedAt: mp.capturedAt ?? meta.submittedAt,
      latitude: mp.latitude ?? null,
      longitude: mp.longitude ?? null,
      address: mp.address ?? null,
      original: await orig.arrayBuffer(),
      watermarked: await wm.arrayBuffer(),
      contentType: wm.type || "image/jpeg",
    });
  }

  const t0 = Date.now();
  console.warn("[5S_SYNC_TRACE]", "server.received", {
    submissionId: meta.submissionId, departmentCode: meta.departmentCode, areaCode: meta.areaCode,
    photoCount: photos.length, bytes: photos.reduce((s, p) => s + p.original.byteLength + p.watermarked.byteLength, 0),
  });
  try {
    const result = await processSubmissionUpload({
      submissionId: meta.submissionId,
      departmentCode: meta.departmentCode,
      areaCode: meta.areaCode,
      areaName: meta.areaName ?? meta.areaCode,
      reporterName: meta.reporterName ?? "",
      reporterEmail: sessionEmail,
      submittedAt: meta.submittedAt || new Date().toISOString(),
      submissionDate: vnDateKey(new Date(meta.submittedAt || Date.now())),
      latitude: meta.latitude ?? null,
      longitude: meta.longitude ?? null,
      address: meta.address ?? null,
      photos,
      queueId: meta.queueId,
      attemptCount: meta.attemptCount,
    });
    console.warn("[5S_SYNC_TRACE]", "server.done", { submissionId: meta.submissionId, syncStatus: result.syncStatus, uploaded: result.photos.length, durationMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = (e as Error).message ?? "lỗi không xác định";
    // Classify for the client lastError (no secrets — messages are app-generated).
    const code = /không hợp lệ|JPEG|PNG|WEBP/i.test(msg) ? "IMAGE_INVALID"
      : /toàn vẹn|byte/i.test(msg) ? "VERIFY_FAILED"
      : /provision|list .* chưa/i.test(msg) ? "LIST_MISSING"
      : /Graph|drive|thư viện|PUT|upload/i.test(msg) ? "GRAPH_UPLOAD_FAILED"
      : "UPLOAD_FAILED";
    console.warn("[5S_SYNC_TRACE]", "server.failed", { submissionId: meta.submissionId, errorCode: code, durationMs: Date.now() - t0, error: msg });
    return NextResponse.json({ ok: false, syncStatus: "failed", errorCode: code, message: msg, error: msg }, { status: 502 });
  }
}
