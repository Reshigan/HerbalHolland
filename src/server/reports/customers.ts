// Member reports: RFM segments (as of today), new vs returning members by week, member attach (share of
// transactions linked to a Rewards member), Rewards savings and where members joined.
import { db, Prisma } from "../db";
import { segmentWhere } from "../marketing";
import { sast } from "../sql";
import { SEGMENTS, type SegmentKey } from "@/lib/rfm";
import { TIERS } from "@/lib/loyalty-rules";
import { getSettings } from "../settings";
import { delta, previousRange } from "@/lib/ranges";
import { fmtDay } from "@/lib/format";
import { zar } from "@/lib/money";
import type { ReportDef, Row } from "./types";
import { STAT_SUMS, bounds, completeDays, eachDay, isoDay, multi, n, ratio, statWhere, storeLabel, sumRows, summaryOf } from "./util";

const channelSql = (c?: "POS" | "ONLINE" | "WHOLESALE") => (c ? Prisma.sql`AND channel = ${c}::"Channel"` : Prisma.empty);

const ORDER: SegmentKey[] = ["CHAMPION", "LOYAL", "PROMISING", "NEW", "AT_RISK", "LAPSED", "PROSPECT"];
const CONSENTED: Prisma.CustomerWhereInput = { OR: [{ consentSms: true }, { consentWhatsapp: true }, { consentEmail: true }, { consentPush: true }] };

export const segments: ReportDef = {
  key: "segments",
  title: "Member segments",
  description: "Who are our members? Recency, frequency and value segments with the play for each.",
  group: "Members",
  scopes: ["store", "hq"],
  async run(ctx) {
    const home: Prisma.CustomerWhereInput = ctx.networkWide ? {} : { homeStoreId: { in: ctx.storeIds } };
    const data = await Promise.all(
      ORDER.map(async (seg) => {
        const where: Prisma.CustomerWhereInput = { AND: [segmentWhere(seg, ctx.now), home] };
        const [agg, reachable] = await Promise.all([
          db.customer.aggregate({ where, _count: true, _sum: { lifetimeCents: true, points: true } }),
          db.customer.count({ where: { AND: [where, CONSENTED] } }),
        ]);
        return { seg, n: agg._count, lifetime: agg._sum.lifetimeCents ?? 0, points: agg._sum.points ?? 0, reachable };
      }),
    );
    const total = data.reduce((s, d) => s + d.n, 0);
    const rows: Row[] = data.map((d) => ({
      segment: SEGMENTS[d.seg].name, who: SEGMENTS[d.seg].blurb, members: d.n, share: ratio(d.n, total), reachable: d.reachable, reach: ratio(d.reachable, d.n),
      lifetime: d.lifetime, avg: d.n ? Math.round(d.lifetime / d.n) : null, points: d.points, play: SEGMENTS[d.seg].play,
    }));
    const t = sumRows(rows, ["members", "reachable", "lifetime", "points"], { segment: "All members" });
    t.share = total ? 1 : null;
    t.reach = ratio(t.reachable as number, total);
    t.avg = total ? Math.round((t.lifetime as number) / total) : null;
    const active = data.filter((d) => ["CHAMPION", "LOYAL", "PROMISING", "NEW"].includes(d.seg)).reduce((s, d) => s + d.n, 0);
    return {
      columns: [
        { key: "segment", label: "Segment" },
        { key: "who", label: "Who they are" },
        { key: "members", label: "Members", format: "number" },
        { key: "share", label: "Share", format: "pct" },
        { key: "reachable", label: "Can be contacted", format: "number" },
        { key: "reach", label: "Reach", format: "pct" },
        { key: "lifetime", label: "Lifetime spend", format: "zar" },
        { key: "avg", label: "Avg per member", format: "zar" },
        { key: "points", label: "Points balance", format: "points" },
        { key: "play", label: "Suggested play" },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Members", value: total, format: "number" },
        { label: "Active (bought in 60 days)", value: ratio(active, total), format: "pct", sub: `${n(active)} members` },
        { label: "Can be contacted", value: ratio(t.reachable as number, total), format: "pct", sub: "consented to at least one channel" },
        { label: "Avg lifetime spend", value: t.avg as number | null, format: "zar", sub: "incl VAT" },
      ],
      chart: total ? { kind: "bar", title: "Members by segment", description: "As of today", format: "number", rows: data.map((d) => ({ label: SEGMENTS[d.seg].name, value: d.n, sub: `${((ratio(d.n, total) ?? 0) * 100).toFixed(0)}%` })) } : null,
      emptyTitle: "No members yet",
      empty: "No Rewards members have this store as their home store yet.",
      note: `Segments are calculated as of today from each member's visits and last purchase — the same rules the campaign builder targets. ${ctx.networkWide ? "Covers every member in the network." : "Members are counted at their home store."} Marketing reach respects POPIA consent; do-not-contact suppression is applied again when a campaign sends.`,
    };
  },
};

export const newVsReturning: ReportDef = {
  key: "new-vs-returning",
  title: "New vs returning members",
  description: "Are we winning new members each week — and bringing them back?",
  group: "Members",
  scopes: ["store", "hq"],
  filters: ["range"],
  defaultRange: "90d",
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const [weeks, signups] = await Promise.all([
      db.$queryRaw<{ week: Date; newMembers: number; returning: number; walkIns: number; memberTx: number; newNet: number; retNet: number; walkNet: number }[]>`
        WITH x AS (
          SELECT date_trunc('week', ${sast('s."createdAt"')}) AS wk, s."customerId", s."totalCents" - s."vatCents" AS net, ${sast('c."firstPurchaseAt"')} AS first_local
          FROM "Sale" s LEFT JOIN "Customer" c ON c.id = s."customerId"
          WHERE s.kind = 'SALE' AND s."storeId" = ANY(${ctx.storeIds}::text[]) AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
        )
        SELECT wk::date AS week,
          COUNT(DISTINCT "customerId") FILTER (WHERE "customerId" IS NOT NULL AND first_local >= wk)::int AS "newMembers",
          COUNT(DISTINCT "customerId") FILTER (WHERE "customerId" IS NOT NULL AND (first_local < wk OR first_local IS NULL))::int AS returning,
          COUNT(*) FILTER (WHERE "customerId" IS NULL)::int AS "walkIns",
          COUNT(*) FILTER (WHERE "customerId" IS NOT NULL)::int AS "memberTx",
          COALESCE(SUM(net) FILTER (WHERE "customerId" IS NOT NULL AND first_local >= wk), 0)::float8 AS "newNet",
          COALESCE(SUM(net) FILTER (WHERE "customerId" IS NOT NULL AND (first_local < wk OR first_local IS NULL)), 0)::float8 AS "retNet",
          COALESCE(SUM(net) FILTER (WHERE "customerId" IS NULL), 0)::float8 AS "walkNet"
        FROM x GROUP BY 1 ORDER BY 1`,
      db.$queryRaw<{ week: Date; n: number }[]>`
        SELECT date_trunc('week', ${sast('"createdAt"')})::date AS week, COUNT(*)::int AS n
        FROM "Customer"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end} ${ctx.networkWide ? Prisma.empty : Prisma.sql`AND "homeStoreId" = ANY(${ctx.storeIds}::text[])`}
        GROUP BY 1`,
    ]);
    const joined = new Map(signups.map((s) => [isoDay(s.week), s.n]));
    const rows: Row[] = weeks.map((w) => {
      const tx = w.memberTx + w.walkIns;
      return {
        week: isoDay(w.week), signups: joined.get(isoDay(w.week)) ?? 0, newMembers: w.newMembers, returning: w.returning, walkIns: w.walkIns,
        memberShare: ratio(w.memberTx, tx), newNet: w.newNet, retNet: w.retNet, walkNet: w.walkNet,
      };
    });
    const t = sumRows(rows, ["signups", "walkIns", "newNet", "retNet", "walkNet"], { week: "Total" });
    const memberTx = weeks.reduce((s, w) => s + w.memberTx, 0);
    t.memberShare = ratio(memberTx, memberTx + (t.walkIns as number));
    const newTotal = rows.reduce((s, r) => s + (r.newMembers as number), 0);
    const memberNet = (t.newNet as number) + (t.retNet as number);
    return {
      columns: [
        { key: "week", label: "Week of", format: "date" },
        { key: "signups", label: "Sign-ups", format: "number" },
        { key: "newMembers", label: "New members", format: "number" },
        { key: "returning", label: "Returning members", format: "number" },
        { key: "walkIns", label: "Walk-in sales", format: "number" },
        { key: "memberShare", label: "Member sales", format: "pct" },
        { key: "newNet", label: "Net from new", format: "zar" },
        { key: "retNet", label: "Net from returning", format: "zar" },
        { key: "walkNet", label: "Net from walk-ins", format: "zar" },
      ],
      rows,
      totals: { ...t, newMembers: newTotal, returning: null },
      summary: [
        { label: "Sign-ups", value: t.signups as number, format: "number", sub: "new Rewards members" },
        { label: "First-time buyers", value: newTotal, format: "number", sub: "first purchase anywhere in the network" },
        { label: "Revenue from returning", value: ratio(t.retNet as number, memberNet + (t.walkNet as number)), format: "pct", sub: zar(t.retNet as number) },
        { label: "Member sales", value: t.memberShare as number | null, format: "pct", sub: "of transactions" },
      ],
      chart: rows.length > 1
        ? { kind: "area", title: "New and returning members", description: "Distinct members buying each week", format: "number", labels: rows.map((r) => fmtDay(`${r.week}T12:00:00Z`)), series: [{ name: "Returning", values: rows.map((r) => r.returning as number) }, { name: "New", values: rows.map((r) => r.newMembers as number) }] }
        : null,
      empty: "No sales in this period.",
      note: "Weeks start on Monday (South African time); the first and last weeks can be partial. New = the member's first purchase anywhere in the network happened that week. Returning customers are counted per week, so the total isn't summed across weeks.",
    };
  },
};

export const memberAttach: ReportDef = {
  key: "member-attach",
  title: "Member attach rate",
  description: "What share of transactions are linked to a Rewards member?",
  group: "Members",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  async run(ctx) {
    const prevR = previousRange(ctx.range);
    const cols = [
      { key: "sales", label: "Transactions", format: "number" as const },
      { key: "members", label: "Member transactions", format: "number" as const },
      { key: "rate", label: "Attach rate", format: "pct" as const },
    ];
    const [cur, prev] = await Promise.all([db.dailyStoreStat.aggregate({ where: statWhere(ctx), _sum: STAT_SUMS }), db.dailyStoreStat.aggregate({ where: statWhere(ctx, prevR), _sum: STAT_SUMS })]);
    const c = summaryOf(cur._sum), p = summaryOf(prev._sum);
    const summary = [
      { label: "Attach rate", value: c.sales ? c.memberRate : null, format: "pct" as const, sub: p.sales ? `${(p.memberRate * 100).toFixed(1)}% in the previous ${ctx.range.days} days` : undefined },
      { label: "Member transactions", value: c.members, format: "number" as const, sub: `of ${n(c.sales)}` },
      { label: "Walk-in transactions", value: c.sales - c.members, format: "number" as const },
    ];
    const note = "A transaction is attached when the member's Rewards account was linked at the till or online. Refunds don't change the count.";
    if (multi(ctx)) {
      const [now, before] = await Promise.all([
        db.dailyStoreStat.groupBy({ by: ["storeId"], where: statWhere(ctx), _sum: { sales: true, members: true, grossCents: true, vatCents: true } }),
        db.dailyStoreStat.groupBy({ by: ["storeId"], where: statWhere(ctx, prevR), _sum: { sales: true, members: true } }),
      ]);
      const prevBy = new Map(before.map((b) => [b.storeId, ratio(b._sum.members ?? 0, b._sum.sales ?? 0)]));
      const rows = now
        .map((x) => {
          const rate = ratio(x._sum.members ?? 0, x._sum.sales ?? 0);
          const pr = prevBy.get(x.storeId) ?? null;
          return { store: storeLabel(ctx, x.storeId), code: ctx.stores.get(x.storeId)?.code ?? "", sales: x._sum.sales ?? 0, members: x._sum.members ?? 0, rate, prev: pr, change: rate != null && pr != null ? rate - pr : null };
        })
        .filter((r) => r.sales > 0)
        .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
      return {
        columns: [{ key: "store", label: "Store" }, { key: "code", label: "Code" }, ...cols, { key: "prev", label: "Previous period", format: "pct" }, { key: "change", label: "Change (pts)", format: "pct" }],
        rows,
        totals: { store: "Total", sales: c.sales, members: c.members, rate: c.sales ? c.memberRate : null, prev: p.sales ? p.memberRate : null, change: c.sales && p.sales ? c.memberRate - p.memberRate : null },
        summary,
        chart: rows.length ? { kind: "bar", title: "Attach rate by store", description: "Share of transactions with a member linked", format: "pct", rows: rows.slice(0, 15).map((r) => ({ label: String(r.store), value: r.rate ?? 0, sub: `${n(r.members)} of ${n(r.sales)}` })) } : null,
        empty: "No transactions in this period.",
        note: `${note} Change is in percentage points.`,
      };
    }
    const days = await db.dailyStoreStat.groupBy({ by: ["date"], where: statWhere(ctx), _sum: { sales: true, members: true }, orderBy: { date: "asc" } });
    const by = new Map(days.map((d) => [isoDay(d.date), d._sum]));
    const rows: Row[] = eachDay(ctx.range).map((date) => {
      const s = by.get(date);
      return { date, sales: s?.sales ?? 0, members: s?.members ?? 0, rate: ratio(s?.members ?? 0, s?.sales ?? 0) };
    });
    const withSales = completeDays(ctx, rows).filter((r) => (r.sales as number) > 0);
    return {
      columns: [{ key: "date", label: "Day", format: "day" }, ...cols],
      rows,
      totals: { date: "Total", sales: c.sales, members: c.members, rate: c.sales ? c.memberRate : null },
      summary,
      chart: withSales.length > 1 ? { kind: "area", title: "Daily attach rate", description: "Share of transactions with a member linked", format: "pct", labels: withSales.map((r) => fmtDay(`${r.date}T12:00:00Z`)), series: [{ name: "Attach rate", values: withSales.map((r) => (r.rate as number) ?? 0) }] } : null,
      empty: "No transactions in this period.",
      note,
    };
  },
};

// ── Instant Rewards savings (tier pricing) ──────────────────────────────────
export const rewardsSavings: ReportDef = {
  key: "rewards-savings",
  title: "Rewards savings",
  description: "How much do members save instantly at the till — and do they spend more than walk-ins?",
  group: "Members",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const byStore = multi(ctx);
    const key = byStore ? Prisma.raw(`"storeId"`) : Prisma.sql`(${sast('"createdAt"')})::date`;
    const [roll, split, prev, settings] = await Promise.all([
      byStore
        ? db.dailyStoreStat.groupBy({ by: ["storeId"], where: statWhere(ctx), _sum: { memberSavingsCents: true } })
        : db.dailyStoreStat.groupBy({ by: ["date"], where: statWhere(ctx), _sum: { memberSavingsCents: true }, orderBy: { date: "asc" } }),
      db.$queryRaw<{ k: string | Date; memberTx: number; memberGross: number; walkTx: number; walkGross: number }[]>`
        SELECT ${key} AS k,
          COUNT(*) FILTER (WHERE kind = 'SALE' AND "customerId" IS NOT NULL)::int AS "memberTx",
          COALESCE(SUM("totalCents") FILTER (WHERE kind = 'SALE' AND "customerId" IS NOT NULL), 0)::float8 AS "memberGross",
          COUNT(*) FILTER (WHERE kind = 'SALE' AND "customerId" IS NULL)::int AS "walkTx",
          COALESCE(SUM("totalCents") FILTER (WHERE kind = 'SALE' AND "customerId" IS NULL), 0)::float8 AS "walkGross"
        FROM "Sale"
        WHERE "storeId" = ANY(${ctx.storeIds}::text[]) AND "createdAt" >= ${start} AND "createdAt" < ${end} ${channelSql(ctx.channel)}
        GROUP BY 1`,
      db.dailyStoreStat.aggregate({ where: statWhere(ctx, previousRange(ctx.range)), _sum: { memberSavingsCents: true } }),
      getSettings(),
    ]);
    const keyOf = (k: string | Date) => (k instanceof Date ? isoDay(k) : k);
    const savingsBy = new Map<string, number>(
      roll.map((r) => ["storeId" in r ? (r.storeId as string) : isoDay((r as { date: Date }).date), r._sum.memberSavingsCents ?? 0]),
    );
    const splitBy = new Map(split.map((x) => [keyOf(x.k), x]));
    const shape = (k: string) => {
      const x = splitBy.get(k) ?? { memberTx: 0, memberGross: 0, walkTx: 0, walkGross: 0 };
      const savings = savingsBy.get(k) ?? 0;
      const memberAtv = x.memberTx ? Math.round(x.memberGross / x.memberTx) : null;
      const walkAtv = x.walkTx ? Math.round(x.walkGross / x.walkTx) : null;
      return {
        memberTx: x.memberTx, memberGross: x.memberGross, savings, rate: ratio(savings, x.memberGross), memberAtv, walkAtv,
        uplift: memberAtv != null && walkAtv ? memberAtv / walkAtv - 1 : null, share: ratio(x.memberGross, x.memberGross + x.walkGross),
      };
    };
    const keys = byStore ? [...new Set([...savingsBy.keys(), ...splitBy.keys()])] : eachDay(ctx.range);
    const rows = keys
      .map((k) => (byStore ? { store: storeLabel(ctx, k), code: ctx.stores.get(k)?.code ?? "", ...shape(k) } : { date: k, ...shape(k) }))
      .filter((r) => !byStore || r.memberTx > 0 || r.savings !== 0)
      .sort((a, b) => (byStore ? b.savings - a.savings || b.memberGross - a.memberGross : 0));
    const all = split.reduce((a, x) => ({ memberTx: a.memberTx + x.memberTx, memberGross: a.memberGross + x.memberGross, walkTx: a.walkTx + x.walkTx, walkGross: a.walkGross + x.walkGross }), { memberTx: 0, memberGross: 0, walkTx: 0, walkGross: 0 });
    const savings = [...savingsBy.values()].reduce((s, v) => s + v, 0);
    const memberAtv = all.memberTx ? Math.round(all.memberGross / all.memberTx) : null;
    const walkAtv = all.walkTx ? Math.round(all.walkGross / all.walkTx) : null;
    const tiers = TIERS.map((t) => `${t.name} ${settings.loyalty.tierSavingsPct?.[t.key] ?? 0}%`).join(" · ");
    const trend = completeDays(ctx, rows as { date: string; savings: number }[]);
    return {
      title: byStore ? "By store" : "Day by day",
      columns: [
        ...(byStore ? [{ key: "store", label: "Store" }, { key: "code", label: "Code" }] : [{ key: "date", label: "Day", format: "day" as const }]),
        { key: "memberTx", label: "Member transactions", format: "number" },
        { key: "memberGross", label: "Member sales incl VAT", format: "zar" },
        { key: "savings", label: "Rewards savings", format: "zar" },
        { key: "rate", label: "Savings rate", format: "pct" },
        { key: "memberAtv", label: "Member basket", format: "zar" },
        { key: "walkAtv", label: "Walk-in basket", format: "zar" },
        { key: "uplift", label: "Member uplift", format: "pct" },
        { key: "share", label: "Member share of sales", format: "pct" },
      ],
      rows,
      totals: {
        [byStore ? "store" : "date"]: "Total", memberTx: all.memberTx, memberGross: all.memberGross, savings, rate: ratio(savings, all.memberGross), memberAtv, walkAtv,
        uplift: memberAtv != null && walkAtv ? memberAtv / walkAtv - 1 : null, share: ratio(all.memberGross, all.memberGross + all.walkGross),
      },
      summary: [
        { label: "Rewards savings given", value: savings, format: "zar", delta: delta(savings, prev._sum.memberSavingsCents ?? 0), sub: "instant, incl VAT" },
        { label: "Savings rate", value: ratio(savings, all.memberGross), format: "pct", sub: "of member sales" },
        { label: "Member basket", value: memberAtv, format: "zar", sub: walkAtv ? `vs ${zar(walkAtv)} walk-in` : undefined },
        { label: "Member share of sales", value: ratio(all.memberGross, all.memberGross + all.walkGross), format: "pct", sub: `${n(all.memberTx)} member sales` },
      ],
      chart: savings !== 0
        ? byStore
          ? { kind: "bar", title: "Savings given by store", description: "Instant Rewards savings, incl VAT", format: "zar", rows: rows.slice(0, 15).map((r) => ({ label: String((r as { store: string }).store), value: r.savings, sub: r.rate == null ? undefined : `${(r.rate * 100).toFixed(1)}% of member sales` })) }
          : trend.length > 1
            ? { kind: "area", title: "Savings given each day", description: "Instant Rewards savings, incl VAT", format: "zar", labels: trend.map((r) => fmtDay(`${r.date}T12:00:00Z`)), series: [{ name: "Rewards savings", values: trend.map((r) => r.savings) }] }
            : null
        : null,
      emptyTitle: "No member sales",
      empty: "No sales were linked to a Rewards member in this period.",
      note: `Members pay their tier's Rewards price at the till (${tiers}); the saving is measured against the walk-in price and nets off refunds. It's a price reduction already reflected in net sales — not a points liability.${savings === 0 ? " No instant savings were recorded in this period — savings are captured from the launch of tier pricing." : ""}`,
    };
  },
};

// ── Where members joined: tagged join links and QR codes (/club/join?src=…) ──
const JOINED_AT: Record<string, string> = { WEB: "Website (untagged)", REFERRAL: "A friend's link", POS: "At the till", ADMIN: "Added by a store" };

export const joinSources: ReportDef = {
  key: "join-sources",
  title: "Where members joined",
  description: "Which QR codes, links, events and partners bring in new members?",
  group: "Members",
  scopes: ["store", "hq"],
  filters: ["range"],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const home: Prisma.CustomerWhereInput = ctx.networkWide ? {} : { homeStoreId: { in: ctx.storeIds } };
    const groups = await db.customer.groupBy({ by: ["joinedVia", "source"], where: { AND: [home, { createdAt: { gte: start, lt: end } }] }, _count: true });
    const by = new Map<string, number>();
    for (const g of groups) {
      const label = g.joinedVia ?? JOINED_AT[g.source ?? ""] ?? "Other";
      by.set(label, (by.get(label) ?? 0) + g._count);
    }
    const total = groups.reduce((s, g) => s + g._count, 0);
    const tagged = groups.reduce((s, g) => s + (g.joinedVia ? g._count : 0), 0);
    const rows = [...by].map(([source, members]) => ({ source, members, share: ratio(members, total) })).sort((a, b) => b.members - a.members);
    return {
      columns: [{ key: "source", label: "Source" }, { key: "members", label: "New members", format: "number" }, { key: "share", label: "Share", format: "pct" }],
      rows,
      totals: { source: "Total", members: total, share: total ? 1 : null },
      summary: [
        { label: "New members", value: total, format: "number" },
        { label: "From tagged links and QR codes", value: tagged, format: "number", sub: total ? `${Math.round((tagged / total) * 100)}% of new members` : undefined },
      ],
      chart: rows.length ? { kind: "bar", title: "New members by source", format: "number", rows: rows.slice(0, 15).map((r) => ({ label: r.source, value: r.members })) } : null,
      empty: "No new members in this period.",
      note: "Tag every join link and QR code with ?src= (for example /club/join?src=flyer-hillcrest) to see it here. Untagged sign-ups show where they happened.",
    };
  },
};
