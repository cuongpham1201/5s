/**
 * Dev-only storage stress utility (Phase 2B.1). Generates synthetic photo blobs
 * into IndexedDB + a queue item to validate storage growth / queue behavior.
 * NOT used in production flows.
 */
import { dataUrlToBlob, makeThumbnailDataUrl } from "./image-utils";
import { putPhoto, sha256Hex } from "./photo-store";
import { enqueueSubmission } from "@/lib/queue/offline-queue";

function makeStressImage(seq: number): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const hue = (seq * 37) % 360;
  const grad = ctx.createLinearGradient(0, 0, 1280, 960);
  grad.addColorStop(0, `hsl(${hue} 45% 60%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360} 45% 35%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 960);
  // Some noise so JPEG doesn't compress to near-nothing (realistic size).
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `hsla(${(hue + i) % 360} 60% 70% / 0.5)`;
    ctx.fillRect((i * 53) % 1280, (i * 97) % 960, 24, 24);
  }
  ctx.fillStyle = "#fff";
  ctx.font = "bold 120px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`TEST #${seq}`, 640, 520);
  return canvas.toDataURL("image/jpeg", 0.7);
}

export interface StressResult {
  submissionId: string;
  photoCount: number;
}

/** Generate `n` synthetic photos into IndexedDB + one queued submission. */
export async function generateMockPhotos(n: number): Promise<StressResult> {
  const submissionId = `stress-${Date.now()}`;
  for (let i = 1; i <= n; i++) {
    const dataUrl = makeStressImage(i);
    const thumbUrl = await makeThumbnailDataUrl(dataUrl);
    const [originalBlob, watermarkedBlob, thumbnailBlob] = await Promise.all([
      dataUrlToBlob(dataUrl),
      dataUrlToBlob(dataUrl),
      dataUrlToBlob(thumbUrl),
    ]);
    // Byte-based model (same as the real capture path — Blobs are transient only).
    const [originalBuffer, watermarkedBuffer, thumbnailBuffer] = await Promise.all([
      originalBlob.arrayBuffer(),
      watermarkedBlob.arrayBuffer(),
      thumbnailBlob.arrayBuffer(),
    ]);
    await putPhoto({
      photoId: `${submissionId}-p${i}`,
      submissionId,
      originalBuffer,
      watermarkedBuffer,
      thumbnailBuffer,
      mimeType: "image/jpeg",
      size: originalBuffer.byteLength + watermarkedBuffer.byteLength,
      originalHash: await sha256Hex([originalBuffer]),
      watermarkedHash: await sha256Hex([watermarkedBuffer]),
      thumbnailHash: await sha256Hex([thumbnailBuffer]),
      width: 1280,
      height: 960,
      createdAt: new Date().toISOString(),
      status: "ready",
    });
  }
  enqueueSubmission(submissionId);
  return { submissionId, photoCount: n };
}
