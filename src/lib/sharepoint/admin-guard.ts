import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/admin";

/**
 * Gate admin endpoints (/api/admin/*). Uses the central email-based admin model.
 * - dev (NODE_ENV !== production): allowed (local tooling convenience).
 * - production: requires an authenticated session whose email isAdmin().
 * Returns a 401/403 response when denied, or null when allowed.
 */
export async function denyIfNotAdmin(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "production") return null;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (await isAdmin(session.user.email)) return null;
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
