-- V4.1.3 HF2: notificacoes PWA para confirmacao de pagamentos no painel SaaS.
-- Compatível com MySQL 5.6.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS saas_financial_push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  device_key VARCHAR(80) NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  destination TEXT NOT NULL,
  payment_confirmed TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saas_fin_push_endpoint (endpoint_hash),
  UNIQUE KEY uq_saas_fin_push_device (user_id,device_key),
  KEY idx_saas_fin_push_user (user_id,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saas_financial_push_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(190) NOT NULL,
  charge_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_saas_fin_push_event (subscription_id,event_key),
  KEY idx_saas_fin_push_charge (charge_id),
  KEY idx_saas_fin_push_status (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
