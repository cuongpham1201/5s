-- 0002_app_users_identity.sql
-- Phase 3 (USER IDENTITY FOUNDATION): complete app_users as the identity center.
-- Adds password/reset + provisioning bookkeeping. Additive only (no data rewrite).

BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_algo         TEXT,                                  -- e.g. 'pbkdf2-sha256'
  ADD COLUMN IF NOT EXISTS password_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  -- TRUE when the row was auto-created by a Microsoft login (vs admin-created).
  ADD COLUMN IF NOT EXISTS provisioned           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at          TIMESTAMPTZ;

-- Case-insensitive username lookups (login).
CREATE INDEX IF NOT EXISTS idx_app_users_username_lower ON app_users(lower(username));
-- A user still needing an employee mapping ("Unmapped" / "Needs review").
CREATE INDEX IF NOT EXISTS idx_app_users_unmapped ON app_users(employee_id) WHERE employee_id IS NULL;

COMMIT;
