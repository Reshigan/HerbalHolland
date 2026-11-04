-- Partner brands and each member's link with one. Empty until HQ adds a partner with its data sharing agreement.
-- CreateTable
CREATE TABLE "PartnerBrand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinUrl" TEXT,
    "agreement" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PartnerLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "externalId" TEXT,
    "wording" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "PartnerLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartnerLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerBrand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerBrand_slug_key" ON "PartnerBrand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerLink_customerId_partnerId_direction_key" ON "PartnerLink"("customerId", "partnerId", "direction");

-- CreateIndex
CREATE INDEX "PartnerLink_partnerId_idx" ON "PartnerLink"("partnerId");
