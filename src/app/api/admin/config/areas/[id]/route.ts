import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { updateArea, deactivateArea, type AreaInput } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/config/areas/[id] — update name/dept/sort/isActive. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: Partial<AreaInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    await updateArea(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/admin/config/areas/[id] — SOFT delete (IsActive=false). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    await deactivateArea(params.id);
    return NextResponse.json({ ok: true, softDeleted: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
