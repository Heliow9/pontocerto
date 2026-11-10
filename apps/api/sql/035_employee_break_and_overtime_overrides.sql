SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees'
      AND COLUMN_NAME='auto_deduct_scheduled_break')=0,
  'ALTER TABLE employees ADD COLUMN auto_deduct_scheduled_break TINYINT(1) NOT NULL DEFAULT 0 AFTER biometric_exempt',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='daily_time_calculations'
      AND COLUMN_NAME='break_deducted_minutes')=0,
  'ALTER TABLE daily_time_calculations ADD COLUMN break_deducted_minutes INT NOT NULL DEFAULT 0 AFTER worked_minutes',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS employee_overtime_overrides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  override_type VARCHAR(40) NOT NULL DEFAULT 'IGNORE_OVERTIME',
  reason VARCHAR(500) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  removed_by_user_id BIGINT UNSIGNED NULL,
  removed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_overtime_override (tenant_id,employee_id,work_date,override_type),
  KEY idx_employee_overtime_override_company_date (tenant_id,company_id,work_date),
  CONSTRAINT fk_employee_overtime_override_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_employee_overtime_override_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_employee_overtime_override_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_employee_overtime_override_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_employee_overtime_override_removed_by FOREIGN KEY (removed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
