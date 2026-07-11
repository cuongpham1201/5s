/**
 * Danh mục khu vực 5S (five_s_areas, ban5s_app) — P1 service.
 *
 * CHỈ quản lý cây/danh mục vật lý. KHÔNG chứa phòng ban — mọi quan hệ phòng↔khu
 * nằm ở department_area_assignments (area-assignment-service). Parent/child
 * tuyệt đối không tạo inheritance. Cây N cấp, chống cycle. Mọi mutation ghi
 * area_assignment_changes. Node-only (pg); CHƯA được production dùng
 * (AREA_SOURCE vẫn là sharepoint cho tới cutover P4).
 */
import type { PoolClient } from "pg";
import { appPool } from "../db/pg";

export type AreaType = "group" | "location" | "capture_point";

export interface AreaRow {
  id: number;
  areaCode: string;
  areaName: string;
  parentId: number | null;
  areaType: AreaType;
  isCaptureRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  locationNote: string | null;
  source: "manual" | "migrated";
}

export interface AreaTreeNode extends AreaRow {
  children: AreaTreeNode[];
}

export interface AreaInputPg {
  areaCode: string;
  areaName: string;
  parentId?: number | null;
  areaType?: AreaType;
  isCaptureRequired?: boolean;
  sortOrder?: number;
  description?: string | null;
  locationNote?: string | null;
  source?: "manual" | "migrated";
  legacySpId?: string | null;
}

function mapRow(r: Record<string, any>): AreaRow {
  return {
    id: Number(r.id),
    areaCode: r.area_code,
    areaName: r.area_name,
    parentId: r.parent_id != null ? Number(r.parent_id) : null,
    areaType: r.area_type,
    isCaptureRequired: !!r.is_capture_required,
    isActive: !!r.is_active,
    sortOrder: Number(r.sort_order ?? 0),
    description: r.description ?? null,
    locationNote: r.location_note ?? null,
    source: r.source,
  };
}

async function logChange(
  client: PoolClient,
  entityType: "area" | "assignment",
  entityId: number,
  action: string,
  oldVal: unknown,
  newVal: unknown,
  actor: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO area_assignment_changes(entity_type, entity_id, action, old_value_json, new_value_json, actor_email)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [entityType, entityId, action, oldVal ? JSON.stringify(oldVal) : null, newVal ? JSON.stringify(newVal) : null, actor],
  );
}
export { logChange as _logAreaChange }; // dùng chung bởi assignment-service

// ── READ ─────────────────────────────────────────────────────────────────────
export async function listAreas(includeInactive = false): Promise<AreaRow[]> {
  const r = await appPool().query(
    `SELECT * FROM five_s_areas ${includeInactive ? "" : "WHERE is_active = TRUE"}
     ORDER BY sort_order, area_name`,
  );
  return r.rows.map(mapRow);
}

/** Cây khu vực (N cấp). Node cha inactive vẫn giữ để con hiển thị đúng vị trí khi includeInactive. */
export async function listAreaTree(includeInactive = false): Promise<AreaTreeNode[]> {
  const rows = await listAreas(includeInactive);
  const byId = new Map<number, AreaTreeNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: AreaTreeNode[] = [];
  for (const n of byId.values()) {
    if (n.parentId != null && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export async function getAreaById(id: number): Promise<AreaRow | null> {
  const r = await appPool().query(`SELECT * FROM five_s_areas WHERE id=$1`, [id]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

/** Row kèm thống kê cho admin Tab 1: số phòng đang gán (active) + có con không. */
export interface AreaStatsRow extends AreaRow {
  assignedDeptCount: number;
  childCount: number;
  legacySpId: string | null;
}

export async function listAreasWithStats(includeInactive = true): Promise<AreaStatsRow[]> {
  const r = await appPool().query(
    `SELECT a.*,
       (SELECT count(DISTINCT s.department_code)::int FROM department_area_assignments s
         WHERE s.area_id=a.id AND s.is_active=TRUE AND s.unresolved_department=FALSE) AS dept_count,
       (SELECT count(*)::int FROM five_s_areas c WHERE c.parent_id=a.id) AS child_count
     FROM five_s_areas a
     ${includeInactive ? "" : "WHERE a.is_active=TRUE"}
     ORDER BY a.sort_order, a.area_name`);
  return r.rows.map((x) => ({
    ...mapRow(x),
    assignedDeptCount: Number(x.dept_count ?? 0),
    childCount: Number(x.child_count ?? 0),
    legacySpId: x.legacy_sp_id ?? null,
  }));
}

/** Lịch sử thay đổi (Tab 4) — filter entity/action, mới nhất trước. */
export interface ChangeRow {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorEmail: string | null;
  createdAt: string;
}

export async function listAreaChanges(filters: { entityType?: string; action?: string; limit?: number } = {}): Promise<ChangeRow[]> {
  const where: string[] = ["TRUE"];
  const params: unknown[] = [];
  if (filters.entityType) { params.push(filters.entityType); where.push(`entity_type=$${params.length}`); }
  if (filters.action) { params.push(filters.action); where.push(`action=$${params.length}`); }
  params.push(Math.min(Math.max(filters.limit ?? 100, 1), 300));
  const r = await appPool().query(
    `SELECT * FROM area_assignment_changes WHERE ${where.join(" AND ")}
     ORDER BY id DESC LIMIT $${params.length}`, params);
  return r.rows.map((x) => ({
    id: Number(x.id), entityType: x.entity_type, entityId: Number(x.entity_id), action: x.action,
    oldValue: x.old_value_json ?? null, newValue: x.new_value_json ?? null,
    actorEmail: x.actor_email ?? null, createdAt: x.created_at,
  }));
}

/** Phát hiện cycle dữ liệu hiện có (DQ Tab 3) — trả các area nằm trong vòng. */
export async function detectCycles(): Promise<Array<{ id: number; areaCode: string }>> {
  const rows = await listAreas(true);
  const parent = new Map(rows.map((r) => [r.id, r.parentId]));
  const bad: Array<{ id: number; areaCode: string }> = [];
  for (const r of rows) {
    const seen = new Set<number>();
    let cur: number | null = r.id;
    while (cur != null) {
      if (seen.has(cur)) { bad.push({ id: r.id, areaCode: r.areaCode }); break; }
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }
  return bad;
}

// ── CYCLE GUARD ──────────────────────────────────────────────────────────────
/** Ném lỗi nếu đặt parent tạo cycle hoặc tự làm cha chính nó. */
export async function assertNoCycle(areaId: number, newParentId: number | null): Promise<void> {
  if (newParentId == null) return;
  if (newParentId === areaId) throw new Error("Khu vực không thể là cha của chính nó.");
  // Đi ngược từ newParent lên gốc; gặp areaId → cycle.
  let cur: number | null = newParentId;
  const seen = new Set<number>();
  while (cur != null) {
    if (cur === areaId) throw new Error("Di chuyển tạo vòng lặp cây (cycle) — bị chặn.");
    if (seen.has(cur)) throw new Error("Cây khu vực hiện có cycle dữ liệu — cần sửa trước.");
    seen.add(cur);
    const r: { rows: Array<{ parent_id: string | number | null }> } =
      await appPool().query(`SELECT parent_id FROM five_s_areas WHERE id=$1`, [cur]);
    if (!r.rows[0]) throw new Error("Khu vực cha không tồn tại.");
    cur = r.rows[0].parent_id != null ? Number(r.rows[0].parent_id) : null;
  }
}

// ── MUTATIONS (đều ghi audit log, chạy trong transaction) ────────────────────
export async function createArea(input: AreaInputPg, actor: string | null): Promise<AreaRow> {
  if (!input.areaCode?.trim() || !input.areaName?.trim()) throw new Error("Thiếu mã/tên khu vực.");
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    if (input.parentId != null) {
      const p = await client.query(`SELECT id FROM five_s_areas WHERE id=$1`, [input.parentId]);
      if (!p.rows[0]) throw new Error("Khu vực cha không tồn tại.");
    }
    const r = await client.query(
      `INSERT INTO five_s_areas
         (area_code, area_name, parent_id, area_type, is_capture_required, sort_order,
          description, location_note, source, legacy_sp_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
      [input.areaCode.trim(), input.areaName.trim(), input.parentId ?? null,
       input.areaType ?? "capture_point", input.isCaptureRequired ?? false, input.sortOrder ?? 0,
       input.description ?? null, input.locationNote ?? null, input.source ?? "manual",
       input.legacySpId ?? null, actor],
    );
    const row = mapRow(r.rows[0]);
    await logChange(client, "area", row.id, "create", null, row, actor);
    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new Error(`Mã khu vực "${input.areaCode}" đã tồn tại.`);
    throw e;
  } finally {
    client.release();
  }
}

export async function updateArea(
  id: number,
  patch: Partial<Pick<AreaInputPg, "areaName" | "areaType" | "isCaptureRequired" | "sortOrder" | "description" | "locationNote">>,
  actor: string | null,
): Promise<AreaRow> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT * FROM five_s_areas WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy khu vực.");
    const old = mapRow(cur.rows[0]);
    const r = await client.query(
      `UPDATE five_s_areas SET
         area_name=COALESCE($2, area_name), area_type=COALESCE($3, area_type),
         is_capture_required=COALESCE($4, is_capture_required), sort_order=COALESCE($5, sort_order),
         description=COALESCE($6, description), location_note=COALESCE($7, location_note),
         updated_at=now(), updated_by=$8
       WHERE id=$1 RETURNING *`,
      [id, patch.areaName ?? null, patch.areaType ?? null,
       patch.isCaptureRequired ?? null, patch.sortOrder ?? null,
       patch.description ?? null, patch.locationNote ?? null, actor],
    );
    const row = mapRow(r.rows[0]);
    await logChange(client, "area", id, "update", old, row, actor);
    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Đổi cha (move). KHÔNG đổi assignment, KHÔNG tạo inheritance. Chặn cycle. */
export async function moveArea(id: number, newParentId: number | null, actor: string | null): Promise<AreaRow> {
  await assertNoCycle(id, newParentId);
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT * FROM five_s_areas WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy khu vực.");
    const old = mapRow(cur.rows[0]);
    const r = await client.query(
      `UPDATE five_s_areas SET parent_id=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING *`,
      [id, newParentId, actor],
    );
    const row = mapRow(r.rows[0]);
    await logChange(client, "area", id, "move", { parentId: old.parentId }, { parentId: row.parentId }, actor);
    await client.query("COMMIT");
    return row;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function setAreaActive(id: number, active: boolean, actor: string | null): Promise<void> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT is_active FROM five_s_areas WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy khu vực.");
    await client.query(`UPDATE five_s_areas SET is_active=$2, updated_at=now(), updated_by=$3 WHERE id=$1`, [id, active, actor]);
    await logChange(client, "area", id, active ? "reactivate" : "deactivate",
      { isActive: cur.rows[0].is_active }, { isActive: active }, actor);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export const deactivateAreaPg = (id: number, actor: string | null) => setAreaActive(id, false, actor);
export const reactivateAreaPg = (id: number, actor: string | null) => setAreaActive(id, true, actor);

/**
 * Xóa cứng — CHỈ khi khu vực chưa từng được dùng: không con, không assignment
 * (kể cả inactive). Có lịch sử → bắt buộc dùng deactivate.
 */
export async function deleteAreaIfUnused(id: number, actor: string | null): Promise<void> {
  const [kids, asg] = await Promise.all([
    appPool().query(`SELECT count(*)::int n FROM five_s_areas WHERE parent_id=$1`, [id]),
    appPool().query(`SELECT count(*)::int n FROM department_area_assignments WHERE area_id=$1`, [id]),
  ]);
  if (kids.rows[0].n > 0) throw new Error("Khu vực còn khu con — không thể xóa.");
  if (asg.rows[0].n > 0) throw new Error("Khu vực đã có assignment — chỉ được Ẩn (deactivate).");
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT * FROM five_s_areas WHERE id=$1 FOR UPDATE`, [id]);
    if (!cur.rows[0]) throw new Error("Không tìm thấy khu vực.");
    // Ghi log TRƯỚC khi xóa (entity_id giữ id đã xóa để tra cứu).
    await logChange(client, "area", id, "deactivate", mapRow(cur.rows[0]), { deleted: true }, actor);
    await client.query(`DELETE FROM five_s_areas WHERE id=$1`, [id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
