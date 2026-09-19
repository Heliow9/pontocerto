SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS commercial_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  legal_name VARCHAR(190) NOT NULL,
  trade_name VARCHAR(190) NULL,
  person_type VARCHAR(2) NOT NULL DEFAULT 'PJ',
  document VARCHAR(20) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  financial_contact_name VARCHAR(190) NULL,
  financial_contact_document VARCHAR(20) NULL,
  financial_contact_email VARCHAR(190) NULL,
  financial_contact_phone VARCHAR(30) NULL,
  zip_code VARCHAR(12) NULL,
  street VARCHAR(190) NULL,
  number VARCHAR(30) NULL,
  complement VARCHAR(120) NULL,
  district VARCHAR(120) NULL,
  city VARCHAR(120) NULL,
  state CHAR(2) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_commercial_customer_tenant(tenant_id),
  KEY idx_commercial_customer_document(document),
  KEY idx_commercial_customer_status(status,legal_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commercial_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  default_provider VARCHAR(30) NULL,
  default_payment_method VARCHAR(20) NULL,
  default_grace_days SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  default_auto_block TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_commercial_product_code(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commercial_product_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  price_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_commercial_product_plan(product_id,code),
  KEY idx_commercial_plan_product(product_id,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  commercial_customer_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_plan_id BIGINT UNSIGNED NULL,
  tenant_id BIGINT UNSIGNED NULL,
  external_source VARCHAR(40) NULL,
  external_account_id VARCHAR(190) NULL,
  billing_source VARCHAR(40) NOT NULL DEFAULT 'PONTO_CERTO',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  monthly_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  starts_at DATETIME NULL,
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  next_due_date DATE NULL,
  billing_provider VARCHAR(30) NULL,
  billing_method VARCHAR(20) NULL,
  grace_days SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  auto_block TINYINT(1) NOT NULL DEFAULT 1,
  blocked_at DATETIME NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY(id),
  UNIQUE KEY uq_product_external(product_id,external_source,external_account_id),
  UNIQUE KEY uq_product_tenant(product_id,tenant_id),
  KEY idx_product_subscription_customer(commercial_customer_id,status),
  KEY idx_product_subscription_due(status,next_due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO commercial_products(code,name,description,active,created_at,updated_at) VALUES
 ('PONTO_CERTO','Ponto Certo','Sistema de gestão de jornada e registro de ponto.',1,NOW(),NOW()),
 ('MOVYO','Movyo','Plataforma SaaS para operação, PDV e delivery de restaurantes.',1,NOW(),NOW()),
 ('PAYHUB','PayHub','Produto de gestão documental e assinatura eletrônica.',0,NOW(),NOW())
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),updated_at=NOW();

INSERT INTO commercial_product_plans(product_id,code,name,price_monthly,active,metadata_json,created_at,updated_at)
SELECT cp.id,p.code,p.name,p.price_monthly,p.active,JSON_OBJECT('legacyPlanId',p.id,'maxEmployees',p.max_employees),NOW(),NOW()
FROM plans p JOIN commercial_products cp ON cp.code='PONTO_CERTO'
ON DUPLICATE KEY UPDATE name=VALUES(name),price_monthly=VALUES(price_monthly),active=VALUES(active),metadata_json=VALUES(metadata_json),updated_at=NOW();

INSERT INTO commercial_product_plans(product_id,code,name,price_monthly,active,metadata_json,created_at,updated_at)
SELECT cp.id,x.code,x.name,x.price,1,x.meta,NOW(),NOW()
FROM commercial_products cp
JOIN (
 SELECT 'starter-mobile' code,'Start Mobile' name,69.90 price,'{"source":"movyo-planRules"}' meta
 UNION ALL SELECT 'essencial','Essencial',129.90,'{"source":"movyo-planRules"}'
 UNION ALL SELECT 'professional','Profissional',179.90,'{"source":"movyo-planRules"}'
 UNION ALL SELECT 'premium','Premium',229.90,'{"source":"movyo-planRules"}'
) x ON cp.code='MOVYO'
ON DUPLICATE KEY UPDATE name=VALUES(name),price_monthly=VALUES(price_monthly),active=1,metadata_json=VALUES(metadata_json),updated_at=NOW();

INSERT INTO commercial_customers(tenant_id,legal_name,trade_name,person_type,document,email,phone,financial_contact_name,financial_contact_document,financial_contact_email,financial_contact_phone,zip_code,street,number,complement,district,city,state,status,created_at,updated_at)
SELECT t.id,
       COALESCE(NULLIF(bp.billing_legal_name,''),t.name),
       NULLIF(bp.billing_trade_name,''),
       CASE WHEN LENGTH(COALESCE(NULLIF(bp.billing_document,''),''))=11 THEN 'PF' ELSE 'PJ' END,
       NULLIF(bp.billing_document,''),
       NULLIF(LOWER(COALESCE(bp.billing_email,'')),''),
       NULLIF(bp.billing_phone,''),
       NULLIF(bp.financial_contact_name,''),
       NULLIF(bp.financial_contact_document,''),
       NULLIF(LOWER(COALESCE(bp.financial_contact_email,'')),''),
       NULLIF(bp.financial_contact_phone,''),
       NULLIF(bp.billing_zip_code,''),NULLIF(bp.billing_street,''),NULLIF(bp.billing_number,''),NULLIF(bp.billing_complement,''),NULLIF(bp.billing_district,''),NULLIF(bp.billing_city,''),NULLIF(bp.billing_state,''),
       CASE WHEN t.status='CANCELED' THEN 'INACTIVE' ELSE 'ACTIVE' END,NOW(),NOW()
FROM tenants t
LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=t.id
WHERE NOT EXISTS(SELECT 1 FROM users su WHERE su.tenant_id=t.id AND su.role='SUPER_ADMIN')
ON DUPLICATE KEY UPDATE legal_name=VALUES(legal_name),trade_name=COALESCE(VALUES(trade_name),trade_name),updated_at=NOW();

INSERT INTO product_subscriptions(commercial_customer_id,product_id,product_plan_id,tenant_id,external_source,external_account_id,billing_source,status,monthly_price,discount_percent,starts_at,current_period_start,current_period_end,next_due_date,billing_provider,billing_method,grace_days,auto_block,metadata_json,created_at,updated_at)
SELECT cc.id,prod.id,cpp.id,t.id,'PONTO_CERTO_TENANT',CAST(t.id AS CHAR),'PONTO_CERTO',COALESCE(s.status,'ACTIVE'),
       COALESCE(tc.price_monthly,p.price_monthly,0),0,
       COALESCE(s.created_at,t.created_at),NULL,s.current_period_end,
       CASE WHEN s.current_period_end IS NULL THEN NULL ELSE DATE(s.current_period_end) END,
       fs.default_payment_provider,fs.default_payment_method,COALESCE(bp.grace_days,3),COALESCE(bp.auto_block_enabled,1),
       JSON_OBJECT('legacySubscriptionId',s.id,'legacyPlanId',p.id),NOW(),NOW()
FROM tenants t
JOIN commercial_customers cc ON cc.tenant_id=t.id
JOIN commercial_products prod ON prod.code='PONTO_CERTO'
LEFT JOIN subscriptions s ON s.id=(SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.tenant_id=t.id)
LEFT JOIN plans p ON p.id=s.plan_id
LEFT JOIN commercial_product_plans cpp ON cpp.product_id=prod.id AND cpp.code=p.code
LEFT JOIN tenant_contracts tc ON tc.tenant_id=t.id
LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=t.id
LEFT JOIN financial_settings fs ON fs.id=1
WHERE NOT EXISTS(SELECT 1 FROM users su WHERE su.tenant_id=t.id AND su.role='SUPER_ADMIN')
ON DUPLICATE KEY UPDATE product_plan_id=COALESCE(VALUES(product_plan_id),product_plan_id),monthly_price=VALUES(monthly_price),current_period_end=VALUES(current_period_end),updated_at=NOW();

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='commercial_customer_id')=0,'ALTER TABLE financial_charges ADD COLUMN commercial_customer_id BIGINT UNSIGNED NULL AFTER tenant_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='product_subscription_id')=0,'ALTER TABLE financial_charges ADD COLUMN product_subscription_id BIGINT UNSIGNED NULL AFTER commercial_customer_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='product_code')=0,'ALTER TABLE financial_charges ADD COLUMN product_code VARCHAR(40) NULL AFTER product_subscription_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND COLUMN_NAME='payer_source') NOT LIKE '%COMMERCIAL%','ALTER TABLE financial_charges MODIFY COLUMN payer_source ENUM(''TENANT'',''COMMERCIAL'',''EXTERNAL'') NOT NULL','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND CONSTRAINT_NAME='chk_financial_external_tenant')>0,'ALTER TABLE financial_charges DROP CHECK chk_financial_external_tenant','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND CONSTRAINT_NAME='chk_financial_charge_owner')=0,'ALTER TABLE financial_charges ADD CONSTRAINT chk_financial_charge_owner CHECK (tenant_id IS NOT NULL OR product_subscription_id IS NOT NULL OR (type=''AD_HOC'' AND payer_source=''EXTERNAL''))','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='uq_financial_subscription_competence')=0,'ALTER TABLE financial_charges ADD UNIQUE KEY uq_financial_subscription_competence(product_subscription_id,type,competence)','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_charges' AND INDEX_NAME='idx_financial_product_status')=0,'ALTER TABLE financial_charges ADD KEY idx_financial_product_status(product_code,status,due_date)','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE financial_charges fc
JOIN commercial_customers cc ON cc.tenant_id=fc.tenant_id
JOIN product_subscriptions ps ON ps.tenant_id=fc.tenant_id
JOIN commercial_products cp ON cp.id=ps.product_id AND cp.code='PONTO_CERTO'
SET fc.commercial_customer_id=COALESCE(fc.commercial_customer_id,cc.id),
    fc.product_subscription_id=COALESCE(fc.product_subscription_id,ps.id),
    fc.product_code=COALESCE(fc.product_code,'PONTO_CERTO')
WHERE fc.tenant_id IS NOT NULL;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_payments' AND COLUMN_NAME='commercial_customer_id')=0,'ALTER TABLE financial_payments ADD COLUMN commercial_customer_id BIGINT UNSIGNED NULL AFTER tenant_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_payments' AND COLUMN_NAME='product_subscription_id')=0,'ALTER TABLE financial_payments ADD COLUMN product_subscription_id BIGINT UNSIGNED NULL AFTER commercial_customer_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE financial_payments fp JOIN financial_charges fc ON fc.id=fp.charge_id SET fp.commercial_customer_id=COALESCE(fp.commercial_customer_id,fc.commercial_customer_id),fp.product_subscription_id=COALESCE(fp.product_subscription_id,fc.product_subscription_id);

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='financial_events' AND COLUMN_NAME='product_subscription_id')=0,'ALTER TABLE financial_events ADD COLUMN product_subscription_id BIGINT UNSIGNED NULL AFTER charge_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS=1;
