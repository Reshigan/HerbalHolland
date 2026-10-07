-- CreateTable
CREATE TABLE "EarlyAccessContact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "province" TEXT,
    "source" TEXT,
    "signedUpAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyAccessContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessContact_email_key" ON "EarlyAccessContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessContact_mobile_key" ON "EarlyAccessContact"("mobile");
