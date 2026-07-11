// Migration Config_Areas → ban5s_app (P2).
//   node scripts/migrate-areas.mjs                → PREVIEW (mặc định, không ghi gì)
//   node scripts/migrate-areas.mjs --apply        → import (transaction, idempotent)
//   node scripts/migrate-areas.mjs --cleanup      → xóa dữ liệu source='migrated' (rollback P2)
// JSON report ghi ra reports/area-migration-<mode>-<ts>.json (không chứa secret).
import "./lib-db.mjs"; // nạp .env.local
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODE = process.argv.includes("--cleanup") ? "cleanup" : process.argv.includes("--apply") ? "apply" : "preview";
const require = createRequire(import.meta.url);
const ROOT = "/data/dev/5s-app";
const OUT = join(ROOT, "node_modules/.cache/areas-migration-build");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(
  `npx tsc src/lib/areas/area-migration-service.ts src/lib/areas/area-assignment-service.ts ` +
  `src/lib/areas/area-pg-service.ts src/lib/db/pg.ts ` +
  `--outDir ${OUT} --rootDir src --module commonjs --target es2020 --moduleResolution node ` +
  `--esModuleInterop --skipLibCheck --strict false`,
  { cwd: ROOT, stdio: "inherit" },
);
const mig = require(join(OUT, "lib/areas/area-migration-service.js"));
const { appPool, closePools } = await import("./lib-db.mjs");

const ACTOR = "migration-script";
const counts = async () => {
  const c = await appPool().query(
    `SELECT (SELECT count(*)::int FROM five_s_areas) a,
            (SELECT count(*)::int FROM department_area_assignments) s,
            (SELECT count(*)::int FROM area_assignment_changes) ch`);
  return { areas: c.rows[0].a, assignments: c.rows[0].s, changes: c.rows[0].ch };
};

try {
  const before = await counts();
  console.log(`MODE=${MODE} · rows trước: ${JSON.stringify(before)}`);
  let report;
  if (MODE === "cleanup") {
    const r = await mig.cleanupMigratedData(ACTOR);
    report = { mode: MODE, before, cleaned: r, after: await counts() };
  } else {
    const plan = await mig.buildMigrationPlan();
    report = { mode: MODE, before, summary: plan.summary };
    console.log("SUMMARY:", JSON.stringify(plan.summary, null, 2));
    if (MODE === "apply") {
      const res = await mig.applyMigration(plan, ACTOR);
      report.apply = res;
      report.after = await counts();
      console.log("APPLY:", JSON.stringify(res, null, 2));
    } else {
      // preview kèm chi tiết assignment để soi (không ghi DB)
      report.assignments = plan.assignments;
      report.areas = plan.areas.map((a) => ({
        code: a.code, name: a.name, parent: a.parentCode, type: a.areaType,
        required: a.isCaptureRequired, active: a.isActive, depts: a.departments.length,
      }));
    }
  }
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  const file = join(ROOT, "reports", `area-migration-${MODE}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Report: ${file}`);
} finally {
  await closePools();
}
