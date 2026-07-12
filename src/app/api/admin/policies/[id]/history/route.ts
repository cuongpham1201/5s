import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listPolicyHistory } from "@/lib/policy/policy-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — lịch sử thay đổi (version) của policy. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, history: await listPolicyHistory(id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
