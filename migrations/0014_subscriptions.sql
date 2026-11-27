-- Club subscriptions: plans (set up and priced at HQ), members' subscriptions, and one row per billing period
-- (paid once, collected once).
-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'GRAMS',
    "allowance" REAL NOT NULL,
    "eligible" JSONB NOT NULL DEFAULT '[]',
    "period" TEXT NOT NULL DEFAULT 'WEEKLY',
    "priceCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "storeIds" JSONB NOT NULL DEFAULT '[]',
    "itemWord" TEXT NOT NULL DEFAULT 'items',
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nextStoreId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fulfilment" TEXT NOT NULL DEFAULT 'COLLECT',
    "addressId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "priceCents" INTEGER NOT NULL,
    "allowance" REAL NOT NULL,
    "carryAllowance" REAL NOT NULL DEFAULT 0,
    "carryCents" INTEGER NOT NULL DEFAULT 0,
    "billingOrderId" TEXT,
    "claimOrderId" TEXT,
    "paidAt" DATETIME,
    "collectedAt" DATETIME,
    "remindedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionPeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_status_sortOrder_idx" ON "SubscriptionPlan"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");

-- CreateIndex
CREATE INDEX "Subscription_status_periodEnd_idx" ON "Subscription"("status", "periodEnd");

-- CreateIndex
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_billingOrderId_key" ON "SubscriptionPeriod"("billingOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_claimOrderId_key" ON "SubscriptionPeriod"("claimOrderId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_status_periodEnd_idx" ON "SubscriptionPeriod"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_subscriptionId_periodStart_key" ON "SubscriptionPeriod"("subscriptionId", "periodStart");

