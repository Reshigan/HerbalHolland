// Marketing reports: what promotions cost and drove, and what campaigns returned.
import { db, Prisma } from "../db";
import { segmentLabel } from "../marketing";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { fmtDay } from "@/lib/format";
import { zar } from "@/lib/money";
import type { ReportDef, Row } from "./types";
import { bounds, n, ratio, statWhere, storeLabel, sumRows } from "./util";

const channelSql = (c?: "POS" | "ONLINE" | "WHOLESALE") => (c ? Prisma.sql`AND channel = ${c}::"Channel"` : Prisma.empty);

export const promotions: ReportDef = {
  key: "promotions",
  title: "Promotions",
  description: "What did each promotion cost in discounts, and what sales did it drive?",
  group: "Marketing",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const [used, all, live] = await Promise.all([
      db.$queryRaw<{ promotionId: string; n: number; members: number; revenue: number; net: number; discount: number }[]>`
        SELECT "promotionId", COUNT(*)::int AS n, COUNT(*) FILTER (WHERE "customerId" IS NOT NULL)::int AS members,
          COALESCE(SUM("totalCents"), 0)::float8 AS revenue, COALESCE(SUM("totalCents" - "vatCents"), 0)::float8 AS net,
          COALESCE(SUM("discountCents"), 0)::float8 AS discount
        FROM "Sale"
        WHERE kind = 'SALE' AND "promotionId" IS NOT NULL AND "storeId" = ANY(${ctx.storeIds}::text[])
          AND "createdAt" >= ${start} AND "createdAt" < ${end} ${channelSql(ctx.channel)}
        GROUP BY 1`,
      db.dailyStoreStat.aggregate({ where: statWhere(ctx), _sum: { grossCents: true, sales: true } }),
      db.promotion.findMany({
        where: { startsAt: { lt: end }, endsAt: { gte: start }, OR: [{ storeIds: { isEmpty: true } }, { storeIds: { hasSome: ctx.storeIds } }], ...(ctx.channel && { channels: { has: ctx.channel } }) },
        select: { id: true },
      }),
    ]);
    const ids = [...new Set([...used.map((u) => u.promotionId), ...live.map((l) => l.id)])];
    const promos = new Map((await db.promotion.findMany({ where: { id: { in: ids } } })).map((p) => [p.id, p]));
    const usedBy = new Map(used.map((u) => [u.promotionId, u]));
    const rows = ids
      .map((id) => {
        const p = promos.get(id);
        const u = usedBy.get(id) ?? { n: 0, members: 0, revenue: 0, net: 0, discount: 0 };
        return {
          name: p?.name ?? "Deleted promotion", deal: p ? describePromo(p as unknown as PromoInput) : "", code: p?.code ?? "",
          owner: p?.ownerStoreId ? (ctx.stores.get(p.ownerStoreId)?.name ?? "Store") : "HQ",
          runs: p ? `${fmtDay(p.startsAt)} – ${fmtDay(p.endsAt)}` : "", n: u.n, revenue: u.revenue, discount: u.discount,
          rate: ratio(u.discount, u.revenue + u.discount), atv: u.n ? Math.round(u.revenue / u.n) : null, members: ratio(u.members, u.n),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
    const t = sumRows(rows, ["n", "revenue", "discount"], { name: "Total" });
    t.rate = ratio(t.discount as number, (t.revenue as number) + (t.discount as number));
    t.atv = (t.n as number) ? Math.round((t.revenue as number) / (t.n as number)) : null;
    const gross = all._sum.grossCents ?? 0;
    const idle = rows.filter((r) => r.n === 0).length;
    return {
      columns: [
        { key: "name", label: "Promotion" },
        { key: "deal", label: "Deal" },
        { key: "code", label: "Code" },
        { key: "owner", label: "Run by" },
        { key: "runs", label: "Runs" },
        { key: "n", label: "Sales", format: "number" },
        { key: "revenue", label: "Revenue incl VAT", format: "zar" },
        { key: "discount", label: "Discount given", format: "zar" },
        { key: "rate", label: "Discount rate", format: "pct" },
        { key: "atv", label: "Avg basket", format: "zar" },
        { key: "members", label: "Member sales", format: "pct" },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Sales on promotion", value: t.n as number, format: "number", sub: all._sum.sales ? `${(((t.n as number) / all._sum.sales) * 100).toFixed(1)}% of transactions` : undefined },
        { label: "Revenue on promotion", value: t.revenue as number, format: "zar", sub: gross ? `${(((t.revenue as number) / gross) * 100).toFixed(1)}% of sales incl VAT` : undefined },
        { label: "Discount given", value: t.discount as number, format: "zar", upIsGood: false },
        { label: "Live but unused", value: idle, format: "number", sub: "promotions with no sales" },
      ],
      chart: rows.some((r) => r.n > 0) ? { kind: "bar", title: "Revenue by promotion", description: "Sales incl VAT with the promotion applied", format: "zar", rows: rows.filter((r) => r.n > 0).slice(0, 10).map((r) => ({ label: r.name, value: r.revenue, sub: `${zar(r.discount)} off` })) } : null,
      emptyTitle: "No promotions",
      empty: "No promotions ran in this period.",
      note: "Each sale is credited to the first promotion applied to it; the discount column includes every deal on those baskets. Medicines never carry promotions (Medicines Act s18A): licensed products, and CBD supplements while they're on the no-incentives list. Franchisee shelf prices are unaffected.",
    };
  },
};

const MSG_LABEL: Record<string, string> = { WHATSAPP: "WhatsApp", SMS: "SMS", EMAIL: "Email", PUSH: "Push" };

export const campaigns: ReportDef = {
  key: "campaigns",
  title: "Campaigns",
  description: "Which campaigns reached members and paid for themselves?",
  group: "Marketing",
  scopes: ["store", "hq"],
  filters: ["range"],
  defaultRange: "90d",
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const list = await db.campaign.findMany({
      where: { status: "SENT", sentAt: { gte: start, lt: end }, ...(ctx.networkWide ? {} : { OR: [{ storeId: null }, { storeId: { in: ctx.storeIds } }] }) },
      orderBy: { sentAt: "desc" },
    });
    const ids = list.map((c) => c.id);
    const since = list.reduce((m, c) => (c.sentAt && c.sentAt < m ? c.sentAt : m), end);
    const [attributed, reach] = await Promise.all([
      ids.length
        ? db.sale.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, storeId: { in: ctx.storeIds }, createdAt: { gte: since } }, _sum: { totalCents: true, vatCents: true }, _count: true })
        : Promise.resolve([]),
      ids.length && !ctx.networkWide
        ? db.$queryRaw<{ campaignId: string; n: number }[]>`
            SELECT m."campaignId", COUNT(*)::int AS n FROM "MessageLog" m JOIN "Customer" c ON c.id = m."customerId"
            WHERE m."campaignId" = ANY(${ids}::text[]) AND m.status = 'SENT' AND c."homeStoreId" = ANY(${ctx.storeIds}::text[])
            GROUP BY 1`
        : Promise.resolve([]),
    ]);
    const att = new Map(attributed.map((a) => [a.campaignId!, { n: a._count, revenue: a._sum.totalCents ?? 0, net: (a._sum.totalCents ?? 0) - (a._sum.vatCents ?? 0) }]));
    const reachBy = new Map(reach.map((r) => [r.campaignId, r.n]));
    const rows: Row[] = list.map((c) => {
      // ROI is only meaningful when this report covers the campaign's whole audience.
      const whole = ctx.networkWide || (c.storeId != null && ctx.storeIds.includes(c.storeId));
      const a = att.get(c.id) ?? { n: 0, revenue: 0, net: 0 };
      return {
        name: c.name, from: c.storeId ? storeLabel(ctx, c.storeId) : "HQ", channel: MSG_LABEL[c.channel] ?? c.channel, segment: segmentLabel(c.segment), sent: c.sentAt,
        audience: whole ? c.audienceCount : null, delivered: whole ? c.sentCount : (reachBy.get(c.id) ?? 0), suppressed: whole ? c.suppressedCount : null,
        cost: whole ? c.costCents : null, orders: a.n, revenue: a.revenue, perMsg: ratio(a.revenue, whole ? c.sentCount : (reachBy.get(c.id) ?? 0)),
        roi: whole && c.costCents > 0 ? (a.net - c.costCents) / c.costCents : null,
      };
    });
    const t = sumRows(rows, ["delivered", "orders", "revenue"], { name: "Total" });
    const costed = list.filter((c) => (ctx.networkWide || (c.storeId != null && ctx.storeIds.includes(c.storeId))) && c.costCents > 0);
    const cost = costed.reduce((s, c) => s + c.costCents, 0);
    const costedNet = costed.reduce((s, c) => s + (att.get(c.id)?.net ?? 0), 0);
    t.cost = cost || null;
    t.roi = cost ? (costedNet - cost) / cost : null;
    // Targeting, cost and ROI only apply where the view covers a campaign's whole audience.
    const whole = rows.some((r) => r.audience != null);
    return {
      columns: [
        { key: "name", label: "Campaign" },
        { key: "from", label: "From" },
        { key: "channel", label: "Channel" },
        { key: "segment", label: "Audience" },
        { key: "sent", label: "Sent", format: "date" },
        ...(whole ? [{ key: "audience", label: "Targeted", format: "number" as const }] : []),
        { key: "delivered", label: ctx.networkWide ? "Messages sent" : "Sent to your members", format: "number" },
        ...(whole ? [{ key: "suppressed", label: "Suppressed", format: "number" as const }, { key: "cost", label: "Cost", format: "zar" as const }] : []),
        { key: "orders", label: "Attributed sales", format: "number" },
        { key: "revenue", label: "Attributed revenue", format: "zar" },
        { key: "perMsg", label: "Revenue / message", format: "zar" },
        ...(whole ? [{ key: "roi", label: "ROI", format: "pct" as const }] : []),
      ],
      rows,
      totals: t,
      summary: [
        { label: "Campaigns sent", value: list.length, format: "number" },
        { label: "Messages", value: t.delivered as number, format: "number", sub: ctx.networkWide ? "after consent & suppression" : "to members of this store" },
        { label: "Attributed revenue", value: t.revenue as number, format: "zar", sub: `${n(t.orders as number)} sales · incl VAT` },
        { label: "ROI", value: t.roi as number | null, format: "pct", sub: cost ? `on ${zar(cost)} spend` : "no costed campaigns in view" },
      ],
      chart: rows.some((r) => (r.revenue as number) > 0) ? { kind: "bar", title: "Attributed revenue", description: "Sales incl VAT credited to each campaign", format: "zar", rows: rows.filter((r) => (r.revenue as number) > 0).map((r) => ({ label: String(r.name), value: r.revenue as number, sub: `${n(r.orders as number)} sale${r.orders === 1 ? "" : "s"}` })) } : null,
      emptyTitle: "No campaigns",
      empty: "No campaigns were sent in this period.",
      note: `Last-touch attribution: sales that used the campaign's promo code or tracked link, or its promotion after the send. ROI = (attributed net sales − cost) ÷ cost${ctx.networkWide ? "" : ", shown only for campaigns whose whole audience is in this view; network campaigns show the sales and members at this store"}.`,
    };
  },
};
