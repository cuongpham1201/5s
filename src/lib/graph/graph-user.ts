/**
 * Graph user profile reader (Phase 1B).
 * GET /me with an explicit $select — only the fields /api/me exposes.
 */
import { createGraphClient } from "./graph-client";
import { mapEntraDepartment } from "@/lib/department-mapping";
import type { GraphUserRaw, MeProfile } from "./graph-types";

const ME_SELECT = [
  "id",
  "displayName",
  "givenName",
  "surname",
  "mail",
  "userPrincipalName",
  "department",
  "jobTitle",
  "officeLocation",
  "employeeId",
].join(",");

/** Fetch + normalize the signed-in user's profile from Microsoft Graph. */
export async function getMe(accessToken: string): Promise<MeProfile> {
  const client = createGraphClient(accessToken);
  const raw = await client.get<GraphUserRaw>(`/me?$select=${ME_SELECT}`);
  return normalizeGraphUser(raw);
}

export function normalizeGraphUser(raw: GraphUserRaw): MeProfile {
  const entraDepartment = raw.department ?? null;
  return {
    displayName: raw.displayName ?? null,
    email: raw.mail ?? raw.userPrincipalName ?? null,
    entraDepartment,
    department: mapEntraDepartment(entraDepartment) ?? null,
    jobTitle: raw.jobTitle ?? null,
    officeLocation: raw.officeLocation ?? null,
    employeeId: raw.employeeId ?? null,
    source: "graph",
  };
}
