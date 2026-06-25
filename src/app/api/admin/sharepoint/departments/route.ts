import { NextResponse, type NextRequest } from "next/server";
import { listActiveDepartments, listAllDepartments } from "@/lib/sharepoint/department-service";
import { normalizeText } from "@/lib/sharepoint/org-codes";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sharepoint/departments
 *   default            -> active departments
 *   ?includeInactive=true -> active + inactive + duplicate analysis (read-only)
 */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";
  try {
    if (!includeInactive) {
      const departments = await listActiveDepartments();
      return NextResponse.json({ count: departments.length, departments });
    }

    const all = await listAllDepartments();
    const active = all.filter((d) => d.isActive);
    const inactive = all.filter((d) => !d.isActive);

    // Duplicate codes (same DepartmentCode appears > 1).
    const byCode = new Map<string, number>();
    for (const d of all) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
    const duplicateCodes = [...byCode.entries()].filter(([, n]) => n > 1).map(([code]) => code);

    // Duplicate names (same normalized DepartmentName across rows).
    const byName = new Map<string, string[]>();
    for (const d of all) {
      const k = normalizeText(d.name);
      byName.set(k, [...(byName.get(k) ?? []), `${d.code}${d.isActive ? "" : "(inactive)"}`]);
    }
    const duplicateNames = [...byName.values()].filter((arr) => arr.length > 1);

    return NextResponse.json({
      total: all.length,
      activeCount: active.length,
      inactiveCount: inactive.length,
      active,
      inactive,
      duplicateCodes,
      duplicateNames,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
