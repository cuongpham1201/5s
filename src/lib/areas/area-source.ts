/**
 * AREA SOURCE (P3B → P9.5) — điểm đọc khu vực DUY NHẤT cho business logic.
 *
 * Từ P5 cutover, nguồn CHÍNH THỨC là PostgreSQL (five_s_areas +
 * department_area_assignments). P9.5 gỡ adapter SharePoint (Config_Areas) và
 * shadow-read: Config_Areas chỉ còn là backup dữ liệu, không reader runtime.
 *
 * AREA_SOURCE (env, tùy chọn): chỉ chấp nhận "postgres". Thiếu env → postgres.
 * Giá trị khác → log lỗi to (không throw: caller KPI dùng .catch(()=>[]) nên
 * throw sẽ thành dashboard trống im lặng — log rõ là tín hiệu vận hành đúng).
 *
 * - PG picker parity: NHÓM cha hiển thị khi ≥1 khu con được gán (union HIỂN THỊ,
 *   không phải assignment, không ảnh hưởng KPI).
 * - Node-only (pg) — không dùng trong middleware/edge.
 */
import { appPool } from "../db/pg";

export type FacadeAreaType = "group" | "location" | "capture_point";

export interface SourceArea {
  code: string;
  name: string;
  parentCode: string | null;
  areaType: FacadeAreaType;
  isCaptureRequired: boolean;
  /** Mã phòng ban vận hành được gán (nhóm cha = union HIỂN THỊ của các con). */
  departments: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface AreaKpiBase {
  /** Số điểm chụp vật lý unique (không đếm trùng khu dùng chung). */
  physicalCapturePoints: number;
  /** Tổng NGHĨA VỤ khu vực theo phòng ban (khu chung tính cho từng phòng). */
  departmentAreaObligations: number;
  perDepartment: Array<{ departmentCode: string; areaCodes: string[] }>;
}

let warnedBadSource = false;
function checkSourceEnv(): void {
  const v = process.env.AREA_SOURCE;
  if (v && v !== "postgres" && !warnedBadSource) {
    warnedBadSource = true;
    console.error(
      `[AREA_SOURCE] Giá trị "${v}" không còn được hỗ trợ sau P5 cutover — luôn đọc PostgreSQL. Xóa/sửa env AREA_SOURCE=postgres.`,
    );
  }
}

interface PgRow {
  code: string; name: string; parent_code: string | null; area_type: FacadeAreaType;
  is_capture_required: boolean; is_active: boolean; sort_order: number; depts: string[] | null;
}

async function pgLoadActive(): Promise<SourceArea[]> {
  checkSourceEnv();
  // departments per area = assignment operational (active + !unresolved).
  const r = await appPool().query<PgRow>(`
    SELECT a.area_code AS code, a.area_name AS name, p.area_code AS parent_code,
           a.area_type, a.is_capture_required, a.is_active, a.sort_order,
           array_remove(array_agg(DISTINCT s.department_code) FILTER (WHERE s.id IS NOT NULL), NULL) AS depts
    FROM five_s_areas a
    LEFT JOIN five_s_areas p ON p.id = a.parent_id
    LEFT JOIN department_area_assignments s
      ON s.area_id = a.id AND s.is_active = TRUE AND s.unresolved_department = FALSE
    WHERE a.is_active = TRUE
    GROUP BY a.id, p.area_code
    ORDER BY a.sort_order, a.area_name`);
  const rows: SourceArea[] = r.rows.map((x) => ({
    code: x.code, name: x.name, parentCode: x.parent_code ?? null,
    areaType: x.area_type, isCaptureRequired: !!x.is_capture_required,
    departments: (x.depts ?? []).sort(), isActive: !!x.is_active, sortOrder: Number(x.sort_order ?? 0),
  }));
  // NHÓM cha: departments = union các con (HIỂN THỊ picker — không phải assignment).
  const byParent = new Map<string, Set<string>>();
  for (const a of rows) {
    if (!a.parentCode) continue;
    const set = byParent.get(a.parentCode) ?? new Set<string>();
    a.departments.forEach((d) => set.add(d));
    byParent.set(a.parentCode, set);
  }
  for (const a of rows) {
    if (a.areaType === "group" || byParent.has(a.code)) {
      const set = byParent.get(a.code) ?? new Set<string>();
      a.departments = [...new Set([...a.departments, ...set])].sort();
    }
  }
  return rows;
}

/* ── PUBLIC FACADE (contract giữ nguyên từ P3B) ─────────────────────────────── */
export async function listAreasByDepartmentCode(departmentCode: string): Promise<SourceArea[]> {
  return (await pgLoadActive()).filter((a) => a.departments.includes(departmentCode));
}

export async function listAreaTree(): Promise<SourceArea[]> {
  return pgLoadActive();
}

export async function getAreaByCode(code: string): Promise<SourceArea | null> {
  return (await pgLoadActive()).find((a) => a.code === code) ?? null;
}

export async function getAreaGroupNameMap(): Promise<Map<string, string>> {
  const r = await appPool().query(`
    SELECT a.area_code, a.area_name, p.area_name AS parent_name
    FROM five_s_areas a LEFT JOIN five_s_areas p ON p.id = a.parent_id`);
  return new Map(r.rows.map((x) => [String(x.area_code), String(x.parent_name ?? x.area_name).trim()]));
}

export async function getAreaKpiBase(activeDeptCodes?: string[]): Promise<AreaKpiBase> {
  checkSourceEnv();
  const filter = activeDeptCodes ? new Set(activeDeptCodes) : null;
  const r = await appPool().query(`
    SELECT s.department_code, array_agg(DISTINCT a.area_code) AS area_codes
    FROM department_area_assignments s
    JOIN five_s_areas a ON a.id = s.area_id
    WHERE s.is_active = TRUE AND s.is_required = TRUE AND s.unresolved_department = FALSE
      AND a.is_active = TRUE AND a.is_capture_required = TRUE
    GROUP BY s.department_code ORDER BY s.department_code`);
  const perDepartment = r.rows
    .map((x) => ({ departmentCode: String(x.department_code), areaCodes: (x.area_codes as string[]).sort() }))
    .filter((x) => !filter || filter.has(x.departmentCode));
  const phys = await appPool().query(
    `SELECT count(*)::int n FROM five_s_areas WHERE is_active = TRUE AND is_capture_required = TRUE`);
  return {
    physicalCapturePoints: phys.rows[0].n,
    departmentAreaObligations: perDepartment.reduce((s, d) => s + d.areaCodes.length, 0),
    perDepartment,
  };
}
