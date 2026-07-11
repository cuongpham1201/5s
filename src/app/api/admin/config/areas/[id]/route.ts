import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** LEGACY (P5 cutover): Config_Areas read-only — sửa/xóa tại /admin/areas (PostgreSQL). */
const gone = () => NextResponse.json({ ok: false, error: "Config_Areas đã chuyển LEGACY (read-only) sau cutover PostgreSQL — dùng /admin/areas." }, { status: 410 });
export async function PATCH() { return gone(); }
export async function DELETE() { return gone(); }
