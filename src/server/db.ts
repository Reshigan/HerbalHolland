// The database client. On Cloudflare the app talks to D1 through the request's binding (`DB`, wrangler.jsonc); Node-side
// tools (the seed, scripts, vitest) open the SQLite file DATABASE_URL names, which is the local D1 under .wrangler/state
// when they run next to `next dev`. The client is built lazily per binding because bindings only exist inside a request.
// D1 has no transactions: Prisma runs the statements of `tx()` one by one (see docs/CLOUDFLARE.md for what that means).
import { createRequire } from "node:module";
import type { D1Database } from "@cloudflare/workers-types";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const errorFormat = process.env.NODE_ENV === "production" ? ("minimal" as const) : undefined; // no query arguments in logs

const perBinding = new WeakMap<object, PrismaClient>();
let local: PrismaClient | undefined;

function client(): PrismaClient {
  let d1: D1Database | undefined;
  try {
    d1 = (getCloudflareContext().env as { DB?: D1Database }).DB;
  } catch {
    d1 = undefined; // not inside a Cloudflare request (a script, a test)
  }
  if (d1) {
    let c = perBinding.get(d1);
    if (!c) perBinding.set(d1, (c = new PrismaClient({ adapter: new PrismaD1(d1), errorFormat })));
    return c;
  }
  if (!local) {
    const url = process.env.DATABASE_URL;
    if (!url?.startsWith("file:")) throw new Error("Outside Cloudflare, DATABASE_URL must name a SQLite file (file:…)");
    // Resolved at run time only: the Worker bundle never carries the native SQLite driver.
    const { PrismaBetterSqlite3 } = createRequire(`${process.cwd()}/package.json`)("@prisma/adapter-better-sqlite3");
    local = numbersFromRaw(new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }), errorFormat }));
  }
  return local;
}

// D1 answers raw queries with numbers; the local SQLite driver answers with BigInt for every integer expression. The
// local client converts them so scripts and tests see what production sees.
const plain = (v: unknown): unknown =>
  typeof v === "bigint" ? Number(v) : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" && !(v instanceof Date) && !(v instanceof Uint8Array) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
function numbersFromRaw<C extends object>(c: C): C {
  return new Proxy(c, {
    get(target, key) {
      const v = (target as Record<PropertyKey, unknown>)[key];
      if (typeof v !== "function") return v;
      if (key === "$queryRaw" || key === "$queryRawUnsafe") return async (...a: unknown[]) => plain(await (v as (...x: unknown[]) => Promise<unknown>).apply(target, a));
      if (key === "$transaction")
        return (arg: unknown, ...rest: unknown[]) =>
          (v as (...x: unknown[]) => unknown).apply(target, [typeof arg === "function" ? (t: object) => (arg as (t: object) => unknown)(numbersFromRaw(t)) : arg, ...rest]);
      return (v as (...x: unknown[]) => unknown).bind(target);
    },
  });
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, key) {
    const c = client();
    const v = (c as unknown as Record<PropertyKey, unknown>)[key];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

export type Tx = Prisma.TransactionClient;
export { Prisma };

/** A unit of work. On D1 the statements run one after another (no rollback): keep each step idempotent. */
export const tx = <T>(fn: (t: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30_000, maxWait: 10_000 });
