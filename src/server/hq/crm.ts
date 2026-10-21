// Members & CRM queries. Everything runs off the denormalised customer stats so it
// stays cheap across millions of members: one scan for the headline numbers, indexed
// counts per segment, and paged member lists.
import { db } from "@/server/db";
import { segmentWhere } from "@/server/marketing";
import { SEGMENTS, type SegmentKey } from "@/lib/rfm";
import { nameWords, parseMemberQuery } from "@/lib/member-search";
import { CLOSE_MATCHES } from "@/lib/text-search";
import { addDays } from "@/lib/format";
import { Prisma, type Tier } from "@/generated/prisma/client";

/** Area managers see members homed at their stores; HQ sees everyone (null). */
export type MemberScope = string[] | null;
const scoped = (s: MemberScope): Prisma.CustomerWhereInput => (s ? { homeStoreId: { in: s } } : {});

export async function crmKpis(s: MemberScope) {
  const monthStart = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(new Date())}-01T00:00:00+02:00`);
  const since30 = addDays(new Date(), -30);
  const filter = s ? Prisma.sql`WHERE "homeStoreId" IN (SELECT value FROM json_each(${JSON.stringify(s)}))` : Prisma.empty;
  const [r] = await db.$queryRaw<{ members: number; active30: number; newMonth: number; sms: number; email: number; whatsapp: number; push: number; points: number }[]>`
    SELECT COUNT(*) AS members,
           COUNT(CASE WHEN "lastPurchaseAt" >= ${since30} THEN 1 END) AS active30,
           COUNT(CASE WHEN "createdAt" >= ${monthStart} THEN 1 END) AS "newMonth",
           COUNT(CASE WHEN "consentSms" THEN 1 END) AS sms,
           COUNT(CASE WHEN "consentEmail" AND email IS NOT NULL THEN 1 END) AS email,
           COUNT(CASE WHEN "consentWhatsapp" THEN 1 END) AS whatsapp,
           COUNT(CASE WHEN "consentPush" THEN 1 END) AS push,
           COALESCE(SUM(points), 0) AS points
    FROM "Customer" ${filter}`;
  return r;
}

export const SEGMENT_ORDER: SegmentKey[] = ["CHAMPION", "LOYAL", "PROMISING", "NEW", "AT_RISK", "LAPSED", "PROSPECT"];

export async function segmentCounts(s: MemberScope) {
  const counts = await Promise.all(SEGMENT_ORDER.map((k) => db.customer.count({ where: { AND: [segmentWhere(k), scoped(s)] } })));
  return SEGMENT_ORDER.map((k, i) => ({ key: k, ...SEGMENTS[k], count: counts[i] }));
}

export async function tierCounts(s: MemberScope) {
  const rows = await db.customer.groupBy({ by: ["tier"], where: scoped(s), _count: true });
  return new Map(rows.map((r) => [r.tier, r._count]));
}

/** Member search box → where clause (see `parseMemberQuery`: names in any order, phone tails, member numbers without HH). */
export function memberSearchWhere(raw: string | undefined): Prisma.CustomerWhereInput {
  const q = parseMemberQuery(raw);
  switch (q.kind) {
    case "empty":
      return {};
    case "phone":
      return { phone: q.phone };
    case "email":
      return { email: { startsWith: q.email } };
    case "memberNo":
      return { memberNo: q.memberNo };
    case "digits":
      return {
        OR: [
          ...(q.memberNo ? [{ memberNo: q.memberNo }] : []),
          ...(q.tail ? [{ phone: { endsWith: q.tail } }, { memberNo: { endsWith: q.tail } }] : []),
        ],
      };
    case "names":
      return { AND: q.words.map((w) => ({ OR: [{ firstName: { startsWith: w } }, { lastName: { startsWith: w } }] })) };
  }
}

/** Member search: phone, email, member number, or name ("thabo", "thabo mok", "Mokoena, Thabo"). */
export function memberWhere(s: MemberScope, f: { q?: string; tier?: string; segment?: string; store?: string }): Prisma.CustomerWhereInput {
  const search = memberSearchWhere(f.q);
  return {
    AND: [
      scoped(s),
      search,
      f.tier && ["SEED", "SPROUT", "BLOOM", "HARVEST"].includes(f.tier) ? { tier: f.tier as Tier } : {},
      f.segment && f.segment in SEGMENTS ? segmentWhere(f.segment) : {},
      f.store ? { homeStore: { code: f.store } } : {},
    ],
  };
}

/**
 * Members whose first or last name contains every word typed ("Abrah" finds Abrahams; a word that is part of a name
 * matches on its own), within `bound` (SQL on "Customer" c), closest first: names starting with a word, then names
 * containing it, then by name: at most CLOSE_MATCHES ids. For a name search that found nobody. A LIKE pattern is at
 * most 50 bytes, so each word is cut to 40 characters.
 */
export async function closeNameMatches(words: string[], bound: Prisma.Sql = Prisma.sql`1 = 1`): Promise<string[]> {
  const ws = words.map((w) => w.slice(0, 40).replace(/[%_]/g, "")).filter(Boolean).slice(0, 4);
  if (!ws.length) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "Customer" c
      WHERE ${bound} AND ${Prisma.join(ws.map((w) => Prisma.sql`(c."firstName" LIKE ${`%${w}%`} OR c."lastName" LIKE ${`%${w}%`})`), " AND ")}
      ORDER BY ${Prisma.join(ws.map((w) => Prisma.sql`CASE WHEN c."firstName" LIKE ${`${w}%`} OR c."lastName" LIKE ${`${w}%`} THEN 0 ELSE 1 END`), " + ")}, c."firstName", c."lastName", c."memberNo"
      LIMIT ${CLOSE_MATCHES}`;
  return rows.map((r) => r.id);
}

/** A name search that found nobody, loosened (closeNameMatches) within the scope: the ids that pass the other filters, closest first. */
export async function closeMembers(s: MemberScope, f: { q?: string; tier?: string; segment?: string; store?: string }) {
  if (parseMemberQuery(f.q).kind !== "names") return [];
  const ids = await closeNameMatches(nameWords(f.q), s ? Prisma.sql`c."homeStoreId" IN (SELECT value FROM json_each(${JSON.stringify(s)}))` : undefined);
  if (!ids.length) return [];
  const pass = await db.customer.findMany({ where: { AND: [memberWhere(s, { ...f, q: undefined }), { id: { in: ids } }] }, select: { id: true } });
  const ok = new Set(pass.map((r) => r.id));
  return ids.filter((id) => ok.has(id));
}
