import { NextResponse, type NextRequest } from "next/server";
import { importDepartmentsFromOrgSource } from "@/lib/sharepoint/config-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sharepoint/import-departments
 * Sync Config_Departments from the org source (active member users). Upsert by
 * DepartmentCode. deactivateMissing defaults to FALSE — only deactivate missing
 * departments when ?deactivateMissing=true or body { deactivateMissing: true }.
 */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let deactivateMissing = new URL(req.url).searchParams.get("deactivateMissing") === "true";
  if (!deactivateMissing) {
    try {
      const body = await req.json();
      if (body?.deactivateMissing === true) deactivateMissing = true;
    } catch {
      /* no body */
    }
  }
  try {
    const result = await importDepartmentsFromOrgSource({ deactivateMissing });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
