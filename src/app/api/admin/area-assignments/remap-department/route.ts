import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { remapAssignmentDepartmentCode } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { fromCode, toCode } — remap mã phòng (update-in-place, clear unresolved). */
export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const session = await auth();
    const result = await remapAssignmentDepartmentCode(
      String(body.fromCode ?? ""), String(body.toCode ?? ""), session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
