// The manager's "Today" list: facts about one store → a prioritised list of things to do, each with a count, one
// line, a link and a severity. Pure, so the rules are unit-tested; @/server/today gathers the facts.
import { dayKey } from "./format";

export type TodaySeverity = "high" | "medium" | "low";
export type TodayItem = { key: string; severity: TodaySeverity; count: number; title: string; line: string; href: string };

export type StockTakeCategory = { slug: string; name: string; lastApprovedAt: Date | null; counting: boolean };

export type TodayFacts = {
  now: Date;
  /** Open online orders by status, and how long the oldest has waited. */
  orders: { placed: number; picking: number; ready: number; oldestOpenAt: Date | null; oldestReadyAt: Date | null };
  /** Categories with ranged stock and when each was last counted (approved). */
  stockTakes: { categories: StockTakeCategory[]; cadenceDays: number; byCategory?: Record<string, number> };
  /** Cash from closed cash-ups not yet banked. `dueOn` is the earliest bank-by day (YYYY-MM-DD, SAST). */
  cash: { waitingCents: number; waitingCount: number; overdueCents: number; overdueCount: number; dueOn: string | null };
  /** Open loss-prevention alerts the person may see (never about themselves). */
  alerts: { open: number; high: number };
  /** Released lots on hand that expire within `withinDays`. */
  batches: { lots: number; units: number; soonest: Date | null; withinDays: number };
  /** Ranged SKUs at or below their reorder point, and how many are out. `onOrder`: of those, how many already have
   *  enough on open stock orders to lift them back above the reorder point (nothing more to order). */
  lowStock: { skus: number; out: number; onOrder?: number };
  /** Patient authorisations that lapse within `withinDays`. */
  patients: { expiring: number; soonest: Date | null; withinDays: number };
  /** HQ updates that still need this store's acknowledgement (`urgent` = recalls). */
  announcements: { pending: number; urgent: number; latestTitle: string | null };
  /** Supplier invoices past their due date, and due within 7 days. */
  supplierInvoices: { overdue: number; overdueCents: number; dueSoon: number; dueSoonCents: number };
  /** Click & collect trade orders at this store: to pick (placed or picking) and packed, waiting for the buyer. */
  tradeOrders?: { toPick: number; ready: number; oldestOpenAt: Date | null; oldestReadyAt: Date | null };
};

const RANK: Record<TodaySeverity, number> = { high: 0, medium: 1, low: 2 };
const ORDER = ["orders", "trade-orders", "alerts", "cash", "announcements", "batches", "low-stock", "stock-takes", "patients", "supplier-invoices"];
const DAY = 86_400_000;

const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? word : many}`;
const rands = (cents: number) => `R${(Math.round(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "just now", "35 min", "3 h", "2 d": how long something has waited. */
export function ageLabel(from: Date, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Whole days from `now` to `d` (negative = past), on SAST calendar days. */
export function daysUntil(d: Date, now: Date) {
  return Math.round((Date.parse(`${dayKey(d)}T00:00:00Z`) - Date.parse(`${dayKey(now)}T00:00:00Z`)) / DAY);
}

/** Categories whose cycle count is due: never counted, or counted longer ago than the cadence (and not being counted now). */
export function stockTakesDue(f: TodayFacts["stockTakes"], now: Date) {
  return f.categories
    .filter((c) => !c.counting)
    .map((c) => {
      const cadence = f.byCategory?.[c.slug] ?? f.cadenceDays;
      const age = c.lastApprovedAt ? (now.getTime() - c.lastApprovedAt.getTime()) / DAY : null;
      return { ...c, cadence, age, overdueDays: age == null ? 0 : Math.floor(age - cadence) };
    })
    .filter((c) => c.age == null || c.age >= c.cadence)
    .sort((a, b) => (b.age ?? Infinity) - (a.age ?? Infinity));
}

/** The list, most urgent first; an empty array means "All clear". */
export function buildToday(f: TodayFacts, base: string): TodayItem[] {
  const items: TodayItem[] = [];
  const { now } = f;

  const open = f.orders.placed + f.orders.picking + f.orders.ready;
  if (open > 0) {
    const stale = f.orders.oldestOpenAt ? now.getTime() - f.orders.oldestOpenAt.getTime() > 60 * 60_000 : false;
    const parts = [f.orders.placed && `${f.orders.placed} to pick`, f.orders.picking && `${f.orders.picking} picking`, f.orders.ready && `${f.orders.ready} ready to hand over`].filter(Boolean);
    items.push({
      key: "orders",
      severity: stale || (f.orders.oldestReadyAt ? now.getTime() - f.orders.oldestReadyAt.getTime() > 2 * DAY : false) ? "high" : "medium",
      count: open,
      title: `${plural(open, "online order")} to fulfil`,
      line: `${parts.join(" · ")}${f.orders.oldestOpenAt ? ` · oldest waiting ${ageLabel(f.orders.oldestOpenAt, now)}` : ""}`,
      href: `${base}/orders`,
    });
  }

  const trade = f.tradeOrders;
  const tradeOpen = trade ? trade.toPick + trade.ready : 0;
  if (trade && tradeOpen > 0) {
    const stale = trade.oldestOpenAt ? now.getTime() - trade.oldestOpenAt.getTime() > 4 * 3_600_000 : false;
    const waitingLong = trade.oldestReadyAt ? now.getTime() - trade.oldestReadyAt.getTime() > 3 * DAY : false;
    const parts = [trade.toPick && `${trade.toPick} to pick`, trade.ready && `${trade.ready} waiting for collection`].filter(Boolean);
    items.push({
      key: "trade-orders",
      severity: stale || waitingLong ? "high" : "medium",
      count: tradeOpen,
      title: `${plural(tradeOpen, "trade order")} to fulfil`,
      line: `${parts.join(" · ")}${trade.oldestOpenAt ? ` · oldest waiting ${ageLabel(trade.oldestOpenAt, now)}` : ""} · click & collect for a business account`,
      href: `${base}/trade`,
    });
  }

  if (f.alerts.open > 0)
    items.push({
      key: "alerts",
      severity: f.alerts.high > 0 ? "high" : "medium",
      count: f.alerts.open,
      title: `${plural(f.alerts.open, "loss-prevention alert")} open`,
      line: f.alerts.high > 0 ? `${plural(f.alerts.high, "high-severity alert")}: investigate today` : "Review, then resolve or dismiss with a note",
      href: `${base}/loss-prevention`,
    });

  if (f.cash.overdueCount > 0)
    items.push({
      key: "cash",
      severity: "high",
      count: f.cash.overdueCount,
      title: `${rands(f.cash.overdueCents)} of cash past its banking deadline`,
      line: `${plural(f.cash.overdueCount, "cash-up")} overdue: bank it today and record the deposit with its slip`,
      href: `${base}/banking`,
    });
  else if (f.cash.waitingCount > 0) {
    const dueToday = !!f.cash.dueOn && f.cash.dueOn <= dayKey(now);
    items.push({
      key: "cash",
      severity: dueToday ? "medium" : "low",
      count: f.cash.waitingCount,
      title: `${rands(f.cash.waitingCents)} of cash to bank`,
      line: `${plural(f.cash.waitingCount, "cash-up")} waiting${f.cash.dueOn ? ` · due ${dueToday ? "today" : f.cash.dueOn}` : ""}`,
      href: `${base}/banking`,
    });
  }

  if (f.announcements.pending > 0)
    items.push({
      key: "announcements",
      severity: f.announcements.urgent > 0 ? "high" : "medium",
      count: f.announcements.pending,
      title: `${plural(f.announcements.pending, "HQ update")} to acknowledge`,
      line: f.announcements.urgent > 0 ? `Includes a recall: act on it now${f.announcements.latestTitle ? ` · ${f.announcements.latestTitle}` : ""}` : f.announcements.latestTitle ? `Latest: ${f.announcements.latestTitle}` : "Read it and brief the team",
      href: `${base}/updates?view=todo`,
    });

  if (f.batches.lots > 0) {
    const days = f.batches.soonest ? daysUntil(f.batches.soonest, now) : null;
    items.push({
      key: "batches",
      severity: days != null && days <= 7 ? "high" : "medium",
      count: f.batches.lots,
      title: `${plural(f.batches.lots, "lot")} expiring within ${f.batches.withinDays} days`,
      line: `${plural(f.batches.units, "unit")} on hand${days != null ? ` · soonest ${days <= 0 ? "today" : `in ${plural(days, "day")}`}` : ""}: mark down or move them first`,
      href: `${base}/batches?view=expiring`,
    });
  }

  const covered = Math.min(f.lowStock.onOrder ?? 0, f.lowStock.skus);
  const toOrder = f.lowStock.skus - covered;
  if (toOrder > 0)
    items.push({
      key: "low-stock",
      severity: f.lowStock.out > 0 ? "high" : "medium",
      count: toOrder,
      title: `${plural(toOrder, "SKU")} to reorder`,
      line:
        (f.lowStock.out > 0 ? `${plural(f.lowStock.out, "item")} out of stock: order from your distribution centre` : "At or below reorder point: top up before they run out") +
        (covered ? ` · ${covered.toLocaleString("en-US")} more already on order` : ""),
      href: `${base}/purchasing/new`,
    });
  else if (covered > 0)
    items.push({
      key: "low-stock",
      severity: "low",
      count: covered,
      title: `${plural(covered, "low SKU")} already on order`,
      line: "Nothing more to order: receive the delivery when it arrives",
      href: `${base}/purchasing`,
    });

  const due = stockTakesDue(f.stockTakes, now);
  if (due.length > 0)
    items.push({
      key: "stock-takes",
      severity: due.some((c) => c.age == null ? false : c.age >= 2 * c.cadence) ? "high" : "medium",
      count: due.length,
      title: `${plural(due.length, "cycle count")} due`,
      line: due
        .slice(0, 3)
        .map((c) => `${c.name}${c.age == null ? " (never counted)" : c.overdueDays > 0 ? ` (${plural(c.overdueDays, "day")} overdue)` : ""}`)
        .join(" · ") + (due.length > 3 ? ` · +${due.length - 3} more` : ""),
      href: `${base}/stock-takes/new`,
    });

  if (f.patients.expiring > 0) {
    const days = f.patients.soonest ? daysUntil(f.patients.soonest, now) : null;
    items.push({
      key: "patients",
      severity: days != null && days <= 3 ? "high" : "medium",
      count: f.patients.expiring,
      title: `${plural(f.patients.expiring, "patient authorisation")} expiring within ${f.patients.withinDays} days`,
      line: `${days != null ? `Soonest ${days <= 0 ? "today" : `in ${plural(days, "day")}`} · ` : ""}ask the member for a renewed authorisation before it lapses`,
      href: `${base}/patients?view=expiring`,
    });
  }

  if (f.supplierInvoices.overdue > 0)
    items.push({
      key: "supplier-invoices",
      severity: "high",
      count: f.supplierInvoices.overdue,
      title: `${plural(f.supplierInvoices.overdue, "supplier invoice")} overdue`,
      line: `${rands(f.supplierInvoices.overdueCents)} past due: pay or query them`,
      href: `${base}/finance/supplier-invoices?status=DUE`,
    });
  else if (f.supplierInvoices.dueSoon > 0)
    items.push({
      key: "supplier-invoices",
      severity: "medium",
      count: f.supplierInvoices.dueSoon,
      title: `${plural(f.supplierInvoices.dueSoon, "supplier invoice")} due within 7 days`,
      line: `${rands(f.supplierInvoices.dueSoonCents)} falls due this week`,
      href: `${base}/finance/supplier-invoices?status=DUE`,
    });

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

/** One store's exceptions, as the consolidated (owner) overview sees them. */
export type StoreExceptionFacts = { code: string; name: string; overdueCash: number; highAlerts: number; alerts: number; negativeLots: number; lowStock: number; quiet: boolean };

/** The owner's consolidated Today list: each store's exceptions as store-tagged items linking into that store. */
export function buildCompanyToday(stores: StoreExceptionFacts[]): TodayItem[] {
  const items: TodayItem[] = [];
  for (const x of stores) {
    const base = `/store/${x.code}`;
    const add = (key: string, severity: TodaySeverity, count: number, what: string, line: string, href: string) =>
      items.push({ key: `${x.code}:${key}`, severity, count, title: `${x.name} · ${what}`, line, href });
    if (x.overdueCash > 0) add("cash", "high", x.overdueCash, `${plural(x.overdueCash, "cash-up")} overdue`, "Past its banking deadline: bank it and record the deposit", `${base}/banking`);
    if (x.alerts > 0)
      add("alerts", x.highAlerts > 0 ? "high" : "medium", x.alerts, `${plural(x.alerts, "loss-prevention alert")} open`, x.highAlerts > 0 ? `${plural(x.highAlerts, "high-severity alert")}: investigate today` : "Review, then resolve or dismiss with a note", `${base}/loss-prevention`);
    if (x.quiet) add("quiet", "medium", 1, "no sales yet today", "Check the store is open and the tills are trading", base);
    if (x.negativeLots > 0) add("negative", "medium", x.negativeLots, `${plural(x.negativeLots, "negative stock lot")}`, "Count them to correct the stock", `${base}/reports/negative-stock`);
    if (x.lowStock > 0) add("low-stock", "low", x.lowStock, `${plural(x.lowStock, "SKU")} at or below reorder point`, "Check what is already on order, then top up", `${base}/purchasing/new`);
  }
  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
}

/** Empty facts: handy as a base in tests and for stores with nothing on. */
export function emptyFacts(now = new Date()): TodayFacts {
  return {
    now,
    orders: { placed: 0, picking: 0, ready: 0, oldestOpenAt: null, oldestReadyAt: null },
    stockTakes: { categories: [], cadenceDays: 30 },
    cash: { waitingCents: 0, waitingCount: 0, overdueCents: 0, overdueCount: 0, dueOn: null },
    alerts: { open: 0, high: 0 },
    batches: { lots: 0, units: 0, soonest: null, withinDays: 30 },
    lowStock: { skus: 0, out: 0 },
    patients: { expiring: 0, soonest: null, withinDays: 14 },
    announcements: { pending: 0, urgent: 0, latestTitle: null },
    supplierInvoices: { overdue: 0, overdueCents: 0, dueSoon: 0, dueSoonCents: 0 },
    tradeOrders: { toPick: 0, ready: 0, oldestOpenAt: null, oldestReadyAt: null },
  };
}
