/**
 * Postgres pools for the 5S business DB (ban5s_app, read-write) and HRM master
 * (biahalong_cb, READ-ONLY). Server-only. Pools are cached on globalThis so Next
 * hot-reload / route invocations reuse one pool instead of leaking connections.
 *
 * HRM pool forces default_transaction_read_only=on at the connection level — the
 * app can never write to HRM, even by mistake.
 */
import { Pool, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __ban5sAppPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __ban5sHrmPool: Pool | undefined;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu env ${name}.`);
  return v;
}

/** Read-write pool for the 5S business DB (ban5s_app). */
export function appPool(): Pool {
  if (!globalThis.__ban5sAppPool) {
    globalThis.__ban5sAppPool = new Pool({ connectionString: requireEnv("BAN5S_DATABASE_URL"), max: 5 });
  }
  return globalThis.__ban5sAppPool;
}

/** READ-ONLY pool for HRM. Every connection starts read-only; SELECT only. */
export function hrmPool(): Pool {
  if (!globalThis.__ban5sHrmPool) {
    globalThis.__ban5sHrmPool = new Pool({
      connectionString: requireEnv("HRM_DATABASE_URL"),
      max: 3,
      options: "-c default_transaction_read_only=on",
    });
  }
  return globalThis.__ban5sHrmPool;
}

export function appQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return appPool().query<T>(text, params as never);
}

export function hrmQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return hrmPool().query<T>(text, params as never);
}
