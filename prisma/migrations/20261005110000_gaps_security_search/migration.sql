-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "soldById" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tempPasswordUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Throttle" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Throttle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "gateway" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("gateway","eventId")
);

-- CreateTable
CREATE TABLE "TradeCart" (
    "tradeAccountId" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeCart_pkey" PRIMARY KEY ("tradeAccountId")
);

-- CreateIndex
CREATE INDEX "Throttle_key_createdAt_idx" ON "Throttle"("key", "createdAt");

-- CreateIndex
CREATE INDEX "Throttle_createdAt_idx" ON "Throttle"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_createdAt_idx" ON "PaymentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Customer_firstName_idx" ON "Customer" USING GIN ("firstName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_lastName_idx" ON "Customer" USING GIN ("lastName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Otp_createdAt_idx" ON "Otp"("createdAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "TradeCart" ADD CONSTRAINT "TradeCart_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
