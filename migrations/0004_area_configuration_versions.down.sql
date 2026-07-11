-- Rollback 0004. LƯU Ý VẬN HÀNH: chỉ chạy khi CHƯA có version cần giữ —
-- sau khi production hóa, KHÔNG tự drop bảng version (giữ dữ liệu nguyên vẹn).
BEGIN;

DROP TABLE IF EXISTS area_configuration_versions CASCADE;

-- Khôi phục CHECK constraint 0003 nguyên bản:
ALTER TABLE area_assignment_changes DROP CONSTRAINT IF EXISTS area_assignment_changes_entity_type_check;
ALTER TABLE area_assignment_changes ADD CONSTRAINT area_assignment_changes_entity_type_check
  CHECK (entity_type IN ('area','assignment'));
ALTER TABLE area_assignment_changes DROP CONSTRAINT IF EXISTS area_assignment_changes_action_check;
ALTER TABLE area_assignment_changes ADD CONSTRAINT area_assignment_changes_action_check
  CHECK (action IN ('create','update','move','deactivate','reactivate','assign','unassign','bulk_assign','approve'));

COMMIT;
