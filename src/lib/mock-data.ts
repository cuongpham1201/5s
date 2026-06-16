/**
 * Mock data for Phase 1A UI port. NO API / SharePoint here.
 * Shapes mirror DATA_MODEL.md so swapping to real data later is mechanical.
 */
import type {
  Area,
  Department,
  HeatmapRow,
  Submission,
  UnitKpi,
} from "@/types";

export const CURRENT_USER = {
  name: "Nguyễn Văn A",
  email: "nguyen.van.a@biahalong.com",
  department: "PMKT",
};

export const DEPARTMENTS: Department[] = [
  { code: "PMKT", name: "Phòng Marketing", isActive: true },
  { code: "PXHL", name: "Phân xưởng Hơi lạnh", isActive: true },
  { code: "KCS", name: "Phòng KCS", isActive: true },
  { code: "PXSC", name: "Phân xưởng Sản chế", isActive: true },
  { code: "PKT", name: "Phòng Kế toán", isActive: true },
  { code: "PXSX", name: "Phân xưởng Sản xuất", isActive: true },
];

// Dynamic area list per department (matches the approved prototype).
export const AREAS: Area[] = [
  { id: "pmkt-vp", name: "Văn phòng", department: "PMKT" },
  { id: "pmkt-ph", name: "Phòng họp", department: "PMKT" },
  { id: "pmkt-kho", name: "Kho POSM", department: "PMKT" },
  { id: "pxhl-x1", name: "Xưởng 1", department: "PXHL" },
  { id: "pxhl-x2", name: "Xưởng 2", department: "PXHL" },
  { id: "pxhl-kn", name: "Khu nấu", department: "PXHL" },
];

export function areasForDepartment(code: string): Area[] {
  return AREAS.filter((a) => a.department === code);
}

export const RECENT_SUBMISSIONS: Submission[] = [
  {
    submissionId: "01J5S-AAA",
    department: "PMKT",
    area: "Văn phòng",
    reporter: "Nguyễn Văn A",
    reporterEmail: CURRENT_USER.email,
    photoTime: "2026-06-15T17:20:00+07:00",
    submissionDate: "2026-06-15",
    latitude: 20.9512,
    longitude: 107.0834,
    address: "Lê Lợi, Hồng Gai, Quảng Ninh",
    geoStatus: "ok",
    status: "complete",
  },
];

// Dashboard KPI (mock).
export const TODAY_KPI = {
  expectedUnits: 23,
  submittedUnits: 18,
  missingUnits: 5,
  completion: 0.78,
};

export const PENDING_UNITS = [
  { code: "PMKT", name: "Phòng Marketing", photosToday: 0, last: "14/06/2026 16:40" },
  { code: "PXHL", name: "Phân xưởng Hơi lạnh", photosToday: 0, last: "13/06/2026 09:12" },
  { code: "KCS", name: "Phòng KCS", photosToday: 0, last: "15/06/2026 08:05" },
  { code: "PKT", name: "Phòng Kế toán", photosToday: 0, last: "12/06/2026 17:30" },
  { code: "PXSX", name: "Phân xưởng Sản xuất", photosToday: 0, last: "14/06/2026 11:20" },
];

export const RANKING: UnitKpi[] = [
  { code: "PXSC", name: "Phân xưởng Sản chế", submittedDays: 30, expectedDays: 30, completionRate: 0.96, photoCount: 214 },
  { code: "PMKT", name: "Phòng Marketing", submittedDays: 29, expectedDays: 30, completionRate: 0.94, photoCount: 198 },
  { code: "KCS", name: "Phòng KCS", submittedDays: 27, expectedDays: 30, completionRate: 0.9, photoCount: 176 },
  { code: "PKT", name: "Phòng Kế toán", submittedDays: 25, expectedDays: 30, completionRate: 0.83, photoCount: 150 },
  { code: "PXHL", name: "Phân xưởng Hơi lạnh", submittedDays: 22, expectedDays: 30, completionRate: 0.73, photoCount: 131 },
  { code: "PXSX", name: "Phân xưởng Sản xuất", submittedDays: 18, expectedDays: 30, completionRate: 0.6, photoCount: 96 },
];

// Calendar heatmap mock (days 01..15). s = status code.
type S = HeatmapRow["cells"][number]["status"];
function row(code: string, statuses: S[]): HeatmapRow {
  return {
    code,
    cells: statuses.map((status, i) => ({
      day: String(i + 1).padStart(2, "0"),
      status,
    })),
  };
}
const W: S = "weekend";
export const HEATMAP: HeatmapRow[] = [
  row("PMKT", ["ok", "ok", "ok", "ok", "ok", W, W, "ok", "ok", "partial", "ok", "ok", W, "ok", "miss"]),
  row("PXHL", ["ok", "ok", "ok", "ok", "ok", W, W, "ok", "miss", "miss", "ok", "ok", W, "miss", "miss"]),
  row("KCS", ["ok", "miss", "miss", "ok", "ok", W, W, "ok", "ok", "ok", "ok", "partial", W, "ok", "partial"]),
  row("PXSC", ["ok", "ok", "ok", "ok", "ok", W, W, "ok", "ok", "ok", "ok", "ok", W, "ok", "ok"]),
  row("PKT", ["ok", "ok", "miss", "ok", "ok", W, W, "ok", "ok", "ok", "miss", "ok", W, "ok", "miss"]),
  row("PXSX", ["ok", "miss", "ok", "miss", "ok", W, W, "miss", "ok", "miss", "ok", "miss", W, "ok", "miss"]),
];

export const GALLERY_ITEMS = Array.from({ length: 10 }).map((_, i) => ({
  id: `g-${i}`,
  area: ["Văn phòng", "Phòng họp", "Kho POSM"][i % 3],
  time: ["17:20", "17:05", "16:48", "16:30", "16:12", "15:50", "15:33", "15:10", "14:55", "14:40"][i],
}));
