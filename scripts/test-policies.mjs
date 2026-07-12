// P7 — integration test Policy Engine trên DB TEST RIÊNG (ban5s_test).
//   node scripts/test-policies.mjs
import "./lib-db.mjs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const pw = /ban5s:([^@]+)@/.exec(process.env.BAN5S_DATABASE_URL)[1];
process.env.BAN5S_DATABASE_URL = `postgres://ban5s:${pw}@localhost:5432/ban5s_test`;

const require = createRequire(import.meta.url);
const ROOT = "/data/dev/5s-app";
const OUT = join(ROOT, "node_modules/.cache/policies-build");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(`npx tsc src/lib/policy/policy-service.ts src/lib/db/pg.ts --outDir ${OUT} --rootDir src --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --strict false`,
  { cwd: ROOT, stdio: "inherit" });
const P = require(join(OUT, "lib/policy/policy-service.js"));
const { appPool, closePools } = await import("./lib-db.mjs");

const A = "ptest@local";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${x}`); } };
const db = appPool();
console.log("DB:", (await db.query("SELECT current_database()")).rows[0].current_database);

try {
  await db.query(`TRUNCATE five_s_policy_changes, five_s_policies RESTART IDENTITY CASCADE`);
  P.clearPolicyCache();

  console.log("FALLBACK — chưa có policy");
  const r0 = await P.resolveCapturePolicy();
  ok("resolver trả DEFAULTS khi bảng rỗng", r0.source === "defaults" && r0.policy.max_photos === 20 && r0.policy.min_photos === 1);
  const rd = await P.resolveDailyPolicy();
  ok("daily defaults = hành vi hiện tại (1 lần/khu, reset 0h VN, weekend true)",
    rd.policy.captures_per_area_per_day === 1 && rd.policy.reset_hour === 0 && rd.policy.reset_timezone === "Asia/Ho_Chi_Minh" && rd.policy.weekend_required === true);
  const ra = await P.resolveAuditPolicy();
  ok("audit defaults (mọi user, chéo OK, CAPA auto, SLA 7)",
    ra.policy.auditor_roles.length === 0 && ra.policy.allow_cross_department === true && ra.policy.auto_create_capa === true && ra.policy.capa_sla_days === 7);
  const rn = await P.resolveNotificationPolicy();
  ok("notification defaults = tất cả OFF", !rn.policy.daily.teams && !rn.policy.violation.email);

  console.log("CRUD + SANITIZE");
  const p1 = await P.createPolicy({
    policyType: "capture", policyName: "Chuẩn nhà máy",
    config: { max_photos: 10, gps_required: true, hacker_field: "x", min_photos: 2 },
  }, A);
  ok("create: mặc định TẮT + sanitize bỏ key lạ",
    p1.enabled === false && p1.config.max_photos === 10 && !("hacker_field" in p1.config));
  let dup = false;
  try { await P.createPolicy({ policyType: "capture", policyName: "Chuẩn nhà máy" }, A); } catch { dup = true; }
  ok("trùng (type, name) bị chặn", dup);
  P.clearPolicyCache();
  const rOff = await P.resolveCapturePolicy();
  ok("policy TẮT → resolver vẫn DEFAULTS", rOff.source === "defaults" && rOff.policy.max_photos === 20);

  console.log("ENABLE + RESOLVE + MERGE");
  await P.setPolicyEnabled(p1.id, true, A);
  P.clearPolicyCache();
  const r1 = await P.resolveCapturePolicy();
  ok("bật → resolver merge override lên defaults",
    r1.source === "policy" && r1.policyId === p1.id && r1.policy.max_photos === 10 && r1.policy.gps_required === true && r1.policy.min_photos === 2);
  ok("key không override giữ default (watermark_required=true)", r1.policy.watermark_required === true);

  console.log("PRIORITY + EFFECTIVE");
  const p2 = await P.createPolicy({ policyType: "capture", policyName: "Ưu tiên cao", priority: 10, enabled: true, config: { max_photos: 5 } }, A);
  P.clearPolicyCache();
  ok("priority cao hơn thắng", (await P.resolveCapturePolicy()).policy.max_photos === 5);
  await P.updatePolicy(p2.id, { effectiveTo: "2000-01-01" }, A); // hết hiệu lực từ lâu
  P.clearPolicyCache();
  ok("hết hiệu lực → rơi về policy còn lại", (await P.resolveCapturePolicy()).policy.max_photos === 10);
  await P.updatePolicy(p2.id, { effectiveFrom: "2099-01-01", effectiveTo: null }, A); // chưa tới
  P.clearPolicyCache();
  ok("chưa tới hiệu lực → không áp dụng", (await P.resolveCapturePolicy()).policy.max_photos === 10);

  console.log("CLONE + HISTORY + RESTORE");
  const c1 = await P.clonePolicy(p1.id, "Chuẩn nhà máy v2", A);
  ok("clone: copy config + luôn TẮT", c1.enabled === false && c1.config.max_photos === 10);
  await P.updatePolicy(p1.id, { config: { max_photos: 15 } }, A);
  P.clearPolicyCache();
  ok("update config có hiệu lực", (await P.resolveCapturePolicy()).policy.max_photos === 15);
  const hist = await P.listPolicyHistory(p1.id);
  ok("history đủ action (create/enable/update)",
    ["create", "enable", "update"].every((a) => hist.some((h) => h.action === a)), hist.map((h) => h.action).join(","));
  // restore về bản ghi 'enable' (config lúc đó max_photos=10)
  const enableRow = hist.find((h) => h.action === "enable" || (h.action === "create"));
  const restoreTarget = hist.find((h) => h.action === "create");
  await P.restorePolicyFromHistory(p1.id, restoreTarget.id, A);
  P.clearPolicyCache();
  const afterRestore = await P.resolveCapturePolicy();
  ok("restore từ history → config quay về bản cũ (max_photos=10)", afterRestore.policy.max_photos === 10, JSON.stringify(afterRestore.policy.max_photos));
  ok("restore ghi history", (await P.listPolicyHistory(p1.id)).some((h) => h.action === "restore"));
  void enableRow;

  console.log("CACHE + FAIL-SAFE");
  await P.updatePolicy(p1.id, { config: { max_photos: 9 } }, A); // updatePolicy tự clear cache
  ok("mutation tự clear cache", (await P.resolveCapturePolicy()).policy.max_photos === 9);
  const realPool = globalThis.__ban5sAppPool;
  globalThis.__ban5sAppPool = { query: () => Promise.reject(new Error("db-down")) };
  P.clearPolicyCache();
  const rSafe = await P.resolveCapturePolicy();
  globalThis.__ban5sAppPool = realPool;
  ok("DB lỗi → resolver KHÔNG ném, trả DEFAULTS (fail-safe read path)", rSafe.source === "defaults" && rSafe.policy.max_photos === 20);
} finally {
  await closePools();
}
console.log(`\nKẾT QUẢ POLICY: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
