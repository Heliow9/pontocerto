CREATE TABLE IF NOT EXISTS punch_requests (
 tenant_id BIGINT UNSIGNED NOT NULL,
 employee_id BIGINT UNSIGNED NOT NULL,
 request_key VARCHAR(80) NOT NULL,
 time_entry_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY (tenant_id,employee_id,request_key),
 KEY idx_punch_requests_entry (time_entry_id),
 CONSTRAINT fk_punch_requests_entry FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
