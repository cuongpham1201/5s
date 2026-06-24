import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Gate admin SharePoint endpoints. Allowed in dev (NODE_ENV !== production) or
 * for environment/admin roles. Middleware already requires authentication.
 * Returns a 403 response when denied, or null when allowed.
 */
export async function denyIfNotAdmin(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "production") return null;
  const session = await auth();
  const role = session?.user?.role;
  if (role === "admin" || role === "environment") return null;
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
