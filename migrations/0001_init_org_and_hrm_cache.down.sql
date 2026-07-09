-- Rollback for 0001_init_org_and_hrm_cache.sql
-- Drops ONLY the Phase-1 tables in this DB (ban5s_app). Does NOT touch HRM.
BEGIN;
DROP TABLE IF EXISTS sync_changes            CASCADE;
DROP TABLE IF EXISTS sync_jobs               CASCADE;
DROP TABLE IF EXISTS teams_targets           CASCADE;
DROP TABLE IF EXISTS department_responsibles CASCADE;
DROP TABLE IF EXISTS five_s_areas            CASCADE;
DROP TABLE IF EXISTS department_aliases      CASCADE;
DROP TABLE IF EXISTS app_users               CASCADE;
DROP TABLE IF EXISTS hr_employees            CASCADE;
DROP TABLE IF EXISTS hr_departments          CASCADE;
COMMIT;
