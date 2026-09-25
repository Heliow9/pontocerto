SET NAMES utf8mb4;

SET @has_provider_settings_json := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'payment_provider_settings'
     AND COLUMN_NAME = 'settings_json'
);
SET @add_provider_settings_json := IF(
  @has_provider_settings_json = 0,
  'ALTER TABLE payment_provider_settings ADD COLUMN settings_json LONGTEXT NULL AFTER last_test_message',
  'SELECT 1'
);
PREPARE stmt_provider_settings_json FROM @add_provider_settings_json;
EXECUTE stmt_provider_settings_json;
DEALLOCATE PREPARE stmt_provider_settings_json;
