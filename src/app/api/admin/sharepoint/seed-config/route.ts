import { NextResponse } from "next/server";
import { seedConfig } from "@/lib/sharepoint/config-service";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/** POST /api/admin/sharepoint/seed-config — idempotent seed of departments/areas. */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  // Mock seed is DEV-ONLY. Config_Departments truth comes from the org source
  // (POST /api/admin/sharepoint/import-departments), not from this mock seed.
  if (process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json(
      { error: "seed-config bị tắt: chỉ chạy ở dev (NEXT_PUBLIC_ALLOW_DEV_LOGIN=true). Dùng import-departments cho org thật." },
      { status: 403 },
    );
  }
  try {
    const result = await seedConfig();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
