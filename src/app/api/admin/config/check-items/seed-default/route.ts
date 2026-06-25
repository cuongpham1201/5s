import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { seedDefaultChecklist } from "@/lib/sharepoint/checkitem-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/config/check-items/seed-default
 * Seed the 5 global 5S checklist items (Sàng lọc/Sắp xếp/Sạch sẽ/Săn sóc/Sẵn sàng).
 * Idempotent; admin-triggered only.
 */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await seedDefaultChecklist();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
