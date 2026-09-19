SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS commercial_seller_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_name VARCHAR(190) NULL,
  trade_name VARCHAR(190) NULL,
  document VARCHAR(20) NULL,
  email VARCHAR(190) NULL,
  financial_email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  zip_code VARCHAR(12) NULL,
  street VARCHAR(190) NULL,
  number VARCHAR(30) NULL,
  complement VARCHAR(120) NULL,
  district VARCHAR(120) NULL,
  city VARCHAR(120) NULL,
  state CHAR(2) NULL,
  legal_representative_name VARCHAR(190) NULL,
  legal_representative_document VARCHAR(20) NULL,
  legal_representative_role VARCHAR(120) NULL,
  logo_path VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO commercial_seller_profiles(id,active,created_at,updated_at) VALUES(1,1,NOW(),NOW());

CREATE TABLE IF NOT EXISTS commercial_document_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  document_type VARCHAR(20) NOT NULL,
  version INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  title VARCHAR(255) NOT NULL,
  template_content LONGTEXT NOT NULL,
  template_metadata_json LONGTEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_document_template_version(product_id,document_type,version),
  KEY idx_document_template_active(product_id,document_type,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='commercial_customer_id')=0,'ALTER TABLE commercial_proposals ADD COLUMN commercial_customer_id BIGINT UNSIGNED NULL AFTER id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='product_id')=0,'ALTER TABLE commercial_proposals ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER commercial_customer_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='product_plan_id')=0,'ALTER TABLE commercial_proposals ADD COLUMN product_plan_id BIGINT UNSIGNED NULL AFTER product_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='template_id')=0,'ALTER TABLE commercial_proposals ADD COLUMN template_id BIGINT UNSIGNED NULL AFTER product_plan_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='template_version')=0,'ALTER TABLE commercial_proposals ADD COLUMN template_version INT UNSIGNED NULL AFTER template_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='seller_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN seller_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='customer_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN customer_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='product_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN product_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='plan_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN plan_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='pricing_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN pricing_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='billing_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN billing_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='rendered_content')=0,'ALTER TABLE commercial_proposals ADD COLUMN rendered_content LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='converted_customer_id')=0,'ALTER TABLE commercial_proposals ADD COLUMN converted_customer_id BIGINT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='converted_subscription_id')=0,'ALTER TABLE commercial_proposals ADD COLUMN converted_subscription_id BIGINT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='plan_id')='NO','ALTER TABLE commercial_proposals MODIFY COLUMN plan_id BIGINT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='max_employees')='NO','ALTER TABLE commercial_proposals MODIFY COLUMN max_employees INT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='commercial_customer_id')=0,'ALTER TABLE commercial_contracts ADD COLUMN commercial_customer_id BIGINT UNSIGNED NULL AFTER id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='product_id')=0,'ALTER TABLE commercial_contracts ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER commercial_customer_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='product_plan_id')=0,'ALTER TABLE commercial_contracts ADD COLUMN product_plan_id BIGINT UNSIGNED NULL AFTER product_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='template_id')=0,'ALTER TABLE commercial_contracts ADD COLUMN template_id BIGINT UNSIGNED NULL AFTER product_plan_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='template_version')=0,'ALTER TABLE commercial_contracts ADD COLUMN template_version INT UNSIGNED NULL AFTER template_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='seller_snapshot_json')=0,'ALTER TABLE commercial_contracts ADD COLUMN seller_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='customer_snapshot_json')=0,'ALTER TABLE commercial_contracts ADD COLUMN customer_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='product_snapshot_json')=0,'ALTER TABLE commercial_contracts ADD COLUMN product_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='plan_snapshot_json')=0,'ALTER TABLE commercial_contracts ADD COLUMN plan_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='pricing_snapshot_json')=0,'ALTER TABLE commercial_contracts ADD COLUMN pricing_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='billing_snapshot_json')=0,'ALTER TABLE commercial_contracts ADD COLUMN billing_snapshot_json LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='rendered_content')=0,'ALTER TABLE commercial_contracts ADD COLUMN rendered_content LONGTEXT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='product_subscription_id')=0,'ALTER TABLE commercial_contracts ADD COLUMN product_subscription_id BIGINT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='plan_id')='NO','ALTER TABLE commercial_contracts MODIFY COLUMN plan_id BIGINT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_contracts' AND COLUMN_NAME='max_employees')='NO','ALTER TABLE commercial_contracts MODIFY COLUMN max_employees INT UNSIGNED NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE commercial_proposals p
JOIN commercial_products prod ON prod.code='PONTO_CERTO'
LEFT JOIN plans legacy ON legacy.id=p.plan_id
LEFT JOIN commercial_product_plans cpp ON cpp.product_id=prod.id AND cpp.code=legacy.code
SET p.product_id=COALESCE(p.product_id,prod.id),p.product_plan_id=COALESCE(p.product_plan_id,cpp.id)
WHERE p.product_id IS NULL;
UPDATE commercial_contracts c
JOIN commercial_products prod ON prod.code='PONTO_CERTO'
LEFT JOIN plans legacy ON legacy.id=c.plan_id
LEFT JOIN commercial_product_plans cpp ON cpp.product_id=prod.id AND cpp.code=legacy.code
SET c.product_id=COALESCE(c.product_id,prod.id),c.product_plan_id=COALESCE(c.product_plan_id,cpp.id)
WHERE c.product_id IS NULL;

SET FOREIGN_KEY_CHECKS=1;
