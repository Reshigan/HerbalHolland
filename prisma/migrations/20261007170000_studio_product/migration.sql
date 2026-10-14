-- AlterTable
ALTER TABLE "StudioPlan" ADD COLUMN     "productId" TEXT;

-- AddForeignKey
ALTER TABLE "StudioPlan" ADD CONSTRAINT "StudioPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
