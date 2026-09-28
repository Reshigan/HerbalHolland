-- Posts handed to Postiz for the brand's social accounts.
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "image" TEXT,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mode" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "postizIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");
