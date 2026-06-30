import { NextResponse, type NextRequest } from "next/server";
import { runSyncIntake, type SyncMeta, type IntakePair } from "@/lib/sharepoint/sync-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * @deprecated Phase R1 — superseded by POST /api/upload/photos (per-photo, no
 * verify-download-back, no JSON/base64 fallback). The client no longer calls this
 * route; it is kept only for backward compatibility and may be removed later.
 *
 * POST /api/sync/submission (multipart/form-data)
 * fields: meta=<JSON SyncMeta>, original_<seq>=<file>, watermarked_<seq>=<file>
 * Shares validation + upload with the JSON fallback via runSyncIntake.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, errorCode: "BAD_MULTIPART", message: "multipart/form-data bắt buộc", error: "multipart" }, { status: 400 });
  }
  let meta: SyncMeta | null = null;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    meta = null;
  }

  // Resolve declared photo files to ArrayBuffers up-front.
  const pairs = new Map<number, IntakePair>();
  if (meta?.photos) {
    for (const mp of meta.photos) {
      const orig = form.get(`original_${mp.seqNo}`);
      const wm = form.get(`watermarked_${mp.seqNo}`);
      if (orig instanceof Blob && wm instanceof Blob) {
        pairs.set(mp.seqNo, { original: await orig.arrayBuffer(), watermarked: await wm.arrayBuffer(), type: wm.type || orig.type || "image/jpeg" });
      }
    }
  }

  const { status, body } = await runSyncIntake(req, meta, (seq) => pairs.get(seq) ?? null, "multipart");
  return NextResponse.json(body, { status });
}
