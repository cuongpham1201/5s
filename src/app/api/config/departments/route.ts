import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listActiveDepartments } from "@/lib/sharepoint/department-service";

export const dynamic = "force-dynamic";

/** GET /api/config/departments — active Config_Departments (login required). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const departments = await listActiveDepartments();
    return NextResponse.json({ count: departments.length, departments });
  } catch (e) {
    return NextResponse.json({ count: 0, departments: [], error: (e as Error).message }, { status: 200 });
  }
}
