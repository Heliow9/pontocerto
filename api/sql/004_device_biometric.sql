SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- v0.4: substitui reconhecimento facial em nuvem por biometria nativa do aparelho.
-- O segredo do dispositivo é armazenado no celular com SecureStore protegido por biometria.

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='require_device_biometric')=0,'ALTER TABLE company_profiles ADD COLUMN require_device_biometric TINYINT(1) NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='require_registered_device')=0,'ALTER TABLE company_profiles ADD COLUMN require_registered_device TINYINT(1) NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='max_registered_devices')=0,'ALTER TABLE company_profiles ADD COLUMN max_registered_devices INT UNSIGNED NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- A v0.4 não usa mais reconhecimento facial AWS.
UPDATE company_profiles SET require_face_recognition=0 WHERE require_face_recognition<>0;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='company_id')=0,'ALTER TABLE devices ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER tenant_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='secret_hash')=0,'ALTER TABLE devices ADD COLUMN secret_hash CHAR(64) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='biometric_capable')=0,'ALTER TABLE devices ADD COLUMN biometric_capable TINYINT(1) NOT NULL DEFAULT 0','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='biometric_types')=0,'ALTER TABLE devices ADD COLUMN biometric_types VARCHAR(120) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='manufacturer')=0,'ALTER TABLE devices ADD COLUMN manufacturer VARCHAR(120) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='os_version')=0,'ALTER TABLE devices ADD COLUMN os_version VARCHAR(80) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='bound_at')=0,'ALTER TABLE devices ADD COLUMN bound_at DATETIME NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='devices' AND COLUMN_NAME='revoked_at')=0,'ALTER TABLE devices ADD COLUMN revoked_at DATETIME NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='device_biometric_verified')=0,'ALTER TABLE time_entries ADD COLUMN device_biometric_verified TINYINT(1) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='device_biometric_type')=0,'ALTER TABLE time_entries ADD COLUMN device_biometric_type VARCHAR(80) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='device_binding_id')=0,'ALTER TABLE time_entries ADD COLUMN device_binding_id BIGINT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='punch_attempts' AND COLUMN_NAME='biometric_decision')=0,'ALTER TABLE punch_attempts ADD COLUMN biometric_decision VARCHAR(30) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='punch_attempts' AND COLUMN_NAME='device_uid')=0,'ALTER TABLE punch_attempts ADD COLUMN device_uid VARCHAR(190) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS time_entry_device_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  time_entry_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  device_uid VARCHAR(190) NULL,
  biometric_verified TINYINT(1) NOT NULL DEFAULT 0,
  biometric_type VARCHAR(80) NULL,
  decision ENUM('VERIFIED','REJECTED','NOT_REQUIRED') NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_time_entry_device_check (tenant_id,time_entry_id),
  KEY idx_device_check_employee (tenant_id,employee_id,created_at),
  CONSTRAINT fk_device_check_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_device_check_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_device_check_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_device_check_device FOREIGN KEY (device_id) REFERENCES devices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
