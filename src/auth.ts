import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";

/**
 * Auth.js (NextAuth v5) configuration — Phase 1A skeleton.
 *
 * - Microsoft Entra ID (M365) provider is wired but only enabled when the
 *   AUTH_MICROSOFT_ENTRA_ID_* env vars are present (filled in Phase 1B with a
 *   real App Registration). No real secret is required to run locally.
 * - A dev "mock" Credentials provider lets the app run + login locally without
 *   any real M365 tenant. It is gated by NEXT_PUBLIC_ALLOW_DEV_LOGIN.
 *
 * NOTE: No SharePoint / Graph business logic here (Phase 1B+). Department/role
 * are mocked for the dev provider and read from the Entra profile otherwise.
 */

export type AppRole = "employee" | "environment" | "admin";

// Augment the session/user types with our app-specific fields.
declare module "next-auth" {
  interface Session {
    user: {
      department?: string;
      role?: AppRole;
    } & DefaultSession["user"];
  }
  interface User {
    department?: string;
    role?: AppRole;
  }
}

const entraConfigured =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;

const allowDevLogin = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

const providers = [];

if (entraConfigured) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
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
      // Phase 1A: accept any input and return a mock user. Replaced by real
      // Entra/Graph identity in Phase 1B. NEVER enable in production.
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
  pages: {
    signIn: "/signin",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Persist app fields onto the JWT.
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: AppRole }).role ?? "employee";
        token.department = (user as { department?: string }).department;
      }
      return token;
    },
    // Expose app fields on the session.
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as AppRole) ?? "employee";
        session.user.department = token.department as string | undefined;
      }
      return session;
    },
  },
});
