SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE saas_billing_profiles
  ADD COLUMN billing_legal_name VARCHAR(190) NULL,
  ADD COLUMN billing_trade_name VARCHAR(190) NULL,
  ADD COLUMN billing_document VARCHAR(20) NULL,
  ADD COLUMN billing_email VARCHAR(190) NULL,
  ADD COLUMN billing_phone VARCHAR(30) NULL,
  ADD COLUMN financial_contact_name VARCHAR(190) NULL,
  ADD COLUMN financial_contact_document VARCHAR(20) NULL,
  ADD COLUMN financial_contact_email VARCHAR(190) NULL,
  ADD COLUMN financial_contact_phone VARCHAR(30) NULL,
  ADD COLUMN billing_zip_code VARCHAR(12) NULL,
  ADD COLUMN billing_street VARCHAR(190) NULL,
  ADD COLUMN billing_number VARCHAR(30) NULL,
  ADD COLUMN billing_complement VARCHAR(120) NULL,
  ADD COLUMN billing_district VARCHAR(120) NULL,
  ADD COLUMN billing_city VARCHAR(120) NULL,
  ADD COLUMN billing_state CHAR(2) NULL,
  ADD COLUMN auto_email_charges TINYINT(1) NOT NULL DEFAULT 1;

UPDATE saas_billing_profiles bp
LEFT JOIN companies c ON c.tenant_id=bp.tenant_id AND c.company_type='MATRIX'
LEFT JOIN company_profiles cp ON cp.company_id=c.id AND cp.tenant_id=c.tenant_id
SET bp.billing_legal_name=COALESCE(NULLIF(bp.billing_legal_name,''),c.legal_name),
    bp.billing_trade_name=COALESCE(NULLIF(bp.billing_trade_name,''),c.trade_name),
    bp.billing_document=COALESCE(NULLIF(bp.billing_document,''),REGEXP_REPLACE(COALESCE(c.cnpj,''),'[^0-9]','')),
    bp.billing_email=COALESCE(NULLIF(bp.billing_email,''),cp.email),
    bp.billing_phone=COALESCE(NULLIF(bp.billing_phone,''),REGEXP_REPLACE(COALESCE(cp.phone,''),'[^0-9]','')),
    bp.billing_zip_code=COALESCE(NULLIF(bp.billing_zip_code,''),REGEXP_REPLACE(COALESCE(cp.zip_code,''),'[^0-9]','')),
    bp.billing_street=COALESCE(NULLIF(bp.billing_street,''),cp.street,cp.address),
    bp.billing_number=COALESCE(NULLIF(bp.billing_number,''),cp.address_number),
    bp.billing_complement=COALESCE(NULLIF(bp.billing_complement,''),cp.complement),
    bp.billing_district=COALESCE(NULLIF(bp.billing_district,''),cp.district),
    bp.billing_city=COALESCE(NULLIF(bp.billing_city,''),cp.city),
    bp.billing_state=COALESCE(NULLIF(bp.billing_state,''),UPPER(cp.state));

ALTER TABLE financial_charges
  ADD COLUMN payer_source ENUM('TENANT','EXTERNAL') NULL AFTER tenant_id,
  ADD COLUMN payer_person_type ENUM('PF','PJ') NULL AFTER payer_source,
  ADD COLUMN payer_name VARCHAR(190) NULL AFTER payer_person_type,
  ADD COLUMN payer_document VARCHAR(20) NULL AFTER payer_name,
  ADD COLUMN payer_email VARCHAR(190) NULL AFTER payer_document,
  ADD COLUMN payer_phone VARCHAR(30) NULL AFTER payer_email,
  ADD COLUMN payer_zip_code VARCHAR(12) NULL AFTER payer_phone,
  ADD COLUMN payer_street VARCHAR(190) NULL AFTER payer_zip_code,
  ADD COLUMN payer_number VARCHAR(30) NULL AFTER payer_street,
  ADD COLUMN payer_complement VARCHAR(120) NULL AFTER payer_number,
  ADD COLUMN payer_district VARCHAR(120) NULL AFTER payer_complement,
  ADD COLUMN payer_city VARCHAR(120) NULL AFTER payer_district,
  ADD COLUMN payer_state CHAR(2) NULL AFTER payer_city,
  ADD COLUMN send_email_after_issue TINYINT(1) NOT NULL DEFAULT 1 AFTER payer_state;

UPDATE financial_charges c
LEFT JOIN saas_billing_profiles bp ON bp.tenant_id=c.tenant_id
LEFT JOIN tenants t ON t.id=c.tenant_id
SET c.payer_source='TENANT',
    c.payer_person_type=CASE WHEN LENGTH(REGEXP_REPLACE(COALESCE(bp.billing_document,''),'[^0-9]',''))=11 THEN 'PF' ELSE 'PJ' END,
    c.payer_name=COALESCE(NULLIF(bp.billing_legal_name,''),t.name,'Cliente legado'),
    c.payer_document=REGEXP_REPLACE(COALESCE(bp.billing_document,''),'[^0-9]',''),
    c.payer_email=NULLIF(LOWER(TRIM(COALESCE(bp.financial_contact_email,bp.billing_email,''))),''),
    c.payer_phone=NULLIF(REGEXP_REPLACE(COALESCE(bp.financial_contact_phone,bp.billing_phone,''),'[^0-9]',''),''),
    c.payer_zip_code=NULLIF(REGEXP_REPLACE(COALESCE(bp.billing_zip_code,''),'[^0-9]',''),''),
    c.payer_street=NULLIF(TRIM(COALESCE(bp.billing_street,'')),''),
    c.payer_number=NULLIF(TRIM(COALESCE(bp.billing_number,'')),''),
    c.payer_complement=NULLIF(TRIM(COALESCE(bp.billing_complement,'')),''),
    c.payer_district=NULLIF(TRIM(COALESCE(bp.billing_district,'')),''),
    c.payer_city=NULLIF(TRIM(COALESCE(bp.billing_city,'')),''),
    c.payer_state=NULLIF(UPPER(TRIM(COALESCE(bp.billing_state,''))),'')
WHERE c.payer_source IS NULL;

ALTER TABLE financial_charges
  MODIFY COLUMN payer_source ENUM('TENANT','EXTERNAL') NOT NULL,
  MODIFY COLUMN payer_person_type ENUM('PF','PJ') NOT NULL,
  MODIFY COLUMN payer_name VARCHAR(190) NOT NULL,
  MODIFY COLUMN payer_document VARCHAR(20) NOT NULL;

ALTER TABLE financial_charges DROP FOREIGN KEY fk_financial_charges_tenant;
ALTER TABLE financial_charges MODIFY COLUMN tenant_id BIGINT UNSIGNED NULL;
ALTER TABLE financial_charges ADD CONSTRAINT fk_financial_charges_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE financial_charges ADD KEY idx_financial_payer_document (payer_source,payer_document);
ALTER TABLE financial_charges ADD CONSTRAINT chk_financial_external_tenant CHECK (tenant_id IS NOT NULL OR (type='AD_HOC' AND payer_source='EXTERNAL'));

ALTER TABLE financial_payments DROP FOREIGN KEY fk_financial_payments_tenant;
ALTER TABLE financial_payments MODIFY COLUMN tenant_id BIGINT UNSIGNED NULL;
ALTER TABLE financial_payments ADD CONSTRAINT fk_financial_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

ALTER TABLE financial_events DROP FOREIGN KEY fk_financial_events_tenant;
ALTER TABLE financial_events MODIFY COLUMN tenant_id BIGINT UNSIGNED NULL;
ALTER TABLE financial_events ADD CONSTRAINT fk_financial_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

CREATE TABLE IF NOT EXISTS financial_charge_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  charge_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NULL,
  recipient_email VARCHAR(190) NOT NULL,
  cc_email VARCHAR(190) NULL,
  subject VARCHAR(255) NOT NULL,
  delivery_type ENUM('AUTO','MANUAL') NOT NULL,
  status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  smtp_message_id VARCHAR(255) NULL,
  error_message VARCHAR(500) NULL,
  sent_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY(id),
  KEY idx_financial_delivery_charge (charge_id,created_at),
  KEY idx_financial_delivery_tenant (tenant_id,created_at),
  CONSTRAINT fk_financial_delivery_charge FOREIGN KEY(charge_id) REFERENCES financial_charges(id),
  CONSTRAINT fk_financial_delivery_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_financial_delivery_user FOREIGN KEY(sent_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;
