// The Founding Members list. Until settings.launch.launchAt (when the list closes) members join the list while the
// shop trades as normal. A member's place is their join order, moved up `referralBoost` places for every friend who
// joins before it closes. Then the first `foundingCap` places become numbered Founding Members who hold at least
// `foundingTier` for `foundingMonths` (Customer.tierFloor); the rest of the list become First Year Members, holding the
// same tier for `firstYearMonths`. A referral boost (Customer.boostTier) is held apart and never blocks either.
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { cache } from "react";
import { TIERS } from "@/lib/loyalty-rules";

export async function launchState(now = new Date()) {
  const l = (await getSettings()).launch;
  const at = l.launchAt ? new Date(l.launchAt) : null;
  return { ...l, at, preLaunch: !!at && now < at };
}

// A tier's rank (SEED 0 … HARVEST 3), to compare tiers in SQL (they are text on SQLite).
const tierRank = (col: Prisma.Sql) => Prisma.sql`CASE ${col} ${Prisma.join(TIERS.map((t, i) => Prisma.sql`WHEN ${t.key} THEN ${i}`), " ")} ELSE 0 END`;
// The higher of a tier column and a tier.
const atLeast = (col: Prisma.Sql, tier: string) => Prisma.sql`CASE WHEN ${tierRank(col)} >= ${TIERS.findIndex((t) => t.key === tier)} THEN ${col} ELSE ${tier} END`;

// Waitlist ranking (members who joined before `at`), shared by the place lookup and founding assignment.
const ranked = (at: Date, boost: number) => Prisma.sql`
  WITH refs AS (
    SELECT "referredById" AS id, count(*) AS n FROM "Customer"
    WHERE "referredById" IS NOT NULL AND "createdAt" < ${at} GROUP BY 1
  ), w AS (
    SELECT c.id, row_number() OVER (ORDER BY c."createdAt", c.id) AS seq, coalesce(r.n, 0) AS refs
    FROM "Customer" c LEFT JOIN refs r ON r.id = c.id WHERE c."createdAt" < ${at}
  ), ranked AS (
    SELECT id, refs, row_number() OVER (ORDER BY seq - ${boost} * refs, seq) AS place, count(*) OVER () AS total FROM w
  )`;

/** How many Founding places the list has used (members who joined before it closes), cached per request. */
export const foundingTaken = cache(async (now = new Date()) => {
  const s = await launchState(now);
  if (!s.at) return 0;
  return db.customer.count({ where: { createdAt: { lt: s.at } } });
});

/** A member's waitlist place (1 = front of the line), or null when there's no launch date. */
export async function waitlistPlace(customerId: string) {
  const s = await launchState();
  if (!s.at) return null;
  const [r] = await db.$queryRaw<{ place: bigint; total: bigint; refs: number }[]>`
    ${ranked(s.at, s.referralBoost)} SELECT place, total, refs FROM ranked WHERE id = ${customerId}`;
  if (!r) return null;
  const place = Number(r.place);
  return { place, total: Number(r.total), referrals: r.refs, founding: place <= s.foundingCap, boost: s.referralBoost, launchAt: s.at };
}

/** At launch, numbers the first `foundingCap` places and raises them to the founding tier. Idempotent. */
export async function assignFounding(now = new Date()) {
  const s = await launchState(now);
  if (!s.at || now < s.at || (await db.customer.count({ where: { foundingNo: { not: null } } }))) return { assigned: 0 };
  const until = new Date(s.at);
  until.setMonth(until.getMonth() + s.foundingMonths);
  const assigned = await db.$executeRaw`
    ${ranked(s.at, s.referralBoost)}
    UPDATE "Customer" AS c SET "foundingNo" = ranked.place, "tierFloor" = ${s.foundingTier}, "tierFloorUntil" = ${until},
      tier = ${atLeast(Prisma.sql`c.tier`, s.foundingTier)}
    FROM ranked WHERE c.id = ranked.id AND ranked.place <= ${s.foundingCap}`;
  // First Year Members: everyone else who joined before the list closed holds the founding tier for a shorter while.
  let firstYear = 0;
  if (s.firstYearMonths > 0) {
    const fyUntil = new Date(s.at);
    fyUntil.setMonth(fyUntil.getMonth() + s.firstYearMonths);
    firstYear = await db.$executeRaw`
      UPDATE "Customer" AS c SET "tierFloor" = ${s.foundingTier}, "tierFloorUntil" = ${fyUntil}, tier = ${atLeast(Prisma.sql`c.tier`, s.foundingTier)}
      WHERE c."createdAt" < ${s.at} AND c."foundingNo" IS NULL AND c."tierFloor" IS NULL`;
  }
  return { assigned, firstYear };
}

/**
 * When a tier floor or a referral boost lapses, it is cleared and the member holds the highest of what their 12-month
 * spend earns and whichever of the two is still running (lib/referral-ladder effectiveTier). Idempotent: a member is
 * only touched while something of theirs has lapsed and not yet been cleared.
 */
export async function expireTierFloors(now = new Date()) {
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const spendRank = Prisma.sql`CASE ${Prisma.join(
    TIERS.map((t, i) => [t, i] as const).reverse().map(([t, i]) => Prisma.sql`WHEN coalesce(s.spend, 0) >= ${t.minCents} THEN ${i}`),
    " ",
  )} ELSE 0 END`;
  const floorRank = Prisma.sql`CASE WHEN c."tierFloorUntil" > ${now} THEN ${tierRank(Prisma.sql`c."tierFloor"`)} ELSE 0 END`;
  const boostRank = Prisma.sql`CASE WHEN c."boostUntil" > ${now} THEN ${tierRank(Prisma.sql`c."boostTier"`)} ELSE 0 END`;
  const tierOf = (rank: Prisma.Sql) => Prisma.sql`CASE ${rank} ${Prisma.join(TIERS.map((t, i) => Prisma.sql`WHEN ${i} THEN ${t.key}`), " ")} END`;
  const [{ floors, boosts }] = await db.$queryRaw<{ floors: number | bigint | null; boosts: number | bigint | null }[]>`
    SELECT sum(CASE WHEN "tierFloorUntil" <= ${now} THEN 1 ELSE 0 END) AS floors, sum(CASE WHEN "boostUntil" <= ${now} THEN 1 ELSE 0 END) AS boosts
    FROM "Customer" WHERE "tierFloorUntil" <= ${now} OR "boostUntil" <= ${now}`;
  if (!Number(floors ?? 0) && !Number(boosts ?? 0)) return { expired: 0, boostsExpired: 0 };
  await db.$executeRaw`
    UPDATE "Customer" AS c SET
      tier = ${tierOf(Prisma.sql`max(${spendRank}, ${floorRank}, ${boostRank})`)},
      "tierFloor" = CASE WHEN c."tierFloorUntil" <= ${now} THEN NULL ELSE c."tierFloor" END,
      "tierFloorUntil" = CASE WHEN c."tierFloorUntil" <= ${now} THEN NULL ELSE c."tierFloorUntil" END,
      "boostTier" = CASE WHEN c."boostUntil" <= ${now} THEN NULL ELSE c."boostTier" END,
      "boostUntil" = CASE WHEN c."boostUntil" <= ${now} THEN NULL ELSE c."boostUntil" END
    FROM (
      SELECT x.id, (SELECT sum(sa."totalCents") FROM "Sale" sa WHERE sa."customerId" = x.id AND sa."createdAt" > ${since}) AS spend
      FROM "Customer" x WHERE x."tierFloorUntil" <= ${now} OR x."boostUntil" <= ${now}
    ) s
    WHERE c.id = s.id`;
  return { expired: Number(floors ?? 0), boostsExpired: Number(boosts ?? 0) };
}
