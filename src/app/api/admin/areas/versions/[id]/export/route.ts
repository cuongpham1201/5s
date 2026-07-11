import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { exportAreaConfigurationVersion } from "@/lib/areas/area-version-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — export JSON version (download). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const session = await auth();
    const v = await exportAreaConfigurationVersion(id, session?.user?.email ?? "admin-api");
    return new NextResponse(JSON.stringify({ version: v.version, snapshot: v.snapshot }, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="area-config-v${v.version.versionNo}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
