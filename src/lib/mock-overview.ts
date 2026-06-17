/**
 * Mock company-wide data for the MVP UI (Home / Toàn cảnh / Lịch sử).
 *
 * The local app only holds THIS device's submissions; a company overview needs
 * cross-department data that will come from SharePoint photo metadata
 * (Config_Departments + 5SPhotos) in the integration phase. Until then these
 * mocks drive the UI review. Dashboard numbers are COMPUTED from the list
 * (not hardcoded) to mirror the "derive from photo metadata" approach.
 */

export interface DeptStatus {
  code: string;
  name: string;
  shotToday: boolean;
  lastTime?: string; // "HH:MM"
  reporter?: string;
  photosToday: number;
  hue: number;
}

const RAW: Array<[string, string, boolean, string?, string?, number?]> = [
  ["PMKT", "Phòng Marketing", true, "08:12", "Nguyễn Văn A", 3],
  ["KT", "Phòng Kế toán", true, "07:55", "Lê Thị B", 2],
  ["HCNS", "Hành chính Nhân sự", false],
  ["PXHL", "Phân xưởng Hơi lạnh", false],
  ["PXĐM", "Phân xưởng Đóng máy", false],
  ["KCS", "Phòng KCS", false],
  ["PXSC", "Phân xưởng Sản chế", true, "06:40", "Trần C", 4],
  ["PXSX", "Phân xưởng Sản xuất", true, "07:20", "Phạm D", 2],
  ["PKD", "Phòng Kinh doanh", true, "08:30", "Vũ E", 1],
  ["PVT", "Phòng Vật tư", true, "07:10", "Đỗ F", 2],
  ["PCĐ", "Phòng Cơ điện", true, "06:58", "Hồ G", 3],
  ["PXLM", "Phân xưởng Lên men", true, "06:35", "Bùi H", 2],
  ["PXCB", "Phân xưởng Chiết bock", true, "07:45", "Đặng I", 2],
  ["PXCC", "Phân xưởng Chiết chai", true, "07:48", "Ngô K", 3],
  ["PXCL", "Phân xưởng Chiết lon", true, "07:50", "Dương L", 2],
  ["KHO", "Kho thành phẩm", true, "08:05", "Lý M", 1],
  ["PBV", "Phòng Bảo vệ", true, "06:15", "Tô N", 1],
  ["PYT", "Phòng Y tế", true, "08:40", "Hà O", 1],
  ["PCNTT", "Công nghệ Thông tin", true, "08:22", "Cao P", 1],
  ["PQA", "Phòng QA", true, "07:33", "Mai Q", 2],
  ["PKT2", "Phòng Kỹ thuật", true, "07:28", "Lâm R", 2],
  ["PXMEN", "Phân xưởng Men", true, "06:50", "Tạ S", 2],
  ["PXNAU", "Phân xưởng Nấu", true, "06:30", "Phan T", 3],
  ["PXNL", "Phân xưởng Nguyên liệu", true, "07:02", "Võ U", 2],
  ["PMT", "Ban Môi trường", true, "08:55", "Trịnh V", 1],
  ["PDV", "Phòng Dịch vụ", false],
  ["PXKT", "Phân xưởng Kiểm tra", true, "07:40", "Lương X", 2],
  ["PHC", "Phòng Hậu cần", true, "08:01", "Đoàn Y", 1],
  ["PTC", "Phòng Tài chính", true, "07:59", "Châu Z", 1],
  ["PXĐG", "Phân xưởng Đóng gói", true, "07:15", "Kiều A2", 3],
];

export const ALL_DEPARTMENTS: DeptStatus[] = RAW.map(([code, name, shot, time, reporter, photos], i) => ({
  code,
  name,
  shotToday: shot,
  lastTime: time,
  reporter,
  photosToday: shot ? (photos ?? 1) : 0,
  hue: (i * 37 + 200) % 360,
}));

export function todayKpi(): { total: number; shot: number; missing: number; pct: number } {
  const total = ALL_DEPARTMENTS.length;
  const shot = ALL_DEPARTMENTS.filter((d) => d.shotToday).length;
  return { total, shot, missing: total - shot, pct: Math.round((shot / total) * 100) };
}

export function missingDepartments(): DeptStatus[] {
  return ALL_DEPARTMENTS.filter((d) => !d.shotToday);
}

export function findDept(code: string): DeptStatus | undefined {
  return ALL_DEPARTMENTS.find((d) => d.code === code);
}

/** Newest photo feed (across departments) for Home. */
export interface FeedItem {
  id: string;
  code: string;
  name: string;
  time: string;
  hue: number;
}
export function latestFeed(limit = 8): FeedItem[] {
  return ALL_DEPARTMENTS.filter((d) => d.shotToday)
    .slice()
    .sort((a, b) => (b.lastTime ?? "").localeCompare(a.lastTime ?? ""))
    .slice(0, limit)
    .map((d) => ({ id: d.code, code: d.code, name: d.name, time: d.lastTime ?? "", hue: d.hue }));
}

/** Mock today's photos for a department (gradient placeholders). */
export function deptGalleryToday(code: string): Array<{ id: string; hue: number; time: string }> {
  const d = findDept(code);
  const n = d?.photosToday ?? 0;
  const baseHue = d?.hue ?? 200;
  return Array.from({ length: n }).map((_, i) => ({
    id: `${code}-${i}`,
    hue: (baseHue + i * 18) % 360,
    time: d?.lastTime ?? "—",
  }));
}

/** Last 7 days completion for a department. */
export function last7Days(code: string): Array<{ date: string; ok: boolean }> {
  const seed = code.length;
  const days = ["11/06", "12/06", "13/06", "14/06", "15/06", "16/06", "17/06"];
  return days.map((date, i) => ({ date, ok: (i + seed) % 4 !== 0 }));
}

/** History grouped by date (most recent first). */
export function historyByDate(): Array<{ date: string; weekday: string; depts: string[] }> {
  const shot = ALL_DEPARTMENTS.filter((d) => d.shotToday).map((d) => d.code);
  return [
    { date: "17/06/2026", weekday: "Thứ Ba", depts: shot.slice(0, 25) },
    { date: "16/06/2026", weekday: "Thứ Hai", depts: shot.slice(0, 28) },
    { date: "15/06/2026", weekday: "Chủ Nhật", depts: shot.slice(0, 12) },
    { date: "14/06/2026", weekday: "Thứ Bảy", depts: shot.slice(0, 22) },
  ];
}
