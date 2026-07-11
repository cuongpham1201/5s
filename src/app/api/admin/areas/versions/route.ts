import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listAreaConfigurationVersions, createAreaConfigurationSnapshot } from "@/lib/areas/area-version-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — danh sách version (không kèm snapshot_json). POST — tạo snapshot hiện tại. */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, versions: await listAreaConfigurationVersions(100) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const b = await req.json().catch(() => ({}));
    const session = await auth();
    const result = await createAreaConfigurationSnapshot({
      name: b.name ? String(b.name).slice(0, 120) : null,
      description: b.description ? String(b.description).slice(0, 500) : null,
      triggerType: "manual",
      actor: session?.user?.email ?? "admin-api",
      force: b.force === true,
      isProtected: b.isProtected === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
