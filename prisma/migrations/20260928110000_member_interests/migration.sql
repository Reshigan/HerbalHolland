-- What members told us they're into, for relevant deals.
ALTER TABLE "Customer" ADD COLUMN "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];
