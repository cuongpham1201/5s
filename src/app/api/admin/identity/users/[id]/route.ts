import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  setUserActive, resetPassword, mapEmployee, unmapEmployee, linkMicrosoft, unlinkMicrosoft,
} from "@/lib/identity/identity-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/identity/users/[id] — action-based mutation (admin).
 * body.action ∈ disable | enable | reset_password | map | unmap | link_microsoft | unlink_microsoft
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const body = await req.json();
    switch (String(body.action)) {
      case "disable": await setUserActive(id, false, body.reason ? String(body.reason) : "manual"); break;
      case "enable": await setUserActive(id, true); break;
      case "reset_password": await resetPassword(id, String(body.password ?? ""), body.mustChange !== false); break;
      case "map": await mapEmployee(id, Number(body.employeeId)); break;
      case "unmap": await unmapEmployee(id); break;
      case "link_microsoft": await linkMicrosoft(id, String(body.oid ?? "")); break;
      case "unlink_microsoft": await unlinkMicrosoft(id); break;
      default: return NextResponse.json({ ok: false, error: "action không hợp lệ" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
