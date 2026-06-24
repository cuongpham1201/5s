/**
 * SharePoint Graph client (Phase 2C.2).
 *
 * App-only (client-credentials) token + a typed Graph fetch wrapper. Token is
 * cached in memory until shortly before expiry. Secrets are NEVER logged or
 * returned. Writes (POST/PATCH) are used only by provision/seed services that
 * are explicitly triggered via protected admin endpoints — no photo upload here.
 */
import { GRAPH_BASE } from "./sharepoint-config";
import { SharePointError } from "./sharepoint-types";

export interface SharePointGraphClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
let cached: CachedToken | null = null;

function readEnv(): { tenantId: string; clientId: string; clientSecret: string } {
  const tenantId = process.env.GRAPH_TENANT_ID ?? "";
  const clientId = process.env.GRAPH_CLIENT_ID ?? "";
  const clientSecret = process.env.GRAPH_CLIENT_SECRET ?? "";
  if (!tenantId || !clientId || !clientSecret) {
    throw new SharePointError(
      "Thiếu GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET / GRAPH_TENANT_ID trong môi trường.",
      500,
    );
  }
  return { tenantId, clientId, clientSecret };
}

export function maskClientId(id: string | undefined): string {
  if (!id) return "none";
  return id.length <= 8 ? "****" : `${id.slice(0, 4)}...${id.slice(-4)}`;
}

/** Acquire an app-only Graph access token (client credentials). Cached. */
export async function getAppOnlyToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { tenantId, clientId, clientSecret } = readEnv();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    // Do NOT include the secret; only the provider error code/description.
    throw new SharePointError(
      `Không lấy được app-only token: ${json.error ?? res.status} ${(json.error_description ?? "").slice(0, 160)}`.trim(),
      res.status || 500,
    );
  }
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

async function request<T>(method: string, accessToken: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new SharePointError(
      `Graph ${method} ${path} thất bại: ${res.status} ${errJson.error?.code ?? ""} ${(errJson.error?.message ?? "").slice(0, 160)}`.trim(),
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Build a Graph client bound to a token (caller provides via getAppOnlyToken). */
export function createSharePointGraphClient(accessToken: string): SharePointGraphClient {
  if (!accessToken) throw new SharePointError("Thiếu access token", 401);
  return {
    get: (path) => request("GET", accessToken, path),
    post: (path, body) => request("POST", accessToken, path, body),
    patch: (path, body) => request("PATCH", accessToken, path, body),
  };
}

/** Convenience: an app-only client (acquires token first). */
export async function getAppOnlyClient(): Promise<SharePointGraphClient> {
  const token = await getAppOnlyToken();
  return createSharePointGraphClient(token);
}
