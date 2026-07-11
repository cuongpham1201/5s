-- 0003_area_redesign.sql
-- REDESIGN khu vực 5S (P1): tách DANH MỤC CÂY (five_s_areas) khỏi ASSIGNMENT
-- phòng ban (department_area_assignments) + audit log (area_assignment_changes).
--
-- Q1: five_s_areas cũ (schema 0001) RỖNG + chưa được runtime dùng → drop/recreate.
-- Q3: department_id FK HRM để NULLABLE — vận hành bằng department_code (mã 5S)
--     tới khi cutover phòng ban; re-map department_id sau KHÔNG tạo assignment mới.
-- Q7: cây N cấp qua parent_id; cycle chặn ở service. Parent/child KHÔNG mang
--     phòng ban — mọi quan hệ phòng↔khu là bản ghi assignment tường minh.

BEGIN;

-- ── Rebuild danh mục khu vực (CHỈ cấu trúc vật lý — không phòng ban) ─────────
DROP TABLE IF EXISTS five_s_areas CASCADE;

CREATE TABLE five_s_areas (
  id                  BIGSERIAL PRIMARY KEY,
  area_code           TEXT        NOT NULL UNIQUE,
  area_name           TEXT        NOT NULL,
  parent_id           BIGINT      REFERENCES five_s_areas(id),
  -- group: nhóm/cây, không tính KPI · location: khu vật lý · capture_point: điểm phải chụp
  area_type           TEXT        NOT NULL DEFAULT 'capture_point'
                      CHECK (area_type IN ('group','location','capture_point')),
  -- NGUỒN QUYẾT ĐỊNH KPI (không suy luận "leaf = phải chụp").
  is_capture_required BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order          INT         NOT NULL DEFAULT 0,
  description         TEXT,
  location_note       TEXT,
  source              TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','migrated')),
  legacy_sp_id        TEXT,                       -- SharePoint item id khi migrate (P2)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          TEXT,
  updated_by          TEXT
);
CREATE INDEX idx_fsa_parent  ON five_s_areas(parent_id);
CREATE INDEX idx_fsa_active  ON five_s_areas(is_active);

-- ── Assignment phòng ban ↔ khu vực (many-to-many TƯỜNG MINH) ─────────────────
CREATE TABLE department_area_assignments (
  id                      BIGSERIAL PRIMARY KEY,
  department_code         TEXT        NOT NULL,   -- mã 5S vận hành hiện hành
  department_id           BIGINT      REFERENCES hr_departments(id), -- NULL tới khi map HRM (Q3)
  area_id                 BIGINT      NOT NULL REFERENCES five_s_areas(id),
  assignment_type         TEXT        NOT NULL DEFAULT 'owner'
                          CHECK (assignment_type IN ('owner','participant','shared')),
  is_required             BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  effective_from          DATE,
  effective_to            DATE,
  responsible_employee_id BIGINT      REFERENCES hr_employees(id),
  -- nguồn gốc bản ghi (phục vụ màn review migration P2):
  source                  TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual','migrated_direct','migrated_bulk_csv','migrated_inherited')),
  review_status           TEXT        NOT NULL DEFAULT 'approved'
                          CHECK (review_status IN ('approved','pending_review')),
  -- Q4: mã phòng không resolve được (mã rác/alias chưa gộp) → KHÔNG vận hành,
  -- KHÔNG picker, KHÔNG KPI; giữ lại để không mất dấu dữ liệu nguồn.
  unresolved_department   BOOLEAN     NOT NULL DEFAULT FALSE,
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              TEXT,
  updated_by              TEXT,
  UNIQUE (department_code, area_id, assignment_type)   -- chống duplicate
);
CREATE INDEX idx_daa_area ON department_area_assignments(area_id);
CREATE INDEX idx_daa_dept ON department_area_assignments(department_code, is_active);

-- ── Audit log mọi mutation area/assignment ──────────────────────────────────
CREATE TABLE area_assignment_changes (
  id             BIGSERIAL PRIMARY KEY,
  entity_type    TEXT        NOT NULL CHECK (entity_type IN ('area','assignment')),
  entity_id      BIGINT      NOT NULL,
  action         TEXT        NOT NULL CHECK (action IN
                   ('create','update','move','deactivate','reactivate','assign','unassign','bulk_assign','approve')),
  old_value_json JSONB,
  new_value_json JSONB,
  actor_email    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_aac_entity ON area_assignment_changes(entity_type, entity_id);
CREATE INDEX idx_aac_time   ON area_assignment_changes(created_at DESC);

-- ── Re-attach FK của các bảng 0001 tham chiếu five_s_areas (bị rơi do CASCADE) ─
-- Cả 2 bảng đang rỗng nên ADD CONSTRAINT an toàn.
ALTER TABLE department_responsibles
  ADD CONSTRAINT department_responsibles_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES five_s_areas(id);
ALTER TABLE teams_targets
  ADD CONSTRAINT teams_targets_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES five_s_areas(id);

COMMIT;
