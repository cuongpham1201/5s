/**
 * Image byte helpers (Phase 3.x hotfix) — magic-number MIME detection + integrity
 * checks. Used to (a) refuse non-image / mislabeled files, (b) name files by their
 * REAL type, and (c) verify a SharePoint upload round-trips byte-for-byte.
 */

export type ImageKind = { ext: "jpg" | "png" | "webp"; mime: string };

function u8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Detect a supported image type from its leading bytes. null = unsupported. */
export function detectImageType(data: ArrayBuffer | Uint8Array): ImageKind | null {
  const b = u8(data);
  if (b.length < 12) return null;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return { ext: "png", mime: "image/png" };
  // WEBP: "RIFF"...."WEBP"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: "webp", mime: "image/webp" };
  return null;
}

/** MIME for a stored relative path by its extension (fallback image/jpeg). */
export function mimeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Hex of the first/last N bytes (diagnostic only — not image content). */
export function edgeHex(data: ArrayBuffer | Uint8Array, n = 16): { first: string; last: string } {
  const b = u8(data);
  const toHex = (arr: Uint8Array) => Array.from(arr, (x) => x.toString(16).padStart(2, "0")).join("");
  return { first: toHex(b.slice(0, n)), last: toHex(b.slice(Math.max(0, b.length - n))) };
}

/** True when two byte buffers have equal length and equal first/last N bytes. */
export function bytesRoundTripOk(uploaded: ArrayBuffer | Uint8Array, downloaded: ArrayBuffer | Uint8Array, n = 16): boolean {
  const a = u8(uploaded);
  const b = u8(downloaded);
  if (a.length !== b.length || a.length === 0) return false;
  const ends = (arr: Uint8Array) => [...arr.slice(0, n), ...arr.slice(Math.max(0, arr.length - n))].join(",");
  return ends(a) === ends(b);
}
