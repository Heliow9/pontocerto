SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE absences
  MODIFY COLUMN type ENUM('ATESTADO','FERIAS','AFASTAMENTO','LICENCA','ABONO','OUTRO','DECLARACAO') NOT NULL;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absences'
      AND COLUMN_NAME='start_time')=0,
  'ALTER TABLE absences ADD COLUMN start_time TIME NULL AFTER end_date',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absences'
      AND COLUMN_NAME='end_time')=0,
  'ALTER TABLE absences ADD COLUMN end_time TIME NULL AFTER start_time',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='absences'
      AND COLUMN_NAME='created_by_user_id')=0,
  'ALTER TABLE absences ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL AFTER status',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='daily_time_calculations'
      AND COLUMN_NAME='excused_minutes')=0,
  'ALTER TABLE daily_time_calculations ADD COLUMN excused_minutes INT NOT NULL DEFAULT 0 AFTER break_deducted_minutes',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS=1;
