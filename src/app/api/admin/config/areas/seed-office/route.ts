import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** LEGACY (P5 cutover): Config_Areas chỉ còn backup/export — mọi ghi bị chặn. */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Config_Areas đã chuyển LEGACY (read-only) sau cutover PostgreSQL — dùng /admin/areas." }, { status: 410 });
}
