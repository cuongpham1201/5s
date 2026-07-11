import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { approveAssignment, unassignDepartmentFromArea } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { ids: number[], action: "approve"|"reject" } — review hàng loạt (unresolved vẫn bị chặn per-row). */
export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
    const action = String(body.action ?? "");
    if (!ids.length || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ ok: false, error: "cần ids[] + action approve|reject" }, { status: 400 });
    }
    if (ids.length > 200) return NextResponse.json({ ok: false, error: "tối đa 200 assignment/lần" }, { status: 400 });
    const session = await auth();
    const actor = session?.user?.email ?? "admin-api";
    const errors: Array<{ id: number; error: string }> = [];
    let done = 0;
    for (const id of ids) {
      try {
        if (action === "approve") await approveAssignment(id, actor);
        else await unassignDepartmentFromArea(id, actor);
        done++;
      } catch (e) {
        errors.push({ id, error: (e as Error).message });
      }
    }
    return NextResponse.json({ ok: errors.length === 0, done, errors });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
