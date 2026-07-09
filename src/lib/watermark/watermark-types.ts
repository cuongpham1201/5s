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
  /** Cấu hình bật/tắt dòng + dòng tùy chỉnh (admin đặt toàn hệ thống). */
  config?: WatermarkConfig;
}

/**
 * Cấu hình watermark do ADMIN đặt, áp dụng toàn hệ thống. Bật/tắt từng dòng +
 * một dòng tùy chỉnh (vd tên công ty). Dòng thời gian LUÔN hiển thị (bằng chứng).
 */
export interface WatermarkConfig {
  showWeekday: boolean;
  showAddress: boolean;
  showDepartment: boolean;
  showArea: boolean;
  showCheckItem: boolean;
  showReporter: boolean;
  showGps: boolean;
  showVerified: boolean;
  /** Dòng tự nhập thêm (trống = không thêm). */
  customLine: string;
}

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  showWeekday: true,
  showAddress: true,
  showDepartment: true,
  showArea: true,
  showCheckItem: true,
  showReporter: true,
  showGps: true,
  showVerified: true,
  customLine: "",
};

/** Chuẩn hóa object bất kỳ về WatermarkConfig hợp lệ (merge default). */
export function normalizeWatermarkConfig(raw: unknown): WatermarkConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof WatermarkConfig) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_WATERMARK_CONFIG[k] as boolean;
  return {
    showWeekday: bool("showWeekday"),
    showAddress: bool("showAddress"),
    showDepartment: bool("showDepartment"),
    showArea: bool("showArea"),
    showCheckItem: bool("showCheckItem"),
    showReporter: bool("showReporter"),
    showGps: bool("showGps"),
    showVerified: bool("showVerified"),
    customLine: typeof o.customLine === "string" ? o.customLine.slice(0, 80) : "",
  };
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
