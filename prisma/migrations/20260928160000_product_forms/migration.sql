-- CBD food & drink, CBD skin care and non-cannabis supplements as their own classes; food, supplement and skin-care facts.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RegClass" ADD VALUE 'CBD_FOOD';
ALTER TYPE "RegClass" ADD VALUE 'CBD_TOPICAL';
ALTER TYPE "RegClass" ADD VALUE 'SUPPLEMENT';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ingredients" TEXT,
ADD COLUMN     "naturalCbd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "netContent" DOUBLE PRECISION,
ADD COLUMN     "netUnit" TEXT;

