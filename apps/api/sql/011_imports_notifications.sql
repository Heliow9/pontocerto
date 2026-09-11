CREATE TABLE IF NOT EXISTS employee_imports (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  imported_count INT NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  device_key VARCHAR(80) NOT NULL,
  kind ENUM('WEB','EXPO') NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  destination LONGTEXT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_push_destination (endpoint_hash),
  UNIQUE KEY uq_push_device (tenant_id,employee_id,device_key),
  KEY idx_push_employee (tenant_id,employee_id,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscription_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(90) NOT NULL,
  status ENUM('CLAIMED','SENT','FAILED') NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_push_event (subscription_id,event_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
