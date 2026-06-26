import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getImgContent } from "@/lib/sharepoint/photo-upload-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/photo?path=Img/2026/06/26/TCKS/SUB-.../watermarked-01.jpg
 * Authenticated proxy: streams a SharePoint photo via app-only Graph so any
 * logged-in user (or admin) can view submitted photos without a Graph token.
 */
const PATH_RE = /^Img\/[A-Za-z0-9/_\-.]+\.(jpe?g|png|webp)$/i;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!PATH_RE.test(path) || path.includes("..")) {
    return new Response("bad path", { status: 400 });
  }
  try {
    const { data, contentType } = await getImgContent(path);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
