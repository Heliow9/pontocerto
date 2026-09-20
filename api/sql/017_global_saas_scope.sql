SET NAMES utf8mb4;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='companies' AND COLUMN_NAME='company_type')=0,"ALTER TABLE companies ADD COLUMN company_type ENUM('MATRIX','BRANCH') NULL AFTER tenant_id",'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE companies c JOIN (SELECT tenant_id,MIN(id) matrix_id FROM companies GROUP BY tenant_id) x ON x.tenant_id=c.tenant_id SET c.company_type=IF(c.id=x.matrix_id,'MATRIX','BRANCH') WHERE c.company_type IS NULL;
SET @sql=IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='companies' AND COLUMN_NAME='company_type')='YES',"ALTER TABLE companies MODIFY COLUMN company_type ENUM('MATRIX','BRANCH') NOT NULL",'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='companies' AND INDEX_NAME='idx_companies_type')=0,'ALTER TABLE companies ADD KEY idx_companies_type(tenant_id,company_type,active)','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_permissions' AND COLUMN_NAME='sensitive_permissions_json')=0,"ALTER TABLE user_permissions ADD COLUMN sensitive_permissions_json LONGTEXT NULL",'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='company_id')=0,'ALTER TABLE audit_logs ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER tenant_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='executor_name')=0,'ALTER TABLE audit_logs ADD COLUMN executor_name VARCHAR(190) NULL AFTER user_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='executor_email')=0,'ALTER TABLE audit_logs ADD COLUMN executor_email VARCHAR(190) NULL AFTER executor_name','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='executor_role')=0,'ALTER TABLE audit_logs ADD COLUMN executor_role VARCHAR(40) NULL AFTER executor_email','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='module')=0,'ALTER TABLE audit_logs ADD COLUMN module VARCHAR(100) NULL AFTER executor_role','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='result')=0,"ALTER TABLE audit_logs ADD COLUMN result ENUM('SUCCESS','ERROR') NOT NULL DEFAULT 'SUCCESS' AFTER entity_id",'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND COLUMN_NAME='details')=0,'ALTER TABLE audit_logs ADD COLUMN details LONGTEXT NULL AFTER after_data','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='proposal_number')=0,'ALTER TABLE commercial_proposals ADD COLUMN proposal_number VARCHAR(40) NULL AFTER id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='plan_name_snapshot')=0,'ALTER TABLE commercial_proposals ADD COLUMN plan_name_snapshot VARCHAR(120) NULL AFTER plan_id','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND COLUMN_NAME='commercial_snapshot_json')=0,'ALTER TABLE commercial_proposals ADD COLUMN commercial_snapshot_json LONGTEXT NULL AFTER features_json','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
UPDATE commercial_proposals cp
JOIN plans p ON p.id=cp.plan_id
SET cp.plan_name_snapshot=COALESCE(cp.plan_name_snapshot,p.name),
    cp.proposal_number=COALESCE(cp.proposal_number,CONCAT('PC-',YEAR(cp.created_at),'-',LPAD(cp.id,5,'0'))),
    cp.commercial_snapshot_json=COALESCE(cp.commercial_snapshot_json,CONCAT('{\"planName\":\"',REPLACE(REPLACE(COALESCE(p.name,''),'\\','\\\\'),'\"','\\\"'),'\",\"maxEmployees\":',IFNULL(cp.max_employees,'null'),',\"priceMonthly\":',IFNULL(cp.price_monthly,'null'),',\"maxBranches\":',IFNULL(cp.max_branches,'null'),',\"features\":',IF(cp.features_json IS NULL OR TRIM(cp.features_json)='', 'null', cp.features_json),',\"implementationDays\":',IFNULL(cp.implementation_days,'null'),',\"implementationFee\":',IFNULL(cp.implementation_fee,'0'),'}'));
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commercial_proposals' AND INDEX_NAME='uq_proposal_number')=0,'ALTER TABLE commercial_proposals ADD UNIQUE KEY uq_proposal_number(proposal_number)','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS commercial_contracts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 contract_number VARCHAR(40) NOT NULL,
 proposal_id BIGINT UNSIGNED NOT NULL,
 tenant_id BIGINT UNSIGNED NULL,
 company_name VARCHAR(200) NOT NULL,cnpj VARCHAR(30) NOT NULL,responsible_name VARCHAR(160) NOT NULL,email VARCHAR(190) NOT NULL,phone VARCHAR(30) NOT NULL,
 plan_id BIGINT UNSIGNED NOT NULL,plan_name_snapshot VARCHAR(120) NOT NULL,max_employees INT UNSIGNED NOT NULL,price_monthly DECIMAL(10,2) NOT NULL,max_branches INT UNSIGNED NULL,features_json LONGTEXT NOT NULL,implementation_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
 contract_date DATE NOT NULL,start_date DATE NULL,term_months INT UNSIGNED NULL,due_day TINYINT UNSIGNED NULL,payment_method VARCHAR(80) NULL,adjustment_rule VARCHAR(255) NULL,notes TEXT NULL,forum VARCHAR(190) NULL,client_representative VARCHAR(190) NULL,ponto_certo_representative VARCHAR(190) NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',revision INT UNSIGNED NOT NULL DEFAULT 1,created_by BIGINT UNSIGNED NOT NULL,updated_by BIGINT UNSIGNED NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_contract_number(contract_number),UNIQUE KEY uq_contract_proposal(proposal_id),KEY idx_contract_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contract_documents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,contract_id BIGINT UNSIGNED NOT NULL,revision INT UNSIGNED NOT NULL,format VARCHAR(10) NOT NULL,filename VARCHAR(190) NOT NULL,sha256 CHAR(64) NOT NULL,content LONGBLOB NOT NULL,created_by BIGINT UNSIGNED NOT NULL,created_at DATETIME NOT NULL,KEY idx_contract_documents(contract_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contract_signed_files (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,contract_id BIGINT UNSIGNED NOT NULL,filename VARCHAR(190) NOT NULL,sha256 CHAR(64) NOT NULL,content LONGBLOB NOT NULL,uploaded_by BIGINT UNSIGNED NOT NULL,uploaded_at DATETIME NOT NULL,KEY idx_contract_signed(contract_id,uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND INDEX_NAME='idx_audit_company_created')=0,'ALTER TABLE audit_logs ADD KEY idx_audit_company_created(company_id,created_at)','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND INDEX_NAME='idx_audit_module_result')=0,'ALTER TABLE audit_logs ADD KEY idx_audit_module_result(tenant_id,module,result,created_at)','SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
