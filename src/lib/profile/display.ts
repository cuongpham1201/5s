/**
 * Profile display normalization — single source of truth for how a user's name
 * and avatar initials are derived across every screen (sidebar, header, home,
 * /me, /admin). Pure module: safe to import from both server and client.
 *
 * Display-name priority (first non-empty wins):
 *   1. stored profile displayName (Data_UserProfiles.DisplayName)
 *   2. profile.name (alternate field, if present)
 *   3. session.user.name (Entra display name)
 *   4. email local-part
 *   5. "Người dùng"
 */

const clean = (s?: string | null) => (s ?? "").trim();

/** Local-part of an email ("phamxuan.cuong" from "phamxuan.cuong@x.com"). */
export function emailLocalPart(email?: string | null): string {
  return clean(email).split("@")[0] ?? "";
}

export interface DisplayNameInput {
  displayName?: string | null;
  name?: string | null;
  sessionName?: string | null;
  email?: string | null;
}

/** Best human-readable name. Never empty — falls back to "Người dùng". */
export function displayNameFrom(input: DisplayNameInput): string {
  return (
    clean(input.displayName) ||
    clean(input.name) ||
    clean(input.sessionName) ||
    emailLocalPart(input.email) ||
    "Người dùng"
  );
}

/**
 * Avatar initials. Uses the last two words' first letters of the name (matches
 * the existing sidebar/header convention), else the first letter of the email
 * local-part. Never returns "?" when a name or email is available.
 */
export function initialsFrom(name?: string | null, email?: string | null): string {
  const n = clean(name);
  if (n && n !== "Người dùng") {
    const ini = n.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(-2).join("").toUpperCase();
    if (ini) return ini;
  }
  const lp = emailLocalPart(email);
  return lp ? lp[0]!.toUpperCase() : "?";
}
