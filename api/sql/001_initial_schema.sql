SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  status ENUM('ACTIVE','SUSPENDED','CANCELED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  legal_name VARCHAR(190) NOT NULL,
  trade_name VARCHAR(190) NULL,
  cnpj VARCHAR(20) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_companies_tenant (tenant_id),
  UNIQUE KEY uq_companies_tenant_cnpj (tenant_id, cnpj),
  CONSTRAINT fk_companies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NULL,
  employee_id BIGINT UNSIGNED NULL,
  name VARCHAR(190) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN','TENANT_ADMIN','RH','GESTOR','SUPERVISOR','FUNCIONARIO') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_users_tenant (tenant_id),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL,
  cpf VARCHAR(20) NULL,
  pis VARCHAR(20) NULL,
  registration_number VARCHAR(50) NULL,
  admission_date DATE NULL,
  ctps VARCHAR(50) NULL,
  position_name VARCHAR(120) NULL,
  department_name VARCHAR(120) NULL,
  work_schedule_id BIGINT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_employees_tenant (tenant_id),
  KEY idx_employees_company (tenant_id, company_id),
  UNIQUE KEY uq_employee_cpf_tenant (tenant_id, cpf),
  UNIQUE KEY uq_employee_registration_tenant (tenant_id, registration_number),
  CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_employees_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL,
  address VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  radius_meters INT UNSIGNED NULL,
  geo_mode ENUM('DISABLED','WARN','BLOCK') NOT NULL DEFAULT 'DISABLED',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_locations_tenant (tenant_id),
  CONSTRAINT fk_locations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_locations_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(190) NOT NULL,
  weekly_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  tolerance_late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  tolerance_overtime_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_schedules_tenant (tenant_id),
  CONSTRAINT fk_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_schedules_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS work_schedule_days (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  work_schedule_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  is_day_off TINYINT(1) NOT NULL DEFAULT 0,
  entry_1 TIME NULL,
  exit_1 TIME NULL,
  entry_2 TIME NULL,
  exit_2 TIME NULL,
  expected_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_schedule_days_tenant (tenant_id),
  UNIQUE KEY uq_schedule_weekday (work_schedule_id, weekday),
  CONSTRAINT fk_schedule_days_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_schedule_days_schedule FOREIGN KEY (work_schedule_id) REFERENCES work_schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS employee_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_location_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_location (employee_id, work_location_id),
  KEY idx_employee_locations_tenant (tenant_id),
  CONSTRAINT fk_employee_locations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_employee_locations_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_employee_locations_location FOREIGN KEY (work_location_id) REFERENCES work_locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS time_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('CLOCK_IN','BREAK_OUT','BREAK_IN','CLOCK_OUT','OTHER') NOT NULL DEFAULT 'OTHER',
  registered_at DATETIME NOT NULL,
  offline_recorded_at DATETIME NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  accuracy DECIMAL(8,2) NULL,
  device_id VARCHAR(190) NULL,
  source ENUM('MOBILE','WEB','MANUAL','IMPORT') NOT NULL DEFAULT 'MOBILE',
  manually_adjusted TINYINT(1) NOT NULL DEFAULT 0,
  adjustment_reason VARCHAR(500) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_time_entries_tenant_employee_date (tenant_id, employee_id, registered_at),
  KEY idx_time_entries_company (tenant_id, company_id),
  CONSTRAINT fk_time_entries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_time_entries_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_time_entries_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_time_entries_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holidays (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NULL,
  holiday_date DATE NOT NULL,
  name VARCHAR(190) NOT NULL,
  scope ENUM('NATIONAL','STATE','MUNICIPAL','COMPANY') NOT NULL DEFAULT 'COMPANY',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_holidays_tenant_date (tenant_id, holiday_date),
  CONSTRAINT fk_holidays_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_holidays_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS absences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type ENUM('ATESTADO','FERIAS','AFASTAMENTO','LICENCA','ABONO','OUTRO') NOT NULL,
  reason VARCHAR(500) NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_absences_tenant_employee (tenant_id, employee_id),
  CONSTRAINT fk_absences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_absences_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS time_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  time_entry_id BIGINT UNSIGNED NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  requested_at DATETIME NOT NULL,
  original_time DATETIME NULL,
  requested_time DATETIME NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_adjustments_tenant_employee (tenant_id, employee_id),
  CONSTRAINT fk_adjustments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_adjustments_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id),
  CONSTRAINT fk_adjustments_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_adjustments_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_time_calculations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  status ENUM('NORMAL','FOLGA','FERIADO','FALTA','ATESTADO','FERIAS','AFASTAMENTO','LICENCA','ABONO') NOT NULL DEFAULT 'NORMAL',
  status_label VARCHAR(190) NULL,
  points_text VARCHAR(255) NULL,
  expected_minutes INT NOT NULL DEFAULT 0,
  worked_minutes INT NOT NULL DEFAULT 0,
  normal_minutes INT NOT NULL DEFAULT 0,
  overtime_minutes INT NOT NULL DEFAULT 0,
  late_minutes INT NOT NULL DEFAULT 0,
  absence_minutes INT NOT NULL DEFAULT 0,
  night_minutes INT NOT NULL DEFAULT 0,
  time_bank_minutes INT NOT NULL DEFAULT 0,
  processed_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_calc_employee_date (tenant_id, employee_id, work_date),
  KEY idx_daily_calc_company_date (tenant_id, company_id, work_date),
  CONSTRAINT fk_daily_calc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_daily_calc_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_daily_calc_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS time_bank_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  movement_date DATE NOT NULL,
  minutes INT NOT NULL,
  reason VARCHAR(255) NULL,
  source_type ENUM('DAILY_CALC','MANUAL','ADJUSTMENT') NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_time_bank_tenant_employee_date (tenant_id, employee_id, movement_date),
  CONSTRAINT fk_time_bank_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_time_bank_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  device_uid VARCHAR(190) NOT NULL,
  platform VARCHAR(50) NULL,
  model VARCHAR(120) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_uid_tenant (tenant_id, device_uid),
  KEY idx_devices_employee (tenant_id, employee_id),
  CONSTRAINT fk_devices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_devices_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  before_data LONGTEXT NULL,
  after_data LONGTEXT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_tenant_created (tenant_id, created_at),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(80) NOT NULL,
  max_employees INT UNSIGNED NULL,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  status ENUM('TRIAL','ACTIVE','PAST_DUE','CANCELED') NOT NULL DEFAULT 'TRIAL',
  starts_at DATETIME NOT NULL,
  trial_ends_at DATETIME NULL,
  current_period_end DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_subscriptions_tenant (tenant_id),
  CONSTRAINT fk_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
