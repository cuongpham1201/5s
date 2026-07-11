/**
 * Versioning cấu hình khu vực 5S (P6) — snapshot / compare / restore / export.
 *
 * Nguyên tắc (đã duyệt):
 *  - Snapshot dùng BUSINESS KEY (area_code, department_code, employee_code) —
 *    KHÔNG dùng raw DB id làm khóa phục hồi.
 *  - Deterministic: areas sort theo area_code; assignments sort theo
 *    (department_code, area_code, assignment_type); field order cố định;
 *    date chuẩn hóa YYYY-MM-DD → cùng dữ liệu = cùng sha256 hash.
 *  - Restore CHỈ tác động five_s_areas + department_area_assignments:
 *    reconcile (upsert theo key + deactivate phần thừa) — KHÔNG truncate,
 *    KHÔNG hard-delete, KHÔNG đụng submission/HRM/app_users/Config_Areas.
 *  - Transaction-safe: đọc snapshot trong REPEATABLE READ; restore trong 1
 *    transaction, verify hash sau restore == hash target, sai → ROLLBACK.
 *  - Versioning tách khỏi read-path Daily/Audit (không import vào facade).
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { appPool } from "../db/pg";

/* ── snapshot shape (business keys only) ─────────────────────────────────── */
export interface SnapArea {
  area_code: string;
  area_name: string;
  parent_area_code: string | null;
  area_type: string;
  is_capture_required: boolean;
  is_active: boolean;
  sort_order: number;
  description: string | null;
  location_note: string | null;
  source: string;
  legacy_sp_id: string | null;
}
export interface SnapAssignment {
  department_code: string;
  area_code: string;
  assignment_type: string;
  is_required: boolean;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  responsible_employee_code: string | null;
  source: string;
  review_status: string;
  unresolved_department: boolean;
  note: string | null;
}
export interface ConfigSnapshot {
  areas: SnapArea[];
  assignments: SnapAssignment[];
}

export interface VersionRow {
  id: number;
  versionNo: number;
  name: string | null;
  description: string | null;
  triggerType: string;
  areasCount: number;
  assignmentsCount: number;
  activeAreasCount: number;
  operationalObligationsCount: number;
  snapshotHash: string;
  createdByEmail: string | null;
  createdAt: string;
  restoredFromVersionId: number | null;
  isProtected: boolean;
}

const dateStr = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10));

/* ── build snapshot hiện tại (REPEATABLE READ) ───────────────────────────── */
export async function buildCurrentSnapshot(existing?: PoolClient): Promise<ConfigSnapshot> {
  const client = existing ?? (await appPool().connect());
  try {
    if (!existing) await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const areas = await client.query(`
      SELECT a.area_code, a.area_name, p.area_code AS parent_area_code, a.area_type,
             a.is_capture_required, a.is_active, a.sort_order, a.description,
             a.location_note, a.source, a.legacy_sp_id
      FROM five_s_areas a LEFT JOIN five_s_areas p ON p.id = a.parent_id
      ORDER BY a.area_code`);
    const asgs = await client.query(`
      SELECT s.department_code, a.area_code, s.assignment_type, s.is_required, s.is_active,
             s.effective_from, s.effective_to, e.employee_code AS responsible_employee_code,
             s.source, s.review_status, s.unresolved_department, s.note
      FROM department_area_assignments s
      JOIN five_s_areas a ON a.id = s.area_id
      LEFT JOIN hr_employees e ON e.id = s.responsible_employee_id
      ORDER BY s.department_code, a.area_code, s.assignment_type`);
    if (!existing) await client.query("COMMIT");
    return {
      areas: areas.rows.map((r) => ({
        area_code: r.area_code, area_name: r.area_name,
        parent_area_code: r.parent_area_code ?? null, area_type: r.area_type,
        is_capture_required: !!r.is_capture_required, is_active: !!r.is_active,
        sort_order: Number(r.sort_order ?? 0), description: r.description ?? null,
        location_note: r.location_note ?? null, source: r.source, legacy_sp_id: r.legacy_sp_id ?? null,
      })),
      assignments: asgs.rows.map((r) => ({
        department_code: r.department_code, area_code: r.area_code,
        assignment_type: r.assignment_type, is_required: !!r.is_required, is_active: !!r.is_active,
        effective_from: dateStr(r.effective_from), effective_to: dateStr(r.effective_to),
        responsible_employee_code: r.responsible_employee_code ?? null,
        source: r.source, review_status: r.review_status,
        unresolved_department: !!r.unresolved_department, note: r.note ?? null,
      })),
    };
  } catch (e) {
    if (!existing) await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    if (!existing) client.release();
  }
}

/**
 * Canonical hóa snapshot: field order CỐ ĐỊNH + ép kiểu — bắt buộc trước khi
 * hash/so sánh chuỗi, vì JSONB của Postgres KHÔNG giữ thứ tự key khi đọc lại.
 */
export function canonicalArea(a: SnapArea): SnapArea {
  return {
    area_code: String(a.area_code), area_name: String(a.area_name),
    parent_area_code: a.parent_area_code ?? null, area_type: String(a.area_type),
    is_capture_required: !!a.is_capture_required, is_active: !!a.is_active,
    sort_order: Number(a.sort_order ?? 0), description: a.description ?? null,
    location_note: a.location_note ?? null, source: String(a.source),
    legacy_sp_id: a.legacy_sp_id ?? null,
  };
}
export function canonicalAssignment(g: SnapAssignment): SnapAssignment {
  return {
    department_code: String(g.department_code), area_code: String(g.area_code),
    assignment_type: String(g.assignment_type), is_required: !!g.is_required,
    is_active: !!g.is_active, effective_from: dateStr(g.effective_from),
    effective_to: dateStr(g.effective_to),
    responsible_employee_code: g.responsible_employee_code ?? null,
    source: String(g.source), review_status: String(g.review_status),
    unresolved_department: !!g.unresolved_department, note: g.note ?? null,
  };
}
export function canonicalSnapshot(s: ConfigSnapshot): ConfigSnapshot {
  return {
    areas: [...s.areas].map(canonicalArea).sort((x, y) => x.area_code.localeCompare(y.area_code)),
    assignments: [...s.assignments].map(canonicalAssignment)
      .sort((x, y) => x.department_code.localeCompare(y.department_code) || x.area_code.localeCompare(y.area_code) || x.assignment_type.localeCompare(y.assignment_type)),
  };
}

/** Giới hạn snapshot hiện tại theo tập key của target (phục vụ verify hash sau
 *  restore — DB giữ row inactive ngoài target nên không so hash toàn cục). */
export function restrictSnapshot(current: ConfigSnapshot, target: ConfigSnapshot): ConfigSnapshot {
  const areaCodes = new Set(target.areas.map((a) => a.area_code));
  const asgKeys = new Set(target.assignments.map((g) => `${g.department_code}|${g.area_code}|${g.assignment_type}`));
  return {
    areas: current.areas.filter((a) => areaCodes.has(a.area_code)),
    assignments: current.assignments.filter((g) => asgKeys.has(`${g.department_code}|${g.area_code}|${g.assignment_type}`)),
  };
}

export function snapshotHash(s: ConfigSnapshot): string {
  return createHash("sha256").update(JSON.stringify(canonicalSnapshot(s))).digest("hex");
}

/* ── KPI thuần từ snapshot ───────────────────────────────────────────────── */
export interface SnapshotKpi {
  physicalCapturePoints: number;
  operationalObligations: number;
  perDepartment: Record<string, number>;
}
export function snapshotKpi(s: ConfigSnapshot): SnapshotKpi {
  const captureAreas = new Set(s.areas.filter((a) => a.is_active && a.is_capture_required).map((a) => a.area_code));
  const per: Record<string, number> = {};
  const seen = new Set<string>();
  for (const g of s.assignments) {
    if (!g.is_active || !g.is_required || g.unresolved_department) continue;
    if (!captureAreas.has(g.area_code)) continue;
    const k = `${g.department_code}|${g.area_code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    per[g.department_code] = (per[g.department_code] ?? 0) + 1;
  }
  return {
    physicalCapturePoints: captureAreas.size,
    operationalObligations: Object.values(per).reduce((x, y) => x + y, 0),
    perDepartment: per,
  };
}

/* ── validate snapshot (chặn restore hỏng) ───────────────────────────────── */
export function validateSnapshot(s: ConfigSnapshot): string[] {
  const errors: string[] = [];
  if (!Array.isArray(s?.areas) || !Array.isArray(s?.assignments)) return ["snapshot JSON không hợp lệ"];
  const codes = new Set<string>();
  for (const a of s.areas) {
    if (!a.area_code || !a.area_name) errors.push(`area thiếu code/name: ${JSON.stringify(a).slice(0, 60)}`);
    if (codes.has(a.area_code)) errors.push(`duplicate area_code: ${a.area_code}`);
    codes.add(a.area_code);
  }
  // cycle theo parent_area_code
  const parent = new Map(s.areas.map((a) => [a.area_code, a.parent_area_code]));
  for (const a of s.areas) {
    const seen = new Set<string>();
    let cur: string | null | undefined = a.area_code;
    while (cur != null) {
      if (seen.has(cur)) { errors.push(`cycle trong cây: ${a.area_code}`); break; }
      seen.add(cur);
      cur = parent.get(cur);
    }
    if (a.parent_area_code && !codes.has(a.parent_area_code)) errors.push(`parent không tồn tại: ${a.area_code} → ${a.parent_area_code}`);
  }
  const akeys = new Set<string>();
  for (const g of s.assignments) {
    if (!g.department_code || !g.area_code) errors.push("assignment thiếu department/area");
    if (!codes.has(g.area_code)) errors.push(`assignment trỏ area không có trong snapshot: ${g.area_code}`);
    const k = `${g.department_code}|${g.area_code}|${g.assignment_type}`;
    if (akeys.has(k)) errors.push(`duplicate assignment: ${k}`);
    akeys.add(k);
  }
  return errors;
}

/* ── audit log (dùng chung bảng area_assignment_changes) ─────────────────── */
async function vlog(client: PoolClient, versionId: number, action: string, detail: unknown, actor: string | null) {
  await client.query(
    `INSERT INTO area_assignment_changes(entity_type, entity_id, action, new_value_json, actor_email)
     VALUES ('version',$1,$2,$3,$4)`,
    [versionId, action, JSON.stringify(detail ?? {}), actor]);
}

/* ── CRUD version ────────────────────────────────────────────────────────── */
function mapVersion(r: Record<string, any>): VersionRow {
  return {
    id: Number(r.id), versionNo: Number(r.version_no), name: r.name ?? null,
    description: r.description ?? null, triggerType: r.trigger_type,
    areasCount: Number(r.areas_count), assignmentsCount: Number(r.assignments_count),
    activeAreasCount: Number(r.active_areas_count),
    operationalObligationsCount: Number(r.operational_obligations_count),
    snapshotHash: r.snapshot_hash, createdByEmail: r.created_by_email ?? null,
    createdAt: r.created_at, restoredFromVersionId: r.restored_from_version_id != null ? Number(r.restored_from_version_id) : null,
    isProtected: !!r.is_protected,
  };
}

export interface CreateSnapshotResult {
  action: "created" | "skipped_same_hash";
  version: VersionRow;
}

export async function createAreaConfigurationSnapshot(opts: {
  name?: string | null; description?: string | null;
  triggerType?: "manual" | "before_restore" | "before_bulk_change" | "migration" | "system";
  actor: string | null; force?: boolean; restoredFromVersionId?: number | null;
  isProtected?: boolean;
}): Promise<CreateSnapshotResult> {
  const snap = await buildCurrentSnapshot();
  const hash = snapshotHash(snap);
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const latest = await client.query(
      `SELECT * FROM area_configuration_versions ORDER BY version_no DESC LIMIT 1 FOR UPDATE`);
    if (!opts.force && latest.rows[0] && latest.rows[0].snapshot_hash === hash) {
      await client.query("COMMIT");
      return { action: "skipped_same_hash", version: mapVersion(latest.rows[0]) };
    }
    const kpi = snapshotKpi(snap);
    const no = latest.rows[0] ? Number(latest.rows[0].version_no) + 1 : 1;
    const r = await client.query(
      `INSERT INTO area_configuration_versions
        (version_no, name, description, trigger_type, areas_count, assignments_count,
         active_areas_count, operational_obligations_count, snapshot_hash, snapshot_json,
         created_by_email, restored_from_version_id, is_protected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [no, opts.name ?? null, opts.description ?? null, opts.triggerType ?? "manual",
       snap.areas.length, snap.assignments.length,
       snap.areas.filter((a) => a.is_active).length, kpi.operationalObligations,
       hash, JSON.stringify(snap), opts.actor, opts.restoredFromVersionId ?? null, opts.isProtected ?? false]);
    const v = mapVersion(r.rows[0]);
    await vlog(client, v.id, "snapshot", { versionNo: no, trigger: opts.triggerType ?? "manual", hash: hash.slice(0, 12) }, opts.actor);
    await client.query("COMMIT");
    return { action: "created", version: v };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listAreaConfigurationVersions(limit = 50): Promise<VersionRow[]> {
  const r = await appPool().query(
    `SELECT id, version_no, name, description, trigger_type, areas_count, assignments_count,
            active_areas_count, operational_obligations_count, snapshot_hash, created_by_email,
            created_at, restored_from_version_id, is_protected
     FROM area_configuration_versions ORDER BY version_no DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)]);
  return r.rows.map(mapVersion);
}

export async function getAreaConfigurationVersion(id: number): Promise<{ version: VersionRow; snapshot: ConfigSnapshot } | null> {
  const r = await appPool().query(`SELECT * FROM area_configuration_versions WHERE id=$1`, [id]);
  if (!r.rows[0]) return null;
  return { version: mapVersion(r.rows[0]), snapshot: r.rows[0].snapshot_json as ConfigSnapshot };
}

export async function setVersionProtected(id: number, isProtected: boolean, actor: string | null): Promise<void> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(`UPDATE area_configuration_versions SET is_protected=$2 WHERE id=$1 RETURNING version_no`, [id, isProtected]);
    if (!r.rows[0]) throw new Error("Không tìm thấy version.");
    await vlog(client, id, "protect", { isProtected }, actor);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/* ── COMPARE ─────────────────────────────────────────────────────────────── */
export interface AreaChangeDetail { area_code: string; changes: Record<string, { from: unknown; to: unknown }> }
export interface AssignmentChangeDetail { key: string; changes: Record<string, { from: unknown; to: unknown }> }
export interface SnapshotCompare {
  areas: {
    added: string[]; removed: string[];
    changed: AreaChangeDetail[];   // renamed/moved/type/required/active/sort/description…
  };
  assignments: {
    added: string[]; removed: string[];
    changed: AssignmentChangeDetail[];
  };
  kpi: {
    physicalBefore: number; physicalAfter: number;
    obligationsBefore: number; obligationsAfter: number;
    perDepartmentDiff: Array<{ departmentCode: string; before: number; after: number }>;
  };
}

const AREA_FIELDS: Array<keyof SnapArea> = ["area_name", "parent_area_code", "area_type", "is_capture_required", "is_active", "sort_order", "description", "location_note"];
const ASG_FIELDS: Array<keyof SnapAssignment> = ["is_required", "is_active", "assignment_type", "responsible_employee_code", "review_status", "unresolved_department", "effective_from", "effective_to", "note"];

/** So sánh from → to (to = trạng thái ĐÍCH). */
export function compareSnapshots(from: ConfigSnapshot, to: ConfigSnapshot): SnapshotCompare {
  const fa = new Map(from.areas.map((a) => [a.area_code, a]));
  const ta = new Map(to.areas.map((a) => [a.area_code, a]));
  const areasAdded = [...ta.keys()].filter((c) => !fa.has(c));
  const areasRemoved = [...fa.keys()].filter((c) => !ta.has(c));
  const areasChanged: AreaChangeDetail[] = [];
  for (const [code, f] of fa) {
    const t = ta.get(code);
    if (!t) continue;
    const changes: AreaChangeDetail["changes"] = {};
    for (const k of AREA_FIELDS) if (JSON.stringify(f[k]) !== JSON.stringify(t[k])) changes[k] = { from: f[k], to: t[k] };
    if (Object.keys(changes).length) areasChanged.push({ area_code: code, changes });
  }
  const key = (g: SnapAssignment) => `${g.department_code}|${g.area_code}|${g.assignment_type}`;
  const fg = new Map(from.assignments.map((g) => [key(g), g]));
  const tg = new Map(to.assignments.map((g) => [key(g), g]));
  const asgAdded = [...tg.keys()].filter((k) => !fg.has(k));
  const asgRemoved = [...fg.keys()].filter((k) => !tg.has(k));
  const asgChanged: AssignmentChangeDetail[] = [];
  for (const [k, f] of fg) {
    const t = tg.get(k);
    if (!t) continue;
    const changes: AssignmentChangeDetail["changes"] = {};
    for (const fld of ASG_FIELDS) if (JSON.stringify(f[fld]) !== JSON.stringify(t[fld])) changes[fld] = { from: f[fld], to: t[fld] };
    if (Object.keys(changes).length) asgChanged.push({ key: k, changes });
  }
  const kf = snapshotKpi(from), kt = snapshotKpi(to);
  const deptSet = new Set([...Object.keys(kf.perDepartment), ...Object.keys(kt.perDepartment)]);
  return {
    areas: { added: areasAdded, removed: areasRemoved, changed: areasChanged },
    assignments: { added: asgAdded, removed: asgRemoved, changed: asgChanged },
    kpi: {
      physicalBefore: kf.physicalCapturePoints, physicalAfter: kt.physicalCapturePoints,
      obligationsBefore: kf.operationalObligations, obligationsAfter: kt.operationalObligations,
      perDepartmentDiff: [...deptSet].sort()
        .map((d) => ({ departmentCode: d, before: kf.perDepartment[d] ?? 0, after: kt.perDepartment[d] ?? 0 }))
        .filter((x) => x.before !== x.after),
    },
  };
}

/* ── RESTORE ─────────────────────────────────────────────────────────────── */
export interface RestorePreview {
  valid: boolean;
  validationErrors: string[];
  compare: SnapshotCompare;
  planned: { areasUpsert: number; areasDeactivate: number; assignmentsUpsert: number; assignmentsDeactivate: number };
  warnings: string[];
}

export async function previewRestoreAreaConfiguration(versionId: number, actor: string | null): Promise<RestorePreview> {
  const v = await getAreaConfigurationVersion(versionId);
  if (!v) throw new Error("Không tìm thấy version.");
  const target = v.snapshot;
  const errors = validateSnapshot(target);
  const current = await buildCurrentSnapshot();
  const cmp = compareSnapshots(current, target);
  const curAreaCodes = new Set(current.areas.map((a) => a.area_code));
  const tgtAreaCodes = new Set(target.areas.map((a) => a.area_code));
  const key = (g: SnapAssignment) => `${g.department_code}|${g.area_code}|${g.assignment_type}`;
  const curAsg = new Set(current.assignments.map(key));
  const tgtAsg = new Set(target.assignments.map(key));
  const warnings: string[] = [];
  const unresolvedInTarget = target.assignments.filter((g) => g.unresolved_department && g.is_active).length;
  if (unresolvedInTarget) warnings.push(`${unresolvedInTarget} assignment unresolved sẽ quay lại trạng thái active (không picker/KPI).`);
  const respMissing: string[] = [];
  for (const g of target.assignments) {
    if (!g.responsible_employee_code) continue;
    respMissing.push(g.responsible_employee_code);
  }
  if (respMissing.length) {
    const r = await appPool().query(`SELECT employee_code FROM hr_employees WHERE employee_code = ANY($1)`, [respMissing]);
    const have = new Set(r.rows.map((x) => String(x.employee_code)));
    const miss = [...new Set(respMissing.filter((c) => !have.has(c)))];
    if (miss.length) warnings.push(`responsible_employee_code không còn trong HRM (sẽ set NULL): ${miss.join(", ")}`);
  }
  const preview: RestorePreview = {
    valid: errors.length === 0,
    validationErrors: errors,
    compare: cmp,
    planned: {
      areasUpsert: target.areas.length,
      areasDeactivate: [...curAreaCodes].filter((c) => !tgtAreaCodes.has(c)).length,
      assignmentsUpsert: target.assignments.length,
      assignmentsDeactivate: [...curAsg].filter((k) => !tgtAsg.has(k)).length,
    },
    warnings,
  };
  const client = await appPool().connect();
  try { await vlog(client, versionId, "restore_preview", { planned: preview.planned, valid: preview.valid }, actor); }
  finally { client.release(); }
  return preview;
}

export interface RestoreResult {
  restored: true;
  versionId: number;
  beforeRestoreVersionId: number;
  verifyHashMatch: true;
  counts: { areasUpserted: number; areasDeactivated: number; assignmentsUpserted: number; assignmentsDeactivated: number };
}

export async function restoreAreaConfiguration(versionId: number, actor: string | null): Promise<RestoreResult> {
  const v = await getAreaConfigurationVersion(versionId);
  if (!v) throw new Error("Không tìm thấy version.");
  const target = v.snapshot;
  const errors = validateSnapshot(target);
  if (errors.length) throw new Error(`Snapshot không hợp lệ, chặn restore: ${errors.slice(0, 3).join(" · ")}`);
  // INTEGRITY: hash lưu trong cột phải khớp hash tính lại từ snapshot_json —
  // JSON bị sửa tay/hỏng → CHẶN trước khi đụng dữ liệu.
  if (snapshotHash(target) !== v.version.snapshotHash) {
    throw new Error("Snapshot integrity fail: hash JSON không khớp hash đã lưu — chặn restore.");
  }

  // 4) auto snapshot before_restore (force — luôn lưu trạng thái ngay trước restore)
  const before = await createAreaConfigurationSnapshot({
    name: `before restore v${v.version.versionNo}`,
    triggerType: "before_restore", actor, force: true,
  });

  const client = await appPool().connect();
  const counts = { areasUpserted: 0, areasDeactivated: 0, assignmentsUpserted: 0, assignmentsDeactivated: 0 };
  try {
    await client.query("BEGIN");
    // PASS 1 — upsert areas theo area_code (parent để null, resolve ở pass 2)
    for (const a of target.areas) {
      const r = await client.query(
        `INSERT INTO five_s_areas
           (area_code, area_name, area_type, is_capture_required, is_active, sort_order,
            description, location_note, source, legacy_sp_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         ON CONFLICT (area_code) DO UPDATE SET
           area_name=EXCLUDED.area_name, area_type=EXCLUDED.area_type,
           is_capture_required=EXCLUDED.is_capture_required, is_active=EXCLUDED.is_active,
           sort_order=EXCLUDED.sort_order, description=EXCLUDED.description,
           location_note=EXCLUDED.location_note, source=EXCLUDED.source,
           legacy_sp_id=EXCLUDED.legacy_sp_id, updated_at=now(), updated_by=$11
         RETURNING id`,
        [a.area_code, a.area_name, a.area_type, a.is_capture_required, a.is_active,
         a.sort_order, a.description, a.location_note, a.source, a.legacy_sp_id, actor]);
      if (r.rows[0]) counts.areasUpserted++;
    }
    // areas ngoài snapshot → deactivate (không xóa — FK/lịch sử an toàn)
    const deact = await client.query(
      `UPDATE five_s_areas SET is_active=FALSE, updated_at=now(), updated_by=$2
       WHERE area_code <> ALL($1) AND is_active=TRUE RETURNING id`,
      [target.areas.map((a) => a.area_code), actor]);
    counts.areasDeactivated = deact.rowCount ?? 0;
    // PASS 2 — resolve parent theo parent_area_code
    await client.query(`
      UPDATE five_s_areas c SET parent_id = NULL
      WHERE c.area_code = ANY($1)`, [target.areas.filter((a) => !a.parent_area_code).map((a) => a.area_code)]);
    for (const a of target.areas) {
      if (!a.parent_area_code) continue;
      await client.query(
        `UPDATE five_s_areas c SET parent_id = p.id
         FROM five_s_areas p WHERE c.area_code=$1 AND p.area_code=$2`,
        [a.area_code, a.parent_area_code]);
    }
    // ASSIGNMENTS — upsert theo (dept, area, type); resolve employee theo code
    for (const g of target.assignments) {
      const r = await client.query(
        `INSERT INTO department_area_assignments
           (department_code, area_id, assignment_type, is_required, is_active,
            effective_from, effective_to, responsible_employee_id, source, review_status,
            unresolved_department, note, created_by, updated_by)
         SELECT $1, a.id, $3, $4, $5, $6::date, $7::date,
                (SELECT e.id FROM hr_employees e WHERE e.employee_code=$8),
                $9, $10, $11, $12, $13, $13
         FROM five_s_areas a WHERE a.area_code=$2
         ON CONFLICT (department_code, area_id, assignment_type) DO UPDATE SET
           is_required=EXCLUDED.is_required, is_active=EXCLUDED.is_active,
           effective_from=EXCLUDED.effective_from, effective_to=EXCLUDED.effective_to,
           responsible_employee_id=EXCLUDED.responsible_employee_id,
           source=EXCLUDED.source, review_status=EXCLUDED.review_status,
           unresolved_department=EXCLUDED.unresolved_department, note=EXCLUDED.note,
           updated_at=now(), updated_by=$13
         RETURNING id`,
        [g.department_code, g.area_code, g.assignment_type, g.is_required, g.is_active,
         g.effective_from, g.effective_to, g.responsible_employee_code,
         g.source, g.review_status, g.unresolved_department, g.note, actor]);
      if (r.rows[0]) counts.assignmentsUpserted++;
    }
    // assignments ngoài snapshot → deactivate
    const tgtKeys = target.assignments.map((g) => `${g.department_code}|${g.area_code}|${g.assignment_type}`);
    const deactA = await client.query(
      `UPDATE department_area_assignments s SET is_active=FALSE, updated_at=now(), updated_by=$2
       FROM five_s_areas a
       WHERE a.id=s.area_id AND s.is_active=TRUE
         AND (s.department_code || '|' || a.area_code || '|' || s.assignment_type) <> ALL($1)
       RETURNING s.id`,
      [tgtKeys, actor]);
    counts.assignmentsDeactivated = deactA.rowCount ?? 0;

    // 6) VERIFY: hash sau restore == hash target (so trên canonical form)
    const after = await buildCurrentSnapshot(client);
    // Chỉ so phần LOGIC snapshot chứa (assignments của area bị deactivate ngoài
    // snapshot vẫn còn row inactive trong DB → after chứa nhiều row hơn target).
    // Chuẩn verify: mọi phần tử target khớp CHÍNH XÁC + không phần tử ACTIVE nào
    // ngoài target.
    const afterAreas = new Map(after.areas.map((a) => [a.area_code, a]));
    const afterAsg = new Map(after.assignments.map((g) => [`${g.department_code}|${g.area_code}|${g.assignment_type}`, g]));
    for (const a of target.areas) {
      const got = afterAreas.get(a.area_code);
      if (!got || JSON.stringify(canonicalArea(got)) !== JSON.stringify(canonicalArea(a))) throw new Error(`Verify fail (area ${a.area_code}) — rollback.`);
    }
    for (const g of target.assignments) {
      const got = afterAsg.get(`${g.department_code}|${g.area_code}|${g.assignment_type}`);
      if (!got || JSON.stringify(canonicalAssignment(got)) !== JSON.stringify(canonicalAssignment(g))) throw new Error(`Verify fail (assignment ${g.department_code}@${g.area_code}) — rollback.`);
    }
    const tgtAreaSet = new Set(target.areas.map((a) => a.area_code));
    for (const a of after.areas) if (a.is_active && !tgtAreaSet.has(a.area_code)) throw new Error(`Verify fail (area thừa active ${a.area_code}) — rollback.`);
    const tgtAsgSet = new Set(tgtKeys);
    for (const g of after.assignments) {
      const k = `${g.department_code}|${g.area_code}|${g.assignment_type}`;
      if (g.is_active && !tgtAsgSet.has(k)) throw new Error(`Verify fail (assignment thừa active ${k}) — rollback.`);
    }

    // VERIFY HASH: trạng thái DB giới hạn theo target phải cho ĐÚNG hash target.
    const restrictedHash = snapshotHash(restrictSnapshot(after, target));
    if (restrictedHash !== v.version.snapshotHash) {
      throw new Error("Verify hash sau restore không khớp target — rollback.");
    }
    await vlog(client, versionId, "restore", { counts, beforeRestoreVersionId: before.version.id, verifiedHash: restrictedHash.slice(0, 12) }, actor);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { restored: true, versionId, beforeRestoreVersionId: before.version.id, verifyHashMatch: true, counts };
}

/* ── EXPORT ──────────────────────────────────────────────────────────────── */
export async function exportAreaConfigurationVersion(id: number, actor: string | null): Promise<{ version: VersionRow; snapshot: ConfigSnapshot }> {
  const v = await getAreaConfigurationVersion(id);
  if (!v) throw new Error("Không tìm thấy version.");
  const client = await appPool().connect();
  try { await vlog(client, id, "export", { versionNo: v.version.versionNo }, actor); }
  finally { client.release(); }
  return v;
}
