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
import { trace } from "@/lib/debug/trace";
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
        fromGraph: true, // trustworthy — live Graph /me
      };
      trace("[5S_PROFILE]", "graph.me", { email: input.email, hasDisplayName: !!me.displayName, hasDept: !!me.entraDepartment });
    } catch (e) {
      trace("[5S_PROFILE]", "graph.me:failed", { message: (e as Error)?.message ?? "error" });
      input = null;
    }
  }
  if (!input) {
    // Dev login / Graph unavailable / expired token: derive from session.
    // fromGraph=false → syncProfileFromGraph will NOT downgrade stored data.
    input = {
      email: lc(session.user.email),
      displayName: session.user.name ?? null,
      departmentRaw: session.user.department ?? null,
      jobTitle: null,
      officeLocation: null,
      fromGraph: false,
    };
  }
  if (!input.email) input = null;
  return { input, role };
}

export async function getRequestProfile(req: NextRequest, opts: { mode?: "read" | "sync" } = {}): Promise<RequestProfile> {
  // READ fast-path: serve the app-owned stored profile WITHOUT a delegated Graph
  // call. Data_UserProfiles is the stable source after first sync; this avoids
  // hitting Graph on every request (and avoids the token-expiry failure path).
  if (opts.mode !== "sync") {
    const session = await auth();
    const email = lc(session?.user?.email);
    if (!session?.user) return { profile: null, email: null };
    if (email) {
      const existing = await getProfile(email).catch(() => null);
      if (existing && existing.departmentResolved) {
        return { profile: existing, email, role: session.user.role };
      }
    }
  }

  // Graph needed: explicit sync, OR profile missing/unresolved (self-heal).
  const { input, role } = await buildGraphInput(req);
  if (!input) return { profile: null, email: null, role };
  try {
    if (opts.mode === "sync") {
      trace("[5S_PROFILE]", "sync", { email: input.email, departmentRaw: input.departmentRaw });
      return { profile: await syncProfileFromGraph(input), email: input.email, role };
    }
    const existing = await getProfile(input.email);
    if (existing && existing.departmentResolved) {
      return { profile: existing, email: input.email, role };
    }
    trace("[5S_PROFILE]", "self-heal", { email: input.email, hadProfile: !!existing, departmentRaw: input.departmentRaw });
    const synced = await syncProfileFromGraph(input);
    return { profile: synced.departmentResolved ? synced : existing ?? synced, email: input.email, role };
  } catch {
    const fallback = await getProfile(input.email).catch(() => null);
    return { profile: fallback, email: input.email, role };
  }
}
