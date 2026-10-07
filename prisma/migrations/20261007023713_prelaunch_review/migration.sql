-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "directors" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "payshapId" TEXT;

-- CreateTable
CREATE TABLE "JobRun" (
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "okAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("job")
);

-- CreateIndex
CREATE INDEX "Journal_source_sourceId_idx" ON "Journal"("source", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_companyId_period_idx" ON "JournalLine"("companyId", "period");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
