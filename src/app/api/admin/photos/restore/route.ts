import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { restorePhoto } from "@/lib/sharepoint/photo-admin-service";

export const dynamic = "force-dynamic";

/** POST /api/admin/photos/restore — restore a soft-deleted photo if files still exist. Body: { photoId } */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: { photoId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.photoId?.trim()) return NextResponse.json({ error: "photoId là bắt buộc" }, { status: 400 });
  try {
    const result = await restorePhoto(body.photoId.trim());
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
