import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getImgContent } from "@/lib/sharepoint/photo-upload-service";
import { mimeForPath } from "@/lib/sharepoint/image-bytes";

export const dynamic = "force-dynamic";

/**
 * GET /api/photo?path=Img/...  — authenticated binary proxy.
 * Streams a SharePoint photo via app-only Graph (token stays server-side).
 * Content-Type is derived from the file extension (Graph content may report
 * octet-stream); binary is returned untouched (no text conversion).
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
    if (!data || data.byteLength === 0) {
      return new Response("empty", { status: 404 });
    }
    // Prefer extension-derived type; fall back to a sane image type.
    const ct = contentType.startsWith("image/") ? contentType : mimeForPath(path);
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": ct, "Cache-Control": "private, max-age=300", "Content-Length": String(data.byteLength) },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
