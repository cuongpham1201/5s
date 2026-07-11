import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { updateAssignment } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — sửa required/type/responsible/effective/note của assignment. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const b = await req.json();
    const session = await auth();
    const assignment = await updateAssignment(id, {
      isRequired: typeof b.isRequired === "boolean" ? b.isRequired : undefined,
      assignmentType: b.assignmentType,
      responsibleEmployeeId: b.responsibleEmployeeId !== undefined ? (b.responsibleEmployeeId != null ? Number(b.responsibleEmployeeId) : null) : undefined,
      effectiveFrom: b.effectiveFrom !== undefined ? b.effectiveFrom : undefined,
      effectiveTo: b.effectiveTo !== undefined ? b.effectiveTo : undefined,
      note: b.note,
    }, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, assignment });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
