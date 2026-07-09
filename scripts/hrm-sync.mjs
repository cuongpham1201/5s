// HRM → ban5s_app sync (Phase 1). Reads HRM READ-ONLY, upserts the cache tables,
// records sync_jobs + sync_changes. NEVER deletes: gone-from-HRM rows are marked
// missing/inactive; resigned/suspended/missing employees disable their app_users
// (unless disabled_reason='manual'); reactivation never auto-enables a manual disable.
//
//   node scripts/hrm-sync.mjs full         (departments then employees)
//   node scripts/hrm-sync.mjs departments
//   node scripts/hrm-sync.mjs employees
import { appPool, hrmPool, closePools, sourceHash } from "./lib-db.mjs";

const jobType = process.argv[2] ?? "full";

function mapStatus(s) {
  const v = (s ?? "").toUpperCase();
  if (v === "ACTIVE") return "active";
  if (v === "LEFT" || v === "RESIGNED") return "resigned";
  if (v === "SUSPEND" || v === "SUSPENDED") return "suspended";
  return "unknown";
}

async function logChange(app, jobId, entityType, code, changeType, oldVal, newVal) {
  await app.query(
    `INSERT INTO sync_changes(sync_job_id, entity_type, entity_code, change_type, old_value_json, new_value_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [jobId, entityType, code ?? null, changeType, oldVal ? JSON.stringify(oldVal) : null, newVal ? JSON.stringify(newVal) : null],
  );
}

// ─────────────────────────── Departments ───────────────────────────
async function syncDepartments(app, hrm, jobId, counts) {
  const src = await hrm.query(`
    SELECT d.id, d.code, d.short_name, d.name, d.kind, d.parent_id,
           he.emp_code AS head_emp_code, d.updated_at
    FROM organization_department d
    LEFT JOIN employees_employee he ON he.id = d.head_id
  `);
  counts.total_read += src.rowCount;

  const existing = new Map();
  for (const r of (await app.query(`SELECT source_id, source_hash, is_active FROM hr_departments`)).rows) {
    existing.set(String(r.source_id), r);
  }
  const seen = new Set();

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
      await app.query(
        `INSERT INTO hr_departments
           (source_id, hr_department_code, short_name, name, kind, parent_source_id,
            manager_employee_code, is_active, source_hash, source_updated_at, last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,now())`,
        [mapped.source_id, mapped.hr_department_code, mapped.short_name, mapped.name, mapped.kind,
         mapped.parent_source_id, mapped.manager_employee_code, hash, d.updated_at],
      );
      counts.created_count++;
      await logChange(app, jobId, "department", mapped.short_name ?? String(d.id), "create", null, mapped);
    } else if (prev.source_hash !== hash || !prev.is_active) {
      await app.query(
        `UPDATE hr_departments SET hr_department_code=$2, short_name=$3, name=$4, kind=$5,
           parent_source_id=$6, manager_employee_code=$7, is_active=TRUE, source_hash=$8,
           source_updated_at=$9, last_synced_at=now(), updated_at=now()
         WHERE source_id=$1`,
        [mapped.source_id, mapped.hr_department_code, mapped.short_name, mapped.name, mapped.kind,
         mapped.parent_source_id, mapped.manager_employee_code, hash, d.updated_at],
      );
      counts.updated_count++;
      await logChange(app, jobId, "department", mapped.short_name ?? String(d.id),
        !prev.is_active ? "reactivate" : "update", { source_hash: prev.source_hash }, mapped);
    } else {
      await app.query(`UPDATE hr_departments SET last_synced_at=now() WHERE source_id=$1`, [d.id]);
    }
  }

  // Resolve self-referential parent_id from parent_source_id.
  await app.query(`
    UPDATE hr_departments c
    SET parent_id = p.id
    FROM hr_departments p
    WHERE c.parent_source_id = p.source_id AND c.parent_id IS DISTINCT FROM p.id
  `);

  // Seed short_name aliases (source='import') so O365/legacy resolution has anchors.
  await app.query(`
    INSERT INTO department_aliases (alias_code, alias_name, department_id, source, confidence, is_active)
    SELECT short_name, name, id, 'import', CASE WHEN kind='DIVISION' THEN 1.0 ELSE 0.5 END, TRUE
    FROM hr_departments WHERE short_name IS NOT NULL AND short_name <> ''
    ON CONFLICT (department_id, source, lower(coalesce(alias_code,''))) DO UPDATE
      SET alias_name = EXCLUDED.alias_name, is_active = TRUE, updated_at = now()
  `);

  // Mark missing (in cache, gone from HRM) — never delete.
  for (const [sid, prev] of existing) {
    if (!seen.has(sid) && prev.is_active) {
      await app.query(`UPDATE hr_departments SET is_active=FALSE, last_synced_at=now(), updated_at=now() WHERE source_id=$1`, [sid]);
      counts.deactivated_count++;
      await logChange(app, jobId, "department", sid, "missing", { source_id: sid }, null);
    }
  }
}

// ─────────────────────────── Employees ───────────────────────────
async function syncEmployees(app, hrm, jobId, counts) {
  const src = await hrm.query(`
    SELECT id, emp_code, full_name, division_id, department_id, sub_unit_id,
           job_title, position_code, work_email, email, zalo_phone,
           status, join_date, leave_date, updated_at
    FROM employees_employee
  `);
  counts.total_read += src.rowCount;

  const existing = new Map();
  for (const r of (await app.query(
    `SELECT employee_code, source_hash, employment_status, department_source_id FROM hr_employees`)).rows) {
    existing.set(r.employee_code, r);
  }
  const seen = new Set();

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
      await app.query(
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
      await logChange(app, jobId, "employee", e.emp_code, "create", null, mapped);
    } else if (prev.source_hash !== hash) {
      await app.query(
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
      await logChange(app, jobId, "employee", e.emp_code, changeType,
        { employment_status: prev.employment_status, department_source_id: prev.department_source_id }, mapped);
    } else {
      await app.query(`UPDATE hr_employees SET last_synced_at=now() WHERE employee_code=$1`, [e.emp_code]);
    }

    // Lock app_users for non-working employees (respect manual disables).
    if (status === "resigned" || status === "suspended") {
      const r = await app.query(
        `UPDATE app_users u SET is_active=FALSE, disabled_reason=$2, updated_at=now()
         FROM hr_employees emp
         WHERE u.employee_id=emp.id AND emp.employee_code=$1
           AND u.is_active=TRUE AND (u.disabled_reason IS NULL OR u.disabled_reason <> 'manual')
         RETURNING u.id`,
        [e.emp_code, status],
      );
      for (const _ of r.rows) await logChange(app, jobId, "user", e.emp_code, "deactivate", null, { reason: status });
    }
  }

  // Mark missing employees + lock their (non-manual) app_users.
  for (const [code, prev] of existing) {
    if (!seen.has(code) && prev.employment_status !== "missing") {
      await app.query(
        `UPDATE hr_employees SET employment_status='missing', last_synced_at=now(), updated_at=now() WHERE employee_code=$1`,
        [code]);
      counts.deactivated_count++;
      await logChange(app, jobId, "employee", code, "missing", { employment_status: prev.employment_status }, null);
      await app.query(
        `UPDATE app_users u SET is_active=FALSE, disabled_reason='missing', updated_at=now()
         FROM hr_employees emp
         WHERE u.employee_id=emp.id AND emp.employee_code=$1
           AND u.is_active=TRUE AND (u.disabled_reason IS NULL OR u.disabled_reason <> 'manual')`,
        [code]);
    }
  }
}

// ─────────────────────────── Job runner ───────────────────────────
async function run() {
  const app = appPool();
  const hrm = hrmPool();
  const counts = { total_read: 0, created_count: 0, updated_count: 0, deactivated_count: 0 };

  const jobRow = await app.query(
    `INSERT INTO sync_jobs(source, job_type, status) VALUES ('hrm',$1,'running') RETURNING id`, [jobType]);
  const jobId = jobRow.rows[0].id;

  const client = await app.connect();
  try {
    await client.query("BEGIN");
    if (jobType === "departments" || jobType === "full") await syncDepartments(client, hrm, jobId, counts);
    if (jobType === "employees" || jobType === "full") await syncEmployees(client, hrm, jobId, counts);
    await client.query("COMMIT");
    await app.query(
      `UPDATE sync_jobs SET status='success', finished_at=now(),
         total_read=$2, created_count=$3, updated_count=$4, deactivated_count=$5 WHERE id=$1`,
      [jobId, counts.total_read, counts.created_count, counts.updated_count, counts.deactivated_count]);
    console.log(`✓ HRM sync '${jobType}' OK (job ${jobId}):`, counts);
  } catch (e) {
    await client.query("ROLLBACK");
    await app.query(`UPDATE sync_jobs SET status='failed', finished_at=now(), error_message=$2 WHERE id=$1`,
      [jobId, e.message]);
    throw e;
  } finally {
    client.release();
  }
}

run()
  .then(closePools)
  .catch(async (e) => { console.error("HRM sync lỗi:", e.message); await closePools(); process.exit(1); });
