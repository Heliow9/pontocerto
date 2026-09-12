ALTER TABLE overtime_alerts
  ADD COLUMN next_attempt_at DATETIME NULL AFTER error_code,
  ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER next_attempt_at,
  ADD KEY idx_alert_retry (status,next_attempt_at,company_id,recipient),
  ADD KEY idx_alert_recipient_sent (tenant_id,company_id,recipient,sent_at);
