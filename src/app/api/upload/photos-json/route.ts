import { NextResponse, type NextRequest } from "next/server";
import { runPhotoUploadIntake, type UploadMetaIn, type ResolvedPair } from "@/lib/upload/photo-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/upload/photos-json — iOS-safe fallback for the primary endpoint.
 * iPhone Safari can throw "Load failed" on a multipart fetch BEFORE the request
 * reaches the server; the client then re-sends the same payload as JSON/base64:
 *   { meta: UploadMetaIn, files: { "original_1": {filename,mime,base64}, ... } }
 * Identical validation/orchestration via runPhotoUploadIntake (same idempotent
 * upserts — a multipart attempt followed by a JSON retry never duplicates).
 */
interface B64File { filename?: string; mime?: string; base64: string }

function decode(b64: string): ArrayBuffer | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let payload: { meta?: UploadMetaIn; files?: Record<string, B64File> };
  try { payload = await req.json(); } catch {
    return NextResponse.json({ ok: false, errorCode: "NO_PHOTOS", message: "JSON không hợp lệ." }, { status: 400 });
  }
  const meta = payload.meta ?? null;
  const files = payload.files ?? {};

  const pairs = new Map<number, ResolvedPair>();
  for (const mp of meta?.photos ?? []) {
    const o = files[`original_${mp.seqNo}`];
    const w = files[`watermarked_${mp.seqNo}`];
    pairs.set(mp.seqNo, {
      original: o?.base64 ? decode(o.base64) : null,
      watermarked: w?.base64 ? decode(w.base64) : null,
      type: w?.mime || o?.mime || "image/jpeg",
    });
  }

  return runPhotoUploadIntake(req, meta, (seq) => pairs.get(seq) ?? null, "json");
}
