// Load test against a production-sized dataset (seed a scratch database with SEED_STORES=1000).
//   DATABASE_URL=postgresql://…/hh_scale npx tsx scripts/bench.ts [--write] [--sales=400] [--tills=20]
// Times the heaviest reads (network dashboards, month-end finance, stock, pricing, every report) and, with --write,
// peak-hour POS posting from many tills at once. --write creates real sales: never point it at production.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { kpis, topProducts, stockAlerts, hourlyHeat } from "@/server/dashboard";
import { salesByStore, profitAndLoss, vatReport, franchiseFees, franchiseStatement } from "@/server/finance";
import { availability } from "@/server/inventory";
import { replenishmentPlan } from "@/server/replenishment";
import { quote } from "@/server/pricing";
import { postPosSale } from "@/server/sales";
import { resolveRange } from "@/lib/ranges";

const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const ms = (t: number) => `${Math.round(t).toLocaleString("en-ZA")} ms`.padStart(10);

async function time(label: string, fn: () => Promise<unknown>) {
  const t = performance.now();
  try {
    await fn();
    console.log(`${ms(performance.now() - t)}  ${label}`);
  } catch (e) {
    console.log(`${"FAILED".padStart(10)}  ${label}: ${(e as Error).message.split("\n")[0]}`);
  }
}

const pct = (xs: number[], p: number) => xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

async function main() {
  const stores = await db.store.findMany({ where: { status: "ACTIVE", kind: "RETAIL" }, select: { id: true, code: true } });
  const ids = stores.map((s) => s.id);
  const one = stores[0];
  const r30 = resolveRange({ range: "30d" });
  const month = new Date().toISOString().slice(0, 7);
  const [sales, members] = await Promise.all([db.sale.count(), db.customer.count()]);
  console.log(`${stores.length.toLocaleString("en-ZA")} trading stores · ${sales.toLocaleString("en-ZA")} sales · ${members.toLocaleString("en-ZA")} members\n`);

  console.log("Network (HQ) — all stores, last 30 days");
  await time("KPIs", () => kpis(ids, r30));
  await time("Top products", () => topProducts(ids, r30));
  await time("Hourly heatmap", () => hourlyHeat(ids, r30));
  await time("Stock alerts", () => stockAlerts(ids));
  await time("Sales by store", () => salesByStore(ids, r30));

  console.log(`\nMonth-end — ${month}`);
  const m = resolveRange({ range: "mtd" });
  await time("Profit & loss (network)", () => profitAndLoss(ids, m));
  await time("VAT report (network)", () => vatReport(ids, m));
  await time("Franchise fees (network)", () => franchiseFees(ids, m));
  await time(`Franchise statement (${one.code})`, () => franchiseStatement(one.id, month));

  console.log(`\nStore — ${one.code}`);
  await time("KPIs", () => kpis([one.id], r30));
  await time("Stock on hand", () => availability([one.id]));
  await time("Replenishment plan", () => replenishmentPlan(one.id));
  const variants = await db.variant.findMany({ where: { product: { regClass: { not: "THC" } } }, select: { id: true }, take: 5 });
  await time("Quote (5 lines)", () => quote({ storeId: one.id, channel: "POS", items: variants.map((v) => ({ variantId: v.id, qty: 1 })) }));

  if (process.argv.includes("--write")) await postingLoad(arg("sales", 400), arg("tills", 20));
}

/** Peak hour: many tills posting card sales concurrently (row locks, rollup upserts, loyalty all included). */
async function postingLoad(total: number, tills: number) {
  const devices = await db.device.findMany({ where: { active: true, store: { status: "ACTIVE", kind: "RETAIL" } }, select: { id: true, storeId: true }, take: tills });
  const lanes = await Promise.all(
    devices.map(async (d) => {
      const [staff, stock] = await Promise.all([
        db.user.findFirst({ where: { storeId: d.storeId, active: true }, select: { id: true, name: true } }),
        db.stockLevel.findMany({
          where: { storeId: d.storeId, qty: { gt: 50 }, variant: { product: { regClass: { not: "THC" } } } },
          select: { variantId: true }, distinct: ["variantId"], take: 3,
        }),
      ]);
      return staff && stock.length ? { d, staff, items: stock.map((s) => ({ variantId: s.variantId, qty: 1 })) } : null;
    }),
  );
  const ready = lanes.filter((l) => l !== null);
  if (!ready.length) return console.log("\nNo tills with stock to post against.");
  console.log(`\nPOS posting — ${total} card sales across ${ready.length} tills`);

  const lat: number[] = [];
  let failed = 0;
  let next = 0;
  const run = Date.now().toString(36).toUpperCase();
  const t0 = performance.now();
  await Promise.all(
    ready.map(async (lane, li) => {
      while (next < total) {
        const n = next++;
        const t = performance.now();
        try {
          const q = await quote({ storeId: lane.d.storeId, channel: "POS", items: lane.items });
          await postPosSale(
            { id: randomUUID(), number: `BENCH-${run}-${li}-${n}`, lines: lane.items, ageCheck: "ID_SIGHTED", payments: [{ method: "CARD", amountCents: q.totalCents }] },
            { storeId: lane.d.storeId, deviceId: lane.d.id, staffId: lane.staff.id, staffName: lane.staff.name },
          );
          lat.push(performance.now() - t);
        } catch (e) {
          if (!failed++) console.log(`  first failure: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    }),
  );
  const secs = (performance.now() - t0) / 1000;
  console.log(`${ms(pct(lat, 50))}  p50 per sale (quote + post)`);
  console.log(`${ms(pct(lat, 95))}  p95`);
  console.log(`${ms(pct(lat, 99))}  p99`);
  console.log(`${(lat.length / secs).toFixed(1).padStart(7)}/s   throughput · ${failed} failed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
