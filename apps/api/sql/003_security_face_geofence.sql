SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- Company profile: endereço estruturado + geofence padrão + política facial.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='zip_code')=0,'ALTER TABLE company_profiles ADD COLUMN zip_code VARCHAR(20) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='street')=0,'ALTER TABLE company_profiles ADD COLUMN street VARCHAR(190) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='address_number')=0,'ALTER TABLE company_profiles ADD COLUMN address_number VARCHAR(40) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='complement')=0,'ALTER TABLE company_profiles ADD COLUMN complement VARCHAR(120) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='district')=0,'ALTER TABLE company_profiles ADD COLUMN district VARCHAR(120) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='country')=0,"ALTER TABLE company_profiles ADD COLUMN country VARCHAR(2) NOT NULL DEFAULT 'BR'",'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='latitude')=0,'ALTER TABLE company_profiles ADD COLUMN latitude DECIMAL(10,7) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='longitude')=0,'ALTER TABLE company_profiles ADD COLUMN longitude DECIMAL(10,7) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='punch_radius_meters')=0,'ALTER TABLE company_profiles ADD COLUMN punch_radius_meters INT UNSIGNED NOT NULL DEFAULT 1000','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='require_location')=0,'ALTER TABLE company_profiles ADD COLUMN require_location TINYINT(1) NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='block_outside_radius')=0,'ALTER TABLE company_profiles ADD COLUMN block_outside_radius TINYINT(1) NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='max_gps_accuracy_meters')=0,'ALTER TABLE company_profiles ADD COLUMN max_gps_accuracy_meters INT UNSIGNED NOT NULL DEFAULT 100','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='require_face_recognition')=0,'ALTER TABLE company_profiles ADD COLUMN require_face_recognition TINYINT(1) NOT NULL DEFAULT 1','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='mapbox_place_id')=0,'ALTER TABLE company_profiles ADD COLUMN mapbox_place_id VARCHAR(190) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Evidências do registro. A foto facial NÃO é gravada; apenas resultado da verificação.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='location_mocked')=0,'ALTER TABLE time_entries ADD COLUMN location_mocked TINYINT(1) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='face_verified')=0,'ALTER TABLE time_entries ADD COLUMN face_verified TINYINT(1) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='face_similarity')=0,'ALTER TABLE time_entries ADD COLUMN face_similarity DECIMAL(6,2) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_entries' AND COLUMN_NAME='face_provider')=0,'ALTER TABLE time_entries ADD COLUMN face_provider VARCHAR(40) NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE time_entry_geo_checks MODIFY decision ENUM('ALLOWED','WARNED','BLOCKED','NOT_REQUIRED') NOT NULL;

CREATE TABLE IF NOT EXISTS employee_face_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL,
  collection_id VARCHAR(190) NOT NULL,
  provider_face_id VARCHAR(190) NOT NULL,
  external_image_id VARCHAR(190) NOT NULL,
  status ENUM('ENROLLED','REVOKED') NOT NULL DEFAULT 'ENROLLED',
  enrolled_at DATETIME NOT NULL,
  last_verified_at DATETIME NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_face_profile_employee (tenant_id, employee_id),
  KEY idx_face_profile_company (tenant_id, company_id),
  CONSTRAINT fk_face_profile_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_face_profile_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_face_profile_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS time_entry_face_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  time_entry_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL,
  similarity DECIMAL(6,2) NULL,
  threshold_value DECIMAL(6,2) NULL,
  verified TINYINT(1) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_face_check_entry (time_entry_id),
  KEY idx_face_checks_employee (tenant_id, employee_id),
  CONSTRAINT fk_face_checks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_face_checks_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_face_checks_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS punch_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  attempted_at DATETIME NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  accuracy DECIMAL(8,2) NULL,
  location_mocked TINYINT(1) NULL,
  geo_decision VARCHAR(30) NULL,
  distance_meters DECIMAL(10,2) NULL,
  face_decision VARCHAR(30) NULL,
  face_similarity DECIMAL(6,2) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_punch_attempts_employee (tenant_id, employee_id, attempted_at),
  CONSTRAINT fk_punch_attempt_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_punch_attempt_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_punch_attempt_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
