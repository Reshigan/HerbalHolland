-- Social posts go straight to the networks: each post keeps its per-network results and when it went.
ALTER TABLE "SocialPost" RENAME COLUMN "postizIds" TO "results";
ALTER TABLE "SocialPost" ADD COLUMN "postedAt" DATETIME;
