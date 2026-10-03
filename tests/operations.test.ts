// Operations rules: the manager's Today list, the store-opening checklist, cohort shaping and the replenishment forecast.
import { describe, expect, it } from "vitest";
import { ageLabel, buildToday, daysUntil, emptyFacts, stockTakesDue } from "@/lib/today";
import { OPENING_TEMPLATE, checklistProgress, groupTasks, isDueSoon, isOverdue, openingTasks } from "@/lib/opening";
import { aovSeries, averageRetention, cohortGrid, monthLabel, monthRange, monthsBetween, repeatRate, retention90 } from "@/lib/cohorts";
import { FORECAST_WINDOW, dailySeries, forecast, forecastQty, movingAverage, stdDev } from "@/lib/forecast";

const NOW = new Date("2026-09-29T08:00:00Z"); // 10:00 SAST, a Tuesday
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY);

describe("Today list", () => {
  it("is empty (all clear) when nothing needs doing", () => {
    expect(buildToday(emptyFacts(NOW), "/store/PTA01")).toEqual([]);
  });

  it("ranks by severity, then in a fixed order", () => {
    const f = emptyFacts(NOW);
    f.orders = { placed: 2, picking: 0, ready: 1, oldestOpenAt: ago(10 * 60_000), oldestReadyAt: ago(60_000) };
    f.lowStock = { skus: 4, out: 1 };
    f.cash = { waitingCents: 120_000, waitingCount: 1, overdueCents: 0, overdueCount: 0, dueOn: "2026-10-02" };
    f.announcements = { pending: 1, urgent: 0, latestTitle: "New returns policy" };
    const items = buildToday(f, "/store/PTA01");
    expect(items.map((i) => `${i.key}:${i.severity}`)).toEqual(["low-stock:high", "orders:medium", "announcements:medium", "cash:low"]);
    expect(items[1]).toMatchObject({ count: 3, title: "3 online orders to fulfil", href: "/store/PTA01/orders" });
    expect(items[1].line).toBe("2 to pick · 1 ready to hand over · oldest waiting 10 min");
    expect(items[2].line).toBe("Latest: New returns policy");
    expect(items[3].line).toBe("1 cash-up waiting · due 2026-10-02");
  });

  it("lists click & collect trade orders to fulfil: to pick, waiting for collection; stale ones escalate", () => {
    const f = emptyFacts(NOW);
    f.tradeOrders = { toPick: 2, ready: 1, oldestOpenAt: ago(30 * 60_000), oldestReadyAt: ago(DAY) };
    const [item] = buildToday(f, "/store/PTA01");
    expect(item).toMatchObject({ key: "trade-orders", severity: "medium", count: 3, title: "3 trade orders to fulfil", href: "/store/PTA01/trade" });
    expect(item.line).toBe("2 to pick · 1 waiting for collection · oldest waiting 30 min — click & collect for a business account");
    f.tradeOrders = { toPick: 0, ready: 1, oldestOpenAt: null, oldestReadyAt: ago(4 * DAY) };
    expect(buildToday(f, "/store/PTA01")[0]).toMatchObject({ severity: "high", count: 1, title: "1 trade order to fulfil", line: "1 waiting for collection — click & collect for a business account" });
    f.tradeOrders = { toPick: 1, ready: 0, oldestOpenAt: ago(5 * 3_600_000), oldestReadyAt: null };
    expect(buildToday(f, "/store/PTA01")[0].severity).toBe("high");
    // Online orders come first at the same severity; without the trade facts (older callers) nothing is listed.
    f.orders = { placed: 1, picking: 0, ready: 0, oldestOpenAt: ago(60_000), oldestReadyAt: null };
    f.tradeOrders = { toPick: 1, ready: 0, oldestOpenAt: ago(60_000), oldestReadyAt: null };
    expect(buildToday(f, "/store/PTA01").map((i) => i.key)).toEqual(["orders", "trade-orders"]);
    delete f.tradeOrders;
    expect(buildToday(f, "/store/PTA01").map((i) => i.key)).toEqual(["orders"]);
  });

  it("escalates: stale orders, overdue cash, recalls, lots expiring within a week, authorisations within 3 days", () => {
    const f = emptyFacts(NOW);
    f.orders = { placed: 1, picking: 0, ready: 0, oldestOpenAt: ago(2 * 3_600_000), oldestReadyAt: null };
    f.cash = { waitingCents: 300_000, waitingCount: 3, overdueCents: 200_000, overdueCount: 2, dueOn: "2026-09-28" };
    f.announcements = { pending: 2, urgent: 1, latestTitle: "Recall: batch TH-A" };
    f.batches = { lots: 2, units: 9, soonest: inDays(5), withinDays: 30 };
    f.patients = { expiring: 1, soonest: inDays(2), withinDays: 14 };
    f.alerts = { open: 3, high: 1 };
    f.supplierInvoices = { overdue: 1, overdueCents: 450_000, dueSoon: 2, dueSoonCents: 100_000 };
    const items = buildToday(f, "/s");
    expect(items.every((i) => i.severity === "high")).toBe(true);
    expect(items.map((i) => i.key)).toEqual(["orders", "alerts", "cash", "announcements", "batches", "patients", "supplier-invoices"]);
    expect(items.find((i) => i.key === "cash")).toMatchObject({ count: 2, title: "R2,000.00 of cash past its banking deadline", href: "/s/banking" });
    expect(items.find((i) => i.key === "batches")!.line).toBe("9 units on hand · soonest in 5 days — mark down or move them first");
    expect(items.find((i) => i.key === "patients")!.line).toContain("Soonest in 2 days");
    expect(items.find((i) => i.key === "supplier-invoices")).toMatchObject({ title: "1 supplier invoice overdue", line: "R4,500.00 past due — pay or query them" });
    expect(items.find((i) => i.key === "announcements")!.line).toBe("Includes a recall — act on it now · Recall: batch TH-A");
  });

  it("finds the cycle counts that are due from the cadence, per category", () => {
    const categories = [
      { slug: "flower", name: "Flower", lastApprovedAt: ago(45 * DAY), counting: false },
      { slug: "wellness", name: "CBD Wellness", lastApprovedAt: ago(10 * DAY), counting: false },
      { slug: "apparel", name: "Apparel", lastApprovedAt: null, counting: false },
      { slug: "grow", name: "Grow", lastApprovedAt: ago(200 * DAY), counting: true },
      { slug: "coffee", name: "Coffee", lastApprovedAt: ago(20 * DAY), counting: false },
    ];
    const due = stockTakesDue({ categories, cadenceDays: 30, byCategory: { coffee: 14 } }, NOW);
    expect(due.map((c) => c.slug)).toEqual(["apparel", "flower", "coffee"]); // never counted first, then oldest; Grow is being counted now
    expect(due.find((c) => c.slug === "flower")!.overdueDays).toBe(15);
    const f = emptyFacts(NOW);
    f.stockTakes = { categories, cadenceDays: 30, byCategory: { coffee: 14 } };
    const [item] = buildToday(f, "/s");
    expect(item).toMatchObject({ key: "stock-takes", severity: "medium", count: 3, href: "/s/stock-takes/new" });
    expect(item.line).toBe("Apparel (never counted) · Flower (15 days overdue) · Coffee (6 days overdue)");
    f.stockTakes.categories[0].lastApprovedAt = ago(61 * DAY); // more than twice the cadence
    expect(buildToday(f, "/s")[0].severity).toBe("high");
  });

  it("formats ages and day counts on SAST days", () => {
    expect(ageLabel(ago(30_000), NOW)).toBe("just now");
    expect(ageLabel(ago(35 * 60_000), NOW)).toBe("35 min");
    expect(ageLabel(ago(5 * 3_600_000), NOW)).toBe("5 h");
    expect(ageLabel(ago(3 * DAY), NOW)).toBe("3 d");
    expect(daysUntil(new Date("2026-10-01T20:30:00Z"), NOW)).toBe(2); // 22:30 SAST on 1 Oct
    expect(daysUntil(new Date("2026-09-28T23:00:00Z"), NOW)).toBe(0); // 01:00 SAST on the 29th
  });
});

describe("Store opening checklist", () => {
  it("seeds every template line with due dates counted back from the opening day", () => {
    const openingAt = new Date("2026-12-01T06:00:00Z");
    const tasks = openingTasks({ openingAt, thc: true });
    expect(tasks).toHaveLength(OPENING_TEMPLATE.length);
    expect(tasks.map((t) => t.key)).toEqual(OPENING_TEMPLATE.map((t) => t.key));
    const lease = tasks.find((t) => t.key === "lease")!;
    expect(lease.dueAt!.toISOString()).toBe("2026-09-02T06:00:00.000Z");
    expect(tasks.find((t) => t.key === "soft-opening")!.dueAt!.toISOString()).toBe("2026-11-30T06:00:00.000Z");
    expect(tasks.map((t) => t.sortOrder)).toEqual(tasks.map((_, i) => i));
    expect(new Set(tasks.map((t) => t.group))).toEqual(new Set(["Legal & licences", "Set-up", "People", "Launch"]));
  });

  it("leaves the SAHPRA licence off stores that won't sell licensed products, and dates off when the opening isn't set", () => {
    const tasks = openingTasks({ openingAt: null, thc: false });
    expect(tasks.some((t) => t.key === "sahpra")).toBe(false);
    expect(tasks.every((t) => t.dueAt === null)).toBe(true);
    expect(new Set(tasks.map((t) => t.key)).size).toBe(tasks.length);
  });

  it("measures progress, overdue and due-soon tasks and the next one due", () => {
    const tasks = [
      { key: "a", group: "Set-up", sortOrder: 1, dueAt: inDays(-3), doneAt: null },
      { key: "b", group: "Set-up", sortOrder: 0, dueAt: inDays(2), doneAt: null },
      { key: "c", group: "People", sortOrder: 2, dueAt: inDays(-10), doneAt: inDays(-11) },
      { key: "d", group: "Launch", sortOrder: 3, dueAt: null, doneAt: null },
    ];
    const p = checklistProgress(tasks, NOW);
    expect(p).toMatchObject({ total: 4, done: 1, pct: 0.25, overdue: 1, dueSoon: 1, complete: false });
    expect(p.next!.key).toBe("a");
    expect(isOverdue(tasks[0], NOW)).toBe(true);
    expect(isOverdue(tasks[2], NOW)).toBe(false); // done tasks are never overdue
    expect(isDueSoon(tasks[1], NOW)).toBe(true);
    const groups = groupTasks(tasks, NOW);
    expect(groups.map((g) => g.group)).toEqual(["Set-up", "People", "Launch"]);
    expect(groups[0].tasks.map((t) => t.key)).toEqual(["b", "a"]);
    expect(groups[1]).toMatchObject({ done: 1, total: 1, complete: true });
    expect(checklistProgress([], NOW)).toMatchObject({ total: 0, pct: 0, complete: false });
  });
});

describe("Cohorts and retention", () => {
  it("handles months", () => {
    expect(monthLabel("2026-09")).toBe("Sep ’26");
    expect(monthsBetween("2026-01", "2026-09")).toBe(8);
    expect(monthsBetween("2025-11", "2026-02")).toBe(3);
    expect(monthsBetween("2026-03", "2026-01")).toBe(-2);
    expect(monthRange("2025-11-15", "2026-02-03")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-09", "2026-09")).toEqual(["2026-09"]);
  });

  it("builds the grid with rates per months-since-join and blanks for months that haven't happened", () => {
    const sizes = [{ cohort: "2026-08", members: 20 }, { cohort: "2026-07", members: 50 }];
    const cells = [
      { cohort: "2026-07", month: 0, buyers: 30 },
      { cohort: "2026-07", month: 1, buyers: 10 },
      { cohort: "2026-07", month: 2, buyers: 5 },
      { cohort: "2026-08", month: 0, buyers: 10 },
      { cohort: "2026-08", month: 1, buyers: 4 },
    ];
    const g = cohortGrid(sizes, cells, { asOf: "2026-09", maxMonths: 4 });
    expect(g.months).toEqual([0, 1, 2, 3]);
    expect(g.rows.map((r) => r.cohort)).toEqual(["2026-07", "2026-08"]);
    expect(g.rows[0].rates).toEqual([0.6, 0.2, 0.1, null]);
    expect(g.rows[1].rates).toEqual([0.5, 0.2, null, null]);
    expect(g.rows[1].label).toBe("Aug ’26");
    expect(averageRetention(g.rows, g.months)).toEqual([40 / 70, 14 / 70, 0.1, null]);
  });

  it("copes with empty cohorts and clamps the month count", () => {
    const g = cohortGrid([{ cohort: "2026-09", members: 0 }], [], { asOf: "2026-09", maxMonths: 40 });
    expect(g.months).toHaveLength(24);
    expect(g.rows[0].rates[0]).toBeNull();
  });

  it("computes the rates and the AOV trend", () => {
    expect(repeatRate(200, 50)).toBe(0.25);
    expect(repeatRate(0, 0)).toBeNull();
    expect(retention90(120, 30)).toBe(0.25);
    expect(aovSeries([{ month: "2026-09", grossCents: 300_000, sales: 4 }, { month: "2026-08", grossCents: 100_000, sales: 0 }])).toEqual({ labels: ["Aug ’26", "Sep ’26"], values: [0, 75_000] });
  });
});

describe("Replenishment forecast", () => {
  it("averages the last 14 days, padding short series with zero days", () => {
    expect(movingAverage([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])).toBe(2);
    expect(movingAverage([14])).toBe(1); // one day of sales in the window
    expect(movingAverage(Array(30).fill(0).concat(Array(14).fill(3)))).toBe(3); // only the last 14 count
    expect(stdDev(Array(14).fill(2))).toBe(0);
    expect(FORECAST_WINDOW).toBe(14);
  });

  it("forecasts per day and per week with lead-time demand and safety stock", () => {
    const steady = Array(14).fill(2);
    expect(forecast(steady, { leadDays: 3 })).toEqual({ perDay: 2, perWeek: 14, leadDemand: 6, safetyStock: 0 });
    const spiky = [0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4];
    const f = forecast(spiky, { leadDays: 4 });
    expect(f.perDay).toBe(2);
    expect(f.safetyStock).toBe(Math.ceil(1.65 * 2 * 2)); // σ = 2, √4 = 2
    expect(forecast([], { leadDays: 3 })).toEqual({ perDay: 0, perWeek: 0, leadDemand: 0, safetyStock: 0 });
  });

  it("suggests quantities from the forecast: nothing while covered, a top-up to lead + cover days plus safety stock", () => {
    const daily = Array(14).fill(2);
    expect(forecastQty({ available: 20, onOrder: 0, reorderPoint: 4, parLevel: 12, daily })).toBe(0);
    // position 5 ≤ lead demand 6 → top up to 17 days × 2 = 34
    expect(forecastQty({ available: 5, onOrder: 0, reorderPoint: 4, parLevel: 12, daily })).toBe(29);
    expect(forecastQty({ available: 5, onOrder: 0, reorderPoint: 4, parLevel: 12, daily, packSize: 6 })).toBe(30);
    // stock on order counts towards the position
    expect(forecastQty({ available: 5, onOrder: 30, reorderPoint: 4, parLevel: 12, daily })).toBe(0);
    // no sales history: the reorder point and par level still drive it
    expect(forecastQty({ available: 4, onOrder: 0, reorderPoint: 4, parLevel: 12, daily: [] })).toBe(8);
    expect(forecastQty({ available: 5, onOrder: 0, reorderPoint: 4, parLevel: 12, daily: [] })).toBe(0);
    // spiky demand adds safety stock to both the trigger and the target
    const spiky = [0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4];
    const safety = forecast(spiky, { leadDays: 3 }).safetyStock;
    expect(forecastQty({ available: 6 + safety, onOrder: 0, reorderPoint: 4, parLevel: 12, daily: spiky })).toBe(34 + safety - (6 + safety));
  });

  it("turns sparse rollup rows into a dense daily series, oldest first", () => {
    const s = dailySeries([{ date: "2026-09-28", units: 3 }, { date: "2026-09-26", units: 1 }, { date: "2026-09-01", units: 9 }], 5, "2026-09-28");
    expect(s).toEqual([0, 0, 1, 0, 3]);
  });
});
