import { NextResponse } from "next/server";
import { verifyLocalCredentials } from "@/lib/identity/identity-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/identity/local-verify — INTERNAL. Verifies a local app_users login.
 * Called by the NextAuth "local" provider's authorize() via server-side fetch so
 * pg never enters the edge/middleware bundle. Protected by x-internal-token =
 * AUTH_SECRET (this route is in PUBLIC_PATHS so it works pre-login).
 */
export async function POST(req: Request) {
  const token = req.headers.get("x-internal-token");
  if (!process.env.AUTH_SECRET || token !== process.env.AUTH_SECRET) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }
  try {
    const { username, password } = await req.json();
    const result = await verifyLocalCredentials(String(username ?? ""), String(password ?? ""));
    if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason });
    const i = result.identity;
    return NextResponse.json({
      ok: true,
      identity: {
        userId: i.userId, username: i.username, email: i.email, displayName: i.displayName,
        role: i.role, departmentCode: i.departmentCode, mustChangePassword: i.mustChangePassword,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "error", message: (e as Error).message }, { status: 500 });
  }
}
