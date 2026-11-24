-- Members may sign in with their mobile number or email plus a password, next to codes and the fingerprint.
ALTER TABLE "Customer" ADD COLUMN "passwordHash" TEXT;
