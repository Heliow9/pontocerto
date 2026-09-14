SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS autopoint_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  scan_interval_seconds INT UNSIGNED NOT NULL DEFAULT 3,
  result_display_seconds INT UNSIGNED NOT NULL DEFAULT 3,
  cooldown_seconds INT UNSIGNED NOT NULL DEFAULT 10,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (tenant_id,company_id),
  CONSTRAINT fk_autopoint_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_autopoint_settings_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_autopoint_settings_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS autopoint_terminals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  activation_code_hash CHAR(64) NULL,
  activation_expires_at DATETIME NULL,
  token_hash CHAR(64) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  activated_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_autopoint_terminal_token (token_hash),
  KEY idx_autopoint_terminal_company (tenant_id,company_id,active),
  KEY idx_autopoint_terminal_activation (activation_code_hash,activation_expires_at),
  CONSTRAINT fk_autopoint_terminal_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_autopoint_terminal_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_autopoint_terminal_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE time_entries MODIFY COLUMN source ENUM('MOBILE','WEB','MANUAL','IMPORT','AUTO_POINT') NOT NULL DEFAULT 'MOBILE';

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='autopoint_terminal_id')=0,
  'ALTER TABLE time_entries ADD COLUMN autopoint_terminal_id BIGINT UNSIGNED NULL AFTER device_id',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND INDEX_NAME='idx_time_entries_autopoint_terminal')=0,
  'ALTER TABLE time_entries ADD KEY idx_time_entries_autopoint_terminal (autopoint_terminal_id,registered_at)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND CONSTRAINT_NAME='fk_time_entries_autopoint_terminal')=0,
  'ALTER TABLE time_entries ADD CONSTRAINT fk_time_entries_autopoint_terminal FOREIGN KEY (autopoint_terminal_id) REFERENCES autopoint_terminals(id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS=1;
