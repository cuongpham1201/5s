// Shared helpers for Phase-1 DB tooling (migrate + HRM sync).
// pg-only, plain ESM. Loads env from .env.local / .env if not already set.
// The HRM pool is FORCED read-only at the connection level — the app must never
// write to HRM. The app (ban5s_app) pool is read-write.
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env parser (no dotenv dep). Does not override already-set vars. */
function loadEnvFile(name) {
  const p = join(ROOT, name);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu env ${name} (đặt trong .env.local).`);
  return v;
}

let _appPool;
let _hrmPool;

/** Read-write pool for the 5S business DB (ban5s_app). */
export function appPool() {
  if (!_appPool) _appPool = new Pool({ connectionString: requireEnv("BAN5S_DATABASE_URL"), max: 5 });
  return _appPool;
}

/**
 * READ-ONLY pool for HRM (biahalong_cb). Every connection starts with
 * default_transaction_read_only=on, so even a stray write throws. SELECT only.
 */
export function hrmPool() {
  if (!_hrmPool) {
    _hrmPool = new Pool({
      connectionString: requireEnv("HRM_DATABASE_URL"),
      max: 3,
      options: "-c default_transaction_read_only=on",
    });
  }
  return _hrmPool;
}

export async function closePools() {
  if (_appPool) await _appPool.end();
  if (_hrmPool) await _hrmPool.end();
  _appPool = _hrmPool = undefined;
}

/** Stable hash over a mapped record's business fields → detect source changes. */
export function sourceHash(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 32);
}

export const ROOT_DIR = ROOT;
