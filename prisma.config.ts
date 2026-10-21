import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The schema is SQLite (Cloudflare D1). DATABASE_URL is only for Node-side tools (seed, scripts, tests) and points at a
// SQLite file: the local D1 under .wrangler/state (see docs/CLOUDFLARE.md) or a scratch file for tests.

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
