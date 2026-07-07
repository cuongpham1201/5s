import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { searchDirectory } from "@/lib/sharepoint/directory-service";

export const dynamic = "force-dynamic";

/** GET /api/users/search?q= — picker người dùng (mọi user đăng nhập). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const users = await searchDirectory(q, 10);
    return NextResponse.json({ count: users.length, users });
  } catch (e) {
    return NextResponse.json({ users: [], error: (e as Error).message }, { status: 200 });
  }
}
