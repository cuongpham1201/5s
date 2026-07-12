import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  resolveCapturePolicy, resolveDailyPolicy, resolveAuditPolicy,
  resolveViolationPolicy, resolveNotificationPolicy, clearPolicyCache, POLICY_DEFAULTS,
} from "@/lib/policy/policy-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/policies/resolve[?type=] — PREVIEW kết quả resolver (defaults +
 * policy đang hiệu lực). Đây chính là giá trị các module sẽ nhận khi chuyển đổi.
 */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    clearPolicyCache(); // preview luôn tươi
    const type = new URL(req.url).searchParams.get("type");
    const all = {
      capture: await resolveCapturePolicy(), daily: await resolveDailyPolicy(),
      audit: await resolveAuditPolicy(), violation: await resolveViolationPolicy(),
      notification: await resolveNotificationPolicy(),
    };
    if (type && type in all) return NextResponse.json({ ok: true, resolved: all[type as keyof typeof all], defaults: POLICY_DEFAULTS[type as keyof typeof POLICY_DEFAULTS] });
    return NextResponse.json({ ok: true, resolved: all, defaults: POLICY_DEFAULTS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
