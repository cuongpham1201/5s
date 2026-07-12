// P8A — test Daily Policy: unit thuần (daily-rules) + resolver/validation (ban5s_test).
//   node scripts/test-daily-policy.mjs
import "./lib-db.mjs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const pw = /ban5s:([^@]+)@/.exec(process.env.BAN5S_DATABASE_URL)[1];
process.env.BAN5S_DATABASE_URL = `postgres://ban5s:${pw}@localhost:5432/ban5s_test`;

const require = createRequire(import.meta.url);
const ROOT = "/data/dev/5s-app";
const OUT = join(ROOT, "node_modules/.cache/daily-policy-build");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(`npx tsc src/lib/policy/policy-service.ts src/lib/policy/daily-rules.ts src/lib/db/pg.ts --outDir ${OUT} --rootDir src --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --strict false`,
  { cwd: ROOT, stdio: "inherit" });
const P = require(join(OUT, "lib/policy/policy-service.js"));
const R = require(join(OUT, "lib/policy/daily-rules.js"));
const { appPool, closePools } = await import("./lib-db.mjs");

const A = "dtest@local";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${x}`); } };

try {
  console.log("UNIT — daily-rules thuần (ma trận C/D/E)");
  // E: reset 06:00 — 05:59 VN (=22:59Z hôm trước) = NGÀY CŨ; 06:01 VN = NGÀY MỚI
  ok("E1 05:59 VN với reset 06:00 → ngày CŨ",
    R.businessDayKey(new Date("2026-07-11T22:59:00Z"), 6, 0) === "2026-07-11"); // 05:59 12/07 VN
  ok("E2 06:01 VN với reset 06:00 → ngày MỚI",
    R.businessDayKey(new Date("2026-07-11T23:01:00Z"), 6, 0) === "2026-07-12");
  ok("E3 reset 00:00 (default) ≡ vnDateKey cũ (00:01 VN = ngày mới)",
    R.businessDayKey(new Date("2026-07-11T17:01:00Z"), 0, 0) === "2026-07-12");
  ok("E4 reset có PHÚT (06:30): 06:29 cũ · 06:31 mới",
    R.businessDayKey(new Date("2026-07-11T23:29:00Z"), 6, 30) === "2026-07-11" &&
    R.businessDayKey(new Date("2026-07-11T23:31:00Z"), 6, 30) === "2026-07-12");
  // C: weekend — 2026-07-11 là THỨ BẢY, 2026-07-13 là THỨ HAI
  ok("C1 weekend_required=false → Thứ 7 KHÔNG tạo nghĩa vụ",
    R.obligationDay("2026-07-11", { weekend_required: false, holiday_dates: [] }).reason === "weekend_off");
  ok("C2 weekend_required=true (default) → Thứ 7 VẪN tính",
    R.obligationDay("2026-07-11", { weekend_required: true, holiday_dates: [] }).isObligationDay === true);
  ok("C3 thứ Hai luôn tính dù weekend=false",
    R.obligationDay("2026-07-13", { weekend_required: false, holiday_dates: [] }).isObligationDay === true);
  // D: holiday
  ok("D1 2026-09-02 trong holiday_dates → KHÔNG nghĩa vụ (holiday)",
    R.obligationDay("2026-09-02", { weekend_required: true, holiday_dates: ["2026-09-02"] }).reason === "holiday");
  ok("D2 ngày khác không ảnh hưởng",
    R.obligationDay("2026-09-03", { weekend_required: true, holiday_dates: ["2026-09-02"] }).isObligationDay === true);
  // rule 1: threshold
  ok("B-unit threshold: N=2 → 1 lần chưa xong, 2 lần xong",
    !R.areaCompleted(1, { captures_per_area_per_day: 2 }) && R.areaCompleted(2, { captures_per_area_per_day: 2 }));
  ok("A-unit threshold default N=1 ≡ hành vi cũ (≥1 là xong)",
    R.areaCompleted(1, { captures_per_area_per_day: 1 }));

  console.log("RESOLVER — F/G/H + VALIDATION (ban5s_test)");
  const db = appPool();
  await db.query(`DELETE FROM five_s_policy_changes WHERE policy_id IN (SELECT id FROM five_s_policies WHERE policy_type='daily')`);
  await db.query(`DELETE FROM five_s_policies WHERE policy_type='daily'`);
  P.clearPolicyCache();
  ok("A resolver 0 policy → defaults (capture=1, reset 0:00, weekend true, holiday [])",
    JSON.stringify((await P.resolveDailyPolicy()).policy) === JSON.stringify(P.POLICY_DEFAULTS.daily));
  const p1 = await P.createPolicy({ policyType: "daily", policyName: "Ca sáng", enabled: true,
    config: { captures_per_area_per_day: 2, reset_hour: 6, reset_minute: 0, weekend_required: false, holiday_dates: ["2026-09-02"] } }, A);
  P.clearPolicyCache();
  const r1 = (await P.resolveDailyPolicy());
  ok("B resolver: policy bật → 4 rule override, field khác giữ default",
    r1.policy.captures_per_area_per_day === 2 && r1.policy.reset_hour === 6 && r1.policy.weekend_required === false &&
    r1.policy.holiday_dates.includes("2026-09-02") && r1.policy.count_overtime === true && r1.policy.reset_timezone === "Asia/Ho_Chi_Minh");
  const p2 = await P.createPolicy({ policyType: "daily", policyName: "Ưu tiên", priority: 5, enabled: true, config: { captures_per_area_per_day: 3 } }, A);
  P.clearPolicyCache();
  ok("G priority cao thắng", (await P.resolveDailyPolicy()).policy.captures_per_area_per_day === 3);
  await P.setPolicyEnabled(p2.id, false, A);
  P.clearPolicyCache();
  ok("F disable → rơi về policy còn lại", (await P.resolveDailyPolicy()).policy.captures_per_area_per_day === 2);
  await P.setPolicyEnabled(p1.id, false, A);
  P.clearPolicyCache();
  ok("F disable hết → defaults 100%",
    JSON.stringify((await P.resolveDailyPolicy()).policy) === JSON.stringify(P.POLICY_DEFAULTS.daily));
  const realPool = globalThis.__ban5sAppPool;
  globalThis.__ban5sAppPool = { query: () => Promise.reject(new Error("down")) };
  P.clearPolicyCache();
  const rH = await P.resolveDailyPolicy();
  globalThis.__ban5sAppPool = realPool;
  ok("H DB down → defaults, không ném", rH.source === "defaults" && rH.policy.captures_per_area_per_day === 1);
  // VALIDATION spec
  const rejects = async (cfg) => { try { await P.createPolicy({ policyType: "daily", policyName: `bad-${Math.random()}`, config: cfg }, A); return false; } catch { return true; } };
  ok("VAL capture=0 bị chặn", await rejects({ captures_per_area_per_day: 0 }));
  ok("VAL capture=21 bị chặn", await rejects({ captures_per_area_per_day: 21 }));
  ok("VAL reset_hour=24 bị chặn", await rejects({ reset_hour: 24 }));
  ok("VAL timezone khác bị chặn", await rejects({ reset_timezone: "UTC" }));
  ok("VAL holiday sai format bị chặn", await rejects({ holiday_dates: ["02-09-2026"] }));
  ok("VAL holiday trùng bị chặn", await rejects({ holiday_dates: ["2026-09-02", "2026-09-02"] }));
  ok("VAL weekend không boolean bị chặn", await rejects({ weekend_required: "yes" }));
} finally {
  await closePools();
}
console.log(`\nKẾT QUẢ DAILY POLICY: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
