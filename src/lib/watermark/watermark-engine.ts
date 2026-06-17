/**
 * Canvas watermark engine (Phase 2A).
 *
 * Draws the business-required watermark block (bottom-left, semi-transparent
 * black background, white text, green "5S Verified") onto a captured photo.
 * Client-side only (uses canvas/Image). Returns both the re-encoded original
 * and the watermarked image as JPEG data URLs.
 */
import type { WatermarkMetadata } from "@/types/submission";
import {
  DEFAULT_WATERMARK_OPTIONS,
  type WatermarkInput,
  type WatermarkResult,
} from "./watermark-types";

const MIME = "image/jpeg";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh để xử lý."));
    img.src = src;
  });
}

/** Scale (w,h) so the longest edge ≤ maxDimension; never upscales. */
function fit(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function estimateBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.round((b64.length * 3) / 4);
}

/** The watermark text lines, in render order. */
export function watermarkLines(m: WatermarkMetadata): string[] {
  return [
    `${m.time} | ${m.date}`,
    m.weekday,
    m.address,
    `Phòng ban: ${m.department}`,
    `Khu vực: ${m.area}`,
    `Người chụp: ${m.reporter}`,
    `GPS: ${m.gps}`,
    m.verifiedText,
  ];
}

export async function generateWatermarkedImage(input: WatermarkInput): Promise<WatermarkResult> {
  if (typeof document === "undefined") {
    throw new Error("Watermark engine chỉ chạy trên trình duyệt.");
  }
  const opts = { ...DEFAULT_WATERMARK_OPTIONS, ...(input.options ?? {}) };
  const img = await loadImage(input.source);
  const { w, h } = fit(img.naturalWidth || img.width, img.naturalHeight || img.height, opts.maxDimension);

  // Base canvas (re-encoded original).
  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const bctx = base.getContext("2d");
  if (!bctx) throw new Error("Không khởi tạo được canvas.");
  bctx.drawImage(img, 0, 0, w, h);
  const originalDataUrl = base.toDataURL(MIME, opts.jpegQuality);

  // Watermarked canvas.
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không khởi tạo được canvas.");
  ctx.drawImage(img, 0, 0, w, h);

  const lines = watermarkLines(input.metadata);
  // Font scales with image size, clamped for legibility on mobile.
  const fontSize = Math.max(13, Math.min(34, Math.round(h * 0.024)));
  const lineHeight = Math.round(fontSize * 1.34);
  const pad = Math.round(fontSize * 0.7);
  ctx.font = `${fontSize}px "Segoe UI", system-ui, Arial, sans-serif`;
  ctx.textBaseline = "top";

  // TimeMark-style full-width FOOTER band anchored at the bottom (not a corner box).
  const boxX = 0;
  const boxW = w;
  const boxH = lines.length * lineHeight + pad * 2;
  const boxY = h - boxH;

  // Semi-transparent black footer + a thin top accent line.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(boxX, boxY, boxW, Math.max(1, Math.round(fontSize * 0.06)));

  // Text lines (first line bold; last line = verified, green).
  lines.forEach((line, i) => {
    ctx.fillStyle = i === lines.length - 1 ? "#6FE26F" : "#FFFFFF";
    ctx.font =
      (i === 0 || i === lines.length - 1 ? "bold " : "") +
      `${fontSize}px "Segoe UI", system-ui, Arial, sans-serif`;
    ctx.fillText(line, boxX + pad, boxY + pad + i * lineHeight, boxW - pad * 2);
  });

  const watermarkedDataUrl = canvas.toDataURL(MIME, opts.jpegQuality);

  return {
    originalDataUrl,
    watermarkedDataUrl,
    width: w,
    height: h,
    mimeType: MIME,
    sizeBytes: estimateBytes(watermarkedDataUrl),
  };
}
