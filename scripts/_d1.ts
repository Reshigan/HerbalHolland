// The database a script talks to. By default the SQLite file DATABASE_URL names (`file:…`; for a running `next dev`
// the local D1 under .wrangler/state/v3/d1/miniflare-D1DatabaseObject/), through the shared `db`. With
// CLOUDFLARE_D1_TOKEN, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_DATABASE_ID set it is the live D1 database over
// Cloudflare's HTTP API instead (a token with D1 edit rights, from the dashboard → API tokens), so the same scripts run
// against production from a laptop:
//   CLOUDFLARE_D1_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_DATABASE_ID=… npx tsx scripts/create-admin.ts …
// The domain services a script calls still use `db` from @/server/db, which outside Cloudflare reads DATABASE_URL: so
// scripts that reach into those (ledger-backfill, bench) pass the D1 client where they can and otherwise need the
// file. Pass `--d1` or set the variables; nothing else is read.
import { createRequire } from "node:module";
import type { PrismaClient } from "@/generated/prisma/client";
import { connectDb, db } from "@/server/db";

const D1_VARS = ["CLOUDFLARE_D1_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_DATABASE_ID"] as const;

let live: PrismaClient | undefined;

/** True when the three CLOUDFLARE_* variables name a live D1 database. */
export const liveD1 = () => D1_VARS.every((k) => process.env[k]);

/** A PrismaClient on the live D1 (over HTTP) when the CLOUDFLARE_* variables are set, else the shared `db`. */
export async function scriptDb(): Promise<PrismaClient> {
  const missing = D1_VARS.filter((k) => !process.env[k]);
  if (missing.length === D1_VARS.length) {
    await connectDb();
    return db;
  }
  if (missing.length) throw new Error(`Set all of ${D1_VARS.join(", ")} to use the live D1 (missing: ${missing.join(", ")})`);
  if (!live) {
    const { PrismaD1Http } = await import("@prisma/adapter-d1");
    // The Node build of the client (npm run generate): the Workers one loads its query compiler as a WASM module, which Node can't.
    const req = createRequire(`${process.cwd()}/package.json`);
    const { PrismaClient: NodeClient } = (await import(req.resolve("./src/generated/prisma-node.mjs"))) as { PrismaClient: typeof PrismaClient };
    live = new NodeClient({
      adapter: new PrismaD1Http({
        CLOUDFLARE_D1_TOKEN: process.env.CLOUDFLARE_D1_TOKEN!,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,
        CLOUDFLARE_DATABASE_ID: process.env.CLOUDFLARE_DATABASE_ID!,
      }),
    });
  }
  return live;
}

/** Where a script's database lives, for its log line. */
export const describeDb = () => (liveD1() ? `D1 ${process.env.CLOUDFLARE_DATABASE_ID}` : process.env.DATABASE_URL ?? "(DATABASE_URL unset)");
