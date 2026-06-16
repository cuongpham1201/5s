/** Shared domain types (Phase 1A — used by mock data + UI). */

export type AppRole = "employee" | "environment" | "admin";

export type GeoStatus = "ok" | "unavailable" | "denied";
export type SubmissionStatus = "complete" | "partial" | "flagged";
export type DayStatus = "ok" | "partial" | "miss" | "weekend" | "future";

export interface Department {
  code: string;
  name: string;
  isActive: boolean;
}

export interface Area {
  id: string;
  name: string;
  department: string;
}

export interface Submission {
  submissionId: string;
  department: string;
  area: string;
  reporter: string;
  reporterEmail: string;
  photoTime: string; // ISO
  submissionDate: string; // YYYY-MM-DD (Asia/Ho_Chi_Minh)
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  geoStatus: GeoStatus;
  status: SubmissionStatus;
}

export interface UnitKpi {
  code: string;
  name: string;
  submittedDays: number;
  expectedDays: number;
  completionRate: number; // 0..1
  photoCount: number;
}

export interface HeatmapCell {
  day: string; // "01".."31"
  status: DayStatus;
}

export interface HeatmapRow {
  code: string;
  cells: HeatmapCell[];
}
