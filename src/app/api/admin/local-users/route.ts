import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { createLocalUser, listLocalUsers } from "@/lib/auth/local-users";

export const dynamic = "force-dynamic";

/** GET /api/admin/local-users — list local (non-M365) accounts. Admin only. */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ users: await listLocalUsers() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST — create a local account {username, displayName, password, departmentCode}. */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const session = await auth();
  try {
    const body = (await req.json()) as { username?: string; displayName?: string; password?: string; departmentCode?: string };
    const user = await createLocalUser({
      username: body.username ?? "",
      displayName: body.displayName ?? "",
      password: body.password ?? "",
      departmentCode: body.departmentCode ?? "",
      createdBy: session?.user?.email ?? "admin",
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
