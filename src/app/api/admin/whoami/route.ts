import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminContext } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/whoami — current user's admin context (email + source + role). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getAdminContext(session.user.email);
  return NextResponse.json({
    email: ctx.email,
    displayName: session.user.name ?? null,
    isAdmin: ctx.isAdmin,
    source: ctx.source,
    mappedRole: ctx.mappedRole,
  });
}
