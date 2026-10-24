// wrangler.staging.jsonc from wrangler.jsonc: the same Worker under another name, on its own D1 database and R2
// bucket, in demo mode, for the staging run (.github/workflows/test-cloudflare.yml). The R2 binding is marked remote so
// the seed (run as a Node process through wrangler's platform proxy) writes the demo files into the real bucket.
// Staging lives on workers.dev: the production custom domain goes, the staging bucket has no jurisdiction, and APP_URL
// is set as a secret after the deploy (the address is only known then), so the production var goes too.
//   node scripts/staging-config.mjs <database_id> [name]
import { readFileSync, writeFileSync } from "node:fs";
import stripJsonComments from "strip-json-comments";

const [databaseId, name = "herbal-holland-shop-staging"] = process.argv.slice(2);
if (!databaseId) {
  console.error("usage: node scripts/staging-config.mjs <database_id> [name]");
  process.exit(2);
}
const cfg = JSON.parse(stripJsonComments(readFileSync("wrangler.jsonc", "utf8")));
cfg.name = name;
cfg.d1_databases = cfg.d1_databases.map((d) => ({ ...d, database_name: name, database_id: databaseId }));
cfg.r2_buckets = cfg.r2_buckets.map(({ jurisdiction: _eu, ...b }) => ({ ...b, bucket_name: `${name}-files`, remote: true }));
cfg.vars = { ...cfg.vars, DEMO_MODE: "true", MESSAGING_PROVIDER: "log" }; // texts are only logged: no SMS keys here
delete cfg.vars.APP_URL;
cfg.workers_dev = true;
delete cfg.routes;
delete cfg.$schema;
writeFileSync("wrangler.staging.jsonc", JSON.stringify(cfg, null, 2) + "\n");
console.log(`wrangler.staging.jsonc: ${name} on D1 ${databaseId}, bucket ${name}-files`);
