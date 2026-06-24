import { NextResponse } from "next/server";
import { checkHealth, canProvision } from "@/lib/sharepoint/health-service";
import { provision } from "@/lib/sharepoint/provision-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/** POST /api/admin/sharepoint/provision — create missing Config_/Data_ lists. */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const health = await checkHealth();
    if (!canProvision(health)) {
      return NextResponse.json(
        { ok: false, error: "Site/library 5S không truy cập được — không provision.", health },
        { status: 412 },
      );
    }
    const result = await provision();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
