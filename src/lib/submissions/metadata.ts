/** Build WatermarkMetadata from a session + GPS snapshot + capture time. */
import type { GeoLocationSnapshot, SubmissionSession, WatermarkMetadata } from "@/types/submission";

const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatGps(geo: GeoLocationSnapshot): string {
  if (geo.status === "ok" && geo.latitude != null && geo.longitude != null) {
    return `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`;
  }
  return "Không xác định";
}

export function buildWatermarkMetadata(
  session: Pick<SubmissionSession, "departmentCode" | "areaName" | "reporterName">,
  geo: GeoLocationSnapshot,
  when: Date,
): WatermarkMetadata {
  return {
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
    date: `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()}`,
    weekday: WEEKDAYS_VI[when.getDay()],
    address: geo.address,
    department: session.departmentCode,
    area: session.areaName,
    reporter: session.reporterName,
    gps: formatGps(geo),
    verifiedText: "✓ 5S Verified",
  };
}
