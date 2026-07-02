import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Route protection (Phase 1A skeleton).
 * - Unauthenticated users hitting protected routes are redirected to /signin.
 * - /signin, auth API, static assets, and PWA files are public.
 * - Fine-grained role checks (employee vs environment/admin) are enforced in
 *   Phase 1B at the BFF layer; here we only gate authentication.
 */
const PUBLIC_PATHS = ["/signin", "/offline", "/clear-auth", "/api/log/client"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/auth");

  if (!isLoggedIn && !isPublic) {
    // API calls get an explicit JSON 401 — redirecting a fetch() to /signin makes
    // the client parse an HTML page and report a misleading generic error.
    if (pathname.startsWith("/api/")) {
      // Upload-path 401s were invisible in production logs (a failing attempt with
      // a dead session left zero server-side trace) — log them ALWAYS.
      if (pathname.startsWith("/api/upload") || pathname.startsWith("/api/sync")) {
        console.log(`[5S_UPLOAD] server.auth401 ${JSON.stringify({ path: pathname, ua: req.headers.get("user-agent")?.slice(0, 80) ?? null })}`);
      }
      return NextResponse.json({ ok: false, errorCode: "AUTH_REQUIRED", message: "Chưa đăng nhập." }, { status: 401 });
    }
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything EXCEPT: the Auth.js routes (api/auth/*), Next internals,
  // PWA files, and static assets. Excluding api/auth is REQUIRED — running the
  // auth() middleware on the sign-in/callback endpoints can regenerate/overwrite
  // the PKCE code_verifier cookie so it no longer matches the code_challenge sent
  // to Entra, producing AADSTS501481 at the callback ("Configuration" error page).
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
