import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { updateCheckItem, deactivateCheckItem, type CheckItemInput } from "@/lib/sharepoint/checkitem-service";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/config/check-items/[id]. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: Partial<CheckItemInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    await updateCheckItem(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/admin/config/check-items/[id] — SOFT delete (IsActive=false). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    await deactivateCheckItem(params.id);
    return NextResponse.json({ ok: true, softDeleted: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
