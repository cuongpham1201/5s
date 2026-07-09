/**
 * HRM → ban5s_app sync service (P2). Canonical TS implementation used by the
 * admin API (the scripts/*.mjs CLI mirrors this for ops/cron until wired).
 *
 * Reads HRM READ-ONLY (hrmPool), writes only to ban5s_app inside a transaction,
 * records sync_jobs + sync_changes. NEVER deletes: gone-from-HRM rows are marked
 * missing/inactive; resigned/suspended/missing employees disable their app_users
 * (unless disabled_reason='manual'); reactivation never auto-enables a manual disable.
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { appPool, hrmPool } from "@/lib/db/pg";

export type SyncJobType = "full" | "departments" | "employees";

export interface SyncCounts {
  total_read: number;
  created_count: number;
  updated_count: number;
  deactivated_count: number;
}

export interface SyncRunResult extends SyncCounts {
  jobId: number;
  jobType: SyncJobType;
  status: "success";
}

function mapStatus(s: string | null): string {
  const v = (s ?? "").toUpperCase();
  if (v === "ACTIVE") return "active";
  if (v === "LEFT" || v === "RESIGNED") return "resigned";
  if (v === "SUSPEND" || v === "SUSPENDED") return "suspended";
  return "unknown";
}

function sourceHash(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 32);
}

async function logChange(
  client: PoolClient,
  jobId: number,
  entityType: string,
  code: string | null,
  changeType: string,
  oldVal: unknown,
  newVal: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO sync_changes(sync_job_id, entity_type, entity_code, change_type, old_value_json, new_value_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [jobId, entityType, code, changeType, oldVal ? JSON.stringify(oldVal) : null, newVal ? JSON.stringify(newVal) : null],
  );
}

// ─────────────────────────── Departments ───────────────────────────
async function syncDepartments(client: PoolClient, jobId: number, counts: SyncCounts): Promise<void> {
  const src = await hrmPool().query(`
    SELECT d.id, d.code, d.short_name, d.name, d.kind, d.parent_id,
           he.emp_code AS head_emp_code, d.updated_at
    FROM organization_department d
    LEFT JOIN employees_employee he ON he.id = d.head_id
  `);
  counts.total_read += src.rowCount ?? 0;

  const existing = new Map<string, { source_hash: string; is_active: boolean }>();
  for (const r of (await client.query(`SELECT source_id, source_hash, is_active FROM hr_departments`)).rows) {
    existing.set(String(r.source_id), { source_hash: r.source_hash, is_active: r.is_active });
  }
  const seen = new Set<string>();

  for (const d of src.rows) {
    seen.add(String(d.id));
    const mapped = {
      source_id: d.id,
      hr_department_code: d.code ?? null,
      short_name: d.short_name || null,
      name: d.name,
      kind: d.kind || null,
      parent_source_id: d.parent_id ?? null,
      manager_employee_code: d.head_emp_code || null,
    };
    const hash = sourceHash(mapped);
    const prev = existing.get(String(d.id));
    if (!prev) {
      await client.query(
        `INSERT INTO hr_departments
           (source_id, hr_department_code, short_name, name, kind, parent_source_id,
            manager_employee_code, is_active, source_hash, source_updated_at, last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,now())`,
        [mapped.source_id, mapped.hr_department_code, mapped.short_name, mapped.name, mapped.kind,
         mapped.parent_source_id, mapped.manager_employee_code, hash, d.updated_at],
      );
      counts.created_count++;
      await logChange(client, jobId, "department", mapped.short_name ?? String(d.id), "create", null, mapped);
    } else if (prev.source_hash !== hash || !prev.is_active) {
      await client.query(
        `UPDATE hr_departments SET hr_department_code=$2, short_name=$3, name=$4, kind=$5,
           parent_source_id=$6, manager_employee_code=$7, is_active=TRUE, source_hash=$8,
           source_updated_at=$9, last_synced_at=now(), updated_at=now()
         WHERE source_id=$1`,
        [mapped.source_id, mapped.hr_department_code, mapped.short_name, mapped.name, mapped.kind,
         mapped.parent_source_id, mapped.manager_employee_code, hash, d.updated_at],
      );
      counts.updated_count++;
      await logChange(client, jobId, "department", mapped.short_name ?? String(d.id),
        !prev.is_active ? "reactivate" : "update", { source_hash: prev.source_hash }, mapped);
    } else {
      await client.query(`UPDATE hr_departments SET last_synced_at=now() WHERE source_id=$1`, [d.id]);
    }
  }

  await client.query(`
    UPDATE hr_departments c SET parent_id = p.id
    FROM hr_departments p
    WHERE c.parent_source_id = p.source_id AND c.parent_id IS DISTINCT FROM p.id
  `);

  await client.query(`
    INSERT INTO department_aliases (alias_code, alias_name, department_id, source, confidence, is_active)
    SELECT short_name, name, id, 'import', CASE WHEN kind='DIVISION' THEN 1.0 ELSE 0.5 END, TRUE
    FROM hr_departments WHERE short_name IS NOT NULL AND short_name <> ''
    ON CONFLICT (department_id, source, lower(coalesce(alias_code,''))) DO UPDATE
      SET alias_name = EXCLUDED.alias_name, is_active = TRUE, updated_at = now()
  `);

  for (const [sid, prev] of existing) {
    if (!seen.has(sid) && prev.is_active) {
      await client.query(`UPDATE hr_departments SET is_active=FALSE, last_synced_at=now(), updated_at=now() WHERE source_id=$1`, [sid]);
      counts.deactivated_count++;
      await logChange(client, jobId, "department", sid, "missing", { source_id: sid }, null);
    }
  }
}

// ─────────────────────────── Employees ───────────────────────────
async function syncEmployees(client: PoolClient, jobId: number, counts: SyncCounts): Promise<void> {
  const src = await hrmPool().query(`
    SELECT id, emp_code, full_name, division_id, department_id, sub_unit_id,
           job_title, position_code, work_email, email, zalo_phone,
           status, join_date, leave_date, updated_at
    FROM employees_employee
  `);
  counts.total_read += src.rowCount ?? 0;

  const existing = new Map<string, { source_hash: string; employment_status: string; department_source_id: string | null }>();
  for (const r of (await client.query(
    `SELECT employee_code, source_hash, employment_status, department_source_id FROM hr_employees`)).rows) {
    existing.set(r.employee_code, {
      source_hash: r.source_hash,
      employment_status: r.employment_status,
      department_source_id: r.department_source_id != null ? String(r.department_source_id) : null,
    });
  }
  const seen = new Set<string>();

  for (const e of src.rows) {
    seen.add(e.emp_code);
    const status = mapStatus(e.status);
    const mapped = {
      source_id: e.id,
      employee_code: e.emp_code,
      full_name: e.full_name,
      department_source_id: e.division_id ?? null,
      sub_unit_source_id: e.sub_unit_id ?? e.department_id ?? null,
      job_title: e.job_title || null,
      position_code: e.position_code || null,
      work_email: e.work_email || null,
      email: e.email || null,
      phone: e.zalo_phone || null,
      employment_status: status,
      join_date: e.join_date ?? null,
      resign_date: e.leave_date ?? null,
    };
    const hash = sourceHash(mapped);
    const prev = existing.get(e.emp_code);

    if (!prev) {
      await client.query(
        `INSERT INTO hr_employees
           (source_id, employee_code, full_name, department_source_id,
            department_id, sub_unit_source_id, job_title, position_code, work_email, email, phone,
            employment_status, join_date, resign_date, source_hash, source_updated_at, last_synced_at)
         VALUES ($1,$2,$3,$4,
            (SELECT id FROM hr_departments WHERE source_id=$4),
            $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())`,
        [mapped.source_id, mapped.employee_code, mapped.full_name, mapped.department_source_id,
         mapped.sub_unit_source_id, mapped.job_title, mapped.position_code, mapped.work_email,
         mapped.email, mapped.phone, mapped.employment_status, mapped.join_date, mapped.resign_date, hash, e.updated_at],
      );
      counts.created_count++;
      await logChange(client, jobId, "employee", e.emp_code, "create", null, mapped);
    } else if (prev.source_hash !== hash) {
      await client.query(
        `UPDATE hr_employees SET source_id=$1, full_name=$3, department_source_id=$4,
           department_id=(SELECT id FROM hr_departments WHERE source_id=$4),
           sub_unit_source_id=$5, job_title=$6, position_code=$7, work_email=$8, email=$9, phone=$10,
           employment_status=$11, join_date=$12, resign_date=$13, source_hash=$14,
           source_updated_at=$15, last_synced_at=now(), updated_at=now()
         WHERE employee_code=$2`,
        [mapped.source_id, mapped.employee_code, mapped.full_name, mapped.department_source_id,
         mapped.sub_unit_source_id, mapped.job_title, mapped.position_code, mapped.work_email,
         mapped.email, mapped.phone, mapped.employment_status, mapped.join_date, mapped.resign_date, hash, e.updated_at],
      );
      counts.updated_count++;
      const transferred = String(prev.department_source_id ?? "") !== String(mapped.department_source_id ?? "");
      const resigned = prev.employment_status === "active" && status === "resigned";
      const changeType = resigned ? "resign" : transferred ? "transfer" : "update";
      await logChange(client, jobId, "employee", e.emp_code, changeType,
        { employment_status: prev.employment_status, department_source_id: prev.department_source_id }, mapped);
    } else {
      await client.query(`UPDATE hr_employees SET last_synced_at=now() WHERE employee_code=$1`, [e.emp_code]);
    }

    if (status === "resigned" || status === "suspended") {
      const r = await client.query(
        `UPDATE app_users u SET is_active=FALSE, disabled_reason=$2, updated_at=now()
         FROM hr_employees emp
         WHERE u.employee_id=emp.id AND emp.employee_code=$1
           AND u.is_active=TRUE AND (u.disabled_reason IS NULL OR u.disabled_reason <> 'manual')
         RETURNING u.id`,
        [e.emp_code, status],
      );
      for (const _row of r.rows) await logChange(client, jobId, "user", e.emp_code, "deactivate", null, { reason: status });
    }
  }

  for (const [code, prev] of existing) {
    if (!seen.has(code) && prev.employment_status !== "missing") {
      await client.query(
        `UPDATE hr_employees SET employment_status='missing', last_synced_at=now(), updated_at=now() WHERE employee_code=$1`,
        [code]);
      counts.deactivated_count++;
      await logChange(client, jobId, "employee", code, "missing", { employment_status: prev.employment_status }, null);
      await client.query(
        `UPDATE app_users u SET is_active=FALSE, disabled_reason='missing', updated_at=now()
         FROM hr_employees emp
         WHERE u.employee_id=emp.id AND emp.employee_code=$1
           AND u.is_active=TRUE AND (u.disabled_reason IS NULL OR u.disabled_reason <> 'manual')`,
        [code]);
    }
  }
}

/** Run a sync job (full/departments/employees). Returns counts + jobId. */
export async function runHrmSync(jobType: SyncJobType): Promise<SyncRunResult> {
  const pool = appPool();
  const counts: SyncCounts = { total_read: 0, created_count: 0, updated_count: 0, deactivated_count: 0 };
  const jobRow = await pool.query(
    `INSERT INTO sync_jobs(source, job_type, status) VALUES ('hrm',$1,'running') RETURNING id`, [jobType]);
  const jobId = Number(jobRow.rows[0].id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (jobType === "departments" || jobType === "full") await syncDepartments(client, jobId, counts);
    if (jobType === "employees" || jobType === "full") await syncEmployees(client, jobId, counts);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    await pool.query(`UPDATE sync_jobs SET status='failed', finished_at=now(), error_message=$2 WHERE id=$1`,
      [jobId, (e as Error).message]);
    client.release();
    throw e;
  }
  client.release();
  await pool.query(
    `UPDATE sync_jobs SET status='success', finished_at=now(),
       total_read=$2, created_count=$3, updated_count=$4, deactivated_count=$5 WHERE id=$1`,
    [jobId, counts.total_read, counts.created_count, counts.updated_count, counts.deactivated_count]);
  return { jobId, jobType, status: "success", ...counts };
}

// ─────────────────────────── Read helpers (status/jobs/changes) ───────────────
export interface SyncStatus {
  lastFullSync: { id: number; started_at: string; finished_at: string | null; status: string } | null;
  lastAnySync: { id: number; job_type: string; started_at: string; status: string } | null;
  departments: { total: number; active: number };
  employees: { total: number; active: number; resigned: number; suspended: number; missing: number; unknown: number };
  aliases: number;
  appUsers: { total: number; active: number };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const pool = appPool();
  const [full, any, dept, emp, alias, users] = await Promise.all([
    pool.query(`SELECT id, started_at, finished_at, status FROM sync_jobs WHERE job_type='full' AND status='success' ORDER BY id DESC LIMIT 1`),
    pool.query(`SELECT id, job_type, started_at, status FROM sync_jobs ORDER BY id DESC LIMIT 1`),
    pool.query(`SELECT count(*)::int total, count(*) FILTER (WHERE is_active)::int active FROM hr_departments`),
    pool.query(`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE employment_status='active')::int active,
        count(*) FILTER (WHERE employment_status='resigned')::int resigned,
        count(*) FILTER (WHERE employment_status='suspended')::int suspended,
        count(*) FILTER (WHERE employment_status='missing')::int missing,
        count(*) FILTER (WHERE employment_status='unknown')::int unknown
      FROM hr_employees`),
    pool.query(`SELECT count(*)::int n FROM department_aliases WHERE is_active`),
    pool.query(`SELECT count(*)::int total, count(*) FILTER (WHERE is_active)::int active FROM app_users`),
  ]);
  return {
    lastFullSync: full.rows[0] ?? null,
    lastAnySync: any.rows[0] ?? null,
    departments: dept.rows[0],
    employees: emp.rows[0],
    aliases: alias.rows[0].n,
    appUsers: users.rows[0],
  };
}

export async function listSyncJobs(limit = 20): Promise<Record<string, unknown>[]> {
  const r = await appPool().query(
    `SELECT id, source, job_type, status, started_at, finished_at,
            total_read, created_count, updated_count, deactivated_count, error_message
     FROM sync_jobs ORDER BY id DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 100)]);
  return r.rows;
}

export async function listSyncChanges(limit = 50): Promise<Record<string, unknown>[]> {
  const r = await appPool().query(
    `SELECT id, sync_job_id, entity_type, entity_code, change_type, created_at
     FROM sync_changes ORDER BY id DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 200)]);
  return r.rows;
}
