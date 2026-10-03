-- CreateEnum
CREATE TYPE "TradeLicenceKind" AS ENUM ('PHARMACY_LICENCE', 'SAPC_RECORDING', 'SAHPRA_LICENCE', 'FOOD_COA', 'BUSINESS_LICENCE', 'PRACTICE_NUMBER', 'CIPC_REGISTRATION');

-- CreateEnum
CREATE TYPE "TradeLicenceStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED');

-- AlterEnum
ALTER TYPE "TradeAccountKind" ADD VALUE 'DISTRIBUTOR';

-- AlterTable
ALTER TABLE "TradeAccount" ADD COLUMN     "ipHash" TEXT;

-- CreateTable
CREATE TABLE "TradeLicence" (
    "id" TEXT NOT NULL,
    "tradeAccountId" TEXT NOT NULL,
    "kind" "TradeLicenceKind" NOT NULL,
    "number" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "uploadId" TEXT NOT NULL,
    "status" "TradeLicenceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectReason" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLicence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeLicence_tradeAccountId_kind_idx" ON "TradeLicence"("tradeAccountId", "kind");

-- CreateIndex
CREATE INDEX "TradeLicence_status_idx" ON "TradeLicence"("status");

-- CreateIndex
CREATE INDEX "TradeLicence_expiresAt_idx" ON "TradeLicence"("expiresAt");

-- AddForeignKey
ALTER TABLE "TradeLicence" ADD CONSTRAINT "TradeLicence_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

