// Cohorts and retention: members by join month × months since joining (share who bought that month), repeat
// purchase and 90-day retention rates, and the average order value trend. Heavy counting is SQL bounded by the
// scoped stores and the date range (members homed at those stores, sales rung up at them); the AOV trend reads the
// rollups. Shaping is pure (@/lib/cohorts).
import { db, Prisma } from "../db";
import { sast } from "../sql";
import { aovSeries, averageRetention, cohortGrid, monthLabel, monthRange, monthsBetween, ratio, repeatRate, retention90 } from "@/lib/cohorts";
import { dayKey } from "@/lib/format";
import { MANAGERS, type ReportDef, type Row } from "./types";
import { bounds, n, retailIds } from "./util";

/** A list of ids as one JSON parameter (any length under D1's 100 bound values): `col IN (${inList(ids)})`. */
const inList = (ids: readonly string[]) => Prisma.sql`SELECT value FROM json_each(${JSON.stringify(ids)})`;
const ymSql = (expr: Prisma.Sql) => Prisma.sql`strftime('%Y-%m', ${expr})`;
/** A month as a number (year × 12 + month) of a SAST timestamp, so months between two dates are a subtraction. */
const ymNum = (expr: Prisma.Sql) => Prisma.sql`(cast(strftime('%Y', ${expr}) AS integer) * 12 + cast(strftime('%m', ${expr}) AS integer))`;
/** A timestamp column moved by a SQLite modifier ('+1 day'), in the ISO text the columns hold, for exact comparisons. */
const shifted = (col: string, modifier: string) => Prisma.raw(`(strftime('%Y-%m-%dT%H:%M:%f', ${col}, '${modifier}') || '+00:00')`);
const homeSql = (ctx: { networkWide: boolean }, ids: string[]) => (ctx.networkWide ? Prisma.empty : Prisma.sql`AND c."homeStoreId" IN (${inList(ids)})`);
const channelSql = (c?: "POS" | "ONLINE" | "WHOLESALE") => (c ? Prisma.sql`AND s.channel = ${c}` : Prisma.empty);

export const cohorts: ReportDef = {
  key: "cohorts",
  title: "Member cohorts",
  description: "Of the members who joined each month, what share came back to buy in the months after?",
  group: "Members",
  scopes: ["hq", "store"],
  filters: ["range", "channel"],
  defaultRange: "90d",
  roles: MANAGERS,
  async run(ctx) {
    const ids = retailIds(ctx);
    const { start, end } = bounds(ctx);
    const asOf = dayKey(ctx.now).slice(0, 7);
    const months = monthRange(ctx.range.from, ctx.range.to);
    const maxMonths = Math.min(24, Math.max(3, monthsBetween(months[0], asOf) + 1));
    const [sizes, cells] = await Promise.all([
      db.$queryRaw<{ cohort: string; members: number }[]>`
        SELECT ${ymSql(sast('c."createdAt"'))} AS cohort, cast(COUNT(*) AS real) AS members
        FROM "Customer" c WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end} ${homeSql(ctx, ids)}
        GROUP BY 1`,
      db.$queryRaw<{ cohort: string; month: number; buyers: number }[]>`
        WITH m AS (
          SELECT c.id, ${ymSql(sast('c."createdAt"'))} AS cohort, ${ymNum(sast('c."createdAt"'))} AS ym
          FROM "Customer" c WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end} ${homeSql(ctx, ids)}
        )
        SELECT m.cohort, cast(${ymNum(sast('s."createdAt"'))} - m.ym AS real) AS month, cast(COUNT(DISTINCT s."customerId") AS real) AS buyers
        FROM "Sale" s JOIN m ON m.id = s."customerId"
        WHERE s.kind = 'SALE' AND s."storeId" IN (${inList(ids)}) AND s."createdAt" >= ${start} AND s."createdAt" < ${ctx.now} ${channelSql(ctx.channel)}
        GROUP BY 1, 2`,
    ]);
    const grid = cohortGrid(sizes, cells, { asOf, maxMonths });
    const avg = averageRetention(grid.rows, grid.months);
    const members = sizes.reduce((t, s) => t + s.members, 0);
    const m1 = avg[1] ?? null;
    const m3 = avg[3] ?? null;
    const rows: Row[] = grid.rows.map((r) => ({ cohort: r.label, members: r.members, ...Object.fromEntries(grid.months.map((m) => [`m${m}`, r.rates[m]])) }));
    const totals: Row = { cohort: "All cohorts", members, ...Object.fromEntries(grid.months.map((m) => [`m${m}`, avg[m]])) };
    return {
      columns: [
        { key: "cohort", label: "Joined" },
        { key: "members", label: "Members", format: "number" },
        ...grid.months.map((m) => ({ key: `m${m}`, label: m === 0 ? "Join month" : `Month ${m}`, format: "pct" as const })),
      ],
      rows,
      totals: rows.length ? totals : null,
      summary: [
        { label: "Members who joined", value: members, format: "number", sub: `${months.length} join month${months.length === 1 ? "" : "s"}` },
        { label: "Bought in their join month", value: avg[0] ?? null, format: "pct", sub: "weighted across cohorts" },
        { label: "Back in month 1", value: m1, format: "pct", sub: "of cohorts a month old" },
        { label: "Back in month 3", value: m3, format: "pct", sub: "of cohorts three months old" },
      ],
      chart: rows.length
        ? {
            kind: "matrix",
            title: "Share of each cohort that bought, by months since joining",
            description: "Rows are join months; a blank cell is a month that hasn't happened yet",
            format: "pct",
            rows: grid.rows.map((r) => `${r.label} · ${n(r.members)}`),
            cols: grid.months.map((m) => (m === 0 ? "Join" : `M${m}`)),
            cells: grid.rows.flatMap((r, ri) => grid.months.map((m) => ({ row: ri, col: m, value: r.rates[m], tip: r.rates[m] == null ? undefined : `${r.label} · month ${m}\n${n(r.buyers[m] ?? 0)} of ${n(r.members)} members bought` }))),
          }
        : null,
      emptyTitle: "No members joined in this period",
      empty: "Pick a range that includes the months members joined: cohorts are built from join dates.",
      note: `Members are counted at their home store${ctx.networkWide ? " across the network" : ""} by the month they joined (SAST); a member is "back" in a month when a sale at ${ctx.storeIds.length === 1 ? "the store" : "these stores"} carries their card. Month 0 is the join month itself. Rates are members-weighted in the totals row.`,
    };
  },
};

export const retention: ReportDef = {
  key: "retention",
  title: "Retention & order value",
  description: "Are members buying again, and how is the average basket moving month by month?",
  group: "Members",
  scopes: ["hq", "store"],
  filters: ["range", "channel"],
  defaultRange: "90d",
  roles: MANAGERS,
  async run(ctx) {
    const ids = retailIds(ctx);
    const { start, end } = bounds(ctx);
    const months = monthRange(ctx.range.from, ctx.range.to);
    const ninety = new Date(ctx.now.getTime() - 90 * 86_400_000);
    const [joined, buying, overall, ret, aov] = await Promise.all([
      db.$queryRaw<{ month: string; members: number }[]>`
        SELECT ${ymSql(sast('c."createdAt"'))} AS month, cast(COUNT(*) AS real) AS members
        FROM "Customer" c WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end} ${homeSql(ctx, ids)} GROUP BY 1`,
      db.$queryRaw<{ month: string; buyers: number; repeat: number; sales: number }[]>`
        SELECT month, cast(COUNT(*) AS real) AS buyers, cast(COUNT(CASE WHEN k >= 2 THEN 1 END) AS real) AS repeat, cast(SUM(k) AS real) AS sales FROM (
          SELECT s."customerId", ${ymSql(sast('s."createdAt"'))} AS month, COUNT(*) AS k
          FROM "Sale" s WHERE s.kind = 'SALE' AND s."customerId" IS NOT NULL AND s."storeId" IN (${inList(ids)}) AND s."createdAt" >= ${start} AND s."createdAt" < ${end} ${channelSql(ctx.channel)}
          GROUP BY 1, 2) x GROUP BY 1`,
      db.$queryRaw<{ buyers: number; repeat: number }[]>`
        SELECT cast(COUNT(*) AS real) AS buyers, cast(COUNT(CASE WHEN k >= 2 THEN 1 END) AS real) AS repeat FROM (
          SELECT s."customerId", COUNT(*) AS k FROM "Sale" s
          WHERE s.kind = 'SALE' AND s."customerId" IS NOT NULL AND s."storeId" IN (${inList(ids)}) AND s."createdAt" >= ${start} AND s."createdAt" < ${end} ${channelSql(ctx.channel)}
          GROUP BY 1) x`,
      db.$queryRaw<{ month: string; eligible: number; retained: number }[]>`
        SELECT ${ymSql(sast('c."createdAt"'))} AS month, cast(COUNT(*) AS real) AS eligible,
          cast(COUNT(CASE WHEN EXISTS (
            SELECT 1 FROM "Sale" s WHERE s."customerId" = c.id AND s.kind = 'SALE' AND s."storeId" IN (${inList(ids)})
              AND s."createdAt" > ${shifted('c."createdAt"', "+1 day")} AND s."createdAt" <= ${shifted('c."createdAt"', "+90 days")} ${channelSql(ctx.channel)}) THEN 1 END) AS real) AS retained
        FROM "Customer" c WHERE c."createdAt" >= ${start} AND c."createdAt" < ${end} AND c."createdAt" <= ${ninety} ${homeSql(ctx, ids)}
        GROUP BY 1`,
      db.$queryRaw<{ month: string; grossCents: number; sales: number }[]>`
        SELECT strftime('%Y-%m', "date") AS month, cast(SUM("grossCents") AS real) AS "grossCents", cast(SUM(sales) AS real) AS sales
        FROM "DailyStoreStat" WHERE "storeId" IN (${inList(ids)}) AND "date" >= ${ctx.range.fromDate} AND "date" <= ${ctx.range.toDate} ${ctx.channel ? Prisma.sql`AND channel = ${ctx.channel}` : Prisma.empty}
        GROUP BY 1`,
    ]);
    const by = <T extends { month: string }>(xs: T[]) => new Map(xs.map((x) => [x.month, x]));
    const j = by(joined), b = by(buying), r = by(ret), a = by(aov);
    const rows: Row[] = months.map((m) => {
      const bb = b.get(m), rr = r.get(m), aa = a.get(m);
      return {
        month: monthLabel(m), newMembers: j.get(m)?.members ?? 0, buyers: bb?.buyers ?? 0, repeatBuyers: bb?.repeat ?? 0,
        repeatRate: bb ? repeatRate(bb.buyers, bb.repeat) : null, retention90: rr ? retention90(rr.eligible, rr.retained) : null,
        aov: aa && aa.sales ? Math.round(aa.grossCents / aa.sales) : null, sales: aa?.sales ?? 0,
      };
    });
    const o = overall[0] ?? { buyers: 0, repeat: 0 };
    const eligible = ret.reduce((t, x) => t + x.eligible, 0);
    const retained = ret.reduce((t, x) => t + x.retained, 0);
    const gross = aov.reduce((t, x) => t + x.grossCents, 0);
    const sales = aov.reduce((t, x) => t + x.sales, 0);
    const trend = aovSeries(months.map((m) => ({ month: m, grossCents: a.get(m)?.grossCents ?? 0, sales: a.get(m)?.sales ?? 0 })));
    return {
      columns: [
        { key: "month", label: "Month" },
        { key: "newMembers", label: "New members", format: "number" },
        { key: "buyers", label: "Members who bought", format: "number" },
        { key: "repeatBuyers", label: "Bought 2+ times", format: "number" },
        { key: "repeatRate", label: "Repeat rate", format: "pct" },
        { key: "retention90", label: "90-day retention", format: "pct" },
        { key: "sales", label: "Sales", format: "number" },
        { key: "aov", label: "Average order value", format: "zar" },
      ],
      rows,
      totals: rows.length
        ? { month: "Period", newMembers: joined.reduce((t, x) => t + x.members, 0), buyers: o.buyers, repeatBuyers: o.repeat, repeatRate: repeatRate(o.buyers, o.repeat), retention90: retention90(eligible, retained), sales, aov: sales ? Math.round(gross / sales) : null }
        : null,
      summary: [
        { label: "Repeat purchase rate", value: repeatRate(o.buyers, o.repeat), format: "pct", sub: `${n(o.repeat)} of ${n(o.buyers)} buying members` },
        { label: "90-day retention", value: retention90(eligible, retained), format: "pct", sub: eligible ? `${n(retained)} of ${n(eligible)} new members bought again` : "no cohort is 90 days old yet" },
        { label: "Average order value", value: sales ? Math.round(gross / sales) : null, format: "zar", sub: "incl. VAT, all sales" },
        { label: "Active members", value: o.buyers, format: "number", sub: "bought in the period" },
      ],
      chart: { kind: "area", title: "Average order value by month", description: "Incl. VAT, from the daily rollups", format: "zar", labels: trend.labels, series: [{ name: "Average order value", values: trend.values }] },
      emptyTitle: "Nothing to show",
      empty: "No sales in this period.",
      note: `Repeat rate: members with two or more sales in a month (or the period). 90-day retention: of members who joined at least 90 days ago, the share who bought again between the day after joining and day 90, so the newest cohorts show as “—” until they're old enough. ${ctx.networkWide ? "Members are counted across the network." : "Members are counted at their home store; sales at the selected stores."}`,
    };
  },
};

export { ratio };
