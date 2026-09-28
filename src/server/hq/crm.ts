// Members & CRM queries. Everything runs off the denormalised customer stats so it
// stays cheap across millions of members: one scan for the headline numbers, indexed
// counts per segment, and paged member lists.
import { db } from "@/server/db";
import { segmentWhere } from "@/server/marketing";
import { SEGMENTS, type SegmentKey } from "@/lib/rfm";
import { normalisePhone } from "@/lib/sa";
import { addDays } from "@/lib/format";
import { Prisma, type Tier } from "@/generated/prisma/client";

/** Area managers see members homed at their stores; HQ sees everyone (null). */
export type MemberScope = string[] | null;
const scoped = (s: MemberScope): Prisma.CustomerWhereInput => (s ? { homeStoreId: { in: s } } : {});

export async function crmKpis(s: MemberScope) {
  const monthStart = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(new Date())}-01T00:00:00+02:00`);
  const since30 = addDays(new Date(), -30);
  const filter = s ? Prisma.sql`WHERE "homeStoreId" = ANY(${s}::text[])` : Prisma.empty;
  const [r] = await db.$queryRaw<{ members: number; active30: number; newMonth: number; sms: number; email: number; whatsapp: number; push: number; points: number }[]>`
    SELECT COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE "lastPurchaseAt" >= ${since30})::int AS active30,
           COUNT(*) FILTER (WHERE "createdAt" >= ${monthStart})::int AS "newMonth",
           COUNT(*) FILTER (WHERE "consentSms")::int AS sms,
           COUNT(*) FILTER (WHERE "consentEmail" AND email IS NOT NULL)::int AS email,
           COUNT(*) FILTER (WHERE "consentWhatsapp")::int AS whatsapp,
           COUNT(*) FILTER (WHERE "consentPush")::int AS push,
           COALESCE(SUM(points), 0)::int AS points
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

/** Member search: phone, email, member number, or name ("thabo", "thabo mok"). */
export function memberWhere(s: MemberScope, f: { q?: string; tier?: string; segment?: string; store?: string }): Prisma.CustomerWhereInput {
  const q = f.q?.trim() ?? "";
  let search: Prisma.CustomerWhereInput = {};
  if (q) {
    const phone = /^[+\d\s()-]{9,}$/.test(q) ? normalisePhone(q) : null;
    if (phone) search = { phone };
    else if (q.includes("@")) search = { email: { startsWith: q.toLowerCase() } };
    else if (/^HH\d{3,}$/i.test(q)) search = { memberNo: { startsWith: q.toUpperCase() } };
    else {
      const [a, b] = q.split(/\s+/);
      search = b
        ? { firstName: { startsWith: a, mode: "insensitive" }, lastName: { startsWith: b, mode: "insensitive" } }
        : { OR: [{ firstName: { startsWith: a, mode: "insensitive" } }, { lastName: { startsWith: a, mode: "insensitive" } }] };
    }
  }
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
