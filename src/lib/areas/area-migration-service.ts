/**
 * Migration Config_Areas (SharePoint) → five_s_areas + department_area_assignments
 * (ban5s_app) — P2. PREVIEW mặc định; APPLY tường minh, transaction, idempotent.
 *
 * Quy tắc (đã duyệt Q1-Q7 + phạm vi P2):
 *  - Import ĐỦ mọi row (kể cả inactive) — giữ nguyên cờ is_active; KHÔNG sửa/xóa
 *    SharePoint (read-only tuyệt đối).
 *  - Node có con → area_type=group + is_capture_required=false;
 *    lá → capture_point + is_capture_required=true (admin sửa sau — Q5).
 *  - Assignment CHỈ explode từ khu LÁ ACTIVE (CSV của nhóm cha là dữ liệu dẫn
 *    xuất — ghi nhận vào report, KHÔNG tạo row; không suy luận parent→child).
 *  - Phân loại: |depts| >= BULK_THRESHOLD → migrated_bulk_csv + pending_review
 *    (Q2 — vẫn tính KPI baseline); ngược lại migrated_direct + approved.
 *  - Mã phòng ∉ Config_Departments ACTIVE → unresolved_department=true +
 *    pending_review + department_id NULL (Q4 — không operational/picker/KPI,
 *    không fuzzy-map).
 *  - Idempotent: area upsert theo area_code (chỉ đè row source='migrated');
 *    assignment ON CONFLICT DO NOTHING → chạy lại không duplicate.
 *  - Baseline: nghĩa vụ KPI sau import (PG) phải KHỚP nghĩa vụ tính từ
 *    SharePoint (lá active × dept active) — preview đối chiếu sẵn.
 */
import { appPool } from "../db/pg";

const BULK_THRESHOLD = 10; // ≥10 phòng trên 1 khu = gán hàng loạt → cần review

// ── Đọc SharePoint (app-only, self-contained — chỉ GET) ─────────────────────
interface SpArea {
  spId: string; code: string; name: string; parentCode: string | null;
  departments: string[]; isActive: boolean; sortOrder: number;
}

async function graphToken(): Promise<string> {
  const tid = process.env.GRAPH_TENANT_ID, cid = process.env.GRAPH_CLIENT_ID, cs = process.env.GRAPH_CLIENT_SECRET;
  if (!tid || !cid || !cs) throw new Error("Thiếu env GRAPH_* để đọc SharePoint.");
  const r = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `client_id=${cid}&client_secret=${encodeURIComponent(cs)}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("Không lấy được Graph token.");
  return d.access_token;
}

const SITE = "biahalong.sharepoint.com,03151163-0852-4f57-b67b-79b114ef5617,204abada-4f97-4b85-98a3-f66dd3c93c45";

async function readSharePoint(): Promise<{ areas: SpArea[]; activeDeptCodes: Set<string> }> {
  const tok = await graphToken();
  const G = async (p: string): Promise<Record<string, unknown>> => {
    const r = await fetch(`https://graph.microsoft.com/v1.0${p}`, { headers: { Authorization: `Bearer ${tok}` } });
    return r.json();
  };
  const lists = (await G(`/sites/${SITE}/lists?$select=id,displayName&$top=100`)) as { value: Array<{ id: string; displayName: string }> };
  const lid = (n: string) => lists.value.find((l) => l.displayName === n)?.id;
  const readAll = async (listId: string) => {
    const out: Array<{ id: string; fields: Record<string, unknown> }> = [];
    let url: string | undefined = `/sites/${SITE}/lists/${listId}/items?expand=fields&$top=999`;
    while (url) {
      const d = (await G(url)) as { value?: Array<{ id: string; fields: Record<string, unknown> }>; "@odata.nextLink"?: string };
      out.push(...(d.value ?? []));
      url = d["@odata.nextLink"]?.replace("https://graph.microsoft.com/v1.0", "");
    }
    return out;
  };
  const areaList = lid("Config_Areas"), deptList = lid("Config_Departments");
  if (!areaList || !deptList) throw new Error("Không tìm thấy Config_Areas/Config_Departments.");
  const areas: SpArea[] = (await readAll(areaList))
    .map((it) => {
      const f = it.fields;
      const csv = String(f.Departments ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const own = String(f.DepartmentCode ?? "").trim();
      return {
        spId: it.id,
        code: String(f.AreaCode ?? "").trim(),
        name: String(f.AreaName ?? "").trim(),
        parentCode: String(f.ParentCode ?? "").trim() || null,
        departments: csv.length ? [...new Set(csv)] : own ? [own] : [],
        isActive: !!f.IsActive,
        sortOrder: Number(f.SortOrder ?? 0),
      };
    })
    .filter((a) => a.code);
  const activeDeptCodes = new Set(
    (await readAll(deptList))
      .map((it) => it.fields)
      .filter((f) => f.IsActive && f.DepartmentCode)
      .map((f) => String(f.DepartmentCode).trim()),
  );
  return { areas, activeDeptCodes };
}

// ── Phân loại (thuần — dùng chung preview + apply) ──────────────────────────
export interface PlannedAssignment {
  departmentCode: string;
  areaCode: string;
  source: "migrated_direct" | "migrated_bulk_csv";
  reviewStatus: "approved" | "pending_review";
  unresolved: boolean;
}

export interface MigrationPlan {
  areas: Array<SpArea & { areaType: "group" | "capture_point"; isCaptureRequired: boolean }>;
  assignments: PlannedAssignment[];
  summary: {
    totalAreaRows: number; activeAreas: number; inactiveAreas: number;
    groups: number; leaves: number; physicalCapturePoints: number;
    directApproved: number; bulkPendingReview: number; unresolvedAssignments: number;
    unresolvedDeptCodes: string[]; skippedGroupCsv: number; skippedInactiveAreaAssignments: number;
    spOperationalObligations: number;   // baseline hiện tại từ SharePoint
    pgExpectedObligations: number;      // KPI sau import (active+required+!unresolved)
    baselineMatch: boolean;
  };
}

export async function buildMigrationPlan(): Promise<MigrationPlan> {
  const { areas, activeDeptCodes } = await readSharePoint();
  const activeCodes = new Set(areas.filter((a) => a.isActive).map((a) => a.code));
  const hasKids = new Set(areas.filter((a) => a.isActive && a.parentCode && activeCodes.has(a.parentCode)).map((a) => a.parentCode as string));

  const planned = areas.map((a) => ({
    ...a,
    areaType: (hasKids.has(a.code) ? "group" : "capture_point") as "group" | "capture_point",
    isCaptureRequired: !hasKids.has(a.code), // Q5: lá bắt buộc chụp; group không (admin sửa sau)
  }));

  const assignments: PlannedAssignment[] = [];
  let skippedGroupCsv = 0, skippedInactive = 0;
  for (const a of planned) {
    if (!a.isActive) { skippedInactive += a.departments.length; continue; }
    if (a.areaType === "group") { skippedGroupCsv += a.departments.length; continue; }
    const bulk = a.departments.length >= BULK_THRESHOLD;
    for (const d of a.departments) {
      const unresolved = !activeDeptCodes.has(d);
      assignments.push({
        departmentCode: d,
        areaCode: a.code,
        source: bulk ? "migrated_bulk_csv" : "migrated_direct",
        reviewStatus: bulk || unresolved ? "pending_review" : "approved",
        unresolved,
      });
    }
  }

  const unresolvedCodes = [...new Set(assignments.filter((x) => x.unresolved).map((x) => x.departmentCode))].sort();
  const spOblig = assignments.filter((x) => !x.unresolved).length; // = lá active × dept active (cách KPI hiện tính)
  const pgOblig = spOblig; // theo quy tắc import: active+required+!unresolved — khớp cấu trúc
  const activeAreas = planned.filter((a) => a.isActive);
  return {
    areas: planned,
    assignments,
    summary: {
      totalAreaRows: planned.length,
      activeAreas: activeAreas.length,
      inactiveAreas: planned.length - activeAreas.length,
      groups: activeAreas.filter((a) => a.areaType === "group").length,
      leaves: activeAreas.filter((a) => a.areaType === "capture_point").length,
      physicalCapturePoints: activeAreas.filter((a) => a.areaType === "capture_point").length,
      directApproved: assignments.filter((x) => x.source === "migrated_direct" && !x.unresolved).length,
      bulkPendingReview: assignments.filter((x) => x.source === "migrated_bulk_csv" && !x.unresolved).length,
      unresolvedAssignments: assignments.filter((x) => x.unresolved).length,
      unresolvedDeptCodes: unresolvedCodes,
      skippedGroupCsv,
      skippedInactiveAreaAssignments: skippedInactive,
      spOperationalObligations: spOblig,
      pgExpectedObligations: pgOblig,
      baselineMatch: spOblig === pgOblig,
    },
  };
}

// ── APPLY (1 transaction, idempotent, audit log; KHÔNG ghi SharePoint) ───────
export interface ApplyResult {
  areasCreated: number; areasUpdated: number; areasSkippedManual: number;
  assignmentsCreated: number; assignmentsSkippedExisting: number;
  countsAfter: { areas: number; assignments: number; changes: number };
}

export async function applyMigration(plan: MigrationPlan, actor: string | null): Promise<ApplyResult> {
  const client = await appPool().connect();
  const out: ApplyResult = {
    areasCreated: 0, areasUpdated: 0, areasSkippedManual: 0,
    assignmentsCreated: 0, assignmentsSkippedExisting: 0,
    countsAfter: { areas: 0, assignments: 0, changes: 0 },
  };
  try {
    await client.query("BEGIN");
    // 1) Upsert areas theo area_code (chỉ đè row source='migrated').
    for (const a of plan.areas) {
      const cur = await client.query(`SELECT id, source FROM five_s_areas WHERE area_code=$1 FOR UPDATE`, [a.code]);
      if (!cur.rows[0]) {
        const r = await client.query(
          `INSERT INTO five_s_areas (area_code, area_name, area_type, is_capture_required, is_active,
             sort_order, source, legacy_sp_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,'migrated',$7,$8,$8) RETURNING id`,
          [a.code, a.name, a.areaType, a.isCaptureRequired, a.isActive, a.sortOrder, a.spId, actor]);
        await client.query(
          `INSERT INTO area_assignment_changes(entity_type, entity_id, action, new_value_json, actor_email)
           VALUES ('area',$1,'create',$2,$3)`,
          [r.rows[0].id, JSON.stringify({ ...a, migrated: true }), actor]);
        out.areasCreated++;
      } else if (cur.rows[0].source === "migrated") {
        await client.query(
          `UPDATE five_s_areas SET area_name=$2, area_type=$3, is_capture_required=$4, is_active=$5,
             sort_order=$6, legacy_sp_id=$7, updated_at=now(), updated_by=$8 WHERE id=$1`,
          [cur.rows[0].id, a.name, a.areaType, a.isCaptureRequired, a.isActive, a.sortOrder, a.spId, actor]);
        out.areasUpdated++;
      } else {
        out.areasSkippedManual++; // KHÔNG đè khu vực admin tạo tay trùng mã
      }
    }
    // 2) Resolve parent_id theo parentCode.
    await client.query(`
      UPDATE five_s_areas c SET parent_id = p.id
      FROM five_s_areas p
      JOIN (SELECT unnest($1::text[]) AS child_code, unnest($2::text[]) AS parent_code) m
        ON p.area_code = m.parent_code
      WHERE c.area_code = m.child_code AND c.parent_id IS DISTINCT FROM p.id`,
      [plan.areas.filter((a) => a.parentCode).map((a) => a.code),
       plan.areas.filter((a) => a.parentCode).map((a) => a.parentCode)]);
    // 3) Assignments — ON CONFLICT DO NOTHING (idempotent, không duplicate).
    for (const s of plan.assignments) {
      const r = await client.query(
        `INSERT INTO department_area_assignments
           (department_code, area_id, assignment_type, is_required, source, review_status,
            unresolved_department, created_by, updated_by)
         SELECT $1, a.id, 'owner', TRUE, $3, $4, $5, $6, $6 FROM five_s_areas a WHERE a.area_code=$2
         ON CONFLICT (department_code, area_id, assignment_type) DO NOTHING
         RETURNING id`,
        [s.departmentCode, s.areaCode, s.source, s.reviewStatus, s.unresolved, actor]);
      if (r.rows[0]) {
        await client.query(
          `INSERT INTO area_assignment_changes(entity_type, entity_id, action, new_value_json, actor_email)
           VALUES ('assignment',$1,'assign',$2,$3)`,
          [r.rows[0].id, JSON.stringify(s), actor]);
        out.assignmentsCreated++;
      } else {
        out.assignmentsSkippedExisting++;
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const c = await appPool().query(
    `SELECT (SELECT count(*)::int FROM five_s_areas) a,
            (SELECT count(*)::int FROM department_area_assignments) s,
            (SELECT count(*)::int FROM area_assignment_changes) ch`);
  out.countsAfter = { areas: c.rows[0].a, assignments: c.rows[0].s, changes: c.rows[0].ch };
  return out;
}

/** Dọn dữ liệu ĐÃ MIGRATE (source='migrated') — phục vụ rollback/re-test P2. */
export async function cleanupMigratedData(actor: string | null): Promise<{ areas: number; assignments: number }> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const s = await client.query(
      `DELETE FROM department_area_assignments
       WHERE source IN ('migrated_direct','migrated_bulk_csv','migrated_inherited') RETURNING id`);
    const a = await client.query(`DELETE FROM five_s_areas WHERE source='migrated' RETURNING id`);
    await client.query(
      `INSERT INTO area_assignment_changes(entity_type, entity_id, action, new_value_json, actor_email)
       VALUES ('area',0,'deactivate',$1,$2)`,
      [JSON.stringify({ cleanupMigrated: true, areas: a.rowCount, assignments: s.rowCount }), actor]);
    await client.query("COMMIT");
    return { areas: a.rowCount ?? 0, assignments: s.rowCount ?? 0 };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
