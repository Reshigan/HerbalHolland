-- DC deliveries are put on the store's supplier invoices automatically: no uploaded file (the stock order is the tax
-- invoice), settled on the month's franchise statement.
ALTER TABLE "SupplierInvoice" ALTER COLUMN "uploadId" DROP NOT NULL;
ALTER TABLE "SupplierInvoice" ADD COLUMN "onStatement" BOOLEAN NOT NULL DEFAULT false;
