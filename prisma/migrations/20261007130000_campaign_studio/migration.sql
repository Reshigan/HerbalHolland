-- CreateEnum
CREATE TYPE "StudioChannel" AS ENUM ('SOCIAL', 'WHATSAPP', 'GOOGLE', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "StudioStatus" AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'POSTED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "StudioPlan" (
    "id" TEXT NOT NULL,
    "playbook" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "storeId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "StudioChannel" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "short" TEXT,
    "card" JSONB,
    "status" "StudioStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "link" TEXT,
    "approvedBy" TEXT,
    "doneBy" TEXT,
    "doneAt" TIMESTAMP(3),
    "socialPostId" TEXT,
    "campaignId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioPlan_createdAt_idx" ON "StudioPlan"("createdAt");

-- CreateIndex
CREATE INDEX "StudioItem_planId_at_idx" ON "StudioItem"("planId", "at");

-- CreateIndex
CREATE INDEX "StudioItem_status_at_idx" ON "StudioItem"("status", "at");

-- AddForeignKey
ALTER TABLE "StudioPlan" ADD CONSTRAINT "StudioPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioItem" ADD CONSTRAINT "StudioItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudioPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioItem" ADD CONSTRAINT "StudioItem_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioItem" ADD CONSTRAINT "StudioItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
