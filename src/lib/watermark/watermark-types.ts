import type { WatermarkMetadata } from "@/types/submission";

export interface WatermarkOptions {
  /** Longest edge of the output image (px). Source is downscaled to fit. */
  maxDimension?: number;
  /** JPEG quality 0..1. */
  jpegQuality?: number;
}

export interface WatermarkInput {
  /** Source image as a data URL (from camera capture or simulated). */
  source: string;
  metadata: WatermarkMetadata;
  options?: WatermarkOptions;
}

export interface WatermarkResult {
  /** Re-encoded original (downscaled, no watermark). */
  originalDataUrl: string;
  /** Original + watermark. */
  watermarkedDataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  /** Approx bytes of the watermarked image. */
  sizeBytes: number;
}

export const DEFAULT_WATERMARK_OPTIONS: Required<WatermarkOptions> = {
  maxDimension: 1280,
  jpegQuality: 0.72,
};
