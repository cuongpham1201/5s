import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { syncDirectoryFromGraph } from "@/lib/sharepoint/directory-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST — đồng bộ danh bạ user từ M365 (Graph /users; cần User.Read.All application). */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const r = await syncDirectoryFromGraph();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = (e as Error).message;
    const needsConsent = /403|Authorization_RequestDenied|Insufficient/i.test(msg);
    return NextResponse.json({
      ok: false,
      error: needsConsent
        ? "Thiếu quyền Graph: cần cấp quyền APPLICATION 'User.Read.All' (admin consent) cho app GRAPH_CLIENT trong Entra, sau đó bấm đồng bộ lại."
        : msg,
    }, { status: 400 });
  }
}
