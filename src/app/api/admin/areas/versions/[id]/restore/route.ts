import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { restoreAreaConfiguration } from "@/lib/areas/area-version-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST { confirm: true } — RESTORE cấu hình về version [id]. Transaction + verify
 * hash + auto snapshot before_restore. Chỉ dùng snapshot server-side.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const b = await req.json().catch(() => ({}));
    if (b.confirm !== true) return NextResponse.json({ ok: false, error: "cần confirm: true" }, { status: 400 });
    const session = await auth();
    const result = await restoreAreaConfiguration(id, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
