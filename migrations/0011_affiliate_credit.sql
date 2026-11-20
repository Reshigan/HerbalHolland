-- Referral credit: each member's wallet voucher and the affiliate shares paid into it.
ALTER TABLE "GiftVoucher" ADD COLUMN "affiliateOfId" TEXT;
CREATE UNIQUE INDEX "GiftVoucher_affiliateOfId_key" ON "GiftVoucher"("affiliateOfId");

CREATE TABLE "AffiliateCredit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "orderId" TEXT,
    "cents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AffiliateCredit_saleId_key" ON "AffiliateCredit"("saleId");
CREATE INDEX "AffiliateCredit_customerId_createdAt_idx" ON "AffiliateCredit"("customerId", "createdAt");
CREATE INDEX "AffiliateCredit_friendId_idx" ON "AffiliateCredit"("friendId");
