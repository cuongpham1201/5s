import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { resolveRole } from "@/lib/auth/roles";

const LOCAL_EMAIL_DOMAIN = "local.biahalong.com";

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
      department?: string; // 5S department code (local/dev providers only; MS resolves via /api/me → ban5s_app)
      role?: AppRole;
      /** Microsoft Entra object id — identity anchor for ban5s_app resolution. */
      oid?: string;
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
    oid?: string;
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

// Local (non-M365) accounts — for employees without a 365 license. Validated
// against the Data_LocalUsers SharePoint list (PBKDF2 hashes). The service is
// imported DYNAMICALLY inside authorize() so the middleware/edge bundle never
// evaluates SharePoint code at module scope.
providers.push(
  Credentials({
    id: "local",
    name: "Tài khoản nội bộ",
    credentials: {
      username: { label: "Tên đăng nhập", type: "text" },
      password: { label: "Mật khẩu", type: "password" },
    },
    authorize: async (creds) => {
      const username = String(creds?.username ?? "");
      const password = String(creds?.password ?? "");
      // 1) app_users (ban5s_app) — verified via node internal route so pg never
      //    enters the edge bundle. app_users is the identity center (Phase 3).
      try {
        const base = process.env.INTERNAL_BASE_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
        const r = await fetch(`${base}/api/identity/local-verify`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-token": process.env.AUTH_SECRET ?? "" },
          body: JSON.stringify({ username, password }),
          // Fail fast so a stuck internal call falls back to the legacy store
          // instead of hanging the login request.
          signal: AbortSignal.timeout(3500),
        });
        if (r.ok) {
          const d = await r.json();
          if (d?.ok && d.identity) {
            const i = d.identity;
            const email = i.email || `${i.username}@${LOCAL_EMAIL_DOMAIN}`;
            return { id: `local:${i.username}`, email, name: i.displayName, role: (i.role as AppRole) || "employee", department: i.departmentCode ?? undefined };
          }
        }
      } catch { /* fall through to legacy store */ }
      // 2) Legacy fallback — Data_LocalUsers (SharePoint) so existing accounts keep working.
      const { verifyLocalLogin } = await import("@/lib/auth/local-users");
      const user = await verifyLocalLogin(username, password);
      if (!user) return null;
      return {
        id: user.email,
        email: user.email,
        name: user.displayName,
        role: (user.role as AppRole) || "employee",
        department: user.departmentCode,
      };
    },
  }),
);

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
    async jwt({ token, user, profile }) {
      // Keep the session cookie SMALL: store ONLY identity + app claims (role,
      // department). The Entra access_token / refresh_token are deliberately NOT
      // persisted — they bloated the JWT into 4 chunked cookies (→ HTTP 431) and
      // are not needed post-login: profile/department come from the id_token
      // claims here + Data_UserProfiles, uploads use the app-only Graph token.
      if (user) {
        token.role = (user as { role?: AppRole }).role;
        token.department = (user as { department?: string }).department;
      }
      if (profile) {
        const email = (profile.email as string) || (profile.preferred_username as string) || "";
        token.role = token.role ?? resolveRole(email);
        // Microsoft object id = identity anchor. Department/jobTitle/role are now
        // resolved from ban5s_app (in /api/me), NOT from Microsoft Graph.
        token.oid = (profile.oid as string) || (profile.sub as string) || token.oid;
      }
      token.role = token.role ?? "employee";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as AppRole) ?? "employee";
        session.user.department = token.department; // undefined for MS → client reads /api/me
        session.user.oid = token.oid as string | undefined;
      }
      return session;
    },
  },
});
