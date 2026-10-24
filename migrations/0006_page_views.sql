-- First-party, cookieless page views and installs for the shop and the Rewards app (no member link; 400-day retention).
-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'view',
    "visitor" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "entry" BOOLEAN NOT NULL DEFAULT false,
    "app" BOOLEAN NOT NULL,
    "src" TEXT,
    "referrer" TEXT,
    "platform" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "PageView_at_idx" ON "PageView"("at");

