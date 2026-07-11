// Integration test P1 — data model + service khu vực/assignment (ban5s_app dev).
// Chạy TRỰC TIẾP trên service TS (compile tạm sang CJS) — không phải SQL nhại lại.
//   node scripts/test-areas.mjs
// Tự dọn dữ liệu TEST_* sau khi chạy. Không đụng SharePoint/HRM/production.
import "./lib-db.mjs"; // nạp .env.local (BAN5S_DATABASE_URL)
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
// Build trong node_modules/.cache để require() resolve được 'pg' (đi ngược lên
// /data/dev/5s-app/node_modules) và git tự bỏ qua.
const OUT = "/data/dev/5s-app/node_modules/.cache/areas-test-build";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(
  `npx tsc src/lib/areas/area-pg-service.ts src/lib/areas/area-assignment-service.ts src/lib/db/pg.ts ` +
  `--outDir ${OUT} --rootDir src --module commonjs --target es2020 --moduleResolution node ` +
  `--esModuleInterop --skipLibCheck --strict false`,
  { cwd: "/data/dev/5s-app", stdio: "inherit" },
);
const areaSvc = require(join(OUT, "lib/areas/area-pg-service.js"));
const asgSvc = require(join(OUT, "lib/areas/area-assignment-service.js"));
const { appPool, closePools } = await import("./lib-db.mjs");

const ACTOR = "test@local";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function cleanup() {
  const db = appPool();
  await db.query(`DELETE FROM area_assignment_changes WHERE actor_email=$1`, [ACTOR]);
  await db.query(`DELETE FROM department_area_assignments WHERE department_code LIKE 'TEST%'`);
  await db.query(`DELETE FROM five_s_areas WHERE area_code LIKE 'TEST_%'`);
}

try {
  await cleanup();

  // ── setup cây: G(group) → C1,C2(capture) · S(shared capture) · C3 ─────────
  const G = await areaSvc.createArea({ areaCode: "TEST_G", areaName: "Test Nhóm", areaType: "group", isCaptureRequired: false }, ACTOR);
  const C1 = await areaSvc.createArea({ areaCode: "TEST_C1", areaName: "Test Con 1", parentId: G.id, areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  const C2 = await areaSvc.createArea({ areaCode: "TEST_C2", areaName: "Test Con 2", parentId: G.id, areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  const C3 = await areaSvc.createArea({ areaCode: "TEST_C3", areaName: "Test Con 3", parentId: G.id, areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  const S = await areaSvc.createArea({ areaCode: "TEST_S", areaName: "Test Chung", areaType: "capture_point", isCaptureRequired: true }, ACTOR);

  console.log("DM — DATA MODEL");
  // duplicate code
  let dup = false;
  try { await areaSvc.createArea({ areaCode: "TEST_G", areaName: "x" }, ACTOR); } catch { dup = true; }
  ok("area_code trùng bị chặn", dup);

  // DM1: gán cha KHÔNG lan con
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTA", areaId: G.id }, ACTOR);
  let aAreas = await asgSvc.getAreasForDepartment("TESTA");
  ok("DM1 gán cha G → TESTA chỉ thấy G, KHÔNG thấy C1/C2/C3",
    aAreas.length === 1 && aAreas[0].areaId === G.id);

  // DM2: bulk explicit + idempotent
  const b1 = await asgSvc.bulkAssignDepartmentToAreas("TESTA", [C1.id, C2.id], {}, ACTOR);
  const b2 = await asgSvc.bulkAssignDepartmentToAreas("TESTA", [C1.id, C2.id], {}, ACTOR);
  const cnt = await appPool().query(
    `SELECT count(*)::int n FROM department_area_assignments WHERE department_code='TESTA' AND area_id = ANY($1)`,
    [[C1.id, C2.id]]);
  ok("DM2 bulk tạo 2 row explicit", b1.created === 2, JSON.stringify(b1));
  ok("DM2 chạy lại idempotent (skip 2, không duplicate)", b2.skipped === 2 && cnt.rows[0].n === 2, JSON.stringify(b2));

  // DM3: C3 chỉ gán TESTB → TESTA không thấy
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTB", areaId: C3.id }, ACTOR);
  aAreas = await asgSvc.getAreasForDepartment("TESTA");
  ok("DM3 C3 chỉ của TESTB → TESTA không thấy C3", !aAreas.some((a) => a.areaId === C3.id));

  // DM4: khu chung S gán cả A + B
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTA", areaId: S.id }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTB", areaId: S.id }, ACTOR);
  const bAreas = await asgSvc.getAreasForDepartment("TESTB");
  ok("DM4 khu chung: cả 2 phòng đều thấy S",
    (await asgSvc.getAreasForDepartment("TESTA")).some((a) => a.areaId === S.id) &&
    bAreas.some((a) => a.areaId === S.id));

  // DM5: deactivate C2 → biến khỏi operational + KPI
  await areaSvc.deactivateAreaPg(C2.id, ACTOR);
  aAreas = await asgSvc.getAreasForDepartment("TESTA");
  ok("DM5 deactivate C2 → mất khỏi picker/operational", !aAreas.some((a) => a.areaId === C2.id));

  // DM6: move C1 ra gốc → assignment KHÔNG đổi
  const before = await appPool().query(`SELECT count(*)::int n FROM department_area_assignments WHERE area_id=$1`, [C1.id]);
  await areaSvc.moveArea(C1.id, null, ACTOR);
  const after = await appPool().query(`SELECT count(*)::int n FROM department_area_assignments WHERE area_id=$1`, [C1.id]);
  const c1row = await areaSvc.getAreaById(C1.id);
  ok("DM6 move không đổi assignment + parent đổi đúng",
    before.rows[0].n === after.rows[0].n && c1row.parentId === null);
  await areaSvc.moveArea(C1.id, G.id, ACTOR); // trả lại

  // DM7: cycle
  let cyc1 = false, cyc2 = false;
  try { await areaSvc.moveArea(G.id, C1.id, ACTOR); } catch { cyc1 = true; }
  try { await areaSvc.moveArea(G.id, G.id, ACTOR); } catch { cyc2 = true; }
  ok("DM7 cycle (G→dưới C1) bị chặn", cyc1);
  ok("DM7 tự làm cha chính nó bị chặn", cyc2);

  console.log("KPI — BASE");
  // KPI9: group không tính; C1,S tính (C2 inactive); G required=false
  const kpi = await asgSvc.getKpiBaseByDepartment();
  const kA = kpi.find((k) => k.departmentCode === "TESTA");
  const kB = kpi.find((k) => k.departmentCode === "TESTB");
  ok("KPI9 TESTA base = {C1,S} (group G + C2 inactive loại)",
    kA && kA.requiredAreaIds.length === 2 &&
    kA.requiredAreaIds.includes(C1.id) && kA.requiredAreaIds.includes(S.id), JSON.stringify(kA));
  // KPI10: shared — nghĩa vụ 2, vật lý 1
  const obligS = [kA, kB].filter((k) => k?.requiredAreaIds.includes(S.id)).length;
  ok("KPI10 khu chung S: nghĩa vụ=2 phòng, vật lý=1 khu", obligS === 2);
  // KPI8 dạng base: TESTB required = {C3, S} → 2 nghĩa vụ
  ok("KPI8 TESTB có 2 nghĩa vụ required (C3,S)",
    kB && kB.requiredAreaIds.length === 2, JSON.stringify(kB));

  console.log("Q2/Q4 — REVIEW & UNRESOLVED");
  // pending_review bulk hợp lệ VẪN operational + KPI (Q2)
  const P = await areaSvc.createArea({ areaCode: "TEST_P", areaName: "Test Pending", areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTA", areaId: P.id, source: "migrated_bulk_csv", reviewStatus: "pending_review" }, ACTOR);
  const kpi2 = await asgSvc.getKpiBaseByDepartment();
  ok("Q2 pending_review (bulk CSV hợp lệ) VẪN tính KPI",
    kpi2.find((k) => k.departmentCode === "TESTA")?.requiredAreaIds.includes(P.id) === true);
  ok("Q2 pending_review vẫn thấy trong operational",
    (await asgSvc.getAreasForDepartment("TESTA")).some((a) => a.areaId === P.id));
  // unresolved KHÔNG operational, KHÔNG KPI (Q4)
  const U = await areaSvc.createArea({ areaCode: "TEST_U", areaName: "Test Unresolved", areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTX", areaId: U.id, source: "migrated_direct", reviewStatus: "pending_review", unresolvedDepartment: true }, ACTOR);
  ok("Q4 unresolved KHÔNG vào operational", (await asgSvc.getAreasForDepartment("TESTX")).length === 0);
  ok("Q4 unresolved KHÔNG vào KPI base",
    !(await asgSvc.getKpiBaseByDepartment()).some((k) => k.departmentCode === "TESTX"));
  const dq = await asgSvc.getAreaDataQualityIssues();
  ok("Q4 unresolved xuất hiện trong data-quality",
    dq.unresolvedAssignments.some((u) => u.departmentCode === "TESTX"));

  console.log("P2 — REVIEW WORKFLOW");
  // approve unresolved bị CHẶN
  const uAsg = (await asgSvc.listAssignmentsByArea(U.id, true)).find((x) => x.departmentCode === "TESTX");
  let blocked = false;
  try { await asgSvc.approveAssignment(uAsg.id, ACTOR); } catch { blocked = true; }
  ok("P2 approve unresolved bị chặn (phải remap trước)", blocked);
  // remap TESTX → TESTZ: update-in-place, clear unresolved, rồi approve được
  const rm = await asgSvc.remapAssignmentDepartmentCode("TESTX", "TESTZ", ACTOR);
  const zAsg = (await asgSvc.listAssignmentsByArea(U.id, true)).find((x) => x.departmentCode === "TESTZ");
  ok("P2 remap code update-in-place (cùng id, hết unresolved)",
    rm.remapped === 1 && zAsg && zAsg.id === uAsg.id && !zAsg.unresolvedDepartment, JSON.stringify(rm));
  await asgSvc.approveAssignment(zAsg.id, ACTOR);
  ok("P2 sau remap → approve OK",
    (await asgSvc.listAssignmentsByArea(U.id, true)).find((x) => x.id === zAsg.id).reviewStatus === "approved");
  // remap đụng UNIQUE → deactivate row nguồn, không duplicate
  await asgSvc.assignDepartmentToArea({ departmentCode: "TESTW", areaId: U.id, unresolvedDepartment: true, reviewStatus: "pending_review" }, ACTOR);
  const rm2 = await asgSvc.remapAssignmentDepartmentCode("TESTW", "TESTZ", ACTOR);
  const zCount = await appPool().query(
    `SELECT count(*)::int n FROM department_area_assignments WHERE department_code='TESTZ' AND area_id=$1`, [U.id]);
  ok("P2 remap đụng trùng → deactivate nguồn, KHÔNG duplicate",
    rm2.deactivatedConflicts === 1 && zCount.rows[0].n === 1, JSON.stringify(rm2));
  // listAssignmentsForReview filter
  const rev = await asgSvc.listAssignmentsForReview({ reviewStatus: "pending_review" });
  ok("P2 listAssignmentsForReview trả pending + join area", rev.every((x) => x.reviewStatus === "pending_review" && !!x.areaCode));
  ok("DQ khu required chưa gán (C2 inactive → assignment trỏ area inactive)",
    dq.assignmentsToInactiveArea.some((x) => x.departmentCode === "TESTA"));

  console.log("MISC — unassign / approve / remap / delete guard / audit");
  const sAsg = (await asgSvc.listAssignmentsByArea(S.id)).find((x) => x.departmentCode === "TESTB");
  await asgSvc.unassignDepartmentFromArea(sAsg.id, ACTOR);
  ok("unassign (soft) → TESTB mất S khỏi operational",
    !(await asgSvc.getAreasForDepartment("TESTB")).some((a) => a.areaId === S.id));
  const re = await asgSvc.assignDepartmentToArea({ departmentCode: "TESTB", areaId: S.id }, ACTOR);
  ok("assign lại sau unassign → reactivated (không duplicate)", re.action === "reactivated");
  const pend = (await asgSvc.listAssignmentsByArea(P.id)).find((x) => x.departmentCode === "TESTA");
  await asgSvc.approveAssignment(pend.id, ACTOR);
  ok("approve pending_review OK",
    (await asgSvc.listAssignmentsByArea(P.id))[0].reviewStatus === "approved");
  const n = await asgSvc.remapDepartmentId("TESTA", null, ACTOR);
  ok("Q3 remapDepartmentId không tạo row mới (update-in-place)", n >= 4);
  // delete guard
  let delBlocked = false;
  try { await areaSvc.deleteAreaIfUnused(S.id, ACTOR); } catch { delBlocked = true; }
  ok("xóa cứng area có assignment bị chặn", delBlocked);
  const O = await areaSvc.createArea({ areaCode: "TEST_ORPHAN", areaName: "Chưa dùng" }, ACTOR);
  await areaSvc.deleteAreaIfUnused(O.id, ACTOR);
  ok("xóa cứng area CHƯA dùng được phép", (await areaSvc.getAreaById(O.id)) === null);
  // audit log đủ action
  const acts = await appPool().query(
    `SELECT DISTINCT action FROM area_assignment_changes WHERE actor_email=$1 ORDER BY 1`, [ACTOR]);
  const have = acts.rows.map((r) => r.action);
  ok("audit log ghi đủ mutation (create/update? move/deactivate/assign/unassign/bulk_assign/approve)",
    ["create","move","deactivate","assign","unassign","bulk_assign","approve"].every((a) => have.includes(a)),
    JSON.stringify(have));
  // tree
  const tree = await areaSvc.listAreaTree(true);
  const g = tree.find((t) => t.areaCode === "TEST_G");
  ok("listAreaTree: G có 3 con (C1,C2,C3)", g && g.children.length === 3, `children=${g?.children.length}`);
} finally {
  await cleanup();
  await closePools();
}

console.log(`\nKẾT QUẢ: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
