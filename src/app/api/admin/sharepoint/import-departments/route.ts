import { NextResponse } from "next/server";
import { importDepartmentsFromOrgSource } from "@/lib/sharepoint/config-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sharepoint/import-departments
 * Sync Config_Departments from the current org source (upsert by DepartmentCode,
 * deactivate missing — never deletes). Source = ORG_DEPARTMENT_SOURCE env.
 */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await importDepartmentsFromOrgSource();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
