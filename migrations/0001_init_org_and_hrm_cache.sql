-- 0001_init_org_and_hrm_cache.sql
-- 5S business DB (ban5s_app) — Phase 1: org/employee cache from HRM + app users +
-- 5S mapping + sync bookkeeping. HRM is READ-ONLY upstream; nothing here writes to it.
--
-- KEY DESIGN: departments key on HRM organization_department.id (source_id), NOT on
-- code/short_name (HRM has duplicate/colliding code & short_name). code/short_name are
-- alias/display only. Never hard-delete synced rows — mark inactive/missing instead.

BEGIN;

-- ── Departments (cache of HRM organization_department, full tree) ──────────────
CREATE TABLE hr_departments (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT      NOT NULL UNIQUE,          -- organization_department.id (true key)
  hr_department_code     TEXT,                                 -- organization_department.code (NOT unique; display)
  short_name             TEXT,                                 -- organization_department.short_name (display/alias)
  name                   TEXT        NOT NULL,
  kind                   TEXT,                                 -- DIVISION | SECTION | TEAM
  parent_source_id       BIGINT,                               -- organization_department.parent_id
  parent_id              BIGINT      REFERENCES hr_departments(id),
  level                  INT,
  manager_employee_code  TEXT,                                 -- resolved from head_id (sparse in HRM)
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  source_hash            TEXT        NOT NULL,
  source_updated_at      TIMESTAMPTZ,
  last_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_departments_parent_source ON hr_departments(parent_source_id);
CREATE INDEX idx_hr_departments_short_name     ON hr_departments(short_name);
CREATE INDEX idx_hr_departments_active         ON hr_departments(is_active);

-- ── Employees (cache of HRM employees_employee; NO sensitive/salary columns) ────
CREATE TABLE hr_employees (
  id                     BIGSERIAL PRIMARY KEY,
  source_id              BIGINT      UNIQUE,                    -- employees_employee.id
  employee_code          TEXT        NOT NULL UNIQUE,          -- emp_code
  full_name              TEXT        NOT NULL,
  department_source_id   BIGINT,                               -- division_id (5S-level department)
  department_id          BIGINT      REFERENCES hr_departments(id),
  sub_unit_source_id     BIGINT,                               -- department_id/sub_unit_id (leaf)
  job_title              TEXT,
  position_code          TEXT,
  manager_employee_code  TEXT,
  work_email             TEXT,
  email                  TEXT,                                 -- personal/fallback (matching only)
  phone                  TEXT,
  employment_status      TEXT        NOT NULL DEFAULT 'unknown', -- active|resigned|suspended|unknown|missing
  join_date              DATE,
  resign_date            DATE,
  source_hash            TEXT        NOT NULL,
  source_updated_at      TIMESTAMPTZ,
  last_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_employees_department       ON hr_employees(department_id);
CREATE INDEX idx_hr_employees_dept_source      ON hr_employees(department_source_id);
CREATE INDEX idx_hr_employees_status           ON hr_employees(employment_status);
CREATE INDEX idx_hr_employees_work_email       ON hr_employees(lower(work_email));
CREATE INDEX idx_hr_employees_email            ON hr_employees(lower(email));

-- ── App users (login accounts: microsoft SSO or admin-created local) ────────────
CREATE TABLE app_users (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         BIGINT      REFERENCES hr_employees(id),
  login_type          TEXT        NOT NULL CHECK (login_type IN ('microsoft','local')),
  microsoft_object_id TEXT        UNIQUE,
  email               TEXT,
  username            TEXT        UNIQUE,
  password_hash       TEXT,
  display_name        TEXT        NOT NULL,
  role                TEXT        NOT NULL DEFAULT 'employee',
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  disabled_reason     TEXT,                                    -- manual|resigned|suspended|missing
  last_login_at       TIMESTAMPTZ,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_users_employee ON app_users(employee_id);
CREATE INDEX idx_app_users_email    ON app_users(lower(email));

-- ── Department aliases (O365/legacy/manual names → canonical HRM department) ─────
CREATE TABLE department_aliases (
  id            BIGSERIAL PRIMARY KEY,
  alias_code    TEXT,
  alias_name    TEXT        NOT NULL,
  department_id BIGINT      NOT NULL REFERENCES hr_departments(id),
  source        TEXT        NOT NULL CHECK (source IN ('o365','manual','legacy','import')),
  confidence    NUMERIC,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_department_aliases_dept  ON department_aliases(department_id);
CREATE INDEX idx_department_aliases_code  ON department_aliases(lower(alias_code));
CREATE INDEX idx_department_aliases_name  ON department_aliases(lower(alias_name));
-- One alias row per (department, source, alias_code) — lets sync upsert idempotently.
CREATE UNIQUE INDEX uq_department_aliases ON department_aliases(department_id, source, lower(coalesce(alias_code,'')));

-- ── 5S areas (5S-managed; owner department + default responsible) ───────────────
CREATE TABLE five_s_areas (
  id                              BIGSERIAL PRIMARY KEY,
  area_code                       TEXT        NOT NULL UNIQUE,
  area_name                       TEXT        NOT NULL,
  location                        TEXT,
  department_owner_id             BIGINT      REFERENCES hr_departments(id),
  default_responsible_employee_id BIGINT      REFERENCES hr_employees(id),
  is_active                       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Department responsibles (5S-managed; owner/deputy/coordinator/safety/manager)─
CREATE TABLE department_responsibles (
  id                 BIGSERIAL PRIMARY KEY,
  department_id      BIGINT      NOT NULL REFERENCES hr_departments(id),
  area_id            BIGINT      REFERENCES five_s_areas(id),
  employee_id        BIGINT      NOT NULL REFERENCES hr_employees(id),
  responsibility_type TEXT       NOT NULL CHECK (responsibility_type IN ('owner','deputy','five_s_coordinator','safety','manager')),
  priority           INT         NOT NULL DEFAULT 0,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dept_responsibles_dept ON department_responsibles(department_id);
CREATE INDEX idx_dept_responsibles_area ON department_responsibles(area_id);

-- ── Teams / Group 365 notification targets ──────────────────────────────────────
CREATE TABLE teams_targets (
  id            BIGSERIAL PRIMARY KEY,
  target_type   TEXT        NOT NULL CHECK (target_type IN ('department','area','violation_type','global')),
  department_id BIGINT      REFERENCES hr_departments(id),
  area_id       BIGINT      REFERENCES five_s_areas(id),
  violation_tag TEXT,
  team_id       TEXT,
  channel_id    TEXT,
  chat_id       TEXT,
  group_email   TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Sync bookkeeping ────────────────────────────────────────────────────────────
CREATE TABLE sync_jobs (
  id                 BIGSERIAL PRIMARY KEY,
  source             TEXT        NOT NULL CHECK (source IN ('hrm','o365')),
  job_type           TEXT        NOT NULL CHECK (job_type IN ('departments','employees','full')),
  status             TEXT        NOT NULL CHECK (status IN ('running','success','failed')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  total_read         INT         NOT NULL DEFAULT 0,
  created_count      INT         NOT NULL DEFAULT 0,
  updated_count      INT         NOT NULL DEFAULT 0,
  deactivated_count  INT         NOT NULL DEFAULT 0,
  error_message      TEXT
);
CREATE INDEX idx_sync_jobs_started ON sync_jobs(started_at DESC);

CREATE TABLE sync_changes (
  id             BIGSERIAL PRIMARY KEY,
  sync_job_id    BIGINT      NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  entity_type    TEXT        NOT NULL CHECK (entity_type IN ('employee','department','user','alias')),
  entity_code    TEXT,
  change_type    TEXT        NOT NULL CHECK (change_type IN ('create','update','deactivate','transfer','resign','missing','reactivate')),
  old_value_json JSONB,
  new_value_json JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_changes_job    ON sync_changes(sync_job_id);
CREATE INDEX idx_sync_changes_entity ON sync_changes(entity_type, entity_code);

COMMIT;
