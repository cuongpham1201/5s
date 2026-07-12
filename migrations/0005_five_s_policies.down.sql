-- Rollback 0005 (ban5s_app only). Chỉ chạy khi chưa có policy cần giữ.
BEGIN;
DROP TABLE IF EXISTS five_s_policy_changes CASCADE;
DROP TABLE IF EXISTS five_s_policies       CASCADE;
COMMIT;
