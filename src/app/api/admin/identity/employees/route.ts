import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listEmployees } from "@/lib/identity/identity-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/identity/employees?q=&status=&unmapped=1 — HRM employees (admin). */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const rows = await listEmployees({
      q: sp.get("q") ?? "",
      status: sp.get("status") ?? undefined,
      onlyUnmapped: sp.get("unmapped") === "1",
    });
    return NextResponse.json({ ok: true, employees: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
