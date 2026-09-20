SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- v0.4: validação da jornada no momento do ponto.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='enforce_schedule_window')=0,'ALTER TABLE company_profiles ADD COLUMN enforce_schedule_window TINYINT(1) NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='schedule_early_margin_minutes')=0,'ALTER TABLE company_profiles ADD COLUMN schedule_early_margin_minutes INT UNSIGNED NOT NULL DEFAULT 120','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='schedule_late_margin_minutes')=0,'ALTER TABLE company_profiles ADD COLUMN schedule_late_margin_minutes INT UNSIGNED NOT NULL DEFAULT 240','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='schedule_decision')=0,'ALTER TABLE time_entries ADD COLUMN schedule_decision VARCHAR(30) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='scheduled_work_date')=0,'ALTER TABLE time_entries ADD COLUMN scheduled_work_date DATE NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='punch_attempts' AND COLUMN_NAME='schedule_decision')=0,'ALTER TABLE punch_attempts ADD COLUMN schedule_decision VARCHAR(30) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS time_entry_schedule_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  time_entry_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_schedule_id BIGINT UNSIGNED NULL,
  work_date DATE NULL,
  weekday TINYINT UNSIGNED NULL,
  schedule_text VARCHAR(120) NULL,
  expected_entry_type VARCHAR(30) NULL,
  decision ENUM('ALLOWED','BLOCKED','NOT_REQUIRED') NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_time_entry_schedule_check (tenant_id,time_entry_id),
  KEY idx_schedule_check_employee (tenant_id,employee_id,work_date),
  CONSTRAINT fk_schedule_check_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_schedule_check_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_check_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_schedule_check_schedule FOREIGN KEY (work_schedule_id) REFERENCES work_schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
