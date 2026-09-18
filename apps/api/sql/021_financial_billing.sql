SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS saas_billing_profiles (
  tenant_id BIGINT UNSIGNED NOT NULL,
  due_day TINYINT UNSIGNED NOT NULL DEFAULT 10,
  grace_days SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  auto_block_enabled TINYINT(1) NOT NULL DEFAULT 1,
  auto_monthly_enabled TINYINT(1) NOT NULL DEFAULT 1,
  inter_cancel_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (tenant_id),
  KEY idx_billing_profile_due (due_day,auto_monthly_enabled),
  CONSTRAINT fk_billing_profile_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_charges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  type ENUM('MONTHLY','IMPLEMENTATION','AD_HOC') NOT NULL,
  competence CHAR(7) NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  block_at DATE NOT NULL,
  status ENUM('DRAFT','ISSUING','OPEN','OVERDUE','PAID','CANCELED','FAILED') NOT NULL DEFAULT 'DRAFT',
  provider VARCHAR(30) NOT NULL DEFAULT 'INTER',
  provider_charge_id VARCHAR(190) NULL,
  provider_your_number VARCHAR(40) NULL,
  barcode VARCHAR(100) NULL,
  digitable_line VARCHAR(120) NULL,
  pix_copy_paste TEXT NULL,
  provider_payload_json LONGTEXT NULL,
  failure_message VARCHAR(500) NULL,
  issued_at DATETIME NULL,
  paid_at DATETIME NULL,
  canceled_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_financial_monthly_competence (tenant_id,type,competence),
  UNIQUE KEY uq_financial_provider_charge (provider,provider_charge_id),
  UNIQUE KEY uq_financial_your_number (provider,provider_your_number),
  KEY idx_financial_charges_tenant_status (tenant_id,status,due_date),
  KEY idx_financial_charges_due (status,block_at),
  KEY idx_financial_charges_created (created_at),
  CONSTRAINT fk_financial_charges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_financial_charges_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  charge_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  provider_payment_id VARCHAR(190) NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATETIME NOT NULL,
  origin ENUM('BOLETO','PIX','MANUAL') NOT NULL,
  payload_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_financial_provider_payment (provider_payment_id),
  KEY idx_financial_payments_tenant_paid (tenant_id,paid_at),
  KEY idx_financial_payments_charge (charge_id),
  CONSTRAINT fk_financial_payments_charge FOREIGN KEY (charge_id) REFERENCES financial_charges(id),
  CONSTRAINT fk_financial_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_access_exceptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  charge_id BIGINT UNSIGNED NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  revoked_at DATETIME NULL,
  revoked_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_financial_access_exception_active (tenant_id,starts_at,ends_at,revoked_at),
  KEY idx_financial_access_exception_charge (charge_id),
  CONSTRAINT fk_financial_exception_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_financial_exception_charge FOREIGN KEY (charge_id) REFERENCES financial_charges(id),
  CONSTRAINT fk_financial_exception_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_financial_exception_revoker FOREIGN KEY (revoked_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(30) NOT NULL DEFAULT 'INTER',
  event_key VARCHAR(190) NOT NULL,
  account_reference VARCHAR(100) NULL,
  payload_json LONGTEXT NOT NULL,
  received_at DATETIME NOT NULL,
  processed_at DATETIME NULL,
  status ENUM('RECEIVED','PROCESSED','FAILED','IGNORED') NOT NULL DEFAULT 'RECEIVED',
  error_message VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_financial_webhook_event (provider,event_key),
  KEY idx_financial_webhook_status (status,received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS financial_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  charge_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  details_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_financial_events_tenant_created (tenant_id,created_at),
  KEY idx_financial_events_charge_created (charge_id,created_at),
  CONSTRAINT fk_financial_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_financial_events_charge FOREIGN KEY (charge_id) REFERENCES financial_charges(id),
  CONSTRAINT fk_financial_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO saas_billing_profiles(tenant_id,due_day,grace_days,auto_block_enabled,auto_monthly_enabled,inter_cancel_days,created_at,updated_at)
SELECT t.id,10,3,1,1,30,NOW(),NOW()
  FROM tenants t
 WHERE NOT EXISTS (SELECT 1 FROM users su WHERE su.tenant_id=t.id AND su.role='SUPER_ADMIN')
ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id);

SET FOREIGN_KEY_CHECKS=1;
