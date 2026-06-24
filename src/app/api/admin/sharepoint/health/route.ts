import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/sharepoint/health-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/** GET /api/admin/sharepoint/health — read-only Ban5S reality check. */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await checkHealth();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ready: false, error: (e as Error).message }, { status: 500 });
  }
}
