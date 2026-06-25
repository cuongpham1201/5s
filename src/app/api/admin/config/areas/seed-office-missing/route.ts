import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { seedOfficeAreaForMissingDepartments } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/config/areas/seed-office-missing
 * Bulk: create "Văn phòng" for every active department that has no active area.
 * Idempotent. Admin-triggered only.
 */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await seedOfficeAreaForMissingDepartments();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
