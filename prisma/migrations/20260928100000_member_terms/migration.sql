-- The membership terms each member accepted, and when.
ALTER TABLE "Customer" ADD COLUMN "termsVersion" TEXT,
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
