// P6 — integration test versioning trên DB TEST RIÊNG (ban5s_test).
//   node scripts/test-area-versions.mjs
// KHÔNG đụng ban5s_app thật / SharePoint / HRM (chỉ SELECT hr_employees? — không,
// test DB có bảng hr_employees rỗng riêng). Ma trận test 1-18 + 22-24 của spec.
import "./lib-db.mjs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// ── trỏ sang DB TEST trước khi pool được tạo ──
const pw = /ban5s:([^@]+)@/.exec(process.env.BAN5S_DATABASE_URL)[1];
process.env.BAN5S_DATABASE_URL = `postgres://ban5s:${pw}@localhost:5432/ban5s_test`;

const require = createRequire(import.meta.url);
const ROOT = "/data/dev/5s-app";
const OUT = join(ROOT, "node_modules/.cache/area-versions-build");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(
  `npx tsc src/lib/areas/area-version-service.ts src/lib/areas/area-pg-service.ts src/lib/areas/area-assignment-service.ts src/lib/db/pg.ts ` +
  `--outDir ${OUT} --rootDir src --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --strict false`,
  { cwd: ROOT, stdio: "inherit" });
const ver = require(join(OUT, "lib/areas/area-version-service.js"));
const areaSvc = require(join(OUT, "lib/areas/area-pg-service.js"));
const asgSvc = require(join(OUT, "lib/areas/area-assignment-service.js"));
const { appPool, closePools } = await import("./lib-db.mjs");

const ACTOR = "vtest@local";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${x}`); } };
const db = appPool();
console.log("DB:", (await db.query("SELECT current_database()")).rows[0].current_database, "(phải là ban5s_test)");

try {
  // reset test DB state
  await db.query(`TRUNCATE area_configuration_versions, area_assignment_changes, department_area_assignments, five_s_areas RESTART IDENTITY CASCADE`);

  // ── seed production-like: nhóm + 2 con + khu chung, 3 assignment ──
  const G = await areaSvc.createArea({ areaCode: "VP", areaName: "Văn phòng", areaType: "group", isCaptureRequired: false }, ACTOR);
  const T1 = await areaSvc.createArea({ areaCode: "VP_T1", areaName: "Tầng 1", parentId: G.id, areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  const T2 = await areaSvc.createArea({ areaCode: "VP_T2", areaName: "Tầng 2", parentId: G.id, areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  const S = await areaSvc.createArea({ areaCode: "KHO", areaName: "Kho", areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "D1", areaId: T1.id }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "D1", areaId: S.id }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "D2", areaId: S.id }, ACTOR);

  console.log("SNAPSHOT (test 1-4)");
  const s1 = await ver.createAreaConfigurationSnapshot({ name: "A", triggerType: "manual", actor: ACTOR });
  ok("1 tạo snapshot A từ dữ liệu production-like", s1.action === "created" && s1.version.versionNo === 1);
  const s2 = await ver.createAreaConfigurationSnapshot({ actor: ACTOR });
  ok("2 tạo lại khi không đổi → skip (hash giống)", s2.action === "skipped_same_hash" && s2.version.id === s1.version.id);
  // 3: đổi thứ tự vật lý (touch updated_at không thuộc snapshot) → hash giống
  await db.query(`UPDATE five_s_areas SET updated_at = now() WHERE area_code='KHO'`);
  const s3 = await ver.createAreaConfigurationSnapshot({ actor: ACTOR });
  ok("3 thứ tự/timestamp vật lý khác → hash vẫn giống", s3.action === "skipped_same_hash");
  const detail = await ver.getAreaConfigurationVersion(s1.version.id);
  const kpiA = ver.snapshotKpi(detail.snapshot);
  ok("4 snapshot đủ areas/assignments/counts/KPI",
    detail.snapshot.areas.length === 4 && detail.snapshot.assignments.length === 3 &&
    s1.version.areasCount === 4 && s1.version.operationalObligationsCount === 3 &&
    kpiA.physicalCapturePoints === 3 && kpiA.operationalObligations === 3, JSON.stringify(kpiA));

  console.log("COMPARE (test 5-9)");
  // sửa: rename T1, move S vào G, thêm assignment D2@T2, đổi required D1@T1
  await areaSvc.updateArea(T1.id, { areaName: "Tầng 1 (mới)" }, ACTOR);
  await areaSvc.moveArea(S.id, G.id, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "D2", areaId: T2.id }, ACTOR);
  const d1t1 = (await asgSvc.listAssignmentsByArea(T1.id)).find((x) => x.departmentCode === "D1");
  await asgSvc.updateAssignment(d1t1.id, { isRequired: false }, ACTOR);
  const sB = await ver.createAreaConfigurationSnapshot({ name: "B", actor: ACTOR });
  ok("tạo snapshot B sau chỉnh sửa", sB.action === "created");
  const cmp = ver.compareSnapshots(detail.snapshot, (await ver.getAreaConfigurationVersion(sB.version.id)).snapshot);
  ok("5 rename detect", cmp.areas.changed.some((c) => c.area_code === "VP_T1" && c.changes.area_name));
  ok("6 move parent detect", cmp.areas.changed.some((c) => c.area_code === "KHO" && c.changes.parent_area_code));
  ok("7 add assignment detect", cmp.assignments.added.includes("D2|VP_T2|owner"));
  ok("8 required change detect", cmp.assignments.changed.some((c) => c.key === "D1|VP_T1|owner" && c.changes.is_required));
  ok("9 KPI impact per-dept đúng (A→B: D1 3→2? D2 1→2)",
    cmp.kpi.obligationsBefore === 3 && cmp.kpi.obligationsAfter === 3 &&
    cmp.kpi.perDepartmentDiff.some((d) => d.departmentCode === "D1" && d.before === 2 && d.after === 1) &&
    cmp.kpi.perDepartmentDiff.some((d) => d.departmentCode === "D2" && d.before === 1 && d.after === 2),
    JSON.stringify(cmp.kpi));

  console.log("RESTORE (test 10-18)");
  const pv = await ver.previewRestoreAreaConfiguration(s1.version.id, ACTOR);
  ok("12 preview restore A: valid + diff đúng chiều B→A",
    pv.valid && pv.compare.areas.changed.some((c) => c.area_code === "VP_T1" && String(c.changes.area_name?.to) === "Tầng 1"),
    JSON.stringify(pv.planned));
  const rs = await ver.restoreAreaConfiguration(s1.version.id, ACTOR);
  ok("13 restore A chạy OK + verify", rs.restored && rs.verifyHashMatch);
  const cur = await ver.buildCurrentSnapshot();
  ok("14 hash sau restore = hash A (giới hạn theo tập key của A — row inactive dư ngoài A là by-design)",
    ver.snapshotHash(ver.restrictSnapshot(cur, detail.snapshot)) === s1.version.snapshotHash);
  const kpiNow = ver.snapshotKpi(cur);
  ok("15 KPI quay về A (3 nghĩa vụ, D1=2 D2=1)",
    kpiNow.operationalObligations === 3 && kpiNow.perDepartment.D1 === 2 && kpiNow.perDepartment.D2 === 1);
  const logs = await db.query(`SELECT action, count(*)::int n FROM area_assignment_changes WHERE entity_type='version' GROUP BY action ORDER BY action`);
  ok("16 audit log version đủ (snapshot/restore_preview/restore)",
    ["restore", "restore_preview", "snapshot"].every((a) => logs.rows.some((r) => r.action === a)), JSON.stringify(logs.rows));
  const vers = await ver.listAreaConfigurationVersions();
  ok("17 snapshot before_restore được tạo", vers.some((v) => v.triggerType === "before_restore"));
  // 18: restore lỗi giữa chừng → rollback. Chèn version với snapshot hash SAI
  // (verify sẽ fail sau khi ghi) → transaction rollback, state giữ nguyên.
  const badSnap = JSON.parse(JSON.stringify(detail.snapshot));
  badSnap.areas[0].area_name = "HACKED-NAME";
  await db.query(
    `INSERT INTO area_configuration_versions (version_no, trigger_type, areas_count, assignments_count,
       active_areas_count, operational_obligations_count, snapshot_hash, snapshot_json, created_by_email)
     VALUES ((SELECT max(version_no)+1 FROM area_configuration_versions), 'system', 4, 3, 4, 3, 'deadbeef-wrong-hash', $1, $2)`,
    [JSON.stringify(badSnap), ACTOR]);
  const badId = Number((await db.query(`SELECT id FROM area_configuration_versions ORDER BY version_no DESC LIMIT 1`)).rows[0].id);
  const hashBefore = ver.snapshotHash(await ver.buildCurrentSnapshot());
  let failedMid = false;
  try { await ver.restoreAreaConfiguration(badId, ACTOR); } catch { failedMid = true; }
  const hashAfter = ver.snapshotHash(await ver.buildCurrentSnapshot());
  ok("18 restore verify-fail → rollback, state nguyên vẹn", failedMid && hashBefore === hashAfter);

  console.log("SAFETY (test 22-24)");
  // 22 duplicate/cycle bị chặn
  const dupSnap = JSON.parse(JSON.stringify(detail.snapshot));
  dupSnap.areas.push({ ...dupSnap.areas[0] });
  ok("22a duplicate area_code bị chặn", ver.validateSnapshot(dupSnap).some((e) => e.includes("duplicate area_code")));
  const cycSnap = JSON.parse(JSON.stringify(detail.snapshot));
  cycSnap.areas.find((a) => a.area_code === "VP").parent_area_code = "VP_T1";
  ok("22b cycle bị chặn", ver.validateSnapshot(cycSnap).some((e) => e.includes("cycle")));
  // 23 unresolved giữ đúng trạng thái qua restore
  const U = await areaSvc.createArea({ areaCode: "UAREA", areaName: "U", areaType: "capture_point", isCaptureRequired: true }, ACTOR);
  await asgSvc.assignDepartmentToArea({ departmentCode: "DX", areaId: U.id, unresolvedDepartment: true, reviewStatus: "pending_review" }, ACTOR);
  const sU = await ver.createAreaConfigurationSnapshot({ name: "with-unresolved", actor: ACTOR });
  await asgSvc.remapAssignmentDepartmentCode("DX", "D9", ACTOR); // đổi đi
  await ver.restoreAreaConfiguration(sU.version.id, ACTOR);      // restore lại
  const curU = await ver.buildCurrentSnapshot();
  const uRow = curU.assignments.find((g) => g.department_code === "DX" && g.area_code === "UAREA");
  ok("23 unresolved assignment restore đúng trạng thái snapshot",
    !!uRow && uRow.unresolved_department === true && uRow.review_status === "pending_review", JSON.stringify(uRow));
  ok("23b KPI không tính unresolved sau restore",
    !ver.snapshotKpi(curU).perDepartment.DX);
  // 24 bulk auto-snapshot: mô phỏng policy (route gọi createSnapshot trước bulk) — verify idempotent + tạo khi có đổi
  await ver.createAreaConfigurationSnapshot({ triggerType: "before_bulk_change", actor: ACTOR });
  const auto1b = await ver.createAreaConfigurationSnapshot({ triggerType: "before_bulk_change", actor: ACTOR });
  ok("24a auto-snapshot idempotent (gọi lần 2 liên tiếp → skip same hash)", auto1b.action === "skipped_same_hash");
  await asgSvc.bulkAssignDepartmentToAreas("D3", [T1.id, T2.id], {}, ACTOR);
  const auto2 = await ver.createAreaConfigurationSnapshot({ triggerType: "before_bulk_change", actor: ACTOR });
  ok("24b auto-snapshot tạo mới sau khi có thay đổi", auto2.action === "created" && auto2.version.triggerType === "before_bulk_change");
  // protect + export
  await ver.setVersionProtected(s1.version.id, true, ACTOR);
  ok("protect version OK", (await ver.listAreaConfigurationVersions()).find((v) => v.id === s1.version.id)?.isProtected === true);
  const ex = await ver.exportAreaConfigurationVersion(s1.version.id, ACTOR);
  ok("export trả version + snapshot", ex.version.id === s1.version.id && ex.snapshot.areas.length === 4);
} finally {
  await closePools();
}
console.log(`\nKẾT QUẢ VERSIONING: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
