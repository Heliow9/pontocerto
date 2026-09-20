SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS payment_provider_settings (
  provider VARCHAR(30) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  environment ENUM('sandbox','production') NOT NULL DEFAULT 'production',
  last_test_at DATETIME NULL,
  last_test_status ENUM('OK','ERROR','NEVER') NOT NULL DEFAULT 'NEVER',
  last_test_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(provider),
  KEY idx_payment_provider_default (is_default,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO payment_provider_settings(provider,is_default,enabled,environment,last_test_status,created_at,updated_at)
VALUES
 ('CORA',0,0,'production','NEVER',NOW(),NOW()),
 ('EFI',0,0,'production','NEVER',NOW(),NOW()),
 ('MERCADO_PAGO',0,0,'production','NEVER',NOW(),NOW())
ON DUPLICATE KEY UPDATE provider=VALUES(provider);

CREATE TABLE IF NOT EXISTS financial_settings (
  id TINYINT UNSIGNED NOT NULL,
  default_payment_provider VARCHAR(30) NULL,
  default_payment_method ENUM('HYBRID','PIX','BOLETO') NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  CONSTRAINT fk_financial_settings_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO financial_settings(id,default_payment_provider,default_payment_method,created_at,updated_at)
VALUES(1,NULL,NULL,NOW(),NOW());

-- Cobranças da integração antiga permanecem somente para auditoria, sem adaptador ativo.
UPDATE financial_charges SET provider='LEGACY' WHERE provider='INTER';
UPDATE financial_webhook_events SET provider='LEGACY' WHERE provider='INTER';
UPDATE financial_settings SET default_payment_provider=NULL,default_payment_method=NULL WHERE default_payment_provider='INTER';


-- Compatibilidade para instalações que já aplicaram a migration 021 antiga.
SET @has_legacy_inter_cancel_days := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'saas_billing_profiles'
     AND COLUMN_NAME = 'inter_cancel_days'
);
SET @rename_legacy_cancel_column := IF(
  @has_legacy_inter_cancel_days > 0,
  'ALTER TABLE saas_billing_profiles CHANGE COLUMN inter_cancel_days provider_expiration_days SMALLINT UNSIGNED NOT NULL DEFAULT 30',
  'SELECT 1'
);
PREPARE stmt_rename_legacy_cancel_column FROM @rename_legacy_cancel_column;
EXECUTE stmt_rename_legacy_cancel_column;
DEALLOCATE PREPARE stmt_rename_legacy_cancel_column;

ALTER TABLE financial_charges
  ADD COLUMN requested_payment_method ENUM('HYBRID','PIX','BOLETO') NULL AFTER provider,
  ADD COLUMN provider_payment_url TEXT NULL AFTER provider_your_number,
  ADD COLUMN provider_pdf_url TEXT NULL AFTER provider_payment_url,
  ADD COLUMN pix_qr_code LONGTEXT NULL AFTER pix_copy_paste,
  ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER pix_qr_code;

SET @financial_charge_provider_has_default := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'financial_charges'
     AND COLUMN_NAME = 'provider'
     AND COLUMN_DEFAULT IS NOT NULL
);
SET @drop_financial_charge_provider_default := IF(
  @financial_charge_provider_has_default > 0,
  'ALTER TABLE financial_charges ALTER COLUMN provider DROP DEFAULT',
  'SELECT 1'
);
PREPARE stmt_drop_financial_charge_provider_default FROM @drop_financial_charge_provider_default;
EXECUTE stmt_drop_financial_charge_provider_default;
DEALLOCATE PREPARE stmt_drop_financial_charge_provider_default;

SET @financial_webhook_provider_has_default := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'financial_webhook_events'
     AND COLUMN_NAME = 'provider'
     AND COLUMN_DEFAULT IS NOT NULL
);
SET @drop_financial_webhook_provider_default := IF(
  @financial_webhook_provider_has_default > 0,
  'ALTER TABLE financial_webhook_events ALTER COLUMN provider DROP DEFAULT',
  'SELECT 1'
);
PREPARE stmt_drop_financial_webhook_provider_default FROM @drop_financial_webhook_provider_default;
EXECUTE stmt_drop_financial_webhook_provider_default;
DEALLOCATE PREPARE stmt_drop_financial_webhook_provider_default;
ALTER TABLE financial_charges ADD UNIQUE KEY uq_financial_idempotency (provider,idempotency_key);
ALTER TABLE financial_charges ADD KEY idx_financial_provider_method_status (provider,requested_payment_method,status);

ALTER TABLE financial_payments
  MODIFY COLUMN origin ENUM('BOLETO','PIX','OTHER','MANUAL') NOT NULL,
  ADD COLUMN provider VARCHAR(30) NULL AFTER tenant_id,
  ADD COLUMN requested_payment_method ENUM('HYBRID','PIX','BOLETO') NULL AFTER provider,
  ADD COLUMN payment_method ENUM('PIX','BOLETO','OTHER','MANUAL') NULL AFTER requested_payment_method,
  ADD COLUMN provider_fee DECIMAL(12,2) NULL AFTER amount,
  ADD COLUMN net_amount DECIMAL(12,2) NULL AFTER provider_fee;

UPDATE financial_payments p
JOIN financial_charges c ON c.id=p.charge_id
SET p.provider=COALESCE(p.provider,c.provider),
    p.requested_payment_method=COALESCE(p.requested_payment_method,c.requested_payment_method),
    p.payment_method=COALESCE(p.payment_method,CASE p.origin WHEN 'PIX' THEN 'PIX' WHEN 'BOLETO' THEN 'BOLETO' WHEN 'MANUAL' THEN 'MANUAL' ELSE 'OTHER' END)
WHERE p.provider IS NULL OR p.payment_method IS NULL;

ALTER TABLE financial_payments DROP INDEX uq_financial_provider_payment;
ALTER TABLE financial_payments ADD UNIQUE KEY uq_financial_provider_payment (provider,provider_payment_id);
ALTER TABLE financial_payments ADD KEY idx_financial_payments_provider_method (provider,payment_method,paid_at);
ALTER TABLE financial_webhook_events ADD KEY idx_financial_webhook_provider_status (provider,status,received_at);

SET FOREIGN_KEY_CHECKS=1;
