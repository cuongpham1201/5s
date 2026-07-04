import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { updateLocalUser } from "@/lib/auth/local-users";

export const dynamic = "force-dynamic";

/** PUT /api/admin/local-users/[id] — update displayName/departmentCode/isActive
 *  or reset password (any subset). Admin only. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const session = await auth();
  try {
    const body = (await req.json()) as { displayName?: string; departmentCode?: string; isActive?: boolean; password?: string };
    await updateLocalUser(params.id, body, session?.user?.email ?? "admin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
