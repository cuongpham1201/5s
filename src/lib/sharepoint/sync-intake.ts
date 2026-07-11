/**
 * Shared submission-intake (Phase 4.x) — used by BOTH the multipart endpoint
 * (/api/sync/submission) and the iOS-safe JSON/base64 fallback
 * (/api/sync/submission-json). Validates identically, then calls the single
 * processSubmissionUpload service. No duplicated upload logic. No schema change.
 */
import { listAreasByDepartmentCode } from "@/lib/areas/area-source";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { processSubmissionUpload, type UploadPhotoInput } from "./submission-upload-service";
import { resolveWorkflowKind } from "./workflow-kind";
import { canCreateAudit } from "@/lib/auth/audit-guard";
import { vnDateKey } from "./report-service";
import { trace } from "@/lib/debug/trace";
import type { NextRequest } from "next/server";

export const MAX_PHOTOS = 20;
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface MetaPhoto {
  seqNo: number;
  capturedAt?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}
export interface SyncMeta {
  submissionId: string;
  departmentCode: string;   // audit: phòng BỊ kiểm tra; daily: phòng người gửi
  departmentName?: string;
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
  /** Client HINT only — server phân loại thật từ checkItemCode/config. */
  submissionType?: string;
  checkItemCode?: string;
  photos: MetaPhoto[];
}

/** One decoded photo pair, provided by the caller (from multipart or base64). */
export interface IntakePair {
  original: ArrayBuffer;
  watermarked: ArrayBuffer;
  type: string;
}

export interface IntakeResult {
  status: number;
  body: Record<string, unknown>;
}

function fail(errorCode: string, message: string, status: number): IntakeResult {
  return { status, body: { ok: false, errorCode, message, error: message } };
}

/**
 * Run validation + upload. `pairBySeq` returns the decoded pair for a seqNo, or
 * null if the file is missing. `mode` is only for logging.
 */
export async function runSyncIntake(
  req: NextRequest,
  meta: SyncMeta | null,
  pairBySeq: (seqNo: number) => IntakePair | null,
  mode: "multipart" | "json",
): Promise<IntakeResult> {
  const me = await resolveRequestUser(req);
  const sessionEmail = me?.email?.toLowerCase();
  if (!sessionEmail) return fail("UNAUTHORIZED", "Chưa đăng nhập", 401);
  if (!meta) return fail("BAD_META", "meta JSON không hợp lệ", 400);

  if (!meta.submissionId || !meta.departmentCode || !meta.areaCode) return fail("MISSING_META", "thiếu submissionId/departmentCode/areaCode", 400);
  if ((meta.reporterEmail ?? "").toLowerCase() !== sessionEmail) return fail("EMAIL_MISMATCH", "email không khớp người dùng đăng nhập", 403);
  if (!Array.isArray(meta.photos) || meta.photos.length === 0) return fail("NO_PHOTOS", "cần ít nhất 1 ảnh", 400);
  if (meta.photos.length > MAX_PHOTOS) return fail("TOO_MANY_PHOTOS", `tối đa ${MAX_PHOTOS} ảnh mỗi lần gửi`, 400);

  // Phân loại workflow phía SERVER (không tin submissionType client làm nguồn duy nhất).
  const canAudit = canCreateAudit({ email: me?.email });
  const wf = await resolveWorkflowKind({ checkItemCode: meta.checkItemCode, submissionType: meta.submissionType }, canAudit);
  // Phòng ban của người kiểm tra (reporter) — snapshot; audit KHÔNG bắt buộc resolve.
  const reporterDeptCode = me?.departmentCode ?? null;
  const reporterDeptName = me?.departmentName ?? null;
  let reporterDeptWarning: string | null = null;

  if (wf.kind === "audit") {
    // AUDIT: cho phép phòng bị kiểm tra khác phòng người gửi. Chỉ chặn theo QUYỀN.
    if (!canAudit) return fail("AUDIT_FORBIDDEN", "bạn không có quyền tạo Audit 5S", 403);
    if (!reporterDeptCode) {
      reporterDeptWarning = "reporter department chưa resolve";
      trace("[5S_SYNC_TRACE]", "audit.reporter_dept_unresolved", { submissionId: meta.submissionId, reporterEmail: sessionEmail });
    }
    // Area phải thuộc PHÒNG BỊ KIỂM TRA (hỗ trợ khu vực đa phòng qua Departments CSV).
    try {
      const deptAreas = await listAreasByDepartmentCode(meta.departmentCode);
      if (deptAreas.length > 0 && !deptAreas.some((a) => a.code === meta.areaCode)) {
        return fail("AREA_NOT_IN_DEPT", `khu vực ${meta.areaCode} không thuộc phòng ban bị kiểm tra ${meta.departmentCode}`, 403);
      }
    } catch { /* area list optional */ }
  } else {
    // DAILY: phòng người gửi phải resolve + phiếu phải đúng phòng người gửi + area thuộc phòng đó.
    if (!me?.departmentResolved || !me.departmentCode) return fail("DEPT_UNRESOLVED", "chưa xác định được phòng ban của bạn", 400);
    if (meta.departmentCode !== me.departmentCode) return fail("DEPT_MISMATCH", `không thể gửi cho phòng ban khác (${meta.departmentCode} ≠ ${me.departmentCode})`, 403);
    try {
      const deptAreas = await listAreasByDepartmentCode(me.departmentCode);
      if (deptAreas.length > 0 && !deptAreas.some((a) => a.code === meta.areaCode)) {
        return fail("AREA_NOT_IN_DEPT", `khu vực ${meta.areaCode} không thuộc phòng ban ${me.departmentCode}`, 403);
      }
    } catch { /* area list optional */ }
  }

  const photos: UploadPhotoInput[] = [];
  for (const mp of meta.photos) {
    const pair = pairBySeq(mp.seqNo);
    if (!pair) return fail("MISSING_FILE", `thiếu file ảnh cho seq ${mp.seqNo}`, 400);
    if ((pair.type && !ALLOWED_MIME.has(pair.type))) return fail("BAD_MIME", `loại ảnh không hợp lệ (${pair.type || "?"})`, 400);
    photos.push({
      seqNo: mp.seqNo,
      capturedAt: mp.capturedAt ?? meta.submittedAt,
      latitude: mp.latitude ?? null,
      longitude: mp.longitude ?? null,
      address: mp.address ?? null,
      original: pair.original,
      watermarked: pair.watermarked,
      contentType: pair.type || "image/jpeg",
    });
  }

  const t0 = Date.now();
  const totalBytes = photos.reduce((s, p) => s + p.original.byteLength + p.watermarked.byteLength, 0);
  trace("[5S_SYNC_TRACE]", "server.received", { mode, submissionId: meta.submissionId, photoCount: photos.length, totalBytes });
  try {
    const result = await processSubmissionUpload({
      submissionId: meta.submissionId,
      departmentCode: meta.departmentCode,
      departmentName: meta.departmentName ?? null,
      areaCode: meta.areaCode,
      areaName: meta.areaName ?? meta.areaCode,
      reporterName: meta.reporterName ?? "",
      reporterEmail: sessionEmail,
      reporterDepartmentCode: reporterDeptCode,
      reporterDepartmentName: reporterDeptName,
      workflowKind: wf.kind,
      submittedAt: meta.submittedAt || new Date().toISOString(),
      submissionDate: vnDateKey(new Date(meta.submittedAt || Date.now())),
      latitude: meta.latitude ?? null,
      longitude: meta.longitude ?? null,
      address: meta.address ?? null,
      photos,
      queueId: meta.queueId,
      attemptCount: meta.attemptCount,
    });
    trace("[5S_SYNC_TRACE]", "server.done", { mode, submissionId: meta.submissionId, syncStatus: result.syncStatus, uploaded: result.photos.length, workflowKind: wf.kind, durationMs: Date.now() - t0 });
    return { status: 200, body: { ok: true, workflowKind: wf.kind, ...(reporterDeptWarning ? { warning: reporterDeptWarning } : {}), ...result } };
  } catch (e) {
    const msg = (e as Error).message ?? "lỗi không xác định";
    const code = /không hợp lệ|JPEG|PNG|WEBP/i.test(msg) ? "IMAGE_INVALID"
      : /toàn vẹn|byte/i.test(msg) ? "VERIFY_FAILED"
      : /provision|list .* chưa/i.test(msg) ? "LIST_MISSING"
      : /Graph|drive|thư viện|PUT|upload/i.test(msg) ? "GRAPH_UPLOAD_FAILED"
      : "UPLOAD_FAILED";
    trace("[5S_SYNC_TRACE]", "server.failed", { mode, submissionId: meta.submissionId, errorCode: code, durationMs: Date.now() - t0, error: msg });
    return { status: 502, body: { ok: false, syncStatus: "failed", errorCode: code, message: msg, error: msg } };
  }
}
