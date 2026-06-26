import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { softDeletePhoto } from "@/lib/sharepoint/photo-admin-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/photos/delete — admin soft-delete a photo (+optional file delete).
 * Body: { photoId, reason, deleteFiles }
 */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const session = await auth();
  const deletedBy = session?.user?.email ?? "admin";
  let body: { photoId?: string; reason?: string; deleteFiles?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.photoId?.trim()) return NextResponse.json({ error: "photoId là bắt buộc" }, { status: 400 });
  try {
    const result = await softDeletePhoto({
      photoId: body.photoId.trim(),
      reason: body.reason ?? "",
      deletedBy,
      deleteFiles: body.deleteFiles === true,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
