SET NAMES utf8mb4;

-- O iDFace grava access_logs.time como o relógio exibido no equipamento.
-- A versão inicial da integração aplicava UTC-3 novamente. Reconstituímos o
-- DATETIME diretamente do Unix timestamp original preservado no payload.
UPDATE control_id_events e
LEFT JOIN time_entries te ON te.id=e.time_entry_id
SET
  te.registered_at=CASE
    WHEN te.id IS NOT NULL AND te.manually_adjusted=0 THEN
      TIMESTAMPADD(
        SECOND,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(e.payload_json,'$.time')) AS SIGNED),
        CAST('1970-01-01 00:00:00' AS DATETIME)
      )
    ELSE te.registered_at
  END,
  e.occurred_at=TIMESTAMPADD(
    SECOND,
    CAST(JSON_UNQUOTE(JSON_EXTRACT(e.payload_json,'$.time')) AS SIGNED),
    CAST('1970-01-01 00:00:00' AS DATETIME)
  )
WHERE JSON_EXTRACT(e.payload_json,'$.time') IS NOT NULL;
