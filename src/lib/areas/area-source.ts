/**
 * AREA SOURCE FACADE (P3B) — điểm đọc khu vực DUY NHẤT cho business logic.
 *
 *   AREA_SOURCE=sharepoint|postgres      (default: sharepoint)
 *   AREA_SHADOW_READ_ENABLED=true|false  (default: false)
 *   AREA_SHADOW_LOG_SAMPLE_RATE=0..1     (default: 1)
 *
 * - source=sharepoint: response từ SharePoint (Config_Areas). Nếu shadow bật:
 *   đọc PostgreSQL song song, log diff [5S_AREA_SHADOW] — KHÔNG ảnh hưởng
 *   response, shadow lỗi chỉ warning.
 * - source=postgres: đọc five_s_areas + department_area_assignments (đã migrate).
 * - Hai adapter trả CÙNG contract (SourceArea/AreaKpiBase, normalize đủ field).
 * - PG picker parity: NHÓM cha hiển thị khi ≥1 khu con được gán (giống hành vi
 *   union của SharePoint) — thuần HIỂN THỊ, không phải assignment, không KPI.
 * - Node-only (pg) — không dùng trong middleware/edge.
 */
import {
  listActiveAreas as spListActiveAreas,
  listAreasByDepartmentCode as spListByDept,
  areaGroupNameMap as spGroupNameMap,
  type AreaOption,
} from "../sharepoint/area-service";
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

export function areaSource(): "sharepoint" | "postgres" {
  return process.env.AREA_SOURCE === "postgres" ? "postgres" : "sharepoint";
}
const shadowEnabled = () => process.env.AREA_SHADOW_READ_ENABLED === "true";
const sampleRate = () => {
  const n = Number(process.env.AREA_SHADOW_LOG_SAMPLE_RATE ?? "1");
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 1;
};

/* ── SharePoint adapter (normalize AreaOption → SourceArea) ─────────────────── */
function normalizeSp(list: AreaOption[], all: AreaOption[]): SourceArea[] {
  const hasKids = new Set(all.filter((a) => a.parentCode).map((a) => a.parentCode as string));
  return list.map((a) => {
    const group = !a.parentCode && hasKids.has(a.code);
    return {
      code: a.code,
      name: a.name,
      parentCode: a.parentCode ?? null,
      areaType: group ? "group" : "capture_point",
      isCaptureRequired: !group, // SP không có cờ — quy ước hiện hành: lá = phải chụp
      departments: a.departments,
      isActive: true, // listActiveAreas chỉ trả active
      sortOrder: a.sortOrder,
    };
  });
}

const spAdapter = {
  async tree(): Promise<SourceArea[]> {
    const all = await spListActiveAreas();
    return normalizeSp(all, all);
  },
  async byDept(departmentCode: string): Promise<SourceArea[]> {
    const [mine, all] = await Promise.all([spListByDept(departmentCode), spListActiveAreas()]);
    return normalizeSp(mine, all);
  },
  async byCode(code: string): Promise<SourceArea | null> {
    const all = await spListActiveAreas();
    return normalizeSp(all, all).find((a) => a.code === code) ?? null;
  },
  async groupNameMap(): Promise<Map<string, string>> {
    return spGroupNameMap();
  },
  async kpiBase(activeDeptCodes?: string[]): Promise<AreaKpiBase> {
    const tree = await this.tree();
    const leaves = tree.filter((a) => a.areaType !== "group");
    const filter = activeDeptCodes ? new Set(activeDeptCodes) : null;
    const per = new Map<string, string[]>();
    for (const a of leaves) {
      for (const d of a.departments) {
        if (filter && !filter.has(d)) continue;
        per.set(d, [...(per.get(d) ?? []), a.code]);
      }
    }
    const perDepartment = [...per]
      .map(([departmentCode, areaCodes]) => ({ departmentCode, areaCodes: [...areaCodes].sort() }))
      .sort((x, y) => x.departmentCode.localeCompare(y.departmentCode));
    return {
      physicalCapturePoints: leaves.length,
      departmentAreaObligations: perDepartment.reduce((s, d) => s + d.areaCodes.length, 0),
      perDepartment,
    };
  },
};

/* ── PostgreSQL adapter (five_s_areas + assignments operational) ────────────── */
interface PgRow {
  code: string; name: string; parent_code: string | null; area_type: FacadeAreaType;
  is_capture_required: boolean; is_active: boolean; sort_order: number; depts: string[] | null;
}

async function pgLoadActive(): Promise<SourceArea[]> {
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

const pgAdapter = {
  async tree(): Promise<SourceArea[]> {
    return pgLoadActive();
  },
  async byDept(departmentCode: string): Promise<SourceArea[]> {
    return (await pgLoadActive()).filter((a) => a.departments.includes(departmentCode));
  },
  async byCode(code: string): Promise<SourceArea | null> {
    return (await pgLoadActive()).find((a) => a.code === code) ?? null;
  },
  async groupNameMap(): Promise<Map<string, string>> {
    const r = await appPool().query(`
      SELECT a.area_code, a.area_name, p.area_name AS parent_name
      FROM five_s_areas a LEFT JOIN five_s_areas p ON p.id = a.parent_id`);
    return new Map(r.rows.map((x) => [String(x.area_code), String(x.parent_name ?? x.area_name).trim()]));
  },
  async kpiBase(activeDeptCodes?: string[]): Promise<AreaKpiBase> {
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
  },
};

/* ── Shadow compare (source=sharepoint + shadow bật) ────────────────────────── */
function diffAreas(sp: SourceArea[], pg: SourceArea[]) {
  const spSet = new Map(sp.map((a) => [a.code, a]));
  const pgSet = new Map(pg.map((a) => [a.code, a]));
  const missingInPostgres = sp.filter((a) => !pgSet.has(a.code)).map((a) => a.code);
  const missingInSharePoint = pg.filter((a) => !spSet.has(a.code)).map((a) => a.code);
  let differentFields = 0;
  for (const [code, s] of spSet) {
    const p = pgSet.get(code);
    if (!p) continue;
    if (s.name !== p.name || s.parentCode !== p.parentCode || s.areaType !== p.areaType ||
        s.isCaptureRequired !== p.isCaptureRequired ||
        s.departments.join(",") !== [...p.departments].sort().join(",")) differentFields++;
  }
  return { sharepointCount: sp.length, postgresCount: pg.length, missingInPostgres, missingInSharePoint, differentFields };
}

async function withShadow<T>(
  operation: string,
  departmentCode: string | null,
  primary: () => Promise<T>,
  shadow: () => Promise<T>,
  compare: (a: T, b: T) => Record<string, unknown>,
): Promise<T> {
  if (areaSource() === "postgres") return shadow(); // postgres là nguồn chính
  if (!shadowEnabled() || Math.random() >= sampleRate()) return primary();
  const t0 = Date.now();
  const spRes = await primary();
  const durationSpMs = Date.now() - t0;
  try {
    const t1 = Date.now();
    const pgRes = await shadow();
    const durationPgMs = Date.now() - t1;
    console.log("[5S_AREA_SHADOW]", JSON.stringify({
      operation, departmentCode, ...compare(spRes, pgRes), durationSpMs, durationPgMs,
    }));
  } catch (e) {
    console.warn("[5S_AREA_SHADOW]", JSON.stringify({
      operation, departmentCode, shadowError: (e as Error).message?.slice(0, 160), durationSpMs,
    }));
  }
  return spRes; // response LUÔN là SharePoint khi source=sharepoint
}

/* ── PUBLIC FACADE ──────────────────────────────────────────────────────────── */
export async function listAreasByDepartmentCode(departmentCode: string): Promise<SourceArea[]> {
  return withShadow("byDept", departmentCode,
    () => spAdapter.byDept(departmentCode), () => pgAdapter.byDept(departmentCode), diffAreas);
}

export async function listAreaTree(): Promise<SourceArea[]> {
  return withShadow("tree", null, () => spAdapter.tree(), () => pgAdapter.tree(), diffAreas);
}

export async function getAreaByCode(code: string): Promise<SourceArea | null> {
  return withShadow("byCode", null,
    () => spAdapter.byCode(code), () => pgAdapter.byCode(code),
    (a, b) => ({ spFound: !!a, pgFound: !!b, differentFields: a && b && (a.name !== b.name || a.parentCode !== b.parentCode) ? 1 : 0 }));
}

export async function getAreaGroupNameMap(): Promise<Map<string, string>> {
  return withShadow("groupNameMap", null,
    () => spAdapter.groupNameMap(), () => pgAdapter.groupNameMap(),
    (a, b) => {
      let mismatch = 0;
      for (const [k, v] of a) if (b.has(k) && b.get(k) !== v) mismatch++;
      return { sharepointCount: a.size, postgresCount: b.size, differentFields: mismatch };
    });
}

export async function getAreaKpiBase(activeDeptCodes?: string[]): Promise<AreaKpiBase> {
  return withShadow("kpiBase", null,
    () => spAdapter.kpiBase(activeDeptCodes), () => pgAdapter.kpiBase(activeDeptCodes),
    (a, b) => ({
      physicalAreaDiff: a.physicalCapturePoints - b.physicalCapturePoints,
      kpiObligationDiff: a.departmentAreaObligations - b.departmentAreaObligations,
      assignmentCountDiff: a.perDepartment.length - b.perDepartment.length,
      spPhysical: a.physicalCapturePoints, pgPhysical: b.physicalCapturePoints,
      spObligations: a.departmentAreaObligations, pgObligations: b.departmentAreaObligations,
    }));
}

/** Chẩn đoán nhanh cho admin/vận hành. */
export function getAreaSourceDiagnostics(): { source: string; shadowEnabled: boolean; sampleRate: number } {
  return { source: areaSource(), shadowEnabled: shadowEnabled(), sampleRate: sampleRate() };
}
