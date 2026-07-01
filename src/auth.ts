import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { resolveRole } from "@/lib/auth/roles";
import { mapEntraDepartment } from "@/lib/department-mapping";
import { trace } from "@/lib/debug/trace";

/**
 * Auth.js (NextAuth v5) configuration — Phase 1B.
 *
 * - Microsoft Entra ID (M365) provider is wired and enabled when the
 *   AUTH_AZURE_AD_* env vars are present (real App Registration, filled at deploy).
 *   It requests delegated Graph scopes (User.Read) so /api/me can read the real
 *   profile. The access token is stored in the encrypted JWT only — never exposed
 *   to the client session (read server-side via next-auth/jwt getToken).
 * - A dev "mock" Credentials provider lets the app run + login locally without a
 *   real M365 tenant. Gated by NEXT_PUBLIC_ALLOW_DEV_LOGIN.
 *
 * NO SharePoint / List / Library here (Phase 2+). Only user identity.
 */

export type AppRole = "employee" | "environment" | "admin";

declare module "next-auth" {
  interface Session {
    user: {
      department?: string; // 5S department code (mapped)
      role?: AppRole;
    } & DefaultSession["user"];
    /** Set to "RefreshAccessTokenError" when the Graph token could not be refreshed. */
    error?: string;
  }
  interface User {
    department?: string;
    role?: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    department?: string;
    accessToken?: string;
    refreshToken?: string;
    /** Epoch SECONDS when the access token expires (matches account.expires_at). */
    accessTokenExpires?: number;
    /** "RefreshAccessTokenError" when refresh failed → UI/API should force re-login. */
    error?: string;
  }
}

const tenantId = process.env.AUTH_AZURE_AD_TENANT_ID;

const entraConfigured =
  !!process.env.AUTH_AZURE_AD_CLIENT_ID && !!process.env.AUTH_AZURE_AD_CLIENT_SECRET;

const allowDevLogin = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

const providers = [];

if (entraConfigured) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AUTH_AZURE_AD_CLIENT_SECRET,
      // Build the v2.0 issuer from the tenant id (single-tenant app).
      issuer: tenantId
        ? `https://login.microsoftonline.com/${tenantId}/v2.0`
        : undefined,
      // Delegated scopes — only user profile. offline_access for refresh.
      // NOTE: User.Read is a low-privilege delegated scope (no admin consent
      // required in most tenants). NO SharePoint/Sites scopes here (Phase 2).
      authorization: {
        params: { scope: "openid profile email offline_access User.Read" },
      },
    }),
  );
}

if (allowDevLogin || !entraConfigured) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev mock (no M365)",
      credentials: {
        email: { label: "Email", type: "email" },
        role: { label: "Role", type: "text" },
      },
      authorize: async (creds) => {
        const email = (creds?.email as string) || "nguyen.van.a@biahalong.com";
        const role = ((creds?.role as string) || "employee") as AppRole;
        const name = email.split("@")[0].replace(/\./g, " ");
        return {
          id: email,
          email,
          name,
          role,
          department: role === "employee" ? "PMKT" : undefined,
        };
      },
    }),
  );
}

/** Refresh window: renew when within this many seconds of expiry. */
const REFRESH_SKEW_SEC = 300;
const GRAPH_SCOPE = "openid profile email offline_access User.Read";

/**
 * Exchange the stored refresh_token for a new Entra access_token (delegated).
 * Never logs token values. On failure marks the JWT with RefreshAccessTokenError
 * and clears the dead access token so callers fall back / force re-login.
 */
async function refreshEntraAccessToken(token: import("next-auth/jwt").JWT): Promise<import("next-auth/jwt").JWT> {
  try {
    if (!token.refreshToken || !tenantId) throw new Error("missing_refresh_token");
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_AZURE_AD_CLIENT_ID ?? "",
        client_secret: process.env.AUTH_AZURE_AD_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        scope: GRAPH_SCOPE,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string; expires_in?: number; refresh_token?: string; error?: string;
    };
    if (!res.ok || !data.access_token) throw new Error(data.error || `http_${res.status}`);
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      // Entra rotates refresh tokens — keep the new one (fall back to old if absent).
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (e) {
    // Event name + provider error code only — NO token values.
    trace("[5S_PROFILE]", "token.refresh:failed", { error: (e as Error)?.message ?? "error" });
    return { ...token, accessToken: undefined, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Homelab runs behind Cloudflare Tunnel (reverse proxy), so the host header
  // must be trusted. Required by Auth.js v5 outside Vercel.
  trustHost: true,
  // On any auth error, route to /clear-auth (expires stale/chunked auth cookies)
  // then back to /signin — prevents failed logins from accumulating cookies into
  // an HTTP 431 dead-end, instead of showing the terminal "Configuration" page.
  pages: { signIn: "/signin", error: "/clear-auth" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user, profile }) {
      // (1) Initial sign-in (Entra): capture access + refresh token + expiry.
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.accessTokenExpires = account.expires_at; // epoch seconds
        token.refreshToken = account.refresh_token;
        token.error = undefined;
      }
      if (user) {
        token.role = (user as { role?: AppRole }).role;
        token.department = (user as { department?: string }).department;
      }
      if (profile) {
        const email = (profile.email as string) || (profile.preferred_username as string) || "";
        token.role = token.role ?? resolveRole(email);
        const entraDept = (profile as { department?: string }).department;
        token.department = token.department ?? mapEntraDepartment(entraDept);
      }
      token.role = token.role ?? "employee";

      // (2) Subsequent calls: rotate the Graph token BEFORE it expires so we never
      // reach the "logged in but Graph token dead" state. Only when we actually
      // have a refresh token (Entra); dev Credentials login has none → skipped.
      if (!account && token.refreshToken && token.accessTokenExpires) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec >= token.accessTokenExpires - REFRESH_SKEW_SEC) {
          return await refreshEntraAccessToken(token);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as AppRole) ?? "employee";
        session.user.department = token.department;
      }
      // Surface refresh failure so UI/API can force a clean re-login.
      // accessToken intentionally NOT attached to the client session.
      session.error = token.error;
      return session;
    },
  },
});
