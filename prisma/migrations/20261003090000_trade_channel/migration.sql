-- CreateEnum
CREATE TYPE "TradeAccountStatus" AS ENUM ('PENDING', 'APPROVED', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "TradeTerms" AS ENUM ('PREPAID', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "TradeAccountKind" AS ENUM ('PHARMACY', 'RETAILER', 'CAFE', 'PRACTICE', 'ONLINE_SHOP', 'OTHER');

-- CreateEnum
CREATE TYPE "TradeBuyerRole" AS ENUM ('OWNER', 'BUYER');

-- CreateEnum
CREATE TYPE "TradeOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PLACED', 'PICKING', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeLedgerKind" AS ENUM ('INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "Channel" ADD VALUE 'WHOLESALE';

-- AlterEnum
ALTER TYPE "PayMethod" ADD VALUE 'ACCOUNT';

-- AlterEnum
ALTER TYPE "PriceListKind" ADD VALUE 'TRADE';

-- AlterTable
ALTER TABLE "DailyStoreStat" ADD COLUMN     "accountCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Otp" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "tradeAccountId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "tradeBuyerId" TEXT;

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "caseQty" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TradeAccount" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "kind" "TradeAccountKind" NOT NULL DEFAULT 'RETAILER',
    "regNumber" TEXT,
    "vatNumber" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "addressLine" TEXT NOT NULL,
    "suburb" TEXT,
    "city" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "postalCode" TEXT NOT NULL,
    "deliveryLine" TEXT,
    "deliverySuburb" TEXT,
    "deliveryCity" TEXT,
    "deliveryProvince" "Province",
    "deliveryPostalCode" TEXT,
    "status" "TradeAccountStatus" NOT NULL DEFAULT 'PENDING',
    "terms" "TradeTerms" NOT NULL DEFAULT 'PREPAID',
    "paymentDays" INTEGER NOT NULL DEFAULT 30,
    "creditLimitCents" INTEGER NOT NULL DEFAULT 0,
    "classes" "RegClass"[] DEFAULT ARRAY[]::"RegClass"[],
    "priceListId" TEXT,
    "dcId" TEXT,
    "notes" TEXT,
    "adultAttestedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "holdReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeBuyer" (
    "id" TEXT NOT NULL,
    "tradeAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "TradeBuyerRole" NOT NULL DEFAULT 'BUYER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeBuyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tradeAccountId" TEXT NOT NULL,
    "buyerId" TEXT,
    "dcId" TEXT NOT NULL,
    "status" "TradeOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payMethod" "PayMethod" NOT NULL,
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "subtotalCents" INTEGER NOT NULL,
    "deliveryCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "addressLine" TEXT NOT NULL,
    "suburb" TEXT,
    "city" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "postalCode" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "courier" TEXT,
    "trackingNo" TEXT,
    "invoiceNumber" TEXT,
    "saleId" TEXT,
    "events" JSONB NOT NULL,
    "reservedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOrderLine" (
    "id" TEXT NOT NULL,
    "tradeOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "shippedQty" INTEGER,
    "shipped" JSONB,

    CONSTRAINT "TradeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeLedgerEntry" (
    "id" TEXT NOT NULL,
    "tradeAccountId" TEXT NOT NULL,
    "kind" "TradeLedgerKind" NOT NULL,
    "cents" INTEGER NOT NULL,
    "reference" TEXT,
    "tradeOrderId" TEXT,
    "saleId" TEXT,
    "dueAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeAccount_number_key" ON "TradeAccount"("number");

-- CreateIndex
CREATE INDEX "TradeAccount_status_idx" ON "TradeAccount"("status");

-- CreateIndex
CREATE INDEX "TradeAccount_name_idx" ON "TradeAccount"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TradeBuyer_email_key" ON "TradeBuyer"("email");

-- CreateIndex
CREATE INDEX "TradeBuyer_tradeAccountId_idx" ON "TradeBuyer"("tradeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_number_key" ON "TradeOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_invoiceNumber_key" ON "TradeOrder"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_saleId_key" ON "TradeOrder"("saleId");

-- CreateIndex
CREATE INDEX "TradeOrder_tradeAccountId_status_idx" ON "TradeOrder"("tradeAccountId", "status");

-- CreateIndex
CREATE INDEX "TradeOrder_dcId_status_idx" ON "TradeOrder"("dcId", "status");

-- CreateIndex
CREATE INDEX "TradeOrder_createdAt_idx" ON "TradeOrder"("createdAt");

-- CreateIndex
CREATE INDEX "TradeOrderLine_tradeOrderId_idx" ON "TradeOrderLine"("tradeOrderId");

-- CreateIndex
CREATE INDEX "TradeOrderLine_variantId_idx" ON "TradeOrderLine"("variantId");

-- CreateIndex
CREATE INDEX "TradeLedgerEntry_tradeAccountId_createdAt_idx" ON "TradeLedgerEntry"("tradeAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeLedgerEntry_saleId_idx" ON "TradeLedgerEntry"("saleId");

-- CreateIndex
CREATE INDEX "TradeLedgerEntry_tradeOrderId_idx" ON "TradeLedgerEntry"("tradeOrderId");

-- CreateIndex
CREATE INDEX "Otp_email_idx" ON "Otp"("email");

-- CreateIndex
CREATE INDEX "Sale_tradeAccountId_idx" ON "Sale"("tradeAccountId");

-- CreateIndex
CREATE INDEX "Session_tradeBuyerId_idx" ON "Session"("tradeBuyerId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tradeBuyerId_fkey" FOREIGN KEY ("tradeBuyerId") REFERENCES "TradeBuyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAccount" ADD CONSTRAINT "TradeAccount_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeBuyer" ADD CONSTRAINT "TradeBuyer_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrder" ADD CONSTRAINT "TradeOrder_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrder" ADD CONSTRAINT "TradeOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "TradeBuyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrder" ADD CONSTRAINT "TradeOrder_dcId_fkey" FOREIGN KEY ("dcId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrder" ADD CONSTRAINT "TradeOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrderLine" ADD CONSTRAINT "TradeOrderLine_tradeOrderId_fkey" FOREIGN KEY ("tradeOrderId") REFERENCES "TradeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrderLine" ADD CONSTRAINT "TradeOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeLedgerEntry" ADD CONSTRAINT "TradeLedgerEntry_tradeAccountId_fkey" FOREIGN KEY ("tradeAccountId") REFERENCES "TradeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

