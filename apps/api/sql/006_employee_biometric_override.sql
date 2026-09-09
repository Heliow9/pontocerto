SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- v0.4.2
-- Permite que RH/Admin dispense a biometria nativa para um funcionário específico.
-- A política da empresa continua sendo a regra padrão.
-- biometric_exempt=1 => biometria dispensada para este funcionário.
-- Ao alterar esta configuração, os dispositivos ativos são revogados e devem ser vinculados novamente.

SET @sql = IF(
  (SELECT COUNT(*)
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='employees'
      AND COLUMN_NAME='biometric_exempt')=0,
  'ALTER TABLE employees ADD COLUMN biometric_exempt TINYINT(1) NOT NULL DEFAULT 0 AFTER work_schedule_id',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS=1;
