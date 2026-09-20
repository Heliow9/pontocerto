-- V4.1.2: ajustes pontuais de cobrança, desconto somente no boleto atual e reemissão auditável.
-- Compatível com MySQL 5.6: sem JSON nativo, CHECK ou DDL não suportado.
SET NAMES utf8mb4;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='revision')=0,
  'ALTER TABLE financial_charges ADD COLUMN revision SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER competence','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='discount_base_amount')=0,
  'ALTER TABLE financial_charges ADD COLUMN discount_base_amount DECIMAL(12,2) NULL AFTER base_amount','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='discount_scope')=0,
  'ALTER TABLE financial_charges ADD COLUMN discount_scope VARCHAR(20) NULL AFTER discount_base_amount','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='discount_type')=0,
  'ALTER TABLE financial_charges ADD COLUMN discount_type VARCHAR(20) NULL AFTER discount_scope','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='discount_value')=0,
  'ALTER TABLE financial_charges ADD COLUMN discount_value DECIMAL(12,4) NULL AFTER discount_type','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='discount_amount')=0,
  'ALTER TABLE financial_charges ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discount_value','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='reissued_from_charge_id')=0,
  'ALTER TABLE financial_charges ADD COLUMN reissued_from_charge_id BIGINT UNSIGNED NULL AFTER canceled_at','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='replaced_by_charge_id')=0,
  'ALTER TABLE financial_charges ADD COLUMN replaced_by_charge_id BIGINT UNSIGNED NULL AFTER reissued_from_charge_id','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='reissue_reason')=0,
  'ALTER TABLE financial_charges ADD COLUMN reissue_reason VARCHAR(500) NULL AFTER replaced_by_charge_id','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Permite mais de uma revisão da mesma competência sem perder proteção contra duplicidade da revisão.
SET @cols=(SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='uq_financial_monthly_competence');
SET @sql=IF(@cols IS NOT NULL AND @cols<>'tenant_id,type,competence,revision','ALTER TABLE financial_charges DROP INDEX uq_financial_monthly_competence','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='uq_financial_monthly_competence')=0,
  'ALTER TABLE financial_charges ADD UNIQUE KEY uq_financial_monthly_competence(tenant_id,type,competence,revision)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @cols=(SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='uq_financial_subscription_competence');
SET @sql=IF(@cols IS NOT NULL AND @cols<>'product_subscription_id,type,competence,revision','ALTER TABLE financial_charges DROP INDEX uq_financial_subscription_competence','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='uq_financial_subscription_competence')=0,
  'ALTER TABLE financial_charges ADD UNIQUE KEY uq_financial_subscription_competence(product_subscription_id,type,competence,revision)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='idx_financial_reissued_from')=0,
  'ALTER TABLE financial_charges ADD KEY idx_financial_reissued_from(reissued_from_charge_id)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='idx_financial_replaced_by')=0,
  'ALTER TABLE financial_charges ADD KEY idx_financial_replaced_by(replaced_by_charge_id)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
