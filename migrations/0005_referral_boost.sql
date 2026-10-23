-- The referral ladder's 3-friend boost is held apart from the Founding / First Year tier floor, so each lapses on its own.
ALTER TABLE "Customer" ADD COLUMN "boostTier" TEXT;
ALTER TABLE "Customer" ADD COLUMN "boostUntil" DATETIME;
