-- Rollback for 0002_app_users_identity.sql (ban5s_app only; never touches HRM).
BEGIN;
DROP INDEX IF EXISTS idx_app_users_unmapped;
DROP INDEX IF EXISTS idx_app_users_username_lower;
ALTER TABLE app_users
  DROP COLUMN IF EXISTS last_seen_at,
  DROP COLUMN IF EXISTS provisioned,
  DROP COLUMN IF EXISTS must_change_password,
  DROP COLUMN IF EXISTS password_updated_at,
  DROP COLUMN IF EXISTS password_algo;
COMMIT;
