/**
 * DAILY BUSINESS RULES (P8A) — hàm THUẦN cho 4 rule Daily của Policy Engine:
 *   1. captures_per_area_per_day (ngưỡng hoàn thành khu)
 *   2. reset_hour/reset_minute   (giờ reset ngày nghiệp vụ)
 *   3. weekend_required          (cuối tuần có tính nghĩa vụ không)
 *   4. holiday_dates             (ngày nghỉ — YYYY-MM-DD, bỏ nghĩa vụ)
 *
 * Không pg, không I/O — unit-test được với ngày cố định. Consumer duy nhất:
 * report-service (read-side KPI). GHI-side (đường dẫn ảnh, SubmissionDate)
 * GIỮ NGUYÊN lịch — chỉ READ-side quy đổi ngày nghiệp vụ.
 */
import type { DailyPolicy } from "./policy-service";

/** Khóa ngày YYYY-MM-DD theo Asia/Ho_Chi_Minh (trùng vnDateKey khi reset 00:00). */
function vnKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/**
 * Ngày NGHIỆP VỤ của một thời điểm: lùi reset_hour:reset_minute rồi lấy ngày VN.
 * reset 00:00 (default) → CHÍNH XÁC vnDateKey hiện tại (không đổi hành vi).
 * Ví dụ reset 06:00: 05:59 → ngày hôm trước; 06:01 → ngày mới.
 */
export function businessDayKey(d: Date, resetHour = 0, resetMinute = 0): string {
  const shift = (resetHour * 60 + resetMinute) * 60_000;
  return vnKey(new Date(d.getTime() - shift));
}

/** Thứ trong tuần của một dayKey (0=CN … 6=T7) — tính theo UTC noon để né DST/mốc ngày. */
export function weekdayOfKey(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay();
}

export function isWeekendKey(dayKey: string): boolean {
  const w = weekdayOfKey(dayKey);
  return w === 0 || w === 6;
}

export interface ObligationDayResult {
  isObligationDay: boolean;
  reason: "normal" | "weekend_off" | "holiday";
}

/**
 * Ngày này có TẠO NGHĨA VỤ chụp không?
 *  - weekend + weekend_required=false → không (weekend_off)
 *  - nằm trong holiday_dates → không (holiday)
 * Defaults (weekend_required=true, holiday_dates=[]) → luôn có = hành vi hiện tại.
 */
export function obligationDay(dayKey: string, daily: Pick<DailyPolicy, "weekend_required" | "holiday_dates">): ObligationDayResult {
  if (Array.isArray(daily.holiday_dates) && daily.holiday_dates.includes(dayKey)) {
    return { isObligationDay: false, reason: "holiday" };
  }
  if (!daily.weekend_required && isWeekendKey(dayKey)) {
    return { isObligationDay: false, reason: "weekend_off" };
  }
  return { isObligationDay: true, reason: "normal" };
}

/** Ngưỡng hoàn thành khu: số lần chụp trong ngày ≥ N (mặc định 1 = hành vi cũ). */
export function areaCompleted(captureCount: number, daily: Pick<DailyPolicy, "captures_per_area_per_day">): boolean {
  const n = Math.max(1, Number(daily.captures_per_area_per_day) || 1);
  return captureCount >= n;
}
