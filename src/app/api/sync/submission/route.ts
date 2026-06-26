import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { listUserAllowedAreas } from "@/lib/sharepoint/user-area-service";
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
export async function POST(req: NextRequest) {
  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase();
  if (!sessionEmail) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data bắt buộc" }, { status: 400 });
  }

  let meta: SyncMeta;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return NextResponse.json({ error: "meta JSON không hợp lệ" }, { status: 400 });
  }

  // --- validation (PART J) ---
  if (!meta.submissionId || !meta.departmentCode || !meta.areaCode) {
    return NextResponse.json({ error: "thiếu submissionId/departmentCode/areaCode" }, { status: 400 });
  }
  if ((meta.reporterEmail ?? "").toLowerCase() !== sessionEmail) {
    return NextResponse.json({ error: "email không khớp người dùng đăng nhập" }, { status: 403 });
  }
  if (!Array.isArray(meta.photos) || meta.photos.length === 0) {
    return NextResponse.json({ error: "cần ít nhất 1 ảnh" }, { status: 400 });
  }
  if (meta.photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `tối đa ${MAX_PHOTOS} ảnh mỗi lần gửi` }, { status: 400 });
  }

  // Area permission: the user must be granted this area.
  try {
    const allowed = await listUserAllowedAreas(sessionEmail);
    if (!allowed.some((a) => a.code === meta.areaCode)) {
      return NextResponse.json({ error: "bạn không có quyền chụp khu vực này" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "không kiểm tra được quyền khu vực" }, { status: 500 });
  }

  // Collect photo blobs.
  const photos: UploadPhotoInput[] = [];
  for (const mp of meta.photos) {
    const orig = form.get(`original_${mp.seqNo}`);
    const wm = form.get(`watermarked_${mp.seqNo}`);
    if (!(orig instanceof Blob) || !(wm instanceof Blob)) {
      return NextResponse.json({ error: `thiếu file ảnh cho seq ${mp.seqNo}` }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(orig.type) || !ALLOWED_MIME.has(wm.type)) {
      return NextResponse.json({ error: "chỉ chấp nhận ảnh jpeg/png/webp" }, { status: 400 });
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
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, syncStatus: "failed", error: (e as Error).message }, { status: 502 });
  }
}
