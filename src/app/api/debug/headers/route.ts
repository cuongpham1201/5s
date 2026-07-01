import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic (Phase auth-fix). Returns ONLY safe request headers so we
 * can confirm what host/proto Auth.js sees behind Cloudflare Tunnel — Auth.js must
 * resolve https://she.biahalong.com. NO cookies, NO secrets. Remove after the auth
 * callback is confirmed stable.
 */
export async function GET(req: NextRequest) {
  const h = req.headers;
  // Cookie bloat diagnostic (names + sizes ONLY, never values) — for the HTTP 431
  // before/after comparison.
  const cookieHeader = h.get("cookie") ?? "";
  const parts = cookieHeader ? cookieHeader.split(/;\s*/).filter(Boolean) : [];
  const sizes = parts.map((p) => {
    const eq = p.indexOf("=");
    const name = eq >= 0 ? p.slice(0, eq) : p;
    return { name, bytes: p.length };
  }).sort((a, b) => b.bytes - a.bytes);
  const cookies = {
    count: parts.length,
    headerBytes: cookieHeader.length,
    largest: sizes.slice(0, 12),
  };
  return NextResponse.json({
    cookies,
    host: h.get("host"),
    "x-forwarded-host": h.get("x-forwarded-host"),
    "x-forwarded-proto": h.get("x-forwarded-proto"),
    "x-forwarded-for": h.get("x-forwarded-for") ? "present" : null,
    origin: h.get("origin"),
    referer: h.get("referer"),
    "user-agent": h.get("user-agent"),
    nextUrlOrigin: req.nextUrl.origin,
    env: {
      AUTH_URL: process.env.AUTH_URL ?? null,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
    },
  });
}
