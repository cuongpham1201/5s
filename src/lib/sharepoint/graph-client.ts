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
  del(path: string): Promise<void>;
  /** Upload raw binary content (e.g. PUT .../content). */
  putContent<T>(path: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<T>;
  /** Download raw binary content (returns bytes + content type). */
  getContent(path: string): Promise<{ data: ArrayBuffer; contentType: string }>;
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

/** Always-on Graph failure/slow-call telemetry: status, request-id, Retry-After, ms. */
function glog(kind: string, method: string, path: string, res: Response | null, ms: number, extra?: string): void {
  const data = {
    method,
    status: res?.status ?? 0,
    ms,
    requestId: res?.headers.get("request-id") ?? res?.headers.get("client-request-id") ?? null,
    retryAfter: res?.headers.get("retry-after") ?? null,
    path: path.replace(/^https?:\/\/[^/]+/, "").slice(0, 120),
    ...(extra ? { detail: extra.slice(0, 160) } : {}),
  };
  console.log(`[5S_GRAPH] ${kind} ${JSON.stringify(data)}`);
}

const GRAPH_SLOW_MS = 5_000;

async function request<T>(method: string, accessToken: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    // Transport failure server→Graph (DNS/connectivity) — previously invisible.
    glog("transport-fail", method, path, null, Date.now() - t0, (e as Error)?.message);
    throw new SharePointError(`Graph ${method} không kết nối được: ${(e as Error)?.message ?? "fetch failed"}`, 0);
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    glog("fail", method, path, res, ms, errJson.error?.code);
    throw new SharePointError(
      `Graph ${method} ${path} thất bại: ${res.status} ${errJson.error?.code ?? ""} ${(errJson.error?.message ?? "").slice(0, 160)}`.trim(),
      res.status,
    );
  }
  if (ms > GRAPH_SLOW_MS) glog("slow", method, path, res, ms);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function rawUpload<T>(
  accessToken: string,
  path: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const body: BodyInit = data instanceof Uint8Array ? new Blob([data]) : new Blob([data]);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
      body,
      cache: "no-store",
    });
  } catch (e) {
    glog("transport-fail", "PUT", path, null, Date.now() - t0, (e as Error)?.message);
    throw new SharePointError(`Graph PUT không kết nối được: ${(e as Error)?.message ?? "fetch failed"}`, 0);
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    glog("fail", "PUT", path, res, ms, errJson.error?.code);
    throw new SharePointError(
      `Graph PUT ${path} thất bại: ${res.status} ${errJson.error?.code ?? ""} ${(errJson.error?.message ?? "").slice(0, 160)}`.trim(),
      res.status,
    );
  }
  if (ms > GRAPH_SLOW_MS) glog("slow", "PUT", path, res, ms);
  return (await res.json()) as T;
}

async function rawDownload(
  accessToken: string,
  path: string,
): Promise<{ data: ArrayBuffer; contentType: string }> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) {
    throw new SharePointError(`Graph GET content ${path} thất bại: ${res.status}`, res.status);
  }
  const data = await res.arrayBuffer();
  return { data, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

/** Build a Graph client bound to a token (caller provides via getAppOnlyToken). */
export function createSharePointGraphClient(accessToken: string): SharePointGraphClient {
  if (!accessToken) throw new SharePointError("Thiếu access token", 401);
  return {
    get: (path) => request("GET", accessToken, path),
    post: (path, body) => request("POST", accessToken, path, body),
    patch: (path, body) => request("PATCH", accessToken, path, body),
    del: (path) => request("DELETE", accessToken, path),
    putContent: (path, data, contentType) => rawUpload(accessToken, path, data, contentType),
    getContent: (path) => rawDownload(accessToken, path),
  };
}

/** Convenience: an app-only client (acquires token first). */
export async function getAppOnlyClient(): Promise<SharePointGraphClient> {
  const token = await getAppOnlyToken();
  return createSharePointGraphClient(token);
}

/**
 * Read a Graph collection COMPLETELY by following @odata.nextLink (P0 audit fix:
 * every `$top=999` single-page read silently truncated at 999 items — which broke
 * find-then-upsert idempotency (duplicate rows for items ≥ #1000) and reporting).
 * `request()` accepts absolute URLs, so nextLink passes straight through.
 * maxPages is a runaway guard (~20k items at $top=999), logged when hit.
 */
export async function getAllListItems<T>(
  client: SharePointGraphClient,
  firstPath: string,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let path: string | undefined = firstPath;
  for (let page = 0; page < maxPages && path; page++) {
    const res: { value?: T[]; "@odata.nextLink"?: string } = await client.get(path);
    out.push(...(res.value ?? []));
    path = res["@odata.nextLink"];
  }
  if (path) console.warn(`[5S_GRAPH] getAllListItems: page cap ${maxPages} hit — results truncated (${firstPath.slice(0, 120)})`);
  return out;
}
