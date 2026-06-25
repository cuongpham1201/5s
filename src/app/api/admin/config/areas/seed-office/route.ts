import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { seedDefaultOfficeAreas } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/config/areas/seed-office
 * Create a default "Văn phòng" area for each active department that lacks one.
 * Idempotent; admin-triggered only.
 */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await seedDefaultOfficeAreas();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
