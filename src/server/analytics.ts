// First-party analytics (PageView rows from /api/a, rules in @/lib/analytics): what HQ → Analytics reads, and the
// daily retention sweep. Every query is bounded by the date range; days are SAST.
import type { DateRange } from "@/lib/format";
import { RETENTION_DAYS } from "@/lib/analytics";
import { db } from "./db";
import { sastDay } from "./sql";

/** Daily job: page views past their 400 days are deleted (one day's rows a night once it's caught up). */
export async function purgePageViews(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  return { deleted: (await db.pageView.deleteMany({ where: { at: { lt: cutoff } } })).count };
}

type N = number | bigint | null;
const n = (v: N) => Number(v ?? 0);

export async function siteAnalytics(r: Pick<DateRange, "start" | "end">, top = 10) {
  const { start, end } = r;
  const [totals, daily, sources, pages] = await Promise.all([
    db.$queryRaw<{ visitors: N; appVisitors: N; views: N; visits: N; installs: N }[]>`
      SELECT COUNT(DISTINCT CASE WHEN kind = 'view' THEN visitor END) AS visitors,
             COUNT(DISTINCT CASE WHEN kind = 'view' AND app = 1 THEN visitor END) AS "appVisitors",
             SUM(CASE WHEN kind = 'view' THEN 1 ELSE 0 END) AS views,
             SUM(CASE WHEN kind = 'view' AND entry = 1 THEN 1 ELSE 0 END) AS visits,
             SUM(CASE WHEN kind = 'install' THEN 1 ELSE 0 END) AS installs
      FROM "PageView" WHERE at >= ${start} AND at < ${end}`,
    db.$queryRaw<{ day: string; app: N; visitors: N }[]>`
      SELECT ${sastDay("at")} AS day, app, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE kind = 'view' AND at >= ${start} AND at < ${end} GROUP BY day, app`,
    // Where visits came from: the ?src= tag, else the referring site, else none ("Direct").
    db.$queryRaw<{ source: string | null; visits: N }[]>`
      SELECT COALESCE(src, referrer) AS source, COUNT(*) AS visits FROM "PageView"
      WHERE kind = 'view' AND entry = 1 AND at >= ${start} AND at < ${end} GROUP BY source ORDER BY visits DESC LIMIT ${top}`,
    db.$queryRaw<{ path: string; views: N }[]>`
      SELECT path, COUNT(*) AS views FROM "PageView" WHERE kind = 'view' AND at >= ${start} AND at < ${end}
      GROUP BY path ORDER BY views DESC LIMIT ${top}`,
  ]);
  const t = totals[0];
  return {
    visitors: n(t?.visitors),
    appVisitors: n(t?.appVisitors),
    views: n(t?.views),
    visits: n(t?.visits),
    installs: n(t?.installs),
    daily: daily.map((d) => ({ day: d.day, app: n(d.app) === 1, visitors: n(d.visitors) })),
    sources: sources.map((s) => ({ source: s.source ?? "Direct", visits: n(s.visits) })),
    pages: pages.map((p) => ({ path: p.path, views: n(p.views) })),
  };
}
