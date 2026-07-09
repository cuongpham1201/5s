import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listAppUsers, createLocalAccount, type UserView } from "@/lib/identity/identity-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIEWS: UserView[] = ["all", "unmapped", "local", "microsoft", "disabled", "needs_review"];

/** GET /api/admin/identity/users?view=&q= — app_users by view (admin). */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const view = (sp.get("view") ?? "all") as UserView;
    const rows = await listAppUsers(VIEWS.includes(view) ? view : "all", sp.get("q") ?? "");
    return NextResponse.json({ ok: true, users: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/identity/users — create a local account (admin). */
export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const session = await auth();
    const created = await createLocalAccount({
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
      displayName: String(body.displayName ?? ""),
      role: body.role ? String(body.role) : "employee",
      employeeId: body.employeeId != null ? Number(body.employeeId) : null,
      createdBy: session?.user?.email ?? null,
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
