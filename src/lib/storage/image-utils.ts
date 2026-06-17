/** Image helpers for moving photos between data URLs (UI) and Blobs (IndexedDB). */

/** Convert a data URL to a Blob (browser). */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
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
