import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  listUserAreas,
  listDepartmentUsers,
  setUserAreas,
  upsertUserArea,
  revokeArea,
} from "@/lib/sharepoint/user-area-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/config/user-areas
 *   ?departmentCode=X -> distinct users in dept (+ active area count)
 *   ?email=Y          -> that user's permission rows (incl. inactive)
 */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const email = sp.get("email");
  const departmentCode = sp.get("departmentCode");
  try {
    if (email) {
      const rows = await listUserAreas(email, true);
      return NextResponse.json({ email, count: rows.length, rows });
    }
    if (departmentCode) {
      const users = await listDepartmentUsers(departmentCode);
      return NextResponse.json({ departmentCode, count: users.length, users });
    }
    return NextResponse.json({ error: "cần email hoặc departmentCode" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST — set the full allowed-area set for a user (Save): {email, displayName, departmentCode, areaCodes[]}. */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: { email?: string; displayName?: string | null; departmentCode?: string | null; areaCodes?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.email?.trim() || !Array.isArray(body.areaCodes)) {
    return NextResponse.json({ error: "email và areaCodes[] là bắt buộc" }, { status: 400 });
  }
  try {
    const result = await setUserAreas(
      body.email.trim(),
      body.departmentCode ?? null,
      body.areaCodes.filter(Boolean),
      body.displayName ?? null,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** PATCH — upsert a single grant: {email, areaCode, displayName?, departmentCode?, isActive?}. */
export async function PATCH(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: { email?: string; areaCode?: string; displayName?: string | null; departmentCode?: string | null; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.email?.trim() || !body.areaCode?.trim()) {
    return NextResponse.json({ error: "email và areaCode là bắt buộc" }, { status: 400 });
  }
  try {
    const result = await upsertUserArea({
      email: body.email.trim(),
      areaCode: body.areaCode.trim(),
      displayName: body.displayName ?? undefined,
      departmentCode: body.departmentCode ?? undefined,
      isActive: body.isActive ?? true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/admin/config/user-areas?email=&areaCode= — SOFT revoke. */
export async function DELETE(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const email = sp.get("email");
  const areaCode = sp.get("areaCode");
  if (!email || !areaCode) {
    return NextResponse.json({ error: "cần email và areaCode" }, { status: 400 });
  }
  try {
    await revokeArea(email, areaCode);
    return NextResponse.json({ ok: true, softDeleted: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
