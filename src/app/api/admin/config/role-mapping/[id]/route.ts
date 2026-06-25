import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { isStaticAdminEmail } from "@/lib/auth/admin";
import {
  listRoleMappings,
  updateRoleMapping,
  deactivateRoleMapping,
  restoreRoleMapping,
  ROLE_NAMES,
  type RoleName,
} from "@/lib/sharepoint/role-mapping-service";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/config/role-mapping/[id] — update role/dept/isActive (restore via isActive:true). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: { role?: string; departmentCode?: string | null; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (body.role !== undefined && !ROLE_NAMES.includes(body.role as RoleName)) {
    return NextResponse.json({ error: "role phải là Admin/Manager/Viewer" }, { status: 400 });
  }
  try {
    if (body.isActive === true && body.role === undefined && body.departmentCode === undefined) {
      await restoreRoleMapping(params.id);
    } else {
      await updateRoleMapping(params.id, { role: body.role as RoleName | undefined, departmentCode: body.departmentCode, isActive: body.isActive });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/admin/config/role-mapping/[id] — soft delete. Guards against last-admin lockout. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const all = await listRoleMappings(true);
    const target = all.find((m) => m.id === params.id);
    if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Safety: don't deactivate the only admin via role-mapping when the acting user
    // isn't a static admin (default/env always retains access otherwise).
    if (target.isActive && target.role.trim().toLowerCase() === "admin") {
      const session = await auth();
      const actingEmail = session?.user?.email ?? "";
      const otherActiveAdmins = all.filter(
        (m) => m.id !== target.id && m.isActive && m.role.trim().toLowerCase() === "admin",
      );
      const safetyNet = otherActiveAdmins.length > 0 || isStaticAdminEmail(actingEmail) || isStaticAdminEmail(target.email);
      if (!safetyNet) {
        return NextResponse.json(
          { error: "Không thể vô hiệu hoá admin duy nhất. Hãy thêm admin khác trước." },
          { status: 400 },
        );
      }
    }
    await deactivateRoleMapping(params.id);
    return NextResponse.json({ ok: true, softDeleted: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
