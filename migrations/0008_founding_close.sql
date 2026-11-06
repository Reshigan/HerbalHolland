-- The Founding Members list now closes at midnight on New Year's Eve (Thu 31 December 2026, 23:59 SAST).
-- Moves the saved date only if it is still the old 30 November close and nobody has been numbered yet, so it does
-- nothing on a fresh database or if HQ has already set another date. Audited like the HQ form.
INSERT INTO "AuditLog" ("id", "at", "actorType", "actorName", "action", "entity", "entityId", "data")
SELECT 'migration-0008-founding-close', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'SYSTEM', 'Migration 0008', 'settings.launch', 'Setting', 'launch',
       '{"launchAt":{"from":"2026-11-30T21:59:00.000Z","to":"2026-12-31T21:59:00.000Z"}}'
FROM "Setting"
WHERE "key" = 'launch'
  AND json_extract("value", '$.launchAt') = '2026-11-30T21:59:00.000Z'
  AND NOT EXISTS (SELECT 1 FROM "Customer" WHERE "foundingNo" IS NOT NULL);

UPDATE "Setting"
SET "value" = json_set("value", '$.launchAt', '2026-12-31T21:59:00.000Z'),
    "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE "key" = 'launch'
  AND json_extract("value", '$.launchAt') = '2026-11-30T21:59:00.000Z'
  AND NOT EXISTS (SELECT 1 FROM "Customer" WHERE "foundingNo" IS NOT NULL);
