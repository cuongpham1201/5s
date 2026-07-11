import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listAssignmentsForReview } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/area-assignments/review?source=&review=&unresolved=1 — danh sách review. */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const rows = await listAssignmentsForReview({
      source: sp.get("source") ?? undefined,
      reviewStatus: sp.get("review") ?? undefined,
      unresolvedOnly: sp.get("unresolved") === "1",
      departmentCode: sp.get("departmentCode") ?? undefined,
      areaId: sp.get("areaId") ? Number(sp.get("areaId")) : undefined,
    });
    return NextResponse.json({ ok: true, assignments: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
