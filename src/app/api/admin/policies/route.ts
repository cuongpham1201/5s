import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listPolicies, createPolicy, type PolicyType } from "@/lib/policy/policy-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/policies[?type=] — danh sách policy. POST — tạo (mặc định TẮT). */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const type = new URL(req.url).searchParams.get("type") as PolicyType | null;
    return NextResponse.json({ ok: true, policies: await listPolicies(type ?? undefined) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const b = await req.json();
    const session = await auth();
    const policy = await createPolicy({
      policyType: b.policyType, policyName: String(b.policyName ?? ""),
      description: b.description ?? null,
      effectiveFrom: b.effectiveFrom ?? null, effectiveTo: b.effectiveTo ?? null,
      priority: Number(b.priority ?? 0), enabled: b.enabled === true, config: b.config,
    }, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
