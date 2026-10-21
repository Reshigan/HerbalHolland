// Trims Next's file traces (.next/**/*.nft.json) after `next build`, before OpenNext copies what they list into the
// Worker. Turbopack's loader for the WASM query compiler (the workerd Prisma client imports it as a module) resolves
// its chunk path dynamically, so every trace sweeps in the whole of node_modules: the Prisma CLI with Postgres-in-WASM,
// wrangler and workerd, the Node-only SQLite client for the scripts and tests, the test and build tools. Their WASM and
// native files would put the Worker over Cloudflare's 64 MiB, and none of them run there. (next.config's
// outputFileTracingExcludes covers the routes but not instrumentation.js, which carries the same sweep.)
//   node scripts/prune-trace.mjs      (open-next.config.ts runs it as part of the build)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = process.cwd();
const DROP = [
  "prisma", "@prisma/dev", "@prisma/config", "@prisma/engines", "@prisma/engines-version", "@prisma/fetch-engine", "@prisma/get-platform",
  "@prisma/studio-core", "@prisma/query-plan-executor", "@prisma/streams-local", "@prisma/debug", "@prisma/adapter-better-sqlite3",
  "@electric-sql", "better-sqlite3", "bindings", "prebuild-install", "node-abi", "workerd", "@cloudflare/workerd-linux-64", "@cloudflare/workerd-darwin-64",
  "@cloudflare/workerd-darwin-arm64", "@cloudflare/workerd-linux-arm64", "@cloudflare/workerd-windows-64", "cloudflare", "miniflare", "wrangler",
  "@opennextjs", "@aws-sdk", "@smithy", "@aws-crypto", "effect", "mysql2", "postgres", "sharp", "@img", "typescript", "rolldown", "@rolldown",
  "esbuild", "@esbuild", "vite", "vitest", "@vitest", "playwright", "playwright-core", "@playwright", "lightningcss", "lightningcss-linux-x64-gnu",
  "lightningcss-linux-x64-musl", "tailwindcss", "@tailwindcss", "tsx", "terser", "@ast-grep", "@next/swc-linux-x64-gnu", "@next/swc-linux-x64-musl",
  "@types", "@fontsource-variable", "@puppeteer", "@dotenvx", "fast-check", "elkjs", "chai", "tinybench", "youch", "youch-core", "express", "ws",
  "undici", "jiti", "c12", "giget", "zod", "valibot", "yaml", "@poppinss", "@speed-highlight", "ts-tqdm", "proxy-agent", "pac-proxy-agent",
  "socks-proxy-agent", "https-proxy-agent", "http-proxy-agent", "extract-zip", "tar-fs", "tar-stream", "unbzip2-stream", "dotenv",
];
const dropped = new Set(DROP);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".nft.json")) out.push(p);
  }
  return out;
}

const packageOf = (abs) => {
  const rel = relative(join(ROOT, "node_modules"), abs);
  if (rel.startsWith("..")) return null;
  const [a, b] = rel.split("/");
  return a.startsWith("@") ? `${a}/${b}` : a;
};

let removed = 0, kept = 0;
for (const file of walk(join(ROOT, ".next"))) {
  const trace = JSON.parse(readFileSync(file, "utf8"));
  const before = trace.files.length;
  trace.files = trace.files.filter((f) => {
    const pkg = packageOf(resolve(dirname(file), f));
    return !(pkg && (dropped.has(pkg) || dropped.has(pkg.split("/")[0])));
  });
  removed += before - trace.files.length;
  kept += trace.files.length;
  if (trace.files.length !== before) writeFileSync(file, JSON.stringify(trace));
}
console.log(`prune-trace: ${removed} entries dropped, ${kept} kept`);
