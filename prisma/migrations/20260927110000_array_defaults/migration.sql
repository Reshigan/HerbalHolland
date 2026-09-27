-- AlterTable
ALTER TABLE "PriceList" ALTER COLUMN "tiers" SET DEFAULT ARRAY[]::"Tier"[],
ALTER COLUMN "storeIds" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "regionIds" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "effects" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "flavours" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "claims" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "channels" SET DEFAULT ARRAY[]::"Channel"[],
ALTER COLUMN "storeIds" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "categoryIds" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "productIds" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "rewardCategoryIds" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "rewardProductIds" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "days" SET DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "licences" SET DEFAULT ARRAY[]::"RegClass"[];

-- Backfill: lists written before the defaults were stored as NULL, which `isEmpty` / `has` filters don't match.
UPDATE "Store" SET "licences" = '{}' WHERE "licences" IS NULL;
UPDATE "Product" SET "effects" = '{}' WHERE "effects" IS NULL;
UPDATE "Product" SET "flavours" = '{}' WHERE "flavours" IS NULL;
UPDATE "Product" SET "claims" = '{}' WHERE "claims" IS NULL;
UPDATE "PriceList" SET "tiers" = '{}' WHERE "tiers" IS NULL;
UPDATE "PriceList" SET "storeIds" = '{}' WHERE "storeIds" IS NULL;
UPDATE "PriceList" SET "regionIds" = '{}' WHERE "regionIds" IS NULL;
UPDATE "Promotion" SET "categoryIds" = '{}' WHERE "categoryIds" IS NULL;
UPDATE "Promotion" SET "productIds" = '{}' WHERE "productIds" IS NULL;
UPDATE "Promotion" SET "rewardCategoryIds" = '{}' WHERE "rewardCategoryIds" IS NULL;
UPDATE "Promotion" SET "rewardProductIds" = '{}' WHERE "rewardProductIds" IS NULL;
UPDATE "Promotion" SET "channels" = '{}' WHERE "channels" IS NULL;
UPDATE "Promotion" SET "storeIds" = '{}' WHERE "storeIds" IS NULL;
UPDATE "Promotion" SET "days" = '{}' WHERE "days" IS NULL;
