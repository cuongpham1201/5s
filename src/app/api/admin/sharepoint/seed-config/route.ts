import { NextResponse } from "next/server";
import { seedConfig } from "@/lib/sharepoint/config-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/** POST /api/admin/sharepoint/seed-config — idempotent seed of departments/areas. */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await seedConfig();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
