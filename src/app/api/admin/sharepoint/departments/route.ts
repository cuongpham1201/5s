import { NextResponse } from "next/server";
import { listActiveDepartments } from "@/lib/sharepoint/department-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/** GET /api/admin/sharepoint/departments — active Config_Departments (read-only). */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const departments = await listActiveDepartments();
    return NextResponse.json({ count: departments.length, departments });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
