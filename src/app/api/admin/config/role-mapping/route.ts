import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  listRoleMappings,
  upsertRoleMappingByEmail,
  ROLE_NAMES,
  type RoleName,
} from "@/lib/sharepoint/role-mapping-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/config/role-mapping[?includeInactive=true] — Admin only. */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  try {
    const mappings = await listRoleMappings(includeInactive);
    return NextResponse.json({ count: mappings.length, mappings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/config/role-mapping — upsert by email (no duplicate active). */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: { email?: string; role?: string; departmentCode?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const email = body.email?.trim();
  const role = body.role as RoleName | undefined;
  if (!email || !role || !ROLE_NAMES.includes(role)) {
    return NextResponse.json({ error: "email và role (Admin/Manager/Viewer) là bắt buộc" }, { status: 400 });
  }
  try {
    const result = await upsertRoleMappingByEmail({ email, role, departmentCode: body.departmentCode ?? null });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
