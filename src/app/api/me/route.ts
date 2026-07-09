import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getRequestProfile } from "@/lib/auth/request-profile";
import { displayNameFrom } from "@/lib/profile/display";
import { getIdentityByEmail, getIdentityByUsername, ensureMicrosoftUser, type Identity } from "@/lib/identity/identity-service";
import type { MeResponse } from "@/lib/graph/graph-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL_DOMAIN = "local.biahalong.com";

/**
 * Resolve identity (department/jobTitle/role) from ban5s_app (Phase 3). Best-effort:
 * any failure returns null and /api/me keeps the legacy profile/Graph fallback.
 * Department is now owned by HRM (ban5s_app), NOT Microsoft Graph.
 */
async function resolveBan5sIdentity(email: string, oid: string | undefined, name: string | null): Promise<Identity | null> {
  try {
    if (email.toLowerCase().endsWith(`@${LOCAL_DOMAIN}`)) return await getIdentityByUsername(email.split("@")[0]);
    if (oid) return await ensureMicrosoftUser({ oid, email, name });
    return await getIdentityByEmail(email);
  } catch {
    return null;
  }
}

/**
 * GET /api/me — signed-in profile from Data_UserProfiles (NO live department
 * resolution). Reads the stored profile; creates it on first call (on-demand).
 * Department resolution is owned by the profile service.
 */
export async function GET(req: NextRequest) {
  const { profile, email, role } = await getRequestProfile(req, { mode: "read" });
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Normalize the display name so the client never receives an empty value:
  // stored DisplayName → Entra session name → email local-part → "Người dùng".
  // (The read fast-path may serve a stored profile whose DisplayName was never
  // backfilled; session.user.name is the reliable Entra name in that case.)
  const session = await auth();
  const code = profile?.departmentCode ?? null;
  const res: MeResponse = {
    displayName: displayNameFrom({ displayName: profile?.displayName, sessionName: session?.user?.name, email }),
    email,
    departmentRaw: profile?.departmentRaw ?? null,
    departmentCode: code,
    departmentName: profile?.departmentName ?? null,
    departmentResolved: !!code,
    departmentSource: "profile",
    departmentWarning: code
      ? null
      : "Chưa xác định được phòng ban 5S cho tài khoản. Vui lòng liên hệ quản trị (có thể cần đồng bộ hồ sơ).",
    jobTitle: profile?.jobTitle ?? null,
    officeLocation: profile?.officeLocation ?? null,
    employeeId: null,
    id: null,
    source: "microsoft-entra-id",
    role,
    lastLogin: profile?.lastLogin ?? null,
  };

  // Phase 3: prefer identity from ban5s_app (HRM master via app_users). Falls
  // back to the stored profile above when the user isn't mapped to an employee.
  const identity = await resolveBan5sIdentity(email, session?.user?.oid, session?.user?.name ?? null);
  if (identity) {
    res.role = identity.role || res.role;
    if (identity.departmentCode) {
      res.departmentCode = identity.departmentCode;
      res.departmentName = identity.departmentName;
      res.departmentResolved = true;
      res.departmentSource = "ban5s_app";
      res.departmentWarning = null;
    }
    res.jobTitle = identity.jobTitle ?? res.jobTitle;
    res.employeeId = identity.employeeCode ?? res.employeeId;
    res.displayName = res.displayName || identity.displayName;
  }
  return NextResponse.json(res);
}
