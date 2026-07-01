import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /clear-auth — recovery from cookie bloat / stuck auth (HTTP 431, repeated
 * AADSTS501481). Expires every known Auth.js cookie (v5 authjs.* and legacy
 * next-auth.*, __Secure-/__Host-/unprefixed, plus chunked session-token .0–.9)
 * then redirects to /signin. Safe: only clears auth cookies, touches nothing else.
 */
const BASE_NAMES = [
  "authjs.session-token",
  "authjs.csrf-token",
  "authjs.callback-url",
  "authjs.pkce.code_verifier",
  "authjs.state",
  "authjs.nonce",
  // legacy NextAuth v4 names, in case any linger
  "next-auth.session-token",
  "next-auth.csrf-token",
  "next-auth.callback-url",
  "next-auth.pkce.code_verifier",
  "next-auth.state",
];
const PREFIXES = ["", "__Secure-", "__Host-"];

function expandNames(): string[] {
  const out = new Set<string>();
  for (const base of BASE_NAMES) {
    for (const p of PREFIXES) {
      out.add(`${p}${base}`);
      // session tokens are chunked when large: name.0, name.1, ...
      if (base.endsWith("session-token")) {
        for (let i = 0; i < 10; i++) out.add(`${p}${base}.${i}`);
      }
    }
  }
  return [...out];
}

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/signin?cleared=1", req.nextUrl.origin));
  for (const name of expandNames()) {
    // Expire with maxAge:0 + path:/ + Secure so __Host-/__Secure- prefixed cookies
    // are validly deleted on https (deletion matches by name+domain+path).
    res.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  }
  return res;
}
