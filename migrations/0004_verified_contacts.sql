-- Sign-in codes by email: which contact details a code has proved, and where a member's code went.
ALTER TABLE "Customer" ADD COLUMN "phoneVerifiedAt" DATETIME;
ALTER TABLE "Customer" ADD COLUMN "emailVerifiedAt" DATETIME;
ALTER TABLE "Otp" ADD COLUMN "sentTo" TEXT;
-- Every member so far joined with a code to their phone.
UPDATE "Customer" SET "phoneVerifiedAt" = "createdAt";
