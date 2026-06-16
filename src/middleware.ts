import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Route protection (Phase 1A skeleton).
 * - Unauthenticated users hitting protected routes are redirected to /signin.
 * - /signin, auth API, static assets, and PWA files are public.
 * - Fine-grained role checks (employee vs environment/admin) are enforced in
 *   Phase 1B at the BFF layer; here we only gate authentication.
 */
const PUBLIC_PATHS = ["/signin", "/offline"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/auth");

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except Next internals, PWA files, and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
