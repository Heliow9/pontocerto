CREATE TABLE IF NOT EXISTS payroll_export_profiles (
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  format VARCHAR(20) NOT NULL,
  settings LONGTEXT NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (tenant_id, company_id, format),
  CONSTRAINT fk_payroll_profile_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_payroll_profile_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
