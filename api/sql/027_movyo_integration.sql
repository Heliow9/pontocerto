-- V4 Movyo integration mapping, synchronization audit and product grace state.
-- Requires 025_commercial_multiproduct_core.sql and 026_commercial_document_templates.sql.
SET NAMES utf8mb4;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_subscriptions' AND COLUMN_NAME='grace_until')=0,
  'ALTER TABLE product_subscriptions ADD COLUMN grace_until DATETIME NULL AFTER blocked_at','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS movyo_integration_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movyo_restaurant_id VARCHAR(190) NOT NULL,
  commercial_customer_id BIGINT UNSIGNED NULL,
  product_subscription_id BIGINT UNSIGNED NULL,
  migration_status VARCHAR(30) NOT NULL DEFAULT 'LEGACY_MOVYO',
  last_remote_snapshot_json LONGTEXT NULL,
  last_error VARCHAR(500) NULL,
  last_sync_at DATETIME NULL,
  cutover_at DATETIME NULL,
  rollback_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_movyo_mapping_restaurant(movyo_restaurant_id),
  UNIQUE KEY uq_movyo_mapping_subscription(product_subscription_id),
  KEY idx_movyo_mapping_status(migration_status,last_sync_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_sync_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_subscription_id BIGINT UNSIGNED NULL,
  product_code VARCHAR(40) NOT NULL,
  external_account_id VARCHAR(190) NULL,
  action VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(120) NULL,
  request_json LONGTEXT NULL,
  response_json LONGTEXT NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_product_sync_idempotency(idempotency_key),
  KEY idx_product_sync_subscription(product_subscription_id,created_at),
  KEY idx_product_sync_status(product_code,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
