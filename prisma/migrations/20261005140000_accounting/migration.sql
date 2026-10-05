-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "BankLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'ALLOCATED', 'IGNORED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "booksLockedThrough" TEXT,
ADD COLUMN     "vatCategory" TEXT,
ADD COLUMN     "yearEndMonth" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "SupplierInvoice" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "key" TEXT,
    "party" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "storeId" TEXT,
    "memo" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeId" TEXT,
    "partyId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerBalance" (
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerBalance_pkey" PRIMARY KEY ("companyId","accountId","storeId","period")
);

-- CreateTable
CREATE TABLE "LedgerQueue" (
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "LedgerQueue_pkey" PRIMARY KEY ("source","sourceId")
);

-- CreateTable
CREATE TABLE "StatementPayment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "storeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "balanceCents" INTEGER,
    "hash" TEXT NOT NULL,
    "uploadId" TEXT,
    "status" "BankLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "journalId" TEXT,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_companyId_code_key" ON "LedgerAccount"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_companyId_key_key" ON "LedgerAccount"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_reversalOfId_key" ON "Journal"("reversalOfId");

-- CreateIndex
CREATE INDEX "Journal_companyId_source_sourceId_idx" ON "Journal"("companyId", "source", "sourceId");

-- CreateIndex
CREATE INDEX "Journal_companyId_period_idx" ON "Journal"("companyId", "period");

-- CreateIndex
CREATE INDEX "Journal_companyId_status_idx" ON "Journal"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_companyId_number_key" ON "Journal"("companyId", "number");

-- CreateIndex
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_accountId_period_idx" ON "JournalLine"("companyId", "accountId", "period");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_accountId_partyId_idx" ON "JournalLine"("companyId", "accountId", "partyId");

-- CreateIndex
CREATE INDEX "LedgerBalance_companyId_period_idx" ON "LedgerBalance"("companyId", "period");

-- CreateIndex
CREATE INDEX "LedgerQueue_queuedAt_idx" ON "LedgerQueue"("queuedAt");

-- CreateIndex
CREATE INDEX "StatementPayment_storeId_month_idx" ON "StatementPayment"("storeId", "month");

-- CreateIndex
CREATE INDEX "StatementPayment_companyId_idx" ON "StatementPayment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountId_key" ON "BankAccount"("accountId");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE INDEX "BankLine_companyId_status_idx" ON "BankLine"("companyId", "status");

-- CreateIndex
CREATE INDEX "BankLine_bankAccountId_date_idx" ON "BankLine"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankLine_journalId_idx" ON "BankLine"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "BankLine_bankAccountId_hash_key" ON "BankLine"("bankAccountId", "hash");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
