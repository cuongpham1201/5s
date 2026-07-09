/**
 * Identity service (Phase 3) — app_users is the center of the system.
 *
 * Resolves identity (role/department/job title) from ban5s_app: app_users →
 * hr_employees → hr_departments. Handles Microsoft auto-provision, local
 * credential verification, and admin management (map/unmap, link/unlink MS,
 * local accounts, disable/enable, password reset).
 *
 * Node-only (uses pg). NEVER imported by auth.ts at module scope (edge). Local
 * login reaches this via the node route /api/identity/local-verify.
 */
import { appPool } from "@/lib/db/pg";

// ── password hashing (PBKDF2-SHA256, same format as Data_LocalUsers) ──────────
const PBKDF2_ITER = 210_000;
const b64 = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return b64(bits);
}
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${await derive(password, salt, PBKDF2_ITER)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = (stored ?? "").split("$");
  if (scheme !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;
  return (await derive(password, unb64(saltB64), Number(iterStr))) === hashB64;
}

export function normalizeUsername(raw: string): string | null {
  const u = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(u) ? u : null;
}

// ── types ─────────────────────────────────────────────────────────────────────
export interface Identity {
  userId: number;
  loginType: "microsoft" | "local";
  email: string | null;
  username: string | null;
  displayName: string;
  role: string;
  isActive: boolean;
  disabledReason: string | null;
  mustChangePassword: boolean;
  employeeId: number | null;
  employeeCode: string | null;
  jobTitle: string | null;
  departmentCode: string | null; // hr_departments.short_name (5S code)
  departmentName: string | null;
  employmentStatus: string | null;
}

const SELECT_IDENTITY = `
  SELECT u.id, u.login_type, u.email, u.username, u.display_name, u.role, u.is_active,
         u.disabled_reason, u.must_change_password, u.employee_id, u.microsoft_object_id,
         u.password_hash, u.provisioned, u.last_login_at,
         e.employee_code, e.job_title, e.employment_status,
         d.short_name AS dept_code, d.name AS dept_name
  FROM app_users u
  LEFT JOIN hr_employees e ON e.id = u.employee_id
  LEFT JOIN hr_departments d ON d.id = e.department_id`;

function mapIdentity(r: Record<string, unknown>): Identity {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    userId: Number(r.id),
    loginType: r.login_type === "microsoft" ? "microsoft" : "local",
    email: s(r.email),
    username: s(r.username),
    displayName: String(r.display_name ?? ""),
    role: s(r.role) ?? "employee",
    isActive: !!r.is_active,
    disabledReason: s(r.disabled_reason),
    mustChangePassword: !!r.must_change_password,
    employeeId: r.employee_id != null ? Number(r.employee_id) : null,
    employeeCode: s(r.employee_code),
    jobTitle: s(r.job_title),
    departmentCode: s(r.dept_code),
    departmentName: s(r.dept_name),
    employmentStatus: s(r.employment_status),
  };
}

// ── lookups ─────────────────────────────────────────────────────────────────
export async function getIdentityByEmail(email: string): Promise<Identity | null> {
  const r = await appPool().query(`${SELECT_IDENTITY} WHERE lower(u.email)=lower($1) LIMIT 1`, [email]);
  return r.rows[0] ? mapIdentity(r.rows[0]) : null;
}
export async function getIdentityByMicrosoftOid(oid: string): Promise<Identity | null> {
  const r = await appPool().query(`${SELECT_IDENTITY} WHERE u.microsoft_object_id=$1 LIMIT 1`, [oid]);
  return r.rows[0] ? mapIdentity(r.rows[0]) : null;
}
export async function getIdentityByUsername(username: string): Promise<Identity | null> {
  const r = await appPool().query(`${SELECT_IDENTITY} WHERE lower(u.username)=lower($1) LIMIT 1`, [username]);
  return r.rows[0] ? mapIdentity(r.rows[0]) : null;
}

// ── Microsoft login: find/link/auto-provision ────────────────────────────────
export async function ensureMicrosoftUser(input: { oid: string; email: string; name?: string | null }): Promise<Identity> {
  const pool = appPool();
  const email = (input.email ?? "").trim();
  const name = (input.name ?? email.split("@")[0]) || email;

  // 1) known by Microsoft object id
  const byOid = await pool.query(`SELECT id FROM app_users WHERE microsoft_object_id=$1 LIMIT 1`, [input.oid]);
  if (byOid.rows[0]) {
    await pool.query(`UPDATE app_users SET last_login_at=now(), last_seen_at=now(), updated_at=now() WHERE id=$1`, [byOid.rows[0].id]);
    return (await getIdentityByMicrosoftOid(input.oid))!;
  }
  // 2) known by email → attach the Microsoft object id
  if (email) {
    const byEmail = await pool.query(`SELECT id FROM app_users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
    if (byEmail.rows[0]) {
      await pool.query(
        `UPDATE app_users SET microsoft_object_id=COALESCE(microsoft_object_id,$2),
           last_login_at=now(), last_seen_at=now(), updated_at=now() WHERE id=$1`,
        [byEmail.rows[0].id, input.oid]);
      return (await getIdentityByEmail(email))!;
    }
  }
  // 3) auto-provision — match an active employee by work_email/email
  let employeeId: number | null = null;
  let role = "employee";
  if (email) {
    const emp = await pool.query(
      `SELECT id FROM hr_employees
       WHERE employment_status='active' AND (lower(work_email)=lower($1) OR lower(email)=lower($1))
       ORDER BY id LIMIT 1`, [email]);
    if (emp.rows[0]) employeeId = Number(emp.rows[0].id);
  }
  const ins = await pool.query(
    `INSERT INTO app_users (employee_id, login_type, microsoft_object_id, email, display_name, role,
        is_active, provisioned, last_login_at, last_seen_at)
     VALUES ($1,'microsoft',$2,$3,$4,$5,TRUE,TRUE,now(),now()) RETURNING id`,
    [employeeId, input.oid, email || null, name, role]);
  return (await getIdentityById(Number(ins.rows[0].id)))!;
}

export async function getIdentityById(id: number): Promise<Identity | null> {
  const r = await appPool().query(`${SELECT_IDENTITY} WHERE u.id=$1 LIMIT 1`, [id]);
  return r.rows[0] ? mapIdentity(r.rows[0]) : null;
}

// ── Local login verification (called by node internal route only) ─────────────
export type LocalVerifyResult =
  | { ok: true; identity: Identity }
  | { ok: false; reason: "not_found" | "disabled" | "bad_password" };

export async function verifyLocalCredentials(username: string, password: string): Promise<LocalVerifyResult> {
  const r = await appPool().query(`${SELECT_IDENTITY} WHERE lower(u.username)=lower($1) AND u.login_type='local' LIMIT 1`, [username]);
  const row = r.rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.is_active) return { ok: false, reason: "disabled" };
  if (!row.password_hash || !(await verifyPassword(password, row.password_hash))) return { ok: false, reason: "bad_password" };
  await appPool().query(`UPDATE app_users SET last_login_at=now(), last_seen_at=now(), updated_at=now() WHERE id=$1`, [row.id]);
  return { ok: true, identity: mapIdentity(row) };
}
