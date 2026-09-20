CREATE TABLE IF NOT EXISTS employee_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_employee_group_name (tenant_id, company_id, name),
  UNIQUE KEY uq_employee_group_scope (tenant_id, company_id, id),
  CONSTRAINT fk_employee_group_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE employees ADD COLUMN group_id BIGINT UNSIGNED NULL,
  ADD KEY idx_employee_group (tenant_id, company_id, group_id),
  ADD CONSTRAINT fk_employee_group_scope FOREIGN KEY (tenant_id, company_id, group_id)
    REFERENCES employee_groups(tenant_id, company_id, id);
