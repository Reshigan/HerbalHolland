import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db =
  globalForDb.db ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

if (process.env.NODE_ENV !== "production") globalForDb.db = db;

export type Tx = Prisma.TransactionClient;
export { Prisma };

/** Interactive transaction with a timeout suited to multi-line stock postings. */
export const tx = <T>(fn: (t: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 30_000, maxWait: 10_000 });
