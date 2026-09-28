-- AlterTable
ALTER TABLE "DailyStoreStat" ADD COLUMN     "memberSavingsCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "memberSavingsCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "memberSavingsCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "memberSavingsCents" INTEGER NOT NULL DEFAULT 0;
