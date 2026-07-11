-- 0004_area_configuration_versions.sql
-- P6: versioning cấu hình khu vực 5S (snapshot/compare/restore/export).
-- Snapshot dùng BUSINESS KEY (area_code/department_code/employee_code) — không
-- dùng raw DB id. Restore chỉ tác động five_s_areas + department_area_assignments.

BEGIN;

CREATE TABLE area_configuration_versions (
  id                        BIGSERIAL PRIMARY KEY,
  version_no                BIGINT      NOT NULL UNIQUE,
  name                      TEXT,
  description               TEXT,
  trigger_type              TEXT        NOT NULL DEFAULT 'manual'
                            CHECK (trigger_type IN ('manual','before_restore','before_bulk_change','migration','system')),
  areas_count               INT         NOT NULL,
  assignments_count         INT         NOT NULL,
  active_areas_count        INT         NOT NULL,
  operational_obligations_count INT     NOT NULL,
  snapshot_hash             TEXT        NOT NULL,
  snapshot_json             JSONB       NOT NULL,
  created_by_email          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored_from_version_id  BIGINT      REFERENCES area_configuration_versions(id),
  is_protected              BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_acv_created ON area_configuration_versions(created_at DESC);
CREATE INDEX idx_acv_hash    ON area_configuration_versions(snapshot_hash);

-- Mở rộng audit log cho versioning (entity 'version' + action mới).
ALTER TABLE area_assignment_changes DROP CONSTRAINT IF EXISTS area_assignment_changes_entity_type_check;
ALTER TABLE area_assignment_changes ADD CONSTRAINT area_assignment_changes_entity_type_check
  CHECK (entity_type IN ('area','assignment','version'));
ALTER TABLE area_assignment_changes DROP CONSTRAINT IF EXISTS area_assignment_changes_action_check;
ALTER TABLE area_assignment_changes ADD CONSTRAINT area_assignment_changes_action_check
  CHECK (action IN ('create','update','move','deactivate','reactivate','assign','unassign','bulk_assign','approve',
                    'snapshot','restore_preview','restore','export','protect'));

COMMIT;
