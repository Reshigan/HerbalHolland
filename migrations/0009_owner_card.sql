-- Card 0001 (member HH0100001, the owner's own card) opens Insights in the app: links it to the HQ admin account.
-- Only when there is exactly one active HQ admin, that admin has no card yet, and no account holds this card, so it
-- does nothing on a fresh database or once someone has chosen differently in the app. Audited like the app's link.
INSERT INTO "AuditLog" ("id", "at", "actorType", "actorName", "action", "entity", "entityId", "data")
SELECT 'migration-0009-owner-card', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'SYSTEM', 'Migration 0009', 'staff.member_link', 'User', u."id",
       json_object('name', u."name", 'memberNo', c."memberNo", 'before', NULL)
FROM "User" u, "Customer" c
WHERE c."memberNo" = 'HH0100001'
  AND u."role" = 'HQ_ADMIN' AND u."active" = 1 AND u."memberId" IS NULL
  AND (SELECT COUNT(*) FROM "User" WHERE "role" = 'HQ_ADMIN' AND "active" = 1) = 1
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "memberId" = c."id");

UPDATE "User"
SET "memberId" = (SELECT "id" FROM "Customer" WHERE "memberNo" = 'HH0100001')
WHERE "id" = (SELECT "entityId" FROM "AuditLog" WHERE "id" = 'migration-0009-owner-card')
  AND "memberId" IS NULL;
