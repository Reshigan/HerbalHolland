import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const g = globalThis as unknown as { db?: PrismaClient; dbClass?: typeof PrismaClient };

// One client across dev hot reloads — unless `prisma generate` produced a new client class (schema change).
if (g.db && g.dbClass !== PrismaClient) void g.db.$disconnect();
export const db =
  g.db && g.dbClass === PrismaClient ? g.db : new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: Number(process.env.DATABASE_POOL_MAX) || 10 }),
        // Production errors without the query's arguments: they can carry members' details into logs and alert emails.
        errorFormat: process.env.NODE_ENV === "production" ? "minimal" : undefined,
      });

if (process.env.NODE_ENV !== "production") (g.db = db), (g.dbClass = PrismaClient);

export type Tx = Prisma.TransactionClient;
export { Prisma };

/** Interactive transaction with a timeout suited to multi-line stock postings. */
export const tx = <T>(fn: (t: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30_000, maxWait: 10_000 });
