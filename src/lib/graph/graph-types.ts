/** Microsoft Graph types (Phase 1B — user profile only, no SharePoint). */

/** Raw shape returned by GET https://graph.microsoft.com/v1.0/me */
export interface GraphUserRaw {
  id?: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  officeLocation?: string | null;
  employeeId?: string | null;
}

/** Normalized profile from Graph /me. */
export interface MeProfile {
  id: string | null;
  displayName: string | null;
  email: string | null;
  userPrincipalName: string | null;
  /** Raw Entra department string (before 5S mapping). */
  entraDepartment: string | null;
  /** Mapped 5S department code, or null when unmapped. */
  department: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  employeeId: string | null;
  /** Identity source: real M365 (Entra/Graph) vs dev mock login. */
  source: "microsoft-entra-id" | "dev";
}

/** The /api/me response (department resolved against Config_Departments). */
export interface MeResponse {
  displayName: string | null;
  email: string | null;
  departmentRaw: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentResolved: boolean;
  departmentSource: string;
  departmentWarning: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  employeeId: string | null;
  id: string | null;
  source: "microsoft-entra-id" | "dev";
  /** App role (employee/environment/admin) from the session. */
  role?: string;
  /** ISO datetime of last login (from the stored profile). */
  lastLogin?: string | null;
}

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GraphError";
  }
}
