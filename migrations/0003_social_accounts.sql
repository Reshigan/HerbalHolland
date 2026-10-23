-- Social accounts HQ connects by signing in (TikTok, YouTube, LinkedIn, X, Pinterest), and a video on a post.
CREATE TABLE "SocialAccount" (
    "network" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" DATETIME,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "connectedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
ALTER TABLE "SocialPost" ADD COLUMN "videoUploadId" TEXT;
ALTER TABLE "StudioItem" ADD COLUMN "videoUploadId" TEXT;
