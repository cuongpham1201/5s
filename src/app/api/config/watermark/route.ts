import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/admin";
import { getWatermarkConfig, saveWatermarkConfig } from "@/lib/sharepoint/settings-service";
import { DEFAULT_WATERMARK_CONFIG } from "@/lib/watermark/watermark-types";

export const dynamic = "force-dynamic";

/** GET /api/config/watermark — cấu hình watermark hiệu lực (mọi user đăng nhập). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const config = await getWatermarkConfig();
    return NextResponse.json({ config });
  } catch (e) {
    // Không chặn luồng chụp nếu đọc lỗi — trả mặc định.
    return NextResponse.json({ config: DEFAULT_WATERMARK_CONFIG, error: (e as Error).message });
  }
}

/** PUT /api/config/watermark — lưu cấu hình (CHỈ admin). */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(session.user.email))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const config = await saveWatermarkConfig(body?.config ?? body);
    return NextResponse.json({ config });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
