import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  getPolicy, updatePolicy, setPolicyEnabled, clonePolicy, restorePolicyFromHistory,
} from "@/lib/policy/policy-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — chi tiết. POST — action: update|enable|disable|clone|restore_history. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  const policy = await getPolicy(id);
  if (!policy) return NextResponse.json({ ok: false, error: "không tìm thấy" }, { status: 404 });
  return NextResponse.json({ ok: true, policy });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const b = await req.json();
    const session = await auth();
    const actor = session?.user?.email ?? "admin-api";
    switch (String(b.action)) {
      case "update": {
        const policy = await updatePolicy(id, {
          policyName: b.policyName, description: b.description,
          effectiveFrom: b.effectiveFrom, effectiveTo: b.effectiveTo,
          priority: b.priority != null ? Number(b.priority) : undefined, config: b.config,
        }, actor);
        return NextResponse.json({ ok: true, policy });
      }
      case "enable": return NextResponse.json({ ok: true, policy: await setPolicyEnabled(id, true, actor) });
      case "disable": return NextResponse.json({ ok: true, policy: await setPolicyEnabled(id, false, actor) });
      case "clone": return NextResponse.json({ ok: true, policy: await clonePolicy(id, String(b.newName ?? ""), actor) });
      case "restore_history": return NextResponse.json({ ok: true, policy: await restorePolicyFromHistory(id, Number(b.changeId), actor) });
      default: return NextResponse.json({ ok: false, error: "action không hợp lệ" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
