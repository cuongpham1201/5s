import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { resolveRole } from "@/lib/auth/roles";
import { mapEntraDepartment } from "@/lib/department-mapping";

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
    accessTokenExpires?: number;
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Homelab runs behind Cloudflare Tunnel (reverse proxy), so the host header
  // must be trusted. Required by Auth.js v5 outside Vercel.
  trustHost: true,
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user, profile }) {
      // Capture the Graph access token at sign-in (Entra only).
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.accessTokenExpires = account.expires_at;
      }
      if (user) {
        token.role = (user as { role?: AppRole }).role;
        token.department = (user as { department?: string }).department;
      }
      // Derive role + 5S department from the Entra profile on first sign-in.
      if (profile) {
        const email = (profile.email as string) || (profile.preferred_username as string) || "";
        token.role = token.role ?? resolveRole(email);
        const entraDept = (profile as { department?: string }).department;
        token.department = token.department ?? mapEntraDepartment(entraDept);
      }
      token.role = token.role ?? "employee";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as AppRole) ?? "employee";
        session.user.department = token.department;
      }
      // accessToken intentionally NOT attached to the client session.
      return session;
    },
  },
});
