import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { isAdmin } from "@/lib/auth/admin";
import { listCapas } from "@/lib/sharepoint/capa-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/capas?scope=mine|dept|all[&status=...]
 * mine = việc giao cho tôi · dept = phòng ban tôi · all = admin/environment.
 */
export async function GET(req: NextRequest) {
  const me = await resolveRequestUser(req);
  if (!me?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await auth();
  const verifier = (await isAdmin(me.email)) || session?.user?.role === "environment";
  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") ?? "mine";
  const status = sp.get("status") || undefined;
  try {
    let rows;
    if (scope === "all" && verifier) rows = await listCapas({ status });
    else if (scope === "dept" && me.departmentCode) rows = await listCapas({ departmentCode: me.departmentCode, status });
    else rows = await listCapas({ assigneeEmail: me.email, status });
    return NextResponse.json({ scope, isVerifier: verifier, count: rows.length, capas: rows });
  } catch (e) {
    return NextResponse.json({ capas: [], error: (e as Error).message }, { status: 200 });
  }
}
