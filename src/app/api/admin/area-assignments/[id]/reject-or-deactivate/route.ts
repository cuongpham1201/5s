import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { unassignDepartmentFromArea } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — reject/loại assignment = soft deactivate (giữ lịch sử, có audit log). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const session = await auth();
    await unassignDepartmentFromArea(id, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
