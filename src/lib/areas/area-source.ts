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
/** Mã phòng PG đang unresolved (Q4) — cache 5 phút; diff membership CHỈ do các
 *  mã này (vd PMKT) là "known legacy diff", không tính vào parity thật. */
let unresolvedCache: { codes: Set<string>; at: number } | null = null;
async function getUnresolvedCodes(): Promise<Set<string>> {
  if (unresolvedCache && Date.now() - unresolvedCache.at < 300_000) return unresolvedCache.codes;
  try {
    const r = await appPool().query(
      `SELECT DISTINCT department_code FROM department_area_assignments WHERE unresolved_department = TRUE`);
    unresolvedCache = { codes: new Set(r.rows.map((x) => String(x.department_code))), at: Date.now() };
  } catch {
    unresolvedCache = { codes: new Set(), at: Date.now() };
  }
  return unresolvedCache.codes;
}

interface ShadowDiff extends Record<string, unknown> {
  differentFields: number;      // diff THẬT (đã loại known legacy)
  knownLegacyDiffs?: number;    // diff chỉ do mã unresolved hiển thị bên SP
}

function diffAreas(sp: SourceArea[], pg: SourceArea[], unresolved: Set<string>): ShadowDiff {
  const spSet = new Map(sp.map((a) => [a.code, a]));
  const pgSet = new Map(pg.map((a) => [a.code, a]));
  const missingInPostgres = sp.filter((a) => !pgSet.has(a.code)).map((a) => a.code);
  const missingInSharePoint = pg.filter((a) => !spSet.has(a.code)).map((a) => a.code);
  let differentFields = 0, knownLegacyDiffs = 0;
  const details: string[] = [];
  for (const [code, s] of spSet) {
    const p = pgSet.get(code);
    if (!p) continue;
    const fields: string[] = [];
    if (s.name !== p.name) fields.push("name");
    if (s.parentCode !== p.parentCode) fields.push("parent");
    if (s.areaType !== p.areaType) fields.push("type");
    if (s.isCaptureRequired !== p.isCaptureRequired) fields.push("required");
    const sym = [...new Set([...s.departments, ...p.departments])]
      .filter((d) => s.departments.includes(d) !== p.departments.includes(d));
    if (sym.length) {
      if (sym.every((d) => unresolved.has(d))) knownLegacyDiffs++;
      else fields.push(`depts(${sym.slice(0, 5).join("+")})`);
    }
    if (fields.length) { differentFields++; if (details.length < 10) details.push(`${code}:${fields.join("/")}`); }
  }
  return { sharepointCount: sp.length, postgresCount: pg.length, missingInPostgres, missingInSharePoint, differentFields, knownLegacyDiffs, ...(details.length ? { details } : {}) };
}

/* ── Shadow stats (in-memory, từ lần restart — cho Admin Shadow Monitor) ────── */
export interface ShadowEntry {
  at: string; operation: string; departmentCode: string | null;
  differentFields: number; knownLegacyDiffs: number;
  missingInPostgres: number; missingInSharePoint: number;
  durationSpMs: number; durationPgMs: number | null; shadowError: string | null;
  detail: Record<string, unknown>;
}
const shadowStats = {
  since: new Date().toISOString(),
  total: 0, clean: 0, realDiff: 0, knownOnly: 0, errors: 0,
  sumSpMs: 0, sumPgMs: 0, pgSamples: 0,
  recent: [] as ShadowEntry[], // ring ≤ 100 (ưu tiên lưu diff/error)
};
function recordShadow(e: ShadowEntry): void {
  shadowStats.total++;
  if (e.shadowError) shadowStats.errors++;
  else if (e.differentFields > 0 || e.missingInPostgres > 0 || e.missingInSharePoint > 0) shadowStats.realDiff++;
  else if (e.knownLegacyDiffs > 0) shadowStats.knownOnly++;
  else shadowStats.clean++;
  shadowStats.sumSpMs += e.durationSpMs;
  if (e.durationPgMs != null) { shadowStats.sumPgMs += e.durationPgMs; shadowStats.pgSamples++; }
  shadowStats.recent.unshift(e);
  if (shadowStats.recent.length > 100) {
    // giữ lại entry có vấn đề lâu hơn entry sạch
    const idx = shadowStats.recent.map((x, i) => ({ x, i }))
      .reverse().find(({ x }) => !x.shadowError && x.differentFields === 0 && x.missingInPostgres === 0 && x.missingInSharePoint === 0)?.i;
    shadowStats.recent.splice(idx ?? shadowStats.recent.length - 1, 1);
  }
}
export function getShadowStats() {
  const okForCutover = shadowStats.total > 0 && shadowStats.realDiff === 0 && shadowStats.errors === 0;
  return {
    ...getAreaSourceDiagnostics(),
    since: shadowStats.since,
    total: shadowStats.total,
    clean: shadowStats.clean,
    knownOnly: shadowStats.knownOnly,
    realDiff: shadowStats.realDiff,
    errors: shadowStats.errors,
    parityPct: shadowStats.total ? Math.round(((shadowStats.clean + shadowStats.knownOnly) / shadowStats.total) * 1000) / 10 : null,
    avgSpMs: shadowStats.total ? Math.round(shadowStats.sumSpMs / shadowStats.total) : null,
    avgPgMs: shadowStats.pgSamples ? Math.round(shadowStats.sumPgMs / shadowStats.pgSamples) : null,
    okForCutover,
    recent: shadowStats.recent.slice(0, 20),
    recentAll: shadowStats.recent,
  };
}

async function withShadow<T>(
  operation: string,
  departmentCode: string | null,
  primary: () => Promise<T>,
  shadow: () => Promise<T>,
  compare: (a: T, b: T, unresolved: Set<string>) => Record<string, unknown>,
): Promise<T> {
  if (areaSource() === "postgres") return shadow(); // postgres là nguồn chính
  if (!shadowEnabled() || Math.random() >= sampleRate()) return primary();
  const t0 = Date.now();
  const spRes = await primary();
  const durationSpMs = Date.now() - t0;
  try {
    const t1 = Date.now();
    const [pgRes, unresolved] = await Promise.all([shadow(), getUnresolvedCodes()]);
    const durationPgMs = Date.now() - t1;
    const diff = compare(spRes, pgRes, unresolved);
    console.log("[5S_AREA_SHADOW]", JSON.stringify({ operation, departmentCode, ...diff, durationSpMs, durationPgMs }));
    recordShadow({
      at: new Date().toISOString(), operation, departmentCode,
      differentFields: Number(diff.differentFields ?? 0), knownLegacyDiffs: Number(diff.knownLegacyDiffs ?? 0),
      missingInPostgres: Array.isArray(diff.missingInPostgres) ? diff.missingInPostgres.length : 0,
      missingInSharePoint: Array.isArray(diff.missingInSharePoint) ? diff.missingInSharePoint.length : 0,
      durationSpMs, durationPgMs, shadowError: null, detail: diff,
    });
  } catch (e) {
    const shadowError = (e as Error).message?.slice(0, 160) ?? "error";
    console.warn("[5S_AREA_SHADOW]", JSON.stringify({ operation, departmentCode, shadowError, durationSpMs }));
    recordShadow({
      at: new Date().toISOString(), operation, departmentCode,
      differentFields: 0, knownLegacyDiffs: 0, missingInPostgres: 0, missingInSharePoint: 0,
      durationSpMs, durationPgMs: null, shadowError, detail: {},
    });
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
    (a, b) => {
      const physicalAreaDiff = a.physicalCapturePoints - b.physicalCapturePoints;
      const kpiObligationDiff = a.departmentAreaObligations - b.departmentAreaObligations;
      const assignmentCountDiff = a.perDepartment.length - b.perDepartment.length;
      return {
        physicalAreaDiff, kpiObligationDiff, assignmentCountDiff,
        differentFields: physicalAreaDiff !== 0 || kpiObligationDiff !== 0 || assignmentCountDiff !== 0 ? 1 : 0,
        spPhysical: a.physicalCapturePoints, pgPhysical: b.physicalCapturePoints,
        spObligations: a.departmentAreaObligations, pgObligations: b.departmentAreaObligations,
      };
    });
}

/** Chẩn đoán nhanh cho admin/vận hành. */
export function getAreaSourceDiagnostics(): { source: string; shadowEnabled: boolean; sampleRate: number } {
  return { source: areaSource(), shadowEnabled: shadowEnabled(), sampleRate: sampleRate() };
}
