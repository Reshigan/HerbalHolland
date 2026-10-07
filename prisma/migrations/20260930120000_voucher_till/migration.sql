-- Gift vouchers at the till: a VOUCHER tender on sales; redemptions belong to an online order (orderId), a till sale
-- (saleId) or both (a counter voucher on a pay-in-store order); refunds are negative rows against the credit note.
-- AlterEnum
ALTER TYPE "PayMethod" ADD VALUE 'VOUCHER';

-- AlterTable
ALTER TABLE "VoucherRedemption" ADD COLUMN     "saleId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "VoucherRedemption_saleId_idx" ON "VoucherRedemption"("saleId");

-- The voucher part of online orders handed over before this change was posted as an ONLINE tender with provider
-- VOUCHER: it is the same "Gift voucher" tender finance sees from now on.
UPDATE "Payment" SET "method" = 'VOUCHER', "provider" = NULL WHERE "method" = 'ONLINE' AND "provider" = 'VOUCHER';
