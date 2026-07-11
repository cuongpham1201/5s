-- Rollback 0003: drop model mới + KHÔI PHỤC five_s_areas theo đúng schema 0001.
-- (ban5s_app only — không đụng HRM/SharePoint.)
BEGIN;

DROP TABLE IF EXISTS area_assignment_changes      CASCADE;
DROP TABLE IF EXISTS department_area_assignments  CASCADE;
DROP TABLE IF EXISTS five_s_areas                 CASCADE;

-- Schema 0001 nguyên bản:
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

-- Khôi phục FK 0001 của các bảng tham chiếu:
ALTER TABLE department_responsibles
  ADD CONSTRAINT department_responsibles_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES five_s_areas(id);
ALTER TABLE teams_targets
  ADD CONSTRAINT teams_targets_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES five_s_areas(id);

COMMIT;
