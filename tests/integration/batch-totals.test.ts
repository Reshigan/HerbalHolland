// The batches page totals, summed in the database: all stock on hand, blocked lots, lots expiring soon and expired lots.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { batchTotals } from "@/server/inventory";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});

describe("batchTotals", () => {
  it("sums lots, units and cost value per bucket", async () => {
    const t = await batchTotals(w.store.id, new Date(), days(45));
    expect(t.onHand).toEqual({ lots: 6, units: 37, value: 845_000 });
    expect(t.blocked).toEqual({ lots: 0, units: 0, value: 0 });
    // OIL-A (2 at R280) and COF-A (2 at R110) expire within 45 days.
    expect(t.expiring).toEqual({ lots: 2, units: 4, value: 78_000 });
    expect(t.expired).toEqual({ lots: 0, units: 0, value: 0 });
  });

  it("moves a quarantined lot to blocked and counts lots past expiry", async () => {
    await db.batch.update({ where: { id: w.flowerOld.id }, data: { status: "QUARANTINE" } });
    const t = await batchTotals(w.store.id, days(130), days(160));
    expect(t.blocked).toEqual({ lots: 1, units: 3, value: 87_000 });
    // TH-A (120 days), OIL-A (30) and COF-A (40) are past expiry by day 130.
    expect(t.expired).toEqual({ lots: 3, units: 7, value: 165_000 });
  });

  it("ignores another store's stock", async () => {
    const t = await batchTotals(w.dc.id, new Date(), days(45));
    expect(t.onHand.units).toBe(205);
  });
});
