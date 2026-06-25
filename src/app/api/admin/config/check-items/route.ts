import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listAllCheckItemsAdmin, createCheckItem, type CheckItemInput } from "@/lib/sharepoint/checkitem-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/config/check-items[?departmentCode=&areaCode=] — all (incl inactive). */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  try {
    const items = await listAllCheckItemsAdmin({
      departmentCode: sp.get("departmentCode"),
      areaCode: sp.get("areaCode"),
    });
    return NextResponse.json({ count: items.length, checkItems: items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/config/check-items — create a check item. */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: Partial<CheckItemInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.code?.trim() || !body.name?.trim()) {
    return NextResponse.json({ error: "code, name là bắt buộc" }, { status: 400 });
  }
  try {
    const created = await createCheckItem({
      code: body.code.trim(),
      name: body.name.trim(),
      departmentCode: body.departmentCode?.trim() || null,
      areaCode: body.areaCode?.trim() || null,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
      description: body.description ?? null,
    });
    return NextResponse.json({ ok: true, checkItem: created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
