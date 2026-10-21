// The database client. On Cloudflare the app talks to D1 through the request's binding (`DB`, wrangler.jsonc); Node-side
// tools (the seed, scripts, vitest) open the SQLite file DATABASE_URL names, which is the local D1 under .wrangler/state
// when they run next to `next dev`. The client is built lazily per binding because bindings only exist inside a request.
// D1 has no transactions: Prisma runs the statements of `tx()` one by one (see docs/CLOUDFLARE.md for what that means).
//
// Two generated clients (prisma/schema.prisma): `@/generated/prisma` targets workerd (its query compiler is WASM loaded
// as a module, which Node cannot do) and `src/generated/prisma-node.mjs` (npm run generate) targets Node. The Node one
// is loaded at run time only, so the Worker bundle never carries it nor the native SQLite driver.
import { createRequire } from "node:module";
import type { D1Database } from "@cloudflare/workers-types";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const errorFormat = process.env.NODE_ENV === "production" ? ("minimal" as const) : undefined; // no query arguments in logs

// One client per request: workerd gives every request its own I/O context, and a client shared across requests makes
// one request await promises that belong to another, which the runtime reports as a hung Worker.
const perRequest = new WeakMap<object, PrismaClient>();
let local: Promise<PrismaClient> | undefined;
let localReady: PrismaClient | undefined;

function d1Client(): PrismaClient | null {
  let d1: D1Database | undefined;
  let key: object | undefined;
  try {
    const cf = getCloudflareContext();
    d1 = (cf.env as { DB?: D1Database }).DB;
    key = (cf.ctx as object | undefined) ?? (cf.env as object);
  } catch {
    d1 = undefined; // not inside a Cloudflare request (a script, a test)
  }
  if (!d1 || !key) return null;
  let c = perRequest.get(key);
  if (!c) perRequest.set(key, (c = sequentialTx(new PrismaClient({ adapter: new PrismaD1(d1), errorFormat }))));
  return c;
}

// Prisma refuses `$transaction(fn)` on D1 outright. The platform's unit of work (`tx`) runs its statements one after
// another on the client itself instead: the same thing a D1 transaction would do, with no rollback (docs/CLOUDFLARE.md).
// Batches (`$transaction([...])`) pass through: D1 runs those atomically.
function sequentialTx(c: PrismaClient): PrismaClient {
  const proxy: PrismaClient = new Proxy(c, {
    get(target, key) {
      const v = (target as unknown as Record<PropertyKey, unknown>)[key];
      if (key === "$transaction")
        return (arg: unknown, ...rest: unknown[]) => (typeof arg === "function" ? (arg as (t: PrismaClient) => unknown)(proxy) : (v as (...x: unknown[]) => unknown).apply(target, [arg, ...rest]));
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  return proxy;
}

function localClient(): Promise<PrismaClient> {
  if (!local) {
    const url = process.env.DATABASE_URL;
    if (!url?.startsWith("file:")) throw new Error("Outside Cloudflare, DATABASE_URL must name a SQLite file (file:…)");
    const req = createRequire(`${process.cwd()}/package.json`);
    const { PrismaBetterSqlite3 } = req("@prisma/adapter-better-sqlite3");
    const file = req.resolve("./src/generated/prisma-node.mjs");
    local = import(/* turbopackIgnore: true */ /* webpackIgnore: true */ file).then(
      ({ PrismaClient: NodeClient, Prisma: NodePrisma }: { PrismaClient: typeof PrismaClient; Prisma: typeof Prisma }) =>
        (localReady = numbersFromRaw(new NodeClient({ adapter: new PrismaBetterSqlite3({ url }), errorFormat }), NodePrisma)),
    );
  }
  return local;
}

/** Node-side tools call this once at start-up, so that `db` is a plain client from then on (batch transactions need it). */
export const connectDb = (): Promise<void> => localClient().then(() => undefined);

// Every Prisma call is asynchronous, so the local client (an import away) is reached through a proxy that awaits it:
// `db.store.findMany(...)` and `db.$transaction(...)` work the same whether the client exists yet or not.
const lazy = (resolve: () => Promise<object>, path: PropertyKey[] = []): unknown =>
  new Proxy(function () {}, {
    get: (_, key) => (key === "then" && path.length === 0 ? undefined : lazy(resolve, [...path, key])),
    apply: async (_, __, args: unknown[]) => {
      let target: unknown = await resolve();
      let fn: unknown = target;
      for (const key of path) {
        target = fn;
        fn = (fn as Record<PropertyKey, unknown>)[key];
      }
      if (typeof fn !== "function") throw new Error(`db.${path.map(String).join(".")} is not a function`);
      return (fn as (...a: unknown[]) => unknown).apply(target, args);
    },
  });

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, key) {
    const c = d1Client() ?? localReady;
    if (c) {
      const v = (c as unknown as Record<PropertyKey, unknown>)[key];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
    }
    return lazy(localClient, [key]);
  },
});

// The local client differs from the Worker one in two ways that this wrapper hides: D1 answers raw queries with numbers
// where the local SQLite driver answers with BigInt for every integer expression, and the SQL fragments the code builds
// (Prisma.sql, Prisma.raw, Prisma.join from the Worker client's namespace) are a class the Node runtime does not
// recognise as its own, so they are rebuilt with the Node namespace before each raw query.
const plain = (v: unknown): unknown =>
  typeof v === "bigint" ? Number(v) : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" && !(v instanceof Date) && !(v instanceof Uint8Array) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
type SqlLike = { strings: readonly string[]; values: readonly unknown[] };
const isSql = (v: unknown): v is SqlLike => !!v && typeof v === "object" && Array.isArray((v as SqlLike).strings) && Array.isArray((v as SqlLike).values);
function numbersFromRaw<C extends object>(c: C, ns: typeof Prisma): C {
  const convert = (v: unknown): unknown => (isSql(v) ? new ns.Sql(v.strings, v.values.map(convert)) : v);
  const args = (a: unknown[]) => (a.length && isSql(a[0]) ? [convert(a[0]), ...a.slice(1)] : [a[0], ...a.slice(1).map(convert)]);
  return new Proxy(c, {
    get(target, key) {
      const v = (target as Record<PropertyKey, unknown>)[key];
      if (typeof v !== "function") return v;
      const call = v as (...x: unknown[]) => Promise<unknown>;
      if (key === "$queryRaw") return async (...a: unknown[]) => plain(await call.apply(target, args(a)));
      if (key === "$queryRawUnsafe") return async (...a: unknown[]) => plain(await call.apply(target, a));
      if (key === "$executeRaw") return (...a: unknown[]) => call.apply(target, args(a));
      if (key === "$transaction")
        return (arg: unknown, ...rest: unknown[]) =>
          call.apply(target, [typeof arg === "function" ? (t: object) => (arg as (t: object) => unknown)(numbersFromRaw(t, ns)) : arg, ...rest]);
      return call.bind(target);
    },
  });
}

/** A Prisma error's code ("P2002" unique violation, "P2025" not found), whichever runtime raised it. */
export const prismaCode = (e: unknown): string | null => (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string" && "clientVersion" in e ? (e as unknown as { code: string }).code : null);

export type Tx = Prisma.TransactionClient;
export { Prisma };

/** A unit of work. On D1 the statements run one after another (no rollback): keep each step idempotent. */
export const tx = <T>(fn: (t: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30_000, maxWait: 10_000 });
