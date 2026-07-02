/**
 * App-only directory lookup (P0 audit fix). Since the delegated Graph token was
 * removed from the session JWT (cookie-bloat fix), delegated /me can never run —
 * a brand-NEW user had no way to get a department (PROFILE_UNRESOLVED → cannot
 * upload) and department CHANGES never propagated. This reads the user's profile
 * with the app-only client instead (requires the *application* permission
 * User.Read.All on the GRAPH_CLIENT app registration; if consent is missing the
 * call 403s, we log it always-on, and callers fall back to the stored profile /
 * session exactly as before — no regression).
 */
import { getAppOnlyClient } from "./graph-client";
import { ulogAlways } from "@/lib/debug/upload-log";

export interface DirectoryUser {
  displayName: string | null;
  department: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  mail: string | null;
}

export async function getDirectoryUser(email: string): Promise<DirectoryUser | null> {
  const clean = (email ?? "").trim().toLowerCase();
  if (!clean) return null;
  try {
    const client = await getAppOnlyClient();
    const u = await client.get<{
      displayName?: string | null; department?: string | null; jobTitle?: string | null;
      officeLocation?: string | null; mail?: string | null;
    }>(`/users/${encodeURIComponent(clean)}?$select=displayName,department,jobTitle,officeLocation,mail`);
    return {
      displayName: u.displayName ?? null,
      department: u.department ?? null,
      jobTitle: u.jobTitle ?? null,
      officeLocation: u.officeLocation ?? null,
      mail: u.mail ?? null,
    };
  } catch (e) {
    // 403 = User.Read.All application permission not consented; 404 = not found.
    // Always-on: profile-resolution failures were previously invisible in prod.
    ulogAlways("profile.directory:failed", { email: clean, message: (e as Error)?.message?.slice(0, 160) ?? "error" });
    return null;
  }
}
