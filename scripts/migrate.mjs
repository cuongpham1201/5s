// Migration runner for the 5S business DB (ban5s_app). pg-only.
//   node scripts/migrate.mjs           → apply all pending *.sql (up)
//   node scripts/migrate.mjs status    → list applied vs pending
//   node scripts/migrate.mjs rollback  → run the .down.sql of the last applied migration
//
// Migrations live in /migrations. An "up" file is NAME.sql; its rollback is
// NAME.down.sql. Applied migrations are tracked in table _migrations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appPool, closePools, ROOT_DIR } from "./lib-db.mjs";

const DIR = join(ROOT_DIR, "migrations");
const cmd = process.argv[2] ?? "up";

function upFiles() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
}

async function ensureTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

async function applied(db) {
  const r = await db.query("SELECT name FROM _migrations ORDER BY name");
  return r.rows.map((x) => x.name);
}

async function main() {
  const db = appPool();
  await ensureTable(db);
  const done = new Set(await applied(db));
  const files = upFiles();

  if (cmd === "status") {
    for (const f of files) console.log(`${done.has(f) ? "[applied]" : "[pending]"} ${f}`);
    return;
  }

  if (cmd === "rollback") {
    const last = (await applied(db)).pop();
    if (!last) { console.log("Không có migration nào để rollback."); return; }
    const downName = last.replace(/\.sql$/, ".down.sql");
    const down = join(DIR, downName);
    console.log(`Rollback: ${downName}`);
    await db.query(readFileSync(down, "utf8"));
    await db.query("DELETE FROM _migrations WHERE name=$1", [last]);
    console.log(`✓ rolled back ${last}`);
    return;
  }

  // up (default)
  let ran = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    console.log(`Applying ${f} …`);
    const sql = readFileSync(join(DIR, f), "utf8");
    // Each up file wraps its own BEGIN/COMMIT.
    await db.query(sql);
    await db.query("INSERT INTO _migrations(name) VALUES ($1)", [f]);
    ran++;
    console.log(`✓ ${f}`);
  }
  console.log(ran === 0 ? "Không có migration mới." : `Đã áp dụng ${ran} migration.`);
}

main()
  .then(closePools)
  .catch(async (e) => { console.error("Migration lỗi:", e.message); await closePools(); process.exit(1); });
