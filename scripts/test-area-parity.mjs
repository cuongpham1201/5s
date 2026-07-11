// P3B — PARITY + SHADOW test: facade area-source với 2 adapter SP vs PG.
//   node scripts/test-area-parity.mjs
// Read-only với SharePoint/PG (không ghi gì). So sánh contract/picker/KPI,
// test shadow-read (log diff + PG-lỗi-giả-lập không làm fail request).
import "./lib-db.mjs"; // nạp .env.local (GRAPH_* + BAN5S_DATABASE_URL)
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = "/data/dev/5s-app";
const OUT = join(ROOT, "node_modules/.cache/area-parity-build");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// tsconfig riêng cho build test (paths @/* → src/*)
const TSCONF = join(OUT, "tsconfig.json");
writeFileSync(TSCONF, JSON.stringify({
  compilerOptions: {
    module: "commonjs", target: "es2020", moduleResolution: "node",
    esModuleInterop: true, skipLibCheck: true, strict: false,
    outDir: OUT, rootDir: join(ROOT, "src"), baseUrl: join(ROOT, "src"),
    paths: { "@/*": ["*"] },
  },
  include: [join(ROOT, "src/lib/areas/area-source.ts")],
}));
execSync(`npx tsc -p ${TSCONF}`, { cwd: ROOT, stdio: "inherit" });
// runtime hook: "@/x" → OUT/x
const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (typeof request === "string" && request.startsWith("@/")) request = join(OUT, request.slice(2));
  return orig.call(this, request, ...args);
};
const src = require(join(OUT, "lib/areas/area-source.js"));
const { appPool, closePools } = await import("./lib-db.mjs");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const asSP = () => { process.env.AREA_SOURCE = "sharepoint"; process.env.AREA_SHADOW_READ_ENABLED = "false"; };
const asPG = () => { process.env.AREA_SOURCE = "postgres"; };

try {
  console.log("A — CONTRACT / TREE PARITY");
  asSP(); const spTree = await src.listAreaTree();
  asPG(); const pgTree = await src.listAreaTree();
  const codes = (l) => l.map((a) => a.code).sort().join(",");
  ok("tree count SP=PG (12 active)", spTree.length === 12 && pgTree.length === 12, `${spTree.length}/${pgTree.length}`);
  ok("tree codes SP=PG", codes(spTree) === codes(pgTree));
  let fieldDiff = []; const explained = [];
  for (const s of spTree) {
    const p = pgTree.find((x) => x.code === s.code);
    if (!p) continue;
    if (s.name !== p.name) fieldDiff.push(`${s.code}:name`);
    if ((s.parentCode ?? "") !== (p.parentCode ?? "")) fieldDiff.push(`${s.code}:parent`);
    if (s.areaType !== p.areaType) fieldDiff.push(`${s.code}:type`);
    if (s.isCaptureRequired !== p.isCaptureRequired) fieldDiff.push(`${s.code}:required`);
    const only = [...new Set([...s.departments, ...p.departments])].filter((d) => s.departments.includes(d) !== p.departments.includes(d));
    if (only.some((d) => d !== "PMKT")) fieldDiff.push(`${s.code}:depts(${only.join("+")})`);
    else if (only.length) explained.push(`${s.code}: SP có PMKT (legacy display) — PG loại theo Q4 unresolved`);
  }
  ok("tree fields khớp (diff PMKT được GIẢI THÍCH — Q4)", fieldDiff.length === 0, fieldDiff.join(" · "));
  if (explained.length) console.log("  ℹ diff có chủ đích: " + explained.join(" · "));

  console.log("B — PICKER PARITY theo phòng (BPSH,TCKS,KBL,MKT,PXHL)");
  for (const d of ["BPSH", "TCKS", "KBL", "MKT", "PXHL"]) {
    asSP(); const sp = await src.listAreasByDepartmentCode(d);
    asPG(); const pg = await src.listAreasByDepartmentCode(d);
    const same = sp.length === pg.length && codes(sp) === codes(pg) &&
      sp.every((s) => { const p = pg.find((x) => x.code === s.code); return p && p.name === s.name && (p.parentCode ?? "") === (s.parentCode ?? "") && p.isCaptureRequired === s.isCaptureRequired; });
    ok(`picker ${d}: SP(${sp.length}) = PG(${pg.length})`, same, same ? "" : `SP=[${codes(sp)}] PG=[${codes(pg)}]`);
  }

  console.log("C — KPI BASE");
  // active dept codes lấy từ chính SP picker parity ở trên là đủ nghiệp vụ; ở đây
  // dùng danh sách phòng active thật từ Config_Departments qua Graph (read-only).
  const env = process.env;
  const tok = (await (await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `client_id=${env.GRAPH_CLIENT_ID}&client_secret=${encodeURIComponent(env.GRAPH_CLIENT_SECRET)}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials` })).json()).access_token;
  const SITE = "biahalong.sharepoint.com,03151163-0852-4f57-b67b-79b114ef5617,204abada-4f97-4b85-98a3-f66dd3c93c45";
  const G = async (p) => (await fetch(`https://graph.microsoft.com/v1.0${p}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  const dlid = (await G(`/sites/${SITE}/lists?$select=id,displayName&$top=100`)).value.find((l) => l.displayName === "Config_Departments").id;
  const activeDepts = ((await G(`/sites/${SITE}/lists/${dlid}/items?expand=fields(select=DepartmentCode,IsActive)&$top=999`)).value ?? [])
    .filter((i) => i.fields.IsActive && i.fields.DepartmentCode).map((i) => String(i.fields.DepartmentCode));
  asSP(); const spKpi = await src.getAreaKpiBase(activeDepts);
  asPG(); const pgKpi = await src.getAreaKpiBase(activeDepts);
  ok("physicalCapturePoints = 11 (cả 2)", spKpi.physicalCapturePoints === 11 && pgKpi.physicalCapturePoints === 11, JSON.stringify({ sp: spKpi.physicalCapturePoints, pg: pgKpi.physicalCapturePoints }));
  ok("departmentAreaObligations = 56 (cả 2 — baseline giữ)", spKpi.departmentAreaObligations === 56 && pgKpi.departmentAreaObligations === 56, JSON.stringify({ sp: spKpi.departmentAreaObligations, pg: pgKpi.departmentAreaObligations }));
  const perDiff = [];
  for (const s of spKpi.perDepartment) {
    const p = pgKpi.perDepartment.find((x) => x.departmentCode === s.departmentCode);
    if (!p || p.areaCodes.join(",") !== s.areaCodes.join(",")) perDiff.push(s.departmentCode);
  }
  ok("per-department obligations khớp từng phòng", perDiff.length === 0 && spKpi.perDepartment.length === pgKpi.perDepartment.length, perDiff.join(","));
  ok("PMKT KHÔNG có trong KPI (cả 2)", !spKpi.perDepartment.some((x) => x.departmentCode === "PMKT") && !pgKpi.perDepartment.some((x) => x.departmentCode === "PMKT"));
  asPG(); ok("PMKT KHÔNG có trong picker PG", (await src.listAreasByDepartmentCode("PMKT")).length === 0);
  ok("area inactive không xuất hiện (byCode TCKS_OFFICE null cả 2)",
    (await src.getAreaByCode("TCKS_OFFICE")) === null && (asSP(), (await src.getAreaByCode("TCKS_OFFICE")) === null));
  console.log("  groupNameMap:");
  asSP(); const spMap = await src.getAreaGroupNameMap();
  asPG(); const pgMap = await src.getAreaGroupNameMap();
  ok("groupNameMap size SP=PG (gồm inactive — snapshot lịch sử)", spMap.size === pgMap.size, `${spMap.size}/${pgMap.size}`);
  ok("Tầng 1 quy về nhóm 'Văn phòng' (cả 2)", spMap.get("KV_VAN_PHONG_TANG_1") === "Văn phòng" && pgMap.get("KV_VAN_PHONG_TANG_1") === "Văn phòng");

  console.log("D — SHADOW READ");
  process.env.AREA_SOURCE = "sharepoint";
  process.env.AREA_SHADOW_READ_ENABLED = "true";
  process.env.AREA_SHADOW_LOG_SAMPLE_RATE = "1";
  const logs = [];
  const origLog = console.log, origWarn = console.warn;
  console.log = (...a) => { if (String(a[0]).includes("5S_AREA_SHADOW")) logs.push(["log", a[1]]); else origLog(...a); };
  console.warn = (...a) => { if (String(a[0]).includes("5S_AREA_SHADOW")) logs.push(["warn", a[1]]); else origWarn(...a); };
  const shadowRes = await src.listAreasByDepartmentCode("TCKS");
  console.log = origLog; console.warn = origWarn;
  const diffLog = logs.find(([k]) => k === "log");
  ok("shadow bật: response vẫn SP + có log diff", shadowRes.length > 0 && !!diffLog);
  if (diffLog) {
    const d = JSON.parse(diffLog[1]);
    ok("shadow diff: SP=PG count, missing 0/0, diff THẬT=0, known(PMKT)=3",
      d.sharepointCount === d.postgresCount && d.missingInPostgres.length === 0 && d.missingInSharePoint.length === 0 && d.differentFields === 0 && d.knownLegacyDiffs === 3,
      diffLog[1]);
    ok("shadow log có duration 2 phía", typeof d.durationSpMs === "number" && typeof d.durationPgMs === "number");
  }
  // PG lỗi giả lập → chỉ warning, response vẫn SP
  const realPool = globalThis.__ban5sAppPool;
  globalThis.__ban5sAppPool = { query: () => Promise.reject(new Error("simulated-pg-down")) };
  const logs2 = [];
  console.warn = (...a) => { if (String(a[0]).includes("5S_AREA_SHADOW")) logs2.push(a[1]); else origWarn(...a); };
  const resWhenPgDown = await src.listAreasByDepartmentCode("TCKS");
  console.warn = origWarn;
  globalThis.__ban5sAppPool = realPool;
  ok("PG hỏng: request KHÔNG fail, trả SP đầy đủ", resWhenPgDown.length === shadowRes.length);
  ok("PG hỏng: chỉ warning shadowError", logs2.length === 1 && JSON.parse(logs2[0]).shadowError?.includes("simulated"), logs2[0] ?? "");
  process.env.AREA_SHADOW_READ_ENABLED = "false";
} finally {
  await closePools();
}
console.log(`\nKẾT QUẢ PARITY: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
