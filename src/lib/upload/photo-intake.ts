/**
 * Shared intake for the primary upload endpoints (Phase R1.1):
 *   POST /api/upload/photos       (multipart — main path)
 *   POST /api/upload/photos-json  (base64 fallback — iOS Safari, where multipart
 *                                  fetch can throw "Load failed" before reaching
 *                                  the server; its removal in R1 broke iPhone)
 * One validation + orchestration path; only byte-pair resolution differs.
 * Milestones log ALWAYS (ulogAlways) — gated tracing left incidents invisible.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { uploadSubmissionPhotos, type PhotoUploadResult } from "@/lib/sharepoint/submission-upload-service";
import { resolveWorkflowKind } from "@/lib/sharepoint/workflow-kind";
import { canCreateAudit } from "@/lib/auth/audit-guard";
import { listAreasByDepartmentCode } from "@/lib/areas/area-source";
import { vnDateKey } from "@/lib/sharepoint/report-service";
import { ulogAlways } from "@/lib/debug/upload-log";

export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTOS = 20;

export interface UploadMetaIn {
  submissionId?: string;
  /** audit: phòng BỊ kiểm tra; daily: phòng người gửi. */
  departmentCode?: string;
  departmentName?: string;
  areaCode?: string;
  areaName?: string;
  checkItemCode?: string;
  checkItemName?: string;
  submittedAt?: string;
  reporterName?: string;
  photos?: Array<{ seqNo: number; capturedAt?: string; latitude?: number | null; longitude?: number | null; address?: string | null; sTag?: string; photoKind?: string; violationNote?: string; violatorEmail?: string; violatorName?: string; linkedSeqNo?: number }>;
  /** "3s" = Thực hành 3S; mặc định "daily". */
  submissionType?: string;
  clientParts?: Array<{ seqNo: number; originalSize: number; watermarkedSize: number }>;
  requestId?: string;
  platform?: string;
}

/** Resolved byte pair for one seq (null = files entirely absent for this seq). */
export interface ResolvedPair {
  original: ArrayBuffer | null;
  watermarked: ArrayBuffer | null;
  type: string;
}

function errRes(errorCode: string, message: string, status: number) {
  return NextResponse.json({ ok: false, submissionId: null, uploadedPhotoCount: 0, failedPhotoCount: 0, photos: [], errors: [{ seqNo: 0, errorCode, message }], errorCode, message }, { status });
}

export async function runPhotoUploadIntake(
  req: NextRequest,
  meta: UploadMetaIn | null,
  pairBySeq: (seqNo: number) => ResolvedPair | null,
  mode: "multipart" | "json",
): Promise<NextResponse> {
  const rid = meta?.requestId ?? "-";
  const tEntry = Date.now();

  // 1) Auth (server-trusted identity).
  const me = await resolveRequestUser(req);
  if (!me?.email) {
    ulogAlways("server.reject", { rid, mode, errorCode: "AUTH_REQUIRED" });
    return errRes("AUTH_REQUIRED", "Chưa đăng nhập.", 401);
  }
  if (!meta) return errRes("NO_PHOTOS", "meta JSON không hợp lệ.", 400);

  ulogAlways("server.entry", {
    rid, mode, submissionId: meta.submissionId, declared: meta.photos?.length ?? 0,
    email: me.email, dept: me.departmentCode, platform: meta.platform ?? "-",
    attempt: (meta as { attemptCount?: number }).attemptCount ?? null,
    contentLength: Number(req.headers.get("content-length") ?? 0) || null,
  });

  if (!meta.submissionId || !meta.areaCode) return errRes("NO_PHOTOS", "Thiếu submissionId/areaCode.", 400);
  if (!Array.isArray(meta.photos) || meta.photos.length === 0) return errRes("NO_PHOTOS", "Cần ít nhất 1 ảnh.", 400);
  if (meta.photos.length > MAX_PHOTOS) return errRes("NO_PHOTOS", `Tối đa ${MAX_PHOTOS} ảnh mỗi lần gửi.`, 400);

  // 2) Phân loại workflow phía SERVER (Config_CheckItems.WorkflowKind — không tin
  //    submissionType client làm nguồn duy nhất) rồi tách luật DAILY vs AUDIT.
  //    Luật DÙNG CHUNG với sync-intake: resolveWorkflowKind + canCreateAudit.
  const canAudit = canCreateAudit({ email: me.email });
  const wf = await resolveWorkflowKind({ checkItemCode: meta.checkItemCode, submissionType: meta.submissionType }, canAudit);
  // Phòng ban của PHIẾU: audit = phòng bị kiểm tra (client chọn); daily = phòng người gửi (server).
  const targetDept = wf.kind === "audit" ? (meta.departmentCode ?? "") : (me.departmentCode ?? "");
  let reporterDeptWarning: string | null = null;
  const wflog = (extra: Record<string, unknown>) => ulogAlways("server.workflow", {
    rid, pipeline: `upload-photos:${mode}`, submissionId: meta.submissionId,
    submissionType: meta.submissionType ?? null, checkItemCode: meta.checkItemCode ?? null,
    resolvedWorkflowKind: wf.kind, kindSource: wf.source,
    reporterDepartmentCode: me.departmentCode ?? null, targetDepartmentCode: targetDept || null,
    ...extra,
  });

  if (wf.kind === "audit") {
    // AUDIT: cho phép phòng bị kiểm tra khác phòng người kiểm tra. Chặn theo QUYỀN.
    if (!canAudit) {
      wflog({ validationBranch: "audit", returnedErrorCode: "AUDIT_FORBIDDEN" });
      return errRes("AUDIT_FORBIDDEN", "Bạn không có quyền tạo Audit 5S.", 403);
    }
    if (!targetDept) {
      wflog({ validationBranch: "audit", returnedErrorCode: "NO_PHOTOS" });
      return errRes("NO_PHOTOS", "Thiếu phòng ban bị kiểm tra (departmentCode).", 400);
    }
    if (!me.departmentResolved || !me.departmentCode) {
      // KHÔNG chặn — chỉ warning + vẫn cố lưu snapshot (null).
      reporterDeptWarning = "reporter department chưa resolve";
    }
    // Area phải thuộc PHÒNG BỊ KIỂM TRA (hỗ trợ khu vực đa phòng — Departments CSV).
    try {
      const deptAreas = await listAreasByDepartmentCode(targetDept);
      if (deptAreas.length > 0 && !deptAreas.some((a) => a.code === meta.areaCode)) {
        wflog({ validationBranch: "audit", returnedErrorCode: "AREA_NOT_IN_DEPT", areaCode: meta.areaCode });
        return errRes("AREA_NOT_IN_DEPT", `Khu vực ${meta.areaCode} không thuộc phòng ban bị kiểm tra ${targetDept}.`, 403);
      }
    } catch { /* area list optional */ }
    wflog({ validationBranch: "audit", returnedErrorCode: null, reporterDeptWarning });
  } else {
    // DAILY: bắt buộc resolve phòng người gửi + phiếu đúng phòng + area thuộc phòng đó.
    if (!me.departmentResolved || !me.departmentCode) {
      wflog({ validationBranch: "daily", returnedErrorCode: "PROFILE_UNRESOLVED" });
      return errRes("PROFILE_UNRESOLVED", "Chưa xác định được phòng ban của tài khoản.", 403);
    }
    if (meta.departmentCode && meta.departmentCode !== me.departmentCode) {
      wflog({ validationBranch: "daily", returnedErrorCode: "DEPT_MISMATCH" });
      return errRes("DEPT_MISMATCH", `Không thể gửi cho phòng ban khác (${meta.departmentCode} ≠ ${me.departmentCode}).`, 403);
    }
    try {
      const deptAreas = await listAreasByDepartmentCode(me.departmentCode);
      if (deptAreas.length > 0 && !deptAreas.some((a) => a.code === meta.areaCode)) {
        wflog({ validationBranch: "daily", returnedErrorCode: "AREA_NOT_IN_DEPT", areaCode: meta.areaCode });
        return errRes("AREA_NOT_IN_DEPT", `Khu vực ${meta.areaCode} không thuộc phòng ban ${me.departmentCode}.`, 403);
      }
    } catch { /* area list optional */ }
    wflog({ validationBranch: "daily", returnedErrorCode: null });
  }

  // 3) Resolve byte pairs; per-photo problems become per-photo errors (BAD_FILE /
  // TRANSPORT_TRUNCATED), never a whole-request failure while other photos exist.
  const clientBySeq = new Map((meta.clientParts ?? []).map((c) => [c.seqNo, c]));
  const serverParts: Array<{ seqNo: number; originalSize: number; watermarkedSize: number }> = [];
  const photos: Array<{ seqNo: number; capturedAt: string; latitude: number | null; longitude: number | null; address: string | null; original: ArrayBuffer; watermarked: ArrayBuffer; contentType: string; sTag?: string; photoKind?: string; violationNote?: string; violatorEmail?: string; violatorName?: string; linkedSeqNo?: number }> = [];
  const preErrors: PhotoUploadResult["errors"] = [];
  for (const mp of meta.photos) {
    const pair = pairBySeq(mp.seqNo);
    const oSize = pair?.original?.byteLength ?? 0;
    const wSize = pair?.watermarked?.byteLength ?? 0;
    serverParts.push({ seqNo: mp.seqNo, originalSize: oSize, watermarkedSize: wSize });
    if (!pair?.original || !pair.watermarked || oSize === 0 || wSize === 0) {
      const c = clientBySeq.get(mp.seqNo);
      const truncated = !!c && (c.originalSize > 0 || c.watermarkedSize > 0);
      const errorCode = truncated ? "TRANSPORT_TRUNCATED" : "BAD_FILE";
      preErrors.push({
        seqNo: mp.seqNo,
        errorCode,
        message: truncated
          ? `Ảnh #${mp.seqNo}: client gửi orig=${c!.originalSize}/wm=${c!.watermarkedSize} nhưng server nhận orig=${oSize}/wm=${wSize} → mất bytes khi truyền.`
          : `Thiếu/rỗng file ảnh cho seq ${mp.seqNo} (client cũng không có bytes).`,
      });
      ulogAlways("server.photo.reject", { rid, mode, submissionId: meta.submissionId, seq: mp.seqNo, errorCode, oSize, wSize });
      continue;
    }
    const type = pair.type || "image/jpeg";
    if (!ALLOWED_MIME.has(type)) {
      preErrors.push({ seqNo: mp.seqNo, errorCode: "BAD_FILE", message: `Loại ảnh không hợp lệ (${type}).` });
      ulogAlways("server.photo.reject", { rid, mode, submissionId: meta.submissionId, seq: mp.seqNo, errorCode: "BAD_FILE", type });
      continue;
    }
    photos.push({
      seqNo: mp.seqNo, capturedAt: mp.capturedAt ?? meta.submittedAt ?? new Date().toISOString(),
      latitude: mp.latitude ?? null, longitude: mp.longitude ?? null, address: mp.address ?? null,
      original: pair.original, watermarked: pair.watermarked, contentType: type,
      sTag: mp.sTag, photoKind: mp.photoKind, violationNote: mp.violationNote, violatorEmail: mp.violatorEmail, violatorName: mp.violatorName, linkedSeqNo: mp.linkedSeqNo,
    });
  }
  const diag = { clientParts: meta.clientParts ?? [], serverParts };

  if (photos.length === 0) {
    ulogAlways("server.failed", { rid, mode, submissionId: meta.submissionId, uploaded: 0, failed: preErrors.length, errorCode: preErrors[0]?.errorCode ?? "NO_PHOTOS" });
    return NextResponse.json({ ok: false, submissionId: meta.submissionId, uploadedPhotoCount: 0, failedPhotoCount: preErrors.length, photos: [], errors: preErrors, diag, errorCode: preErrors[0]?.errorCode ?? "NO_PHOTOS", message: preErrors[0]?.message ?? "Không có file ảnh hợp lệ." }, { status: 400 });
  }

  // 4) Upload (per-photo, idempotent by SubmissionId/PhotoId — retries never duplicate).
  try {
    const submittedAt = meta.submittedAt || new Date().toISOString();
    const result = await uploadSubmissionPhotos({
      submissionId: meta.submissionId,
      // audit: phòng BỊ kiểm tra; daily: phòng người gửi (server-trusted).
      departmentCode: targetDept,
      departmentName: meta.departmentName ?? null,
      areaCode: meta.areaCode,
      areaName: meta.areaName ?? meta.areaCode,
      reporterName: meta.reporterName ?? me.displayName ?? "",
      reporterEmail: me.email,
      // Snapshot phòng ban NGƯỜI KIỂM TRA — tách khỏi DepartmentCode.
      reporterDepartmentCode: me.departmentCode ?? null,
      reporterDepartmentName: me.departmentName ?? null,
      workflowKind: wf.kind,
      submittedAt,
      submissionDate: vnDateKey(new Date(submittedAt)),
      latitude: photos[0]?.latitude ?? null,
      longitude: photos[0]?.longitude ?? null,
      address: photos[0]?.address ?? null,
      submissionType: wf.kind === "audit" ? "3s" : "daily",
      photos,
    });
    const errors = [...preErrors, ...result.errors];
    const body = { ...result, failedPhotoCount: errors.length, errors, diag, workflowKind: wf.kind, ...(reporterDeptWarning ? { warning: reporterDeptWarning } : {}) };
    ulogAlways(body.ok ? "server.done" : "server.failed", {
      rid, mode, submissionId: meta.submissionId, uploaded: body.uploadedPhotoCount,
      failed: body.failedPhotoCount, errors: errors.map((e) => `${e.seqNo}:${e.errorCode}`),
      totalMs: Date.now() - tEntry, responseBytes: JSON.stringify(body).length,
    });
    // ≥1 photo stored → ok:true. 0 stored → ok:false (business result, NOT 502).
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    ulogAlways("server.failed", { rid, mode, submissionId: meta.submissionId, step: "orchestrator", message: (e as Error)?.message ?? "error" });
    return errRes("SERVER_ERROR", (e as Error)?.message ?? "Lỗi máy chủ.", 500);
  }
}
