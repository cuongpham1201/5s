/** Image helpers for moving photos between data URLs (UI) and Blobs (IndexedDB). */

/**
 * Convert a data URL to a Blob WITHOUT fetch().
 *
 * iOS Safari (notably in standalone/PWA mode) does not reliably support
 * `fetch("data:…")` — it can resolve to an EMPTY blob, producing a 0-byte image
 * that uploads as "invalid" and showed "Lỗi đồng bộ" only on iPhone. Decoding the
 * base64 manually works identically on iOS / Android / desktop.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    const res = await fetch(dataUrl); // non-data URL fallback
    return res.blob();
  }
  const header = dataUrl.slice(5, comma); // e.g. "image/jpeg;base64"
  const isBase64 = /;base64/i.test(header);
  const mime = header.split(";")[0] || "image/jpeg";
  const dataPart = dataUrl.slice(comma + 1);
  if (isBase64) {
    const bin = atob(dataPart);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([new TextEncoder().encode(decodeURIComponent(dataPart))], { type: mime });
}

/** Natural pixel dimensions of a data-URL image (for StoredPhoto metadata). */
export function getDataUrlDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") { resolve({ width: 0, height: 0 }); return; }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 }); // dims are metadata, never fatal
    img.src = dataUrl;
  });
}

/** Build a small thumbnail data URL from a source data URL (for instant display). */
export function makeThumbnailDataUrl(sourceDataUrl: string, maxEdge = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("makeThumbnailDataUrl chỉ chạy trên trình duyệt"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight) || maxEdge;
      const k = Math.min(1, maxEdge / longest);
      const w = Math.round((img.naturalWidth || maxEdge) * k);
      const h = Math.round((img.naturalHeight || maxEdge) * k);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Không khởi tạo được canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch (e) {
        reject(e as Error);
      }
    };
    img.onerror = () => reject(new Error("Không đọc được ảnh để tạo thumbnail"));
    img.src = sourceDataUrl;
  });
}
