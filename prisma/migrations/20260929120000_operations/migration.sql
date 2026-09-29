-- Operations: staff push notifications, supplier invoices, store opening checklist, scheduled report exports.
-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DUE', 'PAID', 'QUERIED');

-- CreateEnum
CREATE TYPE "ExportCadence" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "StaffPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "StaffPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPushEvent" (
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPushEvent_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "uploadId" TEXT NOT NULL,
    "stockOrderId" TEXT,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreTask" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "cadence" "ExportCadence" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffPushSubscription_endpoint_key" ON "StaffPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "StaffPushSubscription_userId_idx" ON "StaffPushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_uploadId_key" ON "SupplierInvoice"("uploadId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_storeId_status_dueDate_idx" ON "SupplierInvoice"("storeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "SupplierInvoice_stockOrderId_idx" ON "SupplierInvoice"("stockOrderId");

-- CreateIndex
CREATE INDEX "StoreTask_storeId_doneAt_idx" ON "StoreTask"("storeId", "doneAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreTask_storeId_key_key" ON "StoreTask"("storeId", "key");

-- CreateIndex
CREATE INDEX "ScheduledExport_userId_reportKey_idx" ON "ScheduledExport"("userId", "reportKey");

-- CreateIndex
CREATE INDEX "ScheduledExport_active_cadence_idx" ON "ScheduledExport"("active", "cadence");
