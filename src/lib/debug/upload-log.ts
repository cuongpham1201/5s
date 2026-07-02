import { trace } from "./trace";

/**
 * Single, simple logger for the photo-upload flow (Phase R1). Gated behind the
 * same DEBUG_LOG flags as every other trace. NEVER pass tokens, base64, or image
 * bytes — only ids, counts, sizes, mime, step names, and error messages.
 *
 * Steps (client → server):
 *   client.submit.start · client.blobs.ready · client.upload.request ·
 *   client.upload.response · server.entry · server.file.received ·
 *   server.graph.upload.start · server.graph.upload.done ·
 *   server.photoRow.upsert.done · server.done · server.failed
 */
export function ulog(step: string, data: Record<string, unknown> = {}): void {
  trace("[5S_UPLOAD]", step, data);
}

/**
 * ALWAYS-ON structured upload log (server milestones only — entry/done/failed and
 * per-photo failures). Uploads are low-volume, and gated tracing left production
 * incidents completely invisible. Compact one-line JSON; NEVER tokens/base64/bytes.
 */
export function ulogAlways(step: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(`[5S_UPLOAD] ${step} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[5S_UPLOAD] ${step}`);
  }
}
