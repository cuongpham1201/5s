import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUserAllowedAreas } from "@/lib/sharepoint/user-area-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/areas — areas the current user is permitted to capture in.
 * Returns [] when the user has no granted areas. Login required.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const areas = await listUserAllowedAreas(email);
    return NextResponse.json({ count: areas.length, areas });
  } catch (e) {
    return NextResponse.json({ count: 0, areas: [], error: (e as Error).message }, { status: 200 });
  }
}
