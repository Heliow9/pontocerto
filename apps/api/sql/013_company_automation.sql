CREATE TABLE IF NOT EXISTS company_automation (
 tenant_id BIGINT UNSIGNED NOT NULL, company_id BIGINT UNSIGNED NOT NULL,
 overtime_enabled TINYINT NOT NULL DEFAULT 0, remote_enabled TINYINT NOT NULL DEFAULT 0,
 offline_enabled TINYINT NOT NULL DEFAULT 0, recipients LONGTEXT NOT NULL,
 whatsapp_enabled TINYINT NOT NULL DEFAULT 0,
 PRIMARY KEY (tenant_id,company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS overtime_references (
 tenant_id BIGINT UNSIGNED NOT NULL, company_id BIGINT UNSIGNED NOT NULL,
 entity_kind VARCHAR(10) NOT NULL, entity_id BIGINT UNSIGNED NOT NULL,
 monthly_minutes INT NOT NULL,
 PRIMARY KEY (tenant_id,entity_kind,entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS whatsapp_auth (
 tenant_id BIGINT UNSIGNED NOT NULL, company_id BIGINT UNSIGNED NOT NULL,
 auth_key VARCHAR(190) NOT NULL, encrypted_value LONGTEXT NOT NULL,
 PRIMARY KEY (tenant_id,company_id,auth_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS overtime_alerts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL, company_id BIGINT UNSIGNED NOT NULL,
 employee_id BIGINT UNSIGNED NOT NULL, month_key CHAR(7) NOT NULL,
 threshold_key VARCHAR(10) NOT NULL, recipient VARCHAR(20) NOT NULL,
 message_text TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 message_id VARCHAR(100) NULL, error_code VARCHAR(80) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at DATETIME NULL,
 UNIQUE KEY uq_overtime_alert(tenant_id,company_id,employee_id,month_key,threshold_key,recipient),
 KEY idx_alert_pending(status,company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS remote_punches (
 tenant_id BIGINT UNSIGNED NOT NULL, company_id BIGINT UNSIGNED NOT NULL,
 employee_id BIGINT UNSIGNED NOT NULL, request_key VARCHAR(80) NOT NULL,
 time_entry_id BIGINT UNSIGNED NOT NULL, captured_at DATETIME NOT NULL,
 received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 was_offline TINYINT NOT NULL, payload_hash CHAR(64) NOT NULL,
 PRIMARY KEY (tenant_id,employee_id,request_key), UNIQUE KEY uq_remote_entry(time_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
