import { NextResponse, type NextRequest } from "next/server";
import { runPhotoUploadIntake, type UploadMetaIn, type ResolvedPair } from "@/lib/upload/photo-intake";
import { ulog } from "@/lib/debug/upload-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/upload/photos (Phase R1) — primary upload endpoint (multipart).
 *   meta = JSON UploadMetaIn; original_<seq>, watermarked_<seq> = image files.
 * Validation/orchestration shared with the JSON fallback via runPhotoUploadIntake.
 * Reporter identity + department come from the SERVER session/profile.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ ok: false, errorCode: "NO_PHOTOS", message: "multipart/form-data bắt buộc." }, { status: 400 });
  }
  // Verbose per-part proof (DEBUG_LOG only) — key, name, size, type.
  for (const [key, v] of form.entries()) {
    if (typeof v !== "string") ulog("server.formdata.entry", { key, name: (v as File).name, size: (v as File).size, type: (v as File).type });
  }
  let meta: UploadMetaIn | null = null;
  try { meta = JSON.parse(String(form.get("meta") ?? "")); } catch { meta = null; }

  // Resolve declared pairs up-front (arrayBuffer per file).
  const pairs = new Map<number, ResolvedPair>();
  for (const mp of meta?.photos ?? []) {
    const o = form.get(`original_${mp.seqNo}`);
    const w = form.get(`watermarked_${mp.seqNo}`);
    pairs.set(mp.seqNo, {
      original: o instanceof Blob && o.size > 0 ? await o.arrayBuffer() : null,
      watermarked: w instanceof Blob && w.size > 0 ? await w.arrayBuffer() : null,
      type: (w instanceof Blob && w.type) || (o instanceof Blob && o.type) || "image/jpeg",
    });
  }

  return runPhotoUploadIntake(req, meta, (seq) => pairs.get(seq) ?? null, "multipart");
}
