/**
 * Department mapping (Phase 1B foundation).
 *
 * Maps the free-text Entra ID `department` attribute → canonical 5S department
 * code (PMKT, PXHL, ...). The Entra attribute rarely matches the 5S code exactly
 * (open question Q-02 in RISKS_AND_DECISIONS.md), so we keep an explicit,
 * editable mapping here instead of hardcoding it inside components.
 *
 * Replace MOCK_MAP with the real values (or move to the 5SUserMap SharePoint
 * list) in Phase 2 once the tenant's actual department strings are known.
 */

export interface DepartmentMappingEntry {
  /** Canonical 5S department code. */
  code: string;
  /** 5S display name. */
  name: string;
  /** Entra `department` strings that should resolve to this code (lowercased match). */
  aliases: string[];
}

// Mock mapping — derived from the approved prototype + business context.
export const DEPARTMENT_MAP: DepartmentMappingEntry[] = [
  { code: "PMKT", name: "Phòng Marketing", aliases: ["phòng marketing", "marketing", "pmkt"] },
  { code: "PXHL", name: "Phân xưởng Hơi lạnh", aliases: ["phân xưởng hơi lạnh", "phân xưởng hạ long", "pxhl"] },
  { code: "KCS", name: "Phòng KCS", aliases: ["phòng kcs", "kcs", "kiểm tra chất lượng"] },
  { code: "PXSC", name: "Phân xưởng Sản chế", aliases: ["phân xưởng sản chế", "sản chế", "pxsc"] },
  { code: "PKT", name: "Phòng Kế toán", aliases: ["phòng kế toán", "kế toán", "pkt"] },
  { code: "PXSX", name: "Phân xưởng Sản xuất", aliases: ["phân xưởng sản xuất", "sản xuất", "pxsx"] },
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Resolve an Entra department string to a 5S department code.
 * Returns undefined when the input is empty or unmapped (caller decides fallback).
 */
export function mapEntraDepartment(entraDepartment?: string | null): string | undefined {
  if (!entraDepartment) return undefined;
  const n = norm(entraDepartment);
  // Exact code match first (e.g. Entra already stores "PMKT").
  const byCode = DEPARTMENT_MAP.find((d) => d.code.toLowerCase() === n);
  if (byCode) return byCode.code;
  // Then alias match.
  const byAlias = DEPARTMENT_MAP.find((d) => d.aliases.some((a) => norm(a) === n));
  if (byAlias) return byAlias.code;
  // Loose contains match as a last resort.
  const byContains = DEPARTMENT_MAP.find((d) =>
    d.aliases.some((a) => n.includes(norm(a)) || norm(a).includes(n)),
  );
  return byContains?.code;
}

export function departmentName(code?: string): string | undefined {
  if (!code) return undefined;
  return DEPARTMENT_MAP.find((d) => d.code === code)?.name;
}
