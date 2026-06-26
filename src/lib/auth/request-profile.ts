/**
 * Resolve the current request's UserProfile (Data_UserProfiles) server-side.
 *
 * This is the single entry point screens/APIs use instead of resolving the
 * department live. It reads the stored profile; on first login (or when missing)
 * it syncs from Graph once. `mode:"sync"` forces a full sync (resolve-if-changed
 * + LastLogin) — used by the post-login /api/profile/sync. Never exposes tokens.
 */
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { getMe } from "@/lib/graph/graph-user";
import {
  getProfile,
  syncProfileFromGraph,
  type UserProfile,
  type GraphProfileInput,
} from "@/lib/sharepoint/user-profile-service";
import type { NextRequest } from "next/server";

const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();

export interface RequestProfile {
  profile: UserProfile | null;
  email: string | null;
  role?: string;
}

async function buildGraphInput(req: NextRequest): Promise<{ input: GraphProfileInput | null; role?: string }> {
  const session = await auth();
  if (!session?.user) return { input: null };
  const role = session.user.role;

  const useSecure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const cookieName = useSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
  let accessToken: string | undefined;
  try {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET ?? "", salt: cookieName, cookieName, secureCookie: useSecure });
    accessToken = typeof token?.accessToken === "string" ? token.accessToken : undefined;
  } catch {
    accessToken = undefined;
  }

  let input: GraphProfileInput | null = null;
  if (accessToken) {
    try {
      const me = await getMe(accessToken);
      input = {
        email: lc(me.email ?? session.user.email),
        displayName: me.displayName,
        departmentRaw: me.entraDepartment,
        jobTitle: me.jobTitle,
        officeLocation: me.officeLocation,
      };
    } catch {
      input = null;
    }
  }
  if (!input) {
    // Dev login / Graph unavailable: derive from session.
    input = {
      email: lc(session.user.email),
      displayName: session.user.name ?? null,
      departmentRaw: session.user.department ?? null,
      jobTitle: null,
      officeLocation: null,
    };
  }
  if (!input.email) input = null;
  return { input, role };
}

export async function getRequestProfile(req: NextRequest, opts: { mode?: "read" | "sync" } = {}): Promise<RequestProfile> {
  const { input, role } = await buildGraphInput(req);
  if (!input) return { profile: null, email: null, role };
  try {
    if (opts.mode === "sync") {
      return { profile: await syncProfileFromGraph(input), email: input.email, role };
    }
    const existing = await getProfile(input.email);
    if (existing) return { profile: existing, email: input.email, role };
    // On-demand creation when no profile exists yet (migration-free).
    return { profile: await syncProfileFromGraph(input), email: input.email, role };
  } catch {
    const fallback = await getProfile(input.email).catch(() => null);
    return { profile: fallback, email: input.email, role };
  }
}
