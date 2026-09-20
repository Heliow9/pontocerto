SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS company_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(2) NULL,
  logo_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_profiles_company (company_id),
  KEY idx_company_profiles_tenant (tenant_id),
  CONSTRAINT fk_company_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_company_profiles_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id BIGINT UNSIGNED NOT NULL,
  report_title VARCHAR(120) NOT NULL DEFAULT 'Relatório de Pontos',
  report_footer VARCHAR(255) NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS time_entry_geo_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  time_entry_id BIGINT UNSIGNED NOT NULL,
  work_location_id BIGINT UNSIGNED NULL,
  distance_meters DECIMAL(10,2) NULL,
  within_radius TINYINT(1) NULL,
  decision ENUM('ALLOWED','WARNED','NOT_REQUIRED') NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_geo_check_entry (time_entry_id),
  KEY idx_geo_checks_tenant (tenant_id),
  CONSTRAINT fk_geo_checks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_geo_checks_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_checks_location FOREIGN KEY (work_location_id) REFERENCES work_locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
