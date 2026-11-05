SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS control_id_terminals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  serial_number VARCHAR(64) NOT NULL,
  vendor_device_id VARCHAR(32) NULL,
  model VARCHAR(120) NULL,
  firmware_version VARCHAR(80) NULL,
  credential_hash CHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  active_slot TINYINT GENERATED ALWAYS AS (CASE WHEN active=1 THEN 1 ELSE NULL END) STORED,
  status ENUM('PENDING','ONLINE','OFFLINE','ERROR','DISABLED') NOT NULL DEFAULT 'PENDING',
  last_push_at DATETIME NULL,
  last_monitor_at DATETIME NULL,
  last_event_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_control_id_serial (serial_number),
  UNIQUE KEY uq_control_id_vendor_device (vendor_device_id),
  UNIQUE KEY uq_control_id_active_company (tenant_id,company_id,active_slot),
  UNIQUE KEY uq_control_id_credential (credential_hash),
  KEY idx_control_id_company (tenant_id,company_id,status),
  CONSTRAINT fk_control_id_terminal_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_control_id_terminal_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_control_id_terminal_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS control_id_employee_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terminal_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  vendor_user_id BIGINT UNSIGNED NOT NULL,
  desired_version INT UNSIGNED NOT NULL DEFAULT 1,
  synced_version INT UNSIGNED NOT NULL DEFAULT 0,
  sync_status ENUM('PENDING','SYNCED','ERROR','REMOVAL_PENDING','REMOVED') NOT NULL DEFAULT 'PENDING',
  last_error_code VARCHAR(80) NULL,
  last_error_message VARCHAR(500) NULL,
  last_synced_at DATETIME NULL,
  disabled_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_control_id_mapping_employee (terminal_id,employee_id),
  UNIQUE KEY uq_control_id_mapping_vendor (terminal_id,vendor_user_id),
  KEY idx_control_id_mapping_scope (tenant_id,company_id,sync_status),
  CONSTRAINT fk_control_id_mapping_terminal FOREIGN KEY (terminal_id) REFERENCES control_id_terminals(id),
  CONSTRAINT fk_control_id_mapping_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_control_id_mapping_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_control_id_mapping_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS control_id_sync_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terminal_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NULL,
  job_type ENUM('UPSERT_USER','UPSERT_FACE','DELETE_FACE','DELETE_USER') NOT NULL,
  deduplication_key VARCHAR(190) NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('PENDING','CLAIMED','SUCCEEDED','FAILED','DEAD') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL,
  claimed_at DATETIME NULL,
  completed_at DATETIME NULL,
  push_uuid VARCHAR(80) NULL,
  vendor_response_json JSON NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_control_id_job_dedupe (terminal_id,deduplication_key),
  UNIQUE KEY uq_control_id_job_uuid (terminal_id,push_uuid),
  KEY idx_control_id_job_claim (terminal_id,status,available_at,id),
  CONSTRAINT fk_control_id_job_terminal FOREIGN KEY (terminal_id) REFERENCES control_id_terminals(id),
  CONSTRAINT fk_control_id_job_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS control_id_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terminal_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  vendor_log_id VARCHAR(32) NOT NULL,
  vendor_user_id VARCHAR(32) NOT NULL,
  occurred_at DATETIME NOT NULL,
  vendor_event_type INT NOT NULL,
  vendor_log_type_id INT NOT NULL,
  identifier_type INT NOT NULL,
  payload_json JSON NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  status ENUM('RECEIVED','PROCESSED','DUPLICATE','QUARANTINED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
  time_entry_id BIGINT UNSIGNED NULL,
  reason_code VARCHAR(80) NULL,
  reason_message VARCHAR(500) NULL,
  received_at DATETIME NOT NULL,
  processed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_control_id_event (terminal_id,vendor_log_id),
  UNIQUE KEY uq_control_id_event_entry (time_entry_id),
  KEY idx_control_id_event_scope (tenant_id,company_id,status,occurred_at),
  CONSTRAINT fk_control_id_event_terminal FOREIGN KEY (terminal_id) REFERENCES control_id_terminals(id),
  CONSTRAINT fk_control_id_event_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_control_id_event_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_control_id_event_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE time_entries MODIFY COLUMN source ENUM('MOBILE','WEB','MANUAL','IMPORT','AUTO_POINT','CONTROL_ID') NOT NULL DEFAULT 'MOBILE';

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='control_id_terminal_id')=0,
  'ALTER TABLE time_entries ADD COLUMN control_id_terminal_id BIGINT UNSIGNED NULL AFTER autopoint_terminal_id', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='control_id_event_id')=0,
  'ALTER TABLE time_entries ADD COLUMN control_id_event_id BIGINT UNSIGNED NULL AFTER control_id_terminal_id', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND INDEX_NAME='uq_time_entries_control_id_event')=0,
  'ALTER TABLE time_entries ADD UNIQUE KEY uq_time_entries_control_id_event (control_id_event_id)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS=1;
