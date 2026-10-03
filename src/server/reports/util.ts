// Small helpers shared by the report modules.
import { db } from "../db";
import { derived, type Totals } from "../finance";
import { dayKey, type DateRange } from "@/lib/format";
import type { Column, ReportCtx, Row } from "./types";

/** DailyStoreStat columns summed by every rollup query. */
export const STAT_SUMS = {
  sales: true, refunds: true, units: true, grossCents: true, vatCents: true, costCents: true, discountCents: true,
  cardCents: true, cashCents: true, payshapCents: true, eftCents: true, loyaltyCents: true, onlineCents: true, accountCents: true,
  members: true, pointsIssued: true,
} as const;

/** Rollup sums (nullable from Prisma) → derived summary (net, margin, ATV, UPT, member rate). */
export function summaryOf(s: Partial<Record<keyof Totals, number | null>> | null | undefined) {
  const t = Object.fromEntries(Object.keys(STAT_SUMS).map((k) => [k, s?.[k as keyof Totals] ?? 0])) as Totals;
  return derived(t);
}
export type Sum = ReturnType<typeof summaryOf>;

/** Rollup filter for the report's stores, range (or another range) and channel. */
export const statWhere = (ctx: ReportCtx, r: DateRange = ctx.range) => ({
  storeId: { in: ctx.storeIds },
  date: { gte: r.fromDate, lte: r.toDate },
  ...(ctx.channel && { channel: ctx.channel }),
});

/** Raw-SQL time bounds for the report range. */
export const bounds = (ctx: ReportCtx) => ({ start: ctx.range.start, end: ctx.range.end });

/** Every business day in the range as YYYY-MM-DD. */
export function eachDay(r: DateRange) {
  return Array.from({ length: r.days }, (_, i) => new Date(r.fromDate.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Trend lines leave off today while it is still trading (a partial day reads as a slump). */
export const completeDays = <T>(ctx: ReportCtx, rows: T[]) => (ctx.range.days > 1 && ctx.range.to === dayKey(ctx.now) ? rows.slice(0, -1) : rows);

export const multi = (ctx: ReportCtx) => ctx.storeIds.length > 1;
export const retailIds = (ctx: ReportCtx) => ctx.storeIds.filter((id) => ctx.stores.get(id)?.kind === "RETAIL");

/** Store name/code columns, only when the report covers more than one store. */
export const storeCols = (ctx: ReportCtx): Column[] =>
  multi(ctx) ? [{ key: "store", label: "Store" }, { key: "code", label: "Code" }] : [];
export function storeVals(ctx: ReportCtx, id: string | null | undefined) {
  if (!multi(ctx)) return {};
  const s = id ? ctx.stores.get(id) : undefined;
  return { store: s ? (s.kind === "WAREHOUSE" ? `${s.name} (DC)` : s.name) : "—", code: s?.code ?? "" };
}
export const storeLabel = (ctx: ReportCtx, id: string | null | undefined) => {
  const s = id ? ctx.stores.get(id) : undefined;
  return s ? `${s.name}${s.kind === "WAREHOUSE" ? " (DC)" : ""}` : "—";
};

export const ratio = (a: number, b: number) => (b ? a / b : null);

/** Query params that keep the report's period on drill-down links. */
export const rangeQS = (ctx: ReportCtx): Record<string, string> =>
  ctx.range.preset === "custom" ? { from: ctx.range.from, to: ctx.range.to } : { range: ctx.range.preset };

/** Drill into one store: HQ narrows its own report to that store; owners open that store's own report. */
export const storeDrill = (ctx: ReportCtx, code: string, key: string) =>
  ctx.scope === "hq" ? ctx.href(key, { stores: code, ...rangeQS(ctx) }) : `/store/${code}/reports/${key}?${new URLSearchParams(rangeQS(ctx))}`;
/** 12,345 */
export const n = (v: number) => v.toLocaleString("en-US");
/** "1 unit", "12 units" */
export const count = (v: number, word: string, plural = `${word}s`) => `${n(v)} ${v === 1 ? word : plural}`;

/** Column-wise sums for a totals row. */
export function sumRows(rows: Row[], keys: string[], extra: Row = {}): Row {
  const t: Row = { ...extra };
  for (const k of keys) t[k] = rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  return t;
}

export type VariantInfo = {
  id: string;
  sku: string;
  name: string;
  product: string;
  variant: string;
  category: string;
  categorySlug: string;
  regClass: string;
  priceCents: number;
  wholesaleCents: number;
  grams: number | null;
};

/** Catalogue lookup for variant ids (the catalogue is small: one query). */
export async function variantMap(ids?: string[]) {
  const vs = await db.variant.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    select: {
      id: true, sku: true, name: true, priceCents: true, wholesaleCents: true, grams: true,
      product: { select: { name: true, regClass: true, category: { select: { name: true, slug: true } } } },
    },
  });
  return new Map<string, VariantInfo>(
    vs.map((v) => [
      v.id,
      {
        id: v.id, sku: v.sku, name: `${v.product.name} · ${v.name}`, product: v.product.name, variant: v.name,
        category: v.product.category.name, categorySlug: v.product.category.slug, regClass: v.product.regClass,
        priceCents: v.priceCents, wholesaleCents: v.wholesaleCents, grams: v.grams,
      },
    ]),
  );
}

/** Variant ids in the category filter, or undefined when no category is chosen. */
export async function categoryVariantIds(ctx: ReportCtx) {
  if (!ctx.category) return undefined;
  const vs = await db.variant.findMany({ where: { product: { categoryId: ctx.category.id } }, select: { id: true } });
  return vs.map((v) => v.id);
}

export async function userNames(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, { name: string; role: string; canDispense: boolean }>();
  const us = await db.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true, role: true, canDispense: true } });
  return new Map(us.map((u) => [u.id, u]));
}

/** Runs `fn` over items with at most `limit` in flight (keeps the connection pool healthy). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const ROLE_LABEL: Record<string, string> = {
  HQ_ADMIN: "HQ administrator",
  HQ_STAFF: "HQ team",
  AREA_MANAGER: "Area manager",
  OWNER: "Owner",
  MANAGER: "Store manager",
  BUDTENDER: "Budtender",
};

export const CHANNEL_LABEL: Record<string, string> = { POS: "In store", ONLINE: "Online", WHOLESALE: "Trade" };
export const FULFIL_LABEL: Record<string, string> = { COLLECT: "Click & collect", SAME_DAY: "Same-day delivery", COURIER: "Courier" };
export const PAY_LABEL: Record<string, string> = { CARD: "Card", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Rewards points", ONLINE: "Paid online", VOUCHER: "Gift voucher", ACCOUNT: "On account" };
