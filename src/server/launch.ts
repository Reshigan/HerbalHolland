// Launch: the pre-launch waitlist and Founding Members.
// Before settings.launch.launchAt the storefront runs as a waitlist. A member's place is their join order, moved up
// `referralBoost` places for every friend who joins before launch. At launch the first `foundingCap` places become
// numbered Founding Members who hold at least `foundingTier` for `foundingMonths` (Customer.tierFloor).
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { TIERS } from "@/lib/loyalty-rules";

export async function launchState(now = new Date()) {
  const l = (await getSettings()).launch;
  const at = l.launchAt ? new Date(l.launchAt) : null;
  return { ...l, at, preLaunch: !!at && now < at };
}

// Waitlist ranking (members who joined before `at`), shared by the place lookup and founding assignment.
const ranked = (at: Date, boost: number) => Prisma.sql`
  WITH refs AS (
    SELECT "referredById" AS id, count(*)::int AS n FROM "Customer"
    WHERE "referredById" IS NOT NULL AND "createdAt" < ${at} GROUP BY 1
  ), w AS (
    SELECT c.id, row_number() OVER (ORDER BY c."createdAt", c.id) AS seq, coalesce(r.n, 0) AS refs
    FROM "Customer" c LEFT JOIN refs r ON r.id = c.id WHERE c."createdAt" < ${at}
  ), ranked AS (
    SELECT id, refs, row_number() OVER (ORDER BY seq - ${boost} * refs, seq) AS place, count(*) OVER () AS total FROM w
  )`;

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
    UPDATE "Customer" c SET "foundingNo" = ranked.place, "tierFloor" = ${s.foundingTier}::"Tier", "tierFloorUntil" = ${until},
      tier = GREATEST(c.tier, ${s.foundingTier}::"Tier")
    FROM ranked WHERE c.id = ranked.id AND ranked.place <= ${s.foundingCap}`;
  return { assigned };
}

/** When a floor lapses, members drop back to the tier their 12-month spend earns. */
export async function expireTierFloors(now = new Date()) {
  const cases = Prisma.join(
    [...TIERS].reverse().map((t) => Prisma.sql`WHEN coalesce(s.spend, 0) >= ${t.minCents} THEN ${t.key}::"Tier"`),
    " ",
  );
  const expired = await db.$executeRaw`
    UPDATE "Customer" c SET tier = CASE ${cases} END, "tierFloor" = NULL, "tierFloorUntil" = NULL
    FROM (
      SELECT x.id, (SELECT sum(sa."totalCents") FROM "Sale" sa WHERE sa."customerId" = x.id AND sa."createdAt" > ${new Date(now.getTime() - 365 * 86_400_000)}) AS spend
      FROM "Customer" x WHERE x."tierFloorUntil" <= ${now}
    ) s
    WHERE c.id = s.id`;
  return { expired };
}
