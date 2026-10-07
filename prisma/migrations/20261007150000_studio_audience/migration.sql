-- AlterTable
ALTER TABLE "StudioItem" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "brief" TEXT,
ADD COLUMN     "hand" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linkedin" TEXT;
