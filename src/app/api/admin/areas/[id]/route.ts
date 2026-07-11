import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  updateArea, moveArea, deactivateAreaPg, reactivateAreaPg, deleteAreaIfUnused, type AreaType,
} from "@/lib/areas/area-pg-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES: AreaType[] = ["group", "location", "capture_point"];

/** POST /api/admin/areas/[id] — action: update|move|deactivate|reactivate|delete. */
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
        if (b.areaType && !TYPES.includes(b.areaType)) return NextResponse.json({ ok: false, error: "areaType không hợp lệ" }, { status: 400 });
        const area = await updateArea(id, {
          areaName: b.areaName, areaType: b.areaType,
          isCaptureRequired: typeof b.isCaptureRequired === "boolean" ? b.isCaptureRequired : undefined,
          sortOrder: b.sortOrder != null ? Number(b.sortOrder) : undefined,
          description: b.description, locationNote: b.locationNote,
        }, actor);
        return NextResponse.json({ ok: true, area });
      }
      case "move": {
        const area = await moveArea(id, b.newParentId != null ? Number(b.newParentId) : null, actor);
        return NextResponse.json({ ok: true, area });
      }
      case "deactivate": await deactivateAreaPg(id, actor); return NextResponse.json({ ok: true });
      case "reactivate": await reactivateAreaPg(id, actor); return NextResponse.json({ ok: true });
      case "delete": await deleteAreaIfUnused(id, actor); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ ok: false, error: "action không hợp lệ" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
