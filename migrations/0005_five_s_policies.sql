-- 0005_five_s_policies.sql
-- P7: POLICY ENGINE — quy tắc vận hành 5S cấu hình được (capture/daily/audit/
-- violation/notification). App KHÔNG đọc bảng này trực tiếp — chỉ qua resolver
-- (resolveXxxPolicy) với fallback = hành vi hiện tại khi chưa khai báo.
-- P7 CHƯA chuyển Daily/Audit sang policy — thuần hạ tầng + admin.

BEGIN;

CREATE TABLE five_s_policies (
  id             BIGSERIAL PRIMARY KEY,
  policy_type    TEXT        NOT NULL
                 CHECK (policy_type IN ('capture','daily','audit','violation','notification')),
  policy_name    TEXT        NOT NULL,
  description    TEXT,
  effective_from DATE,                        -- NULL = hiệu lực ngay
  effective_to   DATE,                        -- NULL = vô thời hạn
  priority       INT         NOT NULL DEFAULT 0,  -- cao hơn thắng
  enabled        BOOLEAN     NOT NULL DEFAULT FALSE, -- tạo mới mặc định TẮT (an toàn)
  config         JSONB       NOT NULL DEFAULT '{}'::jsonb, -- chỉ chứa key override
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT,
  updated_by     TEXT,
  UNIQUE (policy_type, policy_name)
);
CREATE INDEX idx_policies_resolve ON five_s_policies(policy_type, enabled, priority DESC);

-- Lịch sử thay đổi policy (dùng chung CƠ CHẾ versioning P6: old/new JSON +
-- hash + actor; "phiên bản" = bản ghi history, khôi phục = update từ history).
CREATE TABLE five_s_policy_changes (
  id             BIGSERIAL PRIMARY KEY,
  policy_id      BIGINT      NOT NULL REFERENCES five_s_policies(id),
  action         TEXT        NOT NULL
                 CHECK (action IN ('create','update','enable','disable','clone','restore')),
  old_value_json JSONB,
  new_value_json JSONB,
  config_hash    TEXT,                        -- sha256 của config sau thay đổi
  actor_email    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_policy_changes ON five_s_policy_changes(policy_id, id DESC);

COMMIT;
