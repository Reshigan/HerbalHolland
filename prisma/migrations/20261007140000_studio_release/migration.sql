-- AlterTable
ALTER TABLE "StudioPlan" ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudioItem" ADD COLUMN     "releasedAt" TIMESTAMP(3);
