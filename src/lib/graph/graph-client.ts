/**
 * Microsoft Graph client (Phase 1B foundation).
 *
 * A tiny fetch wrapper around https://graph.microsoft.com/v1.0 using a delegated
 * user access token (captured by Auth.js at sign-in). No SDK dependency, no
 * SharePoint endpoints — only what /api/me needs today.
 */
import { GraphError } from "./graph-types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphClient {
  get<T>(path: string): Promise<T>;
}

/** Create a Graph client bound to a delegated access token. */
export function createGraphClient(accessToken: string): GraphClient {
  if (!accessToken) {
    throw new GraphError("Missing Graph access token", 401);
  }
  return {
    async get<T>(path: string): Promise<T> {
      const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        // Never cache identity calls.
        cache: "no-store",
      });
      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          detail = body?.error?.message ?? "";
        } catch {
          /* ignore non-JSON error bodies */
        }
        throw new GraphError(
          `Graph request failed: ${res.status} ${res.statusText} ${detail}`.trim(),
          res.status,
        );
      }
      return (await res.json()) as T;
    },
  };
}
