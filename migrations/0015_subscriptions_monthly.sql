-- Club plans bill monthly, paid upfront: a plan's price is per month and its allowance per week. The plan's billing
-- period goes; a subscription gains its anchor day (each cycle runs to the same day next month, clamped to short months)
-- and the PENDING status (joined, first month unpaid), and loses PAUSED. Weekly claims move to their own table, one row
-- per week of a paid month. Production holds no subscriptions yet (one draft plan), so the old claim columns just drop.
UPDATE "Subscription" SET "status" = 'CANCELLED' WHERE "status" = 'PAUSED';
UPDATE "SubscriptionPeriod" SET "status" = 'PAID' WHERE "status" = 'COLLECTED';

-- CreateTable
CREATE TABLE "SubscriptionClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "weekEnd" DATETIME NOT NULL,
    "allowance" REAL NOT NULL,
    "cents" INTEGER NOT NULL,
    "orderId" TEXT,
    "collectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionClaim_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SubscriptionPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nextStoreId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fulfilment" TEXT NOT NULL DEFAULT 'COLLECT',
    "addressId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "anchorDay" INTEGER NOT NULL DEFAULT 1,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("addressId", "cancelAtPeriodEnd", "cancelledAt", "createdAt", "customerId", "fulfilment", "id", "nextStoreId", "periodEnd", "periodStart", "planId", "priceCents", "startedAt", "status", "storeId", "updatedAt") SELECT "addressId", "cancelAtPeriodEnd", "cancelledAt", "createdAt", "customerId", "fulfilment", "id", "nextStoreId", "periodEnd", "periodStart", "planId", "priceCents", "startedAt", "status", "storeId", "updatedAt" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");
CREATE INDEX "Subscription_status_periodEnd_idx" ON "Subscription"("status", "periodEnd");
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");
CREATE TABLE "new_SubscriptionPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "priceCents" INTEGER NOT NULL,
    "allowance" REAL NOT NULL,
    "billingOrderId" TEXT,
    "paidAt" DATETIME,
    "remindedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionPeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SubscriptionPeriod" ("allowance", "billingOrderId", "createdAt", "id", "paidAt", "periodEnd", "periodStart", "priceCents", "remindedAt", "status", "subscriptionId", "updatedAt") SELECT "allowance", "billingOrderId", "createdAt", "id", "paidAt", "periodEnd", "periodStart", "priceCents", "remindedAt", "status", "subscriptionId", "updatedAt" FROM "SubscriptionPeriod";
DROP TABLE "SubscriptionPeriod";
ALTER TABLE "new_SubscriptionPeriod" RENAME TO "SubscriptionPeriod";
CREATE UNIQUE INDEX "SubscriptionPeriod_billingOrderId_key" ON "SubscriptionPeriod"("billingOrderId");
CREATE INDEX "SubscriptionPeriod_status_periodEnd_idx" ON "SubscriptionPeriod"("status", "periodEnd");
CREATE UNIQUE INDEX "SubscriptionPeriod_subscriptionId_periodStart_key" ON "SubscriptionPeriod"("subscriptionId", "periodStart");
CREATE TABLE "new_SubscriptionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'GRAMS',
    "allowance" REAL NOT NULL,
    "eligible" JSONB NOT NULL DEFAULT '[]',
    "priceCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "storeIds" JSONB NOT NULL DEFAULT '[]',
    "itemWord" TEXT NOT NULL DEFAULT 'items',
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SubscriptionPlan" ("allowance", "createdAt", "description", "eligible", "id", "imageUrl", "itemWord", "name", "priceCents", "rollover", "slug", "sortOrder", "status", "storeIds", "tagline", "unit", "updatedAt") SELECT "allowance", "createdAt", "description", "eligible", "id", "imageUrl", "itemWord", "name", "priceCents", "rollover", "slug", "sortOrder", "status", "storeIds", "tagline", "unit", "updatedAt" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");
CREATE INDEX "SubscriptionPlan_status_sortOrder_idx" ON "SubscriptionPlan"("status", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionClaim_orderId_key" ON "SubscriptionClaim"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionClaim_periodId_weekStart_key" ON "SubscriptionClaim"("periodId", "weekStart");

