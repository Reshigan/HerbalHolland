-- Franchise enquiries from herbalholland.com, worked by HQ.
-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'INFO_EVENING', 'DISCLOSURE_SENT', 'SIGNED', 'NOT_A_FIT');

-- CreateTable
CREATE TABLE "FranchiseLead" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "province" TEXT,
    "experience" TEXT NOT NULL,
    "capital" TEXT NOT NULL,
    "pharmacist" BOOLEAN NOT NULL,
    "message" TEXT,
    "source" TEXT,
    "ipHash" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "notes" TEXT,
    "disclosureSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseLead_number_key" ON "FranchiseLead"("number");

-- CreateIndex
CREATE INDEX "FranchiseLead_status_createdAt_idx" ON "FranchiseLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FranchiseLead_email_idx" ON "FranchiseLead"("email");

-- CreateIndex
CREATE INDEX "FranchiseLead_ipHash_createdAt_idx" ON "FranchiseLead"("ipHash", "createdAt");

