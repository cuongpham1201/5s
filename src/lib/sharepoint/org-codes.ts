/**
 * Org department code mapping + normalization (shared, no SharePoint deps).
 * Used by both org-source (import) and department-service (resolution) — kept
 * separate to avoid an import cycle.
 */

/** Normalize for matching: NFD strip accents, đ→d, lowercase, collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Official company department codes; names = known raw variants. */
export const OFFICIAL_DEPARTMENTS: Array<{ code: string; names: string[] }> = [
  { code: "TCKS", names: ["Ban Tài chính - Kiểm soát nội bộ", "Ban Tài chính kiểm soát nội bộ"] },
  { code: "SHE", names: ["Ban An Toàn - Sức khỏe - Môi trường", "Ban SHE"] },
  { code: "PCTT", names: ["Ban Pháp chế - Tuân thủ"] },
  { code: "TTĐH", names: ["Trung tâm Điều hành", "Phòng Điều hành Trung tâm"] },
  { code: "HCNS", names: ["Phòng Hành chính Nhân sự", "Hành chính Nhân Sự"] },
  { code: "KT", names: ["Phòng Kế toán", "Kế Toán"] },
  { code: "KHVT", names: ["Phòng Kế hoạch - Vật tư", "Kế hoạch vật tư"] },
  { code: "MKT", names: ["Phòng Marketing", "Marketing"] },
  { code: "KPP", names: ["Kênh Phân phối"] },
  { code: "VHKD", names: ["Phòng Vận hành Kinh doanh", "Vận hành kinh doanh"] },
  { code: "KDBH", names: ["Phòng Kinh doanh Bia hơi"] },
  { code: "CĐ", names: ["Phòng Cơ điện"] },
  { code: "CĐHL", names: ["Phân xưởng Cơ điện - Động lực Hạ Long", "Phân xưởng cơ điện hạ long"] },
  { code: "CĐĐM", names: ["Phân xưởng Cơ điện - Động lực Đông Mai"] },
  { code: "PXHL", names: ["Phân xưởng Sản xuất Bia Hạ Long"] },
  { code: "PXĐM", names: ["Phân xưởng Sản xuất Bia Đông Mai"] },
  { code: "KCS", names: ["Phòng KCS", "Phòng Kiểm soát Chất lượng - KCS"] },
  { code: "KTCN", names: ["Phòng Kỹ thuật - Công nghệ và Cải tiến Sản xuất"] },
];

const OFFICIAL_BY_NORM = new Map<string, string>();
for (const o of OFFICIAL_DEPARTMENTS) for (const n of o.names) OFFICIAL_BY_NORM.set(normalizeText(n), o.code);

/** Official code for a raw department name, or null. */
export function officialCodeForName(raw: string): string | null {
  return OFFICIAL_BY_NORM.get(normalizeText(raw)) ?? null;
}

const STOP = new Set(["va", "-"]);

/** Deterministic uppercase code from a department name (admin can correct later). */
export function deterministicCode(name: string): string {
  const norm = normalizeText(name);
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  let code = words.map((w) => w[0]).join("").toUpperCase();
  if (code.length < 2) code = norm.replace(/[^a-z0-9]/g, "").slice(0, 4).toUpperCase();
  return code.slice(0, 8) || "DEPT";
}
