import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { aggregatePhotoStats, parseStatParams } from "@/lib/sharepoint/photo-stats";

export const dynamic = "force-dynamic";

/** GET /api/admin/photo-stats?from&to&group=day|week|month — photo counts per dept/area. */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const { from, to, group } = parseStatParams(req.nextUrl.searchParams);
  try {
    return NextResponse.json(await aggregatePhotoStats(from, to, group));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
