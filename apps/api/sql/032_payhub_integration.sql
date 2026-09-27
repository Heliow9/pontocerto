SET NAMES utf8mb4;
UPDATE commercial_products SET active=1,updated_at=NOW() WHERE code='PAYHUB';
INSERT INTO commercial_product_plans(product_id,code,name,price_monthly,active,metadata_json,created_at,updated_at)
SELECT id,'basico','Básico',1200.00,1,'{"maxEmployees":300,"documentRetentionDays":60}',NOW(),NOW() FROM commercial_products WHERE code='PAYHUB'
ON DUPLICATE KEY UPDATE name='Básico',active=1,metadata_json=VALUES(metadata_json),updated_at=NOW();
CREATE TABLE IF NOT EXISTS payhub_integration_mappings(
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,payhub_company_id VARCHAR(190) NOT NULL,commercial_customer_id BIGINT UNSIGNED NULL,product_subscription_id BIGINT UNSIGNED NULL,
 migration_status VARCHAR(30) NOT NULL DEFAULT 'LINKED',last_remote_snapshot_json LONGTEXT NULL,last_error VARCHAR(500) NULL,last_sync_at DATETIME NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_payhub_company(payhub_company_id),UNIQUE KEY uq_payhub_subscription(product_subscription_id),KEY idx_payhub_status(migration_status,last_sync_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
