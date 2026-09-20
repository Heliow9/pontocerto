SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS time_entry_selfies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  time_entry_id BIGINT UNSIGNED NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  captured_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_time_entry_selfie (tenant_id, time_entry_id),
  KEY idx_selfie_employee (tenant_id, employee_id, captured_at),
  CONSTRAINT fk_selfie_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_selfie_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_selfie_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_selfie_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
