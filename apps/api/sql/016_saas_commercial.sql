CREATE TABLE IF NOT EXISTS saas_plan_settings (
 plan_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 is_custom TINYINT NOT NULL DEFAULT 0,
 features_json LONGTEXT NOT NULL,
 max_branches INT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO plans(name,code,max_employees,price_monthly,active) VALUES
 ('Essencial','ESSENCIAL',15,69.90,1),('Profissional','PROFISSIONAL',100,99.90,1),
 ('Corporativo','CORPORATIVO',150,250.00,1),('Personalizado','PERSONALIZADO',NULL,0,1)
ON DUPLICATE KEY UPDATE name=VALUES(name),max_employees=VALUES(max_employees),price_monthly=VALUES(price_monthly);
INSERT INTO saas_plan_settings(plan_id,is_custom,features_json,max_branches)
 SELECT id,code='PERSONALIZADO',
 CASE WHEN code IN ('CORPORATIVO','PERSONALIZADO') THEN '{"whatsapp":true,"branches":true,"offline":true,"pwa":true,"android":true,"erp":true,"logs":true}'
 ELSE '{"whatsapp":false,"branches":false,"offline":true,"pwa":true,"android":true,"erp":true,"logs":true}' END,
 CASE WHEN code IN ('CORPORATIVO','PERSONALIZADO') THEN NULL ELSE 0 END
 FROM plans WHERE code IN ('ESSENCIAL','PROFISSIONAL','CORPORATIVO','PERSONALIZADO')
ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id);
CREATE TABLE IF NOT EXISTS tenant_contracts (
 tenant_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 max_employees INT UNSIGNED NULL,price_monthly DECIMAL(10,2) NULL,
 max_branches INT UNSIGNED NULL,features_json LONGTEXT NULL,
 updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS company_entitlements (
 tenant_id BIGINT UNSIGNED NOT NULL,company_id BIGINT UNSIGNED NOT NULL,
 features_json LONGTEXT NOT NULL,PRIMARY KEY(tenant_id,company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS user_permissions (
 tenant_id BIGINT UNSIGNED NOT NULL,user_id BIGINT UNSIGNED NOT NULL,
 permissions_json LONGTEXT NOT NULL,PRIMARY KEY(tenant_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS commercial_proposals (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 company_name VARCHAR(200) NOT NULL,cnpj VARCHAR(30) NOT NULL,
 responsible_name VARCHAR(160) NOT NULL,email VARCHAR(190) NOT NULL,phone VARCHAR(30) NOT NULL,
 plan_id BIGINT UNSIGNED NOT NULL,max_employees INT UNSIGNED NOT NULL,
 price_monthly DECIMAL(10,2) NOT NULL,max_branches INT UNSIGNED NULL,
 features_json LONGTEXT NOT NULL,implementation_days INT UNSIGNED NOT NULL,
 implementation_fee DECIMAL(10,2) NOT NULL DEFAULT 0,valid_until DATE NOT NULL,notes TEXT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',revision INT UNSIGNED NOT NULL DEFAULT 1,
 converted_tenant_id BIGINT UNSIGNED NULL,
 created_by BIGINT UNSIGNED NOT NULL,updated_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_proposal_tenant(converted_tenant_id),KEY idx_proposals_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS proposal_documents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,proposal_id BIGINT UNSIGNED NOT NULL,
 revision INT UNSIGNED NOT NULL,format VARCHAR(5) NOT NULL,filename VARCHAR(190) NOT NULL,
 sha256 CHAR(64) NOT NULL,content LONGBLOB NOT NULL,created_by BIGINT UNSIGNED NOT NULL,created_at DATETIME NOT NULL,
 KEY idx_proposal_documents(proposal_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS saas_settings (
 setting_key VARCHAR(80) NOT NULL PRIMARY KEY,setting_value LONGTEXT NOT NULL,updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
