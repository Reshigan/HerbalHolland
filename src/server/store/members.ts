// Member figures for the store back office. Franchise privacy: a store sees only its own sales, so spend, visits and
// savings come from this store's sales (refunds are stored negative, so sums are net). Tier, points balance and RFM
// segment stay network-wide: they belong to the Rewards programme, not to any one store.
import { db, Prisma } from "@/server/db";
import { closeNameMatches } from "@/server/hq/crm";
import { nameWords } from "@/lib/member-search";
import { likeTerm } from "@/lib/search";

export type HereStats = { spendCents: number; visits: number; firstAt: Date | null; lastAt: Date | null; savedCents: number };
export const NO_STATS: HereStats = { spendCents: 0, visits: 0, firstAt: null, lastAt: null, savedCents: 0 };

/** Spend (net of refunds), visits, first and last visit and Rewards savings at one store, per member. */
export async function statsHere(storeId: string, customerIds: string[]) {
  if (!customerIds.length) return new Map<string, HereStats>();
  const rows = await db.$queryRaw<{ id: string; spend: number; visits: number; first: Date | string | null; last: Date | string | null; saved: number }[]>`
    SELECT "customerId" AS id,
           COALESCE(SUM("totalCents"), 0) AS spend,
           COUNT(CASE WHEN kind = 'SALE' THEN 1 END) AS visits,
           MIN(CASE WHEN kind = 'SALE' THEN "createdAt" END) AS first,
           MAX(CASE WHEN kind = 'SALE' THEN "createdAt" END) AS last,
           COALESCE(SUM("memberSavingsCents"), 0) AS saved
    FROM "Sale"
    WHERE "storeId" = ${storeId} AND "customerId" IN (SELECT value FROM json_each(${JSON.stringify(customerIds)}))
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.id, { spendCents: Math.round(r.spend), visits: r.visits, firstAt: r.first ? new Date(r.first) : null, lastAt: r.last ? new Date(r.last) : null, savedCents: Math.round(r.saved) }]));
}

/**
 * One page of member ids ordered by a this-store figure: spend here (high first) or last visit here (recent first).
 * Members who haven't bought here follow, newest members first.
 */
export async function membersByHere(storeId: string, where: Prisma.CustomerWhereInput, by: "spend" | "recent", skip: number, take: number) {
  const ranked =
    by === "spend"
      ? await db.sale.groupBy({ by: ["customerId"], where: { storeId, customer: { is: where } }, _sum: { totalCents: true }, orderBy: [{ _sum: { totalCents: "desc" } }, { customerId: "asc" }] })
      : await db.sale.groupBy({ by: ["customerId"], where: { storeId, kind: "SALE", customer: { is: where } }, _max: { createdAt: true }, orderBy: [{ _max: { createdAt: "desc" } }, { customerId: "asc" }] });
  const ids = ranked.map((r) => r.customerId!);
  const head = ids.slice(skip, skip + take);
  if (head.length === take) return head;
  const rest = await db.customer.findMany({
    where: { AND: [where, { sales: { none: { storeId, ...(by === "recent" && { kind: "SALE" as const }) } } }] },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: Math.max(0, skip - ids.length),
    take: take - head.length,
    select: { id: true },
  });
  return [...head, ...rest.map((r) => r.id)];
}

/** Home members who bought here since `since`, and what home members have spent here in total (net of refunds). */
export async function homeMemberTotals(storeId: string, since: Date) {
  const [[active], spend] = await Promise.all([
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT s."customerId") AS n
      FROM "Sale" s JOIN "Customer" c ON c.id = s."customerId"
      WHERE s."storeId" = ${storeId} AND s.kind = 'SALE' AND s."createdAt" >= ${since} AND c."homeStoreId" = ${storeId}`,
    db.sale.aggregate({ where: { storeId, customer: { is: { homeStoreId: storeId } } }, _sum: { totalCents: true } }),
  ]);
  return { active: active?.n ?? 0, spendCents: spend._sum.totalCents ?? 0 };
}

/**
 * A member search from the box on Members / Online orders: every word must match a name, member number or email,
 * and a run of 4+ digits also matches the mobile (stored without the leading 0). "Mpho Baloyi", "082 555 0101".
 */
export function customerSearch(q: string): Prisma.CustomerWhereInput {
  const words = q.split(/\s+/).filter(Boolean).map((w) => likeTerm(w));
  if (!words.length) return {};
  const digits = likeTerm(q.replace(/\D/g, ""));
  return {
    AND: words.map((w) => ({
      OR: [
        { firstName: { contains: w } },
        { lastName: { contains: w } },
        { memberNo: { contains: w } },
        { email: { contains: w } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }] : []),
      ],
    })),
  };
}

/** Members a store may look up: its home members, and members who have bought there (Sale.customerId is indexed). */
export const memberAtStore = (storeId: string): Prisma.CustomerWhereInput => ({ OR: [{ homeStoreId: storeId }, { sales: { some: { storeId } } }] });

/** For a search that found nobody here: members a store may look up whose names are close to the words typed (a typo), closest first. */
export const closeMembersAt = (storeId: string, q: string) =>
  closeNameMatches(nameWords(q), Prisma.sql`(c."homeStoreId" = ${storeId} OR EXISTS (SELECT 1 FROM "Sale" s WHERE s."customerId" = c.id AND s."storeId" = ${storeId}))`);
