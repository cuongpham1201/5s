import { NextResponse, type NextRequest } from "next/server";
import { runSyncIntake, type SyncMeta, type IntakePair } from "@/lib/sharepoint/sync-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/sync/submission-json — iOS-safe fallback when multipart fetch fails
 * ("Load failed") on iPhone PWA. Body:
 *   { meta, files: { "original_1": {filename,mime,base64}, "watermarked_1": {...}, ... } }
 * Same auth/validation/upload as the multipart route (via runSyncIntake).
 */
interface B64File { filename?: string; mime?: string; base64: string }

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function POST(req: NextRequest) {
  let payload: { meta?: SyncMeta; files?: Record<string, B64File> };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, errorCode: "BAD_JSON", message: "JSON không hợp lệ", error: "json" }, { status: 400 });
  }
  const files = payload.files ?? {};
  const pairs = new Map<number, IntakePair>();
  for (const mp of payload.meta?.photos ?? []) {
    const o = files[`original_${mp.seqNo}`];
    const w = files[`watermarked_${mp.seqNo}`];
    if (o?.base64 && w?.base64) {
      try {
        pairs.set(mp.seqNo, { original: decode(o.base64), watermarked: decode(w.base64), type: w.mime || o.mime || "image/jpeg" });
      } catch {
        return NextResponse.json({ ok: false, errorCode: "BAD_BASE64", message: `base64 lỗi seq ${mp.seqNo}`, error: "base64" }, { status: 400 });
      }
    }
  }

  const { status, body } = await runSyncIntake(req, payload.meta ?? null, (seq) => pairs.get(seq) ?? null, "json");
  return NextResponse.json(body, { status });
}
