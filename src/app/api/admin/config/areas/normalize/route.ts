import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { normalizeDuplicateAreas } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/** POST — gộp các khu vực active trùng tên thành khu vực gốc (idempotent). */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await normalizeDuplicateAreas();
    return NextResponse.json({ ok: true, merged: result.groups.length, groups: result.groups });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
