import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { previewRestoreAreaConfiguration } from "@/lib/areas/area-version-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — preview restore (diff + planned + warnings). Không thay đổi dữ liệu. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const session = await auth();
    const preview = await previewRestoreAreaConfiguration(id, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, preview });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
