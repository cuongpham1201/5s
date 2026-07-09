/**
 * Admin management for the identity center (Phase 3). Node-only (pg).
 * Views: HRM employees, app users (all / unmapped / local / microsoft / disabled
 * / needs-review) + mutations (create local, disable/enable, reset password,
 * map/unmap employee, link/unlink Microsoft).
 */
import { appPool } from "@/lib/db/pg";
import { hashPassword, normalizeUsername } from "./identity-service";

export type UserView = "all" | "unmapped" | "local" | "microsoft" | "disabled" | "needs_review";

const USER_SELECT = `
  SELECT u.id, u.login_type, u.email, u.username, u.display_name, u.role, u.is_active,
         u.disabled_reason, u.must_change_password, u.provisioned, u.microsoft_object_id IS NOT NULL AS has_microsoft,
         u.employee_id, u.last_login_at, u.created_at,
         e.employee_code, e.full_name AS employee_name, e.employment_status,
         d.short_name AS dept_code, d.name AS dept_name
  FROM app_users u
  LEFT JOIN hr_employees e ON e.id = u.employee_id
  LEFT JOIN hr_departments d ON d.id = e.department_id`;

const VIEW_WHERE: Record<UserView, string> = {
  all: "TRUE",
  unmapped: "u.employee_id IS NULL",
  local: "u.login_type='local'",
  microsoft: "u.login_type='microsoft'",
  disabled: "u.is_active = FALSE",
  needs_review: "u.employee_id IS NULL",
};

export async function listAppUsers(view: UserView = "all", q = "", limit = 200): Promise<Record<string, unknown>[]> {
  const where = [VIEW_WHERE[view] ?? "TRUE"];
  const params: unknown[] = [];
  if (q.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where.push(`(lower(u.display_name) LIKE $${params.length} OR lower(coalesce(u.email,'')) LIKE $${params.length}
                OR lower(coalesce(u.username,'')) LIKE $${params.length} OR lower(coalesce(e.employee_code,'')) LIKE $${params.length})`);
  }
  params.push(Math.min(Math.max(limit, 1), 500));
  const r = await appPool().query(
    `${USER_SELECT} WHERE ${where.join(" AND ")} ORDER BY u.created_at DESC LIMIT $${params.length}`, params);
  return r.rows;
}

/** HRM employees + whether they already have an app_user (for "Unmapped"). */
export async function listEmployees(opts: { q?: string; status?: string; onlyUnmapped?: boolean; limit?: number } = {}): Promise<Record<string, unknown>[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) { params.push(opts.status); where.push(`e.employment_status=$${params.length}`); }
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(`(lower(e.full_name) LIKE $${params.length} OR lower(e.employee_code) LIKE $${params.length}
                OR lower(coalesce(e.work_email,'')) LIKE $${params.length})`);
  }
  if (opts.onlyUnmapped) where.push(`NOT EXISTS (SELECT 1 FROM app_users u WHERE u.employee_id=e.id)`);
  params.push(Math.min(Math.max(opts.limit ?? 300, 1), 800));
  const r = await appPool().query(
    `SELECT e.id, e.employee_code, e.full_name, e.job_title, e.work_email, e.email, e.employment_status,
            d.short_name AS dept_code, d.name AS dept_name,
            (SELECT count(*)::int FROM app_users u WHERE u.employee_id=e.id) AS account_count
     FROM hr_employees e
     LEFT JOIN hr_departments d ON d.id = e.department_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY e.full_name LIMIT $${params.length}`, params);
  return r.rows;
}

export async function createLocalAccount(input: {
  username: string; password: string; displayName: string; role?: string;
  employeeId?: number | null; createdBy?: string | null;
}): Promise<{ id: number }> {
  const username = normalizeUsername(input.username);
  if (!username) throw new Error("Tên đăng nhập không hợp lệ (3-32 ký tự: a-z 0-9 . _ -).");
  if ((input.password ?? "").length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự.");
  const dup = await appPool().query(`SELECT 1 FROM app_users WHERE lower(username)=lower($1) LIMIT 1`, [username]);
  if (dup.rows[0]) throw new Error("Tên đăng nhập đã tồn tại.");
  const hash = await hashPassword(input.password);
  const r = await appPool().query(
    `INSERT INTO app_users (employee_id, login_type, username, password_hash, password_algo,
        password_updated_at, must_change_password, display_name, role, is_active, created_by, last_seen_at)
     VALUES ($1,'local',$2,$3,'pbkdf2-sha256',now(),TRUE,$4,$5,TRUE,$6,now()) RETURNING id`,
    [input.employeeId ?? null, username, hash, input.displayName || username, input.role || "employee", input.createdBy ?? null]);
  return { id: Number(r.rows[0].id) };
}

export async function setUserActive(id: number, active: boolean, reason?: string | null): Promise<void> {
  await appPool().query(
    `UPDATE app_users SET is_active=$2, disabled_reason=$3, updated_at=now() WHERE id=$1`,
    [id, active, active ? null : (reason || "manual")]);
}

export async function resetPassword(id: number, newPassword: string, mustChange = true): Promise<void> {
  if ((newPassword ?? "").length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự.");
  const hash = await hashPassword(newPassword);
  const r = await appPool().query(
    `UPDATE app_users SET password_hash=$2, password_algo='pbkdf2-sha256', password_updated_at=now(),
       must_change_password=$3, updated_at=now() WHERE id=$1 AND login_type='local' RETURNING id`,
    [id, hash, mustChange]);
  if (!r.rows[0]) throw new Error("Chỉ đặt lại mật khẩu cho tài khoản nội bộ (local).");
}

export async function mapEmployee(id: number, employeeId: number): Promise<void> {
  const emp = await appPool().query(`SELECT 1 FROM hr_employees WHERE id=$1`, [employeeId]);
  if (!emp.rows[0]) throw new Error("Không tìm thấy nhân viên HRM.");
  await appPool().query(`UPDATE app_users SET employee_id=$2, updated_at=now() WHERE id=$1`, [id, employeeId]);
}
export async function unmapEmployee(id: number): Promise<void> {
  await appPool().query(`UPDATE app_users SET employee_id=NULL, updated_at=now() WHERE id=$1`, [id]);
}

export async function linkMicrosoft(id: number, oid: string): Promise<void> {
  if (!oid.trim()) throw new Error("Thiếu Microsoft object id.");
  const dup = await appPool().query(`SELECT 1 FROM app_users WHERE microsoft_object_id=$1 AND id<>$2 LIMIT 1`, [oid, id]);
  if (dup.rows[0]) throw new Error("Microsoft object id đã gắn cho tài khoản khác.");
  await appPool().query(`UPDATE app_users SET microsoft_object_id=$2, updated_at=now() WHERE id=$1`, [id, oid]);
}
export async function unlinkMicrosoft(id: number): Promise<void> {
  await appPool().query(`UPDATE app_users SET microsoft_object_id=NULL, updated_at=now() WHERE id=$1`, [id]);
}
