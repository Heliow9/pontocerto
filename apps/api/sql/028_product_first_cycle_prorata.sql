-- V4.1: pró-rata da primeira mensalidade para novas assinaturas multiproduto.
-- Seguro para reexecução e sem efeito retroativo em assinaturas existentes.
SET NAMES utf8mb4;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_subscriptions' AND COLUMN_NAME='first_cycle_prorata_enabled')=0,
  'ALTER TABLE product_subscriptions ADD COLUMN first_cycle_prorata_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_block','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='base_amount')=0,
  'ALTER TABLE financial_charges ADD COLUMN base_amount DECIMAL(12,2) NULL AFTER amount','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='is_prorata')=0,
  'ALTER TABLE financial_charges ADD COLUMN is_prorata TINYINT(1) NOT NULL DEFAULT 0 AFTER base_amount','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='prorata_days')=0,
  'ALTER TABLE financial_charges ADD COLUMN prorata_days SMALLINT UNSIGNED NULL AFTER is_prorata','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='prorata_cycle_days')=0,
  'ALTER TABLE financial_charges ADD COLUMN prorata_cycle_days SMALLINT UNSIGNED NULL AFTER prorata_days','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='billing_period_start')=0,
  'ALTER TABLE financial_charges ADD COLUMN billing_period_start DATE NULL AFTER prorata_cycle_days','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='billing_period_end')=0,
  'ALTER TABLE financial_charges ADD COLUMN billing_period_end DATE NULL AFTER billing_period_start','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Assinaturas existentes permanecem sem pró-rata por padrão. Novas assinaturas
-- criadas pelo serviço passam a gravar first_cycle_prorata_enabled=1 explicitamente.
UPDATE financial_charges SET base_amount=amount WHERE base_amount IS NULL;
