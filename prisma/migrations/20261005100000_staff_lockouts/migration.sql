-- Wrong passwords and PINs are counted on the account, so a lockout holds across every server.
ALTER TABLE "User" ADD COLUMN "passwordFails" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordLockedAt" TIMESTAMP(3),
ADD COLUMN "pinFails" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinLockedAt" TIMESTAMP(3);
