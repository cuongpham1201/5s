/**
 * Assignment phòng ban ↔ khu vực (department_area_assignments) — P1 service.
 *
 * Nguyên tắc (đã duyệt):
 *  - Mọi quan hệ là bản ghi TƯỜNG MINH; parent assignment KHÔNG suy ra child.
 *  - Duplicate guard: UNIQUE(department_code, area_id, assignment_type);
 *    assign idempotent (đã có + inactive → reactivate; đã có + active → skip).
 *  - Bulk assign = tạo từng row explicit, idempotent, log 'bulk_assign'.
 *  - Unassign = soft (is_active=false) + log; không hard-delete khi có lịch sử.
 *  - OPERATIONAL (picker/KPI sau này) = assignment.is_active ∧ area.is_active ∧
 *    NOT unresolved_department. pending_review bulk-CSV hợp lệ VẪN tính KPI
 *    (giữ baseline Q2); unresolved KHÔNG tính (Q4).
 *  - Q3: re-map department_id (FK HRM) qua remapDepartmentId — KHÔNG tạo row mới.
 */
import { appPool } from "../db/pg";
import { _logAreaChange as logChange } from "./area-pg-service";

export type AssignmentType = "owner" | "participant" | "shared";
export type AssignmentSource = "manual" | "migrated_direct" | "migrated_bulk_csv" | "migrated_inherited";

export interface AssignmentRow {
  id: number;
  departmentCode: string;
  departmentId: number | null;
  areaId: number;
  assignmentType: AssignmentType;
  isRequired: boolean;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  responsibleEmployeeId: number | null;
  source: AssignmentSource;
  reviewStatus: "approved" | "pending_review";
  unresolvedDepartment: boolean;
  note: string | null;
}

export interface AssignInput {
  departmentCode: string;
  areaId: number;
  assignmentType?: AssignmentType;
  isRequired?: boolean;
  responsibleEmployeeId?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  source?: AssignmentSource;
  reviewStatus?: "approved" | "pending_review";
  unresolvedDepartment?: boolean;
  departmentId?: number | null;
  note?: string | null;
}

function mapRow(r: Record<string, any>): AssignmentRow {
  return {
    id: Number(r.id),
    departmentCode: r.department_code,
    departmentId: r.department_id != null ? Number(r.department_id) : null,
    areaId: Number(r.area_id),
    assignmentType: r.assignment_type,
    isRequired: !!r.is_required,
    isActive: !!r.is_active,
    effectiveFrom: r.effective_from ?? null,
    effectiveTo: r.effective_to ?? null,
    responsibleEmployeeId: r.responsible_employee_id != null ? Number(r.responsible_employee_id) : null,
    source: r.source,
    reviewStatus: r.review_status,
    unresolvedDepartment: !!r.unresolved_department,
    note: r.note ?? null,
  };
}

export interface AssignResult {
  action: "created" | "reactivated" | "skipped_duplicate";
  assignment: AssignmentRow;
}

/** Gán 1 phòng ↔ 1 khu (idempotent — không bao giờ duplicate). */
export async function assignDepartmentToArea(input: AssignInput, actor: string | null): Promise<AssignResult> {
  const dept = (input.departmentCode ?? "").trim();
  if (!dept) throw new Error("Thiếu mã phòng ban.");
  const type = input.assignmentType ?? "owner";
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const area = await client.query(`SELECT id FROM five_s_areas WHERE id=$1`, [input.areaId]);
    if (!area.rows[0]) throw new Error("Khu vực không tồn tại.");
    const existing = await client.query(
      `SELECT * FROM department_area_assignments
       WHERE department_code=$1 AND area_id=$2 AND assignment_type=$3 FOR UPDATE`,
      [dept, input.areaId, type],
    );
    if (existing.rows[0]) {
      const row = mapRow(existing.rows[0]);
      if (row.isActive) {
        await client.query("COMMIT");
        return { action: "skipped_duplicate", assignment: row };
      }
      const r = await client.query(
        `UPDATE department_area_assignments
         SET is_active=TRUE, updated_at=now(), updated_by=$2 WHERE id=$1 RETURNING *`,
        [row.id, actor],
      );
      const next = mapRow(r.rows[0]);
      await logChange(client, "assignment", next.id, "assign", { isActive: false }, next, actor);
      await client.query("COMMIT");
      return { action: "reactivated", assignment: next };
    }
    const r = await client.query(
      `INSERT INTO department_area_assignments
         (department_code, department_id, area_id, assignment_type, is_required,
          effective_from, effective_to, responsible_employee_id, source, review_status,
          unresolved_department, note, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
      [dept, input.departmentId ?? null, input.areaId, type, input.isRequired ?? true,
       input.effectiveFrom ?? null, input.effectiveTo ?? null, input.responsibleEmployeeId ?? null,
       input.source ?? "manual", input.reviewStatus ?? "approved",
       input.unresolvedDepartment ?? false, input.note ?? null, actor],
    );
    const next = mapRow(r.rows[0]);
    await logChange(client, "assignment", next.id, "assign", null, next, actor);
    await client.query("COMMIT");
    return { action: "created", assignment: next };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface BulkAssignResult {
  created: number;
  reactivated: number;
  skipped: number;
  total: number;
}

/**
 * Gán hàng loạt 1 phòng vào NHIỀU khu (danh sách areaIds TƯỜNG MINH do UI chọn —
 * KHÔNG tự lan xuống con). Tạo từng row, idempotent, log tổng 'bulk_assign'.
 */
export async function bulkAssignDepartmentToAreas(
  departmentCode: string,
  areaIds: number[],
  opts: Omit<AssignInput, "departmentCode" | "areaId">,
  actor: string | null,
): Promise<BulkAssignResult> {
  const out: BulkAssignResult = { created: 0, reactivated: 0, skipped: 0, total: areaIds.length };
  for (const areaId of areaIds) {
    const r = await assignDepartmentToArea({ ...opts, departmentCode, areaId }, actor);
    if (r.action === "created") out.created++;
    else if (r.action === "reactivated") out.reactivated++;
    else out.skipped++;
  }
  const client = await appPool().connect();
  try {
    await logChange(client, "assignment", 0, "bulk_assign", null,
      { departmentCode, areaIds, ...out }, actor);
  } finally {
    client.release();
  }
  return out;
}

/** Sửa thuộc tính 1 assignment (required/type/responsible/effective/note) — audit log. */
export async function updateAssignment(
  id: number,
  patch: Partial<Pick<AssignInput, "isRequired" | "assignmentType" | "responsibleEmployeeId" | "effectiveFrom" | "effectiveTo" | "note">>,
  actor: string | null,
): Promise<AssignmentRow> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT * FROM department_area_assignments WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy assignment.");
    const old = mapRow(cur.rows[0]);
    const r = await client.query(
      `UPDATE department_area_assignments SET
         is_required=COALESCE($2, is_required),
         assignment_type=COALESCE($3, assignment_type),
         responsible_employee_id=CASE WHEN $4::boolean THEN $5 ELSE responsible_employee_id END,
         effective_from=CASE WHEN $6::boolean THEN $7::date ELSE effective_from END,
         effective_to=CASE WHEN $8::boolean THEN $9::date ELSE effective_to END,
         note=COALESCE($10, note),
         updated_at=now(), updated_by=$11
       WHERE id=$1 RETURNING *`,
      [id, patch.isRequired ?? null, patch.assignmentType ?? null,
       patch.responsibleEmployeeId !== undefined, patch.responsibleEmployeeId ?? null,
       patch.effectiveFrom !== undefined, patch.effectiveFrom ?? null,
       patch.effectiveTo !== undefined, patch.effectiveTo ?? null,
       patch.note ?? null, actor],
    );
    const next = mapRow(r.rows[0]);
    await logChange(client, "assignment", id, "update", old, next, actor);
    await client.query("COMMIT");
    return next;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Bỏ gán (soft — is_active=false, giữ lịch sử). */
export async function unassignDepartmentFromArea(assignmentId: number, actor: string | null): Promise<void> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT * FROM department_area_assignments WHERE id=$1 FOR UPDATE`, [assignmentId]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy assignment.");
    if (!cur.rows[0].is_active) { await client.query("COMMIT"); return; }
    await client.query(
      `UPDATE department_area_assignments SET is_active=FALSE, updated_at=now(), updated_by=$2 WHERE id=$1`,
      [assignmentId, actor]);
    await logChange(client, "assignment", assignmentId, "unassign", mapRow(cur.rows[0]), { isActive: false }, actor);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Duyệt assignment pending_review (Q2). CHẶN duyệt khi unresolved (Q4 — phải remap trước). */
export async function approveAssignment(assignmentId: number, actor: string | null): Promise<void> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT review_status, unresolved_department FROM department_area_assignments WHERE id=$1 FOR UPDATE`, [assignmentId]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy assignment.");
    if (cur.rows[0].unresolved_department) {
      throw new Error("Assignment có mã phòng ban chưa resolve — phải remap mã phòng trước khi duyệt.");
    }
    await client.query(
      `UPDATE department_area_assignments SET review_status='approved', updated_at=now(), updated_by=$2 WHERE id=$1`,
      [assignmentId, actor]);
    await logChange(client, "assignment", assignmentId, "approve",
      { reviewStatus: cur.rows[0].review_status }, { reviewStatus: "approved" }, actor);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Remap MÃ PHÒNG BAN (fromCode → toCode) cho mọi assignment — update-in-place,
 * KHÔNG tạo row mới; clear cờ unresolved. Nếu (toCode, area, type) đã tồn tại
 * (đụng UNIQUE) → deactivate row cũ thay vì tạo trùng, ghi log. Dùng để xử lý
 * 5 mã rác (Q4) trước khi duyệt.
 */
export async function remapAssignmentDepartmentCode(
  fromCode: string,
  toCode: string,
  actor: string | null,
): Promise<{ remapped: number; deactivatedConflicts: number }> {
  const from = fromCode.trim();
  const to = toCode.trim();
  if (!from || !to) throw new Error("Thiếu mã phòng ban nguồn/đích.");
  if (from === to) throw new Error("Mã nguồn và đích trùng nhau.");
  const client = await appPool().connect();
  const out = { remapped: 0, deactivatedConflicts: 0 };
  try {
    await client.query("BEGIN");
    const rows = await client.query(
      `SELECT * FROM department_area_assignments WHERE department_code=$1 FOR UPDATE`, [from]);
    for (const raw of rows.rows) {
      const row = mapRow(raw);
      const conflict = await client.query(
        `SELECT id FROM department_area_assignments
         WHERE department_code=$1 AND area_id=$2 AND assignment_type=$3`,
        [to, row.areaId, row.assignmentType]);
      if (conflict.rows[0]) {
        // Đích đã có assignment → không tạo trùng: deactivate row nguồn.
        await client.query(
          `UPDATE department_area_assignments SET is_active=FALSE, unresolved_department=FALSE,
             note=COALESCE(note,'') || ' [remap-conflict → ' || $2 || ']', updated_at=now(), updated_by=$3
           WHERE id=$1`, [row.id, to, actor]);
        await logChange(client, "assignment", row.id, "update",
          { departmentCode: from }, { deactivated: true, conflictWith: Number(conflict.rows[0].id) }, actor);
        out.deactivatedConflicts++;
      } else {
        await client.query(
          `UPDATE department_area_assignments SET department_code=$2, unresolved_department=FALSE,
             updated_at=now(), updated_by=$3 WHERE id=$1`, [row.id, to, actor]);
        await logChange(client, "assignment", row.id, "update",
          { departmentCode: from, unresolvedDepartment: row.unresolvedDepartment },
          { departmentCode: to, unresolvedDepartment: false }, actor);
        out.remapped++;
      }
    }
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Danh sách assignment cho màn review (join area, filter source/review/unresolved). */
export interface ReviewRow extends AssignmentRow {
  areaCode: string;
  areaName: string;
  areaActive: boolean;
}

export async function listAssignmentsForReview(filters: {
  source?: string; reviewStatus?: string; unresolvedOnly?: boolean;
  departmentCode?: string; areaId?: number; limit?: number;
} = {}): Promise<ReviewRow[]> {
  const where: string[] = ["TRUE"];
  const params: unknown[] = [];
  if (filters.source) { params.push(filters.source); where.push(`s.source=$${params.length}`); }
  if (filters.reviewStatus) { params.push(filters.reviewStatus); where.push(`s.review_status=$${params.length}`); }
  if (filters.departmentCode) { params.push(filters.departmentCode); where.push(`s.department_code=$${params.length}`); }
  if (filters.areaId != null) { params.push(filters.areaId); where.push(`s.area_id=$${params.length}`); }
  if (filters.unresolvedOnly) where.push(`s.unresolved_department=TRUE`);
  params.push(Math.min(Math.max(filters.limit ?? 200, 1), 500));
  const r = await appPool().query(
    `SELECT s.*, a.area_code, a.area_name, a.is_active AS area_active
     FROM department_area_assignments s JOIN five_s_areas a ON a.id=s.area_id
     WHERE ${where.join(" AND ")}
     ORDER BY s.unresolved_department DESC, s.review_status DESC, s.department_code, a.area_code
     LIMIT $${params.length}`, params);
  return r.rows.map((x) => ({
    ...mapRow(x), areaCode: x.area_code, areaName: x.area_name, areaActive: !!x.area_active,
  }));
}

/** Q3: map lại FK HRM cho MỌI assignment của một mã phòng — không tạo row mới. */
export async function remapDepartmentId(departmentCode: string, departmentId: number | null, actor: string | null): Promise<number> {
  const r = await appPool().query(
    `UPDATE department_area_assignments SET department_id=$2, updated_at=now(), updated_by=$3
     WHERE department_code=$1 RETURNING id`,
    [departmentCode, departmentId, actor]);
  return r.rowCount ?? 0;
}

// ── READ ─────────────────────────────────────────────────────────────────────
export interface AreaForDepartment {
  areaId: number;
  areaCode: string;
  areaName: string;
  parentId: number | null;
  areaType: string;
  isCaptureRequired: boolean;
  assignmentId: number;
  assignmentType: AssignmentType;
  isRequired: boolean;
  reviewStatus: string;
}

/**
 * Khu vực OPERATIONAL của một phòng (nguồn cho picker/KPI sau cutover):
 * assignment active + KHÔNG unresolved + area active. pending_review hợp lệ
 * vẫn trả về (Q2). KHÔNG suy luận từ parent.
 */
export async function getAreasForDepartment(departmentCode: string): Promise<AreaForDepartment[]> {
  const r = await appPool().query(
    `SELECT a.id area_id, a.area_code, a.area_name, a.parent_id, a.area_type, a.is_capture_required,
            s.id assignment_id, s.assignment_type, s.is_required, s.review_status
     FROM department_area_assignments s
     JOIN five_s_areas a ON a.id = s.area_id
     WHERE s.department_code=$1 AND s.is_active=TRUE AND s.unresolved_department=FALSE
       AND a.is_active=TRUE
     ORDER BY a.sort_order, a.area_name`,
    [departmentCode]);
  return r.rows.map((x) => ({
    areaId: Number(x.area_id), areaCode: x.area_code, areaName: x.area_name,
    parentId: x.parent_id != null ? Number(x.parent_id) : null,
    areaType: x.area_type, isCaptureRequired: !!x.is_capture_required,
    assignmentId: Number(x.assignment_id), assignmentType: x.assignment_type,
    isRequired: !!x.is_required, reviewStatus: x.review_status,
  }));
}

export async function listAssignmentsByArea(areaId: number, includeInactive = false): Promise<AssignmentRow[]> {
  const r = await appPool().query(
    `SELECT * FROM department_area_assignments WHERE area_id=$1 ${includeInactive ? "" : "AND is_active=TRUE"}
     ORDER BY department_code`, [areaId]);
  return r.rows.map(mapRow);
}

// ── KPI base (P4 sẽ nối vào report-service; P1 chỉ cung cấp hàm) ─────────────
export interface DepartmentAreaKpiBase {
  departmentCode: string;
  /** Nghĩa vụ tính KPI: active + required + !unresolved + area active + capture_required. */
  requiredAreaIds: number[];
}

export async function getKpiBaseByDepartment(): Promise<DepartmentAreaKpiBase[]> {
  const r = await appPool().query(
    `SELECT s.department_code, array_agg(DISTINCT a.id) area_ids
     FROM department_area_assignments s
     JOIN five_s_areas a ON a.id = s.area_id
     WHERE s.is_active=TRUE AND s.is_required=TRUE AND s.unresolved_department=FALSE
       AND a.is_active=TRUE AND a.is_capture_required=TRUE
     GROUP BY s.department_code ORDER BY s.department_code`);
  return r.rows.map((x) => ({
    departmentCode: x.department_code,
    requiredAreaIds: (x.area_ids as unknown[]).map(Number),
  }));
}

// ── DATA QUALITY (Tab 3 P3 dùng; P1 cung cấp query) ──────────────────────────
export interface AreaDataQualityIssues {
  requiredAreasWithoutAssignment: Array<{ areaId: number; areaCode: string; areaName: string }>;
  assignmentsToInactiveArea: Array<{ assignmentId: number; departmentCode: string; areaCode: string }>;
  unresolvedAssignments: Array<{ assignmentId: number; departmentCode: string; areaCode: string }>;
  pendingReviewCount: number;
}

export async function getAreaDataQualityIssues(): Promise<AreaDataQualityIssues> {
  const pool = appPool();
  const [noAsg, inactArea, unres, pending] = await Promise.all([
    pool.query(
      `SELECT a.id, a.area_code, a.area_name FROM five_s_areas a
       WHERE a.is_active=TRUE AND a.is_capture_required=TRUE
         AND NOT EXISTS (SELECT 1 FROM department_area_assignments s
                         WHERE s.area_id=a.id AND s.is_active=TRUE AND s.unresolved_department=FALSE)
       ORDER BY a.area_code`),
    pool.query(
      `SELECT s.id, s.department_code, a.area_code FROM department_area_assignments s
       JOIN five_s_areas a ON a.id=s.area_id
       WHERE s.is_active=TRUE AND a.is_active=FALSE ORDER BY s.id`),
    pool.query(
      `SELECT s.id, s.department_code, a.area_code FROM department_area_assignments s
       JOIN five_s_areas a ON a.id=s.area_id
       WHERE s.unresolved_department=TRUE ORDER BY s.id`),
    pool.query(`SELECT count(*)::int n FROM department_area_assignments WHERE review_status='pending_review'`),
  ]);
  return {
    requiredAreasWithoutAssignment: noAsg.rows.map((x) => ({ areaId: Number(x.id), areaCode: x.area_code, areaName: x.area_name })),
    assignmentsToInactiveArea: inactArea.rows.map((x) => ({ assignmentId: Number(x.id), departmentCode: x.department_code, areaCode: x.area_code })),
    unresolvedAssignments: unres.rows.map((x) => ({ assignmentId: Number(x.id), departmentCode: x.department_code, areaCode: x.area_code })),
    pendingReviewCount: pending.rows[0].n,
  };
}
