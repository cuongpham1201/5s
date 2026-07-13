// P9.5 — parity test parsePhotoPath: bản dùng chung PHẢI byte-equivalent với
// cả 2 bản cũ (report-service + photo-stats) trên corpus mọi dạng path đã biết.
//   node scripts/test-photo-path.mjs
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = "/data/dev/5s-app";
const OUT = join(ROOT, "node_modules/.cache/photo-path-build");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execSync(`npx tsc src/lib/sharepoint/photo-path.ts --outDir ${OUT} --rootDir src --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --strict false`, { cwd: ROOT, stdio: "inherit" });
const { parsePhotoPath } = require(join(OUT, "lib/sharepoint/photo-path.js"));

// Bản CŨ của report-service (copy nguyên văn trước P9.5)
function oldReport(path) {
  const parts = path.split("/");
  if (parts[0] !== "Img" || parts.length < 4) return null;
  const dept = parts[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[2])) return { dept, dateKey: parts[2] };
  if (/^\d{4}$/.test(parts[2]) && /^\d{2}$/.test(parts[3]) && /^\d{2}$/.test(parts[4])) {
    return { dept, dateKey: `${parts[2]}-${parts[3]}-${parts[4]}` };
  }
  return null;
}
// Bản CŨ của photo-stats (copy nguyên văn trước P9.5)
function oldStats(path) {
  const parts = path.split("/");
  if (parts[0] !== "Img" || parts.length < 4) return null;
  const dept = parts[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[2])) return { dept, dateKey: parts[2] };
  if (/^\d{4}$/.test(parts[2]) && /^\d{2}$/.test(parts[3]) && /^\d{2}$/.test(parts[4] ?? "")) {
    return { dept, dateKey: `${parts[2]}-${parts[3]}-${parts[4]}` };
  }
  return null;
}

const corpus = [
  // layout mới
  "Img/TCKS/2026-07-12/SUB123/photo_01.jpg",
  "Img/CĐ/2026-07-12/S1/a.jpg",
  "Img/BPSH/2026-01-01/x/y/z/deep.jpg",
  // layout cũ
  "Img/TCKS/2026/07/12/SUB123/photo_01.jpg",
  "Img/KKD/2025/12/31/a.jpg",
  // biên: path 4 phần layout cũ (parts[4] undefined)
  "Img/TCKS/2026/07",
  "Img/TCKS/2026/07/",
  // không khớp
  "Img/TCKS/photo.jpg",
  "Img/TCKS",
  "Data/TCKS/2026-07-12/a.jpg",
  "img/TCKS/2026-07-12/a.jpg",
  "",
  "Img//2026-07-12/a.jpg",
  "Img/TCKS/26-07-12/a.jpg",
  "Img/TCKS/2026-7-12/a.jpg",
  "Img/TCKS/2026/7/12/a.jpg",
  "Img/TCKS/20260712/a.jpg",
  "Img/PXĐM/2026-02-29/a.jpg", // parser không validate lịch — giữ nguyên hành vi
  "Img/A B/2026-07-12/a.jpg",
  "Img/TCKS/2026/07/12",
];

let pass = 0, fail = 0;
for (const p of corpus) {
  const n = JSON.stringify(parsePhotoPath(p));
  const r = JSON.stringify(oldReport(p));
  const s = JSON.stringify(oldStats(p));
  if (n === r && n === s) { pass++; }
  else { fail++; console.log(`  ✗ "${p}" new=${n} oldReport=${r} oldStats=${s}`); }
}
console.log(`\nKẾT QUẢ PHOTO-PATH PARITY: ${pass} PASS · ${fail} FAIL trên ${corpus.length} paths`);
process.exit(fail ? 1 : 0);
