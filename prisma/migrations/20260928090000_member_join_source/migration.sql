-- Where a member joined: the ?src= tag on the join link or QR code.
ALTER TABLE "Customer" ADD COLUMN "joinedVia" TEXT;
