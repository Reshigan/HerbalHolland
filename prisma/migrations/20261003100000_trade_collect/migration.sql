-- Trade orders: click & collect at a store (handling fee, collection code) beside courier from the DC. The fulfilling
-- store replaces the DC column; the table is empty at this point (the trade channel hasn't shipped).
-- AlterEnum


ALTER TYPE "TradeOrderStatus" ADD VALUE 'READY';
ALTER TYPE "TradeOrderStatus" ADD VALUE 'COLLECTED';

-- DropForeignKey
ALTER TABLE "TradeOrder" DROP CONSTRAINT "TradeOrder_dcId_fkey";

-- DropIndex
DROP INDEX "TradeOrder_dcId_status_idx";

-- AlterTable
ALTER TABLE "TradeOrder" DROP COLUMN "dcId",
ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "collectionCode" TEXT,
ADD COLUMN     "fulfilment" "Fulfilment" NOT NULL DEFAULT 'COURIER',
ADD COLUMN     "handlingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "storeId" TEXT NOT NULL,
ALTER COLUMN "addressLine" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "province" DROP NOT NULL,
ALTER COLUMN "postalCode" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "TradeOrder_storeId_status_idx" ON "TradeOrder"("storeId", "status");

-- AddForeignKey
ALTER TABLE "TradeOrder" ADD CONSTRAINT "TradeOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

