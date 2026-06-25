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

/** Normalized profile used by the app (/api/me response). */
export interface MeProfile {
  displayName: string | null;
  email: string | null;
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

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GraphError";
  }
}
