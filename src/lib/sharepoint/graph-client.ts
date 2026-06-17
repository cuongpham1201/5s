/**
 * SharePoint Graph client foundation (Phase 2C.1) — READ-ONLY scaffolding.
 *
 * No writes (no POST/PUT/PATCH) and no real auth wiring yet. The app-only token
 * acquisition + create/upload operations land in Phase 2C.2. This module only
 * provides a typed GET wrapper and a token placeholder, and is NOT imported by
 * any runtime page.
 */
import { GRAPH_BASE, GRAPH_ENV } from "./sharepoint-config";
import { SharePointError } from "./sharepoint-types";

export interface SharePointGraphClient {
  get<T>(path: string): Promise<T>;
}

/**
 * Placeholder for app-only token acquisition (client credentials flow).
 * Phase 2C.2 will implement MSAL client-credentials against GRAPH_* env.
 */
export async function getAppOnlyToken(): Promise<string> {
  const configured =
    !!process.env[GRAPH_ENV.clientId] &&
    !!process.env[GRAPH_ENV.clientSecret] &&
    !!process.env[GRAPH_ENV.tenantId];
  if (!configured) {
    throw new SharePointError(
      "Graph app-only chưa cấu hình (GRAPH_CLIENT_ID/SECRET/TENANT_ID). Sẽ wiring ở Phase 2C.2.",
      501,
    );
  }
  // Intentionally not implemented in 2C.1 (design/foundation only).
  throw new SharePointError("getAppOnlyToken chưa triển khai (Phase 2C.2).", 501);
}

/** Create a read-only Graph client bound to a token (token provided by caller). */
export function createSharePointGraphClient(accessToken: string): SharePointGraphClient {
  if (!accessToken) throw new SharePointError("Thiếu access token", 401);
  return {
    async get<T>(path: string): Promise<T> {
      const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new SharePointError(`Graph GET thất bại: ${res.status} ${res.statusText}`, res.status);
      }
      return (await res.json()) as T;
    },
  };
}
