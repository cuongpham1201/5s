import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { uploadSubmissionPhotos, type PhotoUploadResult } from "@/lib/sharepoint/submission-upload-service";
import { vnDateKey } from "@/lib/sharepoint/report-service";
import { ulog } from "@/lib/debug/upload-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/upload/photos (Phase R1) — the ONE primary upload endpoint.
 * multipart/form-data:
 *   meta = JSON { submissionId, departmentCode, departmentName?, areaCode, areaName,
 *                 checkItemCode?, checkItemName?, submittedAt, reporterEmail?,
 *                 reporterName?, photos:[{seqNo}] }
 *   original_<seq>, watermarked_<seq> = image files
 *
 * Reporter identity + department come from the SERVER session/profile (client is
 * NOT trusted). Each photo uploads independently; ≥1 success = ok. Business errors
 * return structured JSON (never HTTP 502). No JSON-base64 / FileReader fallback.
 */
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTOS = 20;

interface MetaIn {
  submissionId?: string;
  departmentCode?: string;
  areaCode?: string;
  areaName?: string;
  checkItemCode?: string;
  checkItemName?: string;
  submittedAt?: string;
  reporterName?: string;
  photos?: Array<{ seqNo: number; capturedAt?: string; latitude?: number | null; longitude?: number | null; address?: string | null }>;
}

function err(errorCode: string, message: string, status: number) {
  return NextResponse.json({ ok: false, submissionId: null, uploadedPhotoCount: 0, failedPhotoCount: 0, photos: [], errors: [{ seqNo: 0, errorCode, message }], errorCode, message }, { status });
}

export async function POST(req: NextRequest) {
  // 1) Auth + profile (server-trusted identity).
  const me = await resolveRequestUser(req);
  if (!me?.email) return err("AUTH_REQUIRED", "Chưa đăng nhập.", 401);
  if (!me.departmentResolved || !me.departmentCode) return err("PROFILE_UNRESOLVED", "Chưa xác định được phòng ban của tài khoản.", 403);

  // 2) Parse multipart + meta.
  let form: FormData;
  try { form = await req.formData(); } catch { return err("NO_PHOTOS", "multipart/form-data bắt buộc.", 400); }
  let meta: MetaIn;
  try { meta = JSON.parse(String(form.get("meta") ?? "")); } catch { return err("NO_PHOTOS", "meta JSON không hợp lệ.", 400); }

  ulog("server.entry", { submissionId: meta.submissionId, declared: meta.photos?.length ?? 0, email: me.email });

  if (!meta.submissionId || !meta.areaCode) return err("NO_PHOTOS", "Thiếu submissionId/areaCode.", 400);
  if (!Array.isArray(meta.photos) || meta.photos.length === 0) return err("NO_PHOTOS", "Cần ít nhất 1 ảnh.", 400);
  if (meta.photos.length > MAX_PHOTOS) return err("NO_PHOTOS", `Tối đa ${MAX_PHOTOS} ảnh mỗi lần gửi.`, 400);

  // 3) Department comes from the SERVER profile (ignore any client-sent dept that differs).
  if (meta.departmentCode && meta.departmentCode !== me.departmentCode) {
    return err("PROFILE_UNRESOLVED", `Không thể gửi cho phòng ban khác (${meta.departmentCode} ≠ ${me.departmentCode}).`, 403);
  }
  const departmentCode = me.departmentCode;

  // 4) Resolve declared photos to byte pairs; skip missing/empty files (BAD_FILE).
  const photos: Array<{ seqNo: number; capturedAt: string; latitude: number | null; longitude: number | null; address: string | null; original: ArrayBuffer; watermarked: ArrayBuffer; contentType: string }> = [];
  const preErrors: PhotoUploadResult["errors"] = [];
  for (const mp of meta.photos) {
    const o = form.get(`original_${mp.seqNo}`);
    const w = form.get(`watermarked_${mp.seqNo}`);
    if (!(o instanceof Blob) || !(w instanceof Blob) || o.size === 0 || w.size === 0) {
      preErrors.push({ seqNo: mp.seqNo, errorCode: "BAD_FILE", message: `Thiếu/rỗng file ảnh cho seq ${mp.seqNo}.` });
      continue;
    }
    const type = w.type || o.type || "image/jpeg";
    if (type && !ALLOWED_MIME.has(type)) {
      preErrors.push({ seqNo: mp.seqNo, errorCode: "BAD_FILE", message: `Loại ảnh không hợp lệ (${type}).` });
      continue;
    }
    ulog("server.file.received", { submissionId: meta.submissionId, seq: mp.seqNo, originalBytes: o.size, watermarkedBytes: w.size, type });
    photos.push({
      seqNo: mp.seqNo, capturedAt: mp.capturedAt ?? meta.submittedAt ?? new Date().toISOString(),
      latitude: mp.latitude ?? null, longitude: mp.longitude ?? null, address: mp.address ?? null,
      original: await o.arrayBuffer(), watermarked: await w.arrayBuffer(), contentType: type,
    });
  }

  if (photos.length === 0) {
    return NextResponse.json({ ok: false, submissionId: meta.submissionId, uploadedPhotoCount: 0, failedPhotoCount: preErrors.length, photos: [], errors: preErrors, errorCode: "NO_PHOTOS", message: "Không có file ảnh hợp lệ." }, { status: 400 });
  }

  // 5) Upload (per-photo, idempotent). Never throws for a photo-level failure.
  try {
    const submittedAt = meta.submittedAt || new Date().toISOString();
    const result = await uploadSubmissionPhotos({
      submissionId: meta.submissionId,
      departmentCode,
      areaCode: meta.areaCode,
      areaName: meta.areaName ?? meta.areaCode,
      reporterName: meta.reporterName ?? me.displayName ?? "",
      reporterEmail: me.email,
      submittedAt,
      submissionDate: vnDateKey(new Date(submittedAt)),
      latitude: photos[0]?.latitude ?? null,
      longitude: photos[0]?.longitude ?? null,
      address: photos[0]?.address ?? null,
      photos,
    });
    // Merge any pre-upload BAD_FILE errors into the response.
    const errors = [...preErrors, ...result.errors];
    const body = { ...result, failedPhotoCount: errors.length, errors };
    ulog("server.done", { submissionId: meta.submissionId, ok: body.ok, uploaded: body.uploadedPhotoCount, failed: body.failedPhotoCount });
    // ≥1 photo stored → 200 ok. 0 stored → 200 ok:false (business result, NOT 502).
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    ulog("server.failed", { submissionId: meta.submissionId, step: "orchestrator", message: (e as Error)?.message ?? "error" });
    return err("SERVER_ERROR", (e as Error)?.message ?? "Lỗi máy chủ.", 500);
  }
}
