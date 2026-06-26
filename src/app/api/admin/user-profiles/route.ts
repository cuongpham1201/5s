import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listProfiles, forceResyncProfile } from "@/lib/sharepoint/user-profile-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/user-profiles — all user profiles (admin). */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const profiles = await listProfiles();
    return NextResponse.json({ count: profiles.length, profiles });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/user-profiles — re-resolve department for one profile: { email }. */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let email = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim() : "";
  } catch {
    /* no body */
  }
  if (!email) return NextResponse.json({ error: "email là bắt buộc" }, { status: 400 });
  try {
    const profile = await forceResyncProfile(email);
    if (!profile) return NextResponse.json({ error: "không tìm thấy hồ sơ" }, { status: 404 });
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
