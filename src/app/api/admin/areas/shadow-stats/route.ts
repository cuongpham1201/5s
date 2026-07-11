import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getShadowStats } from "@/lib/areas/area-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/areas/shadow-stats — số liệu shadow read (in-memory, tính từ
 * lần restart PM2). ?full=1 trả toàn bộ recent entries (export JSON).
 */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const full = new URL(req.url).searchParams.get("full") === "1";
  const s = getShadowStats();
  const { recentAll, ...base } = s;
  return NextResponse.json({ ok: true, stats: full ? { ...base, recentAll } : base });
}
