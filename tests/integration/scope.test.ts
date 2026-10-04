// Who sees which stores: managers their store, owners every store they own, area managers
// their region, HQ the network. Report scope comes from the user, never the query string.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { scopeOf, scopedStoreIds, storeForUser } from "@/server/scope";
import { getReport } from "@/server/reports";
import { reportContext } from "@/server/reports/context";
import type { Staff } from "@/server/auth";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let second: { id: string; code: string };
let other: { id: string; code: string };
const staff = (id: string) => db.user.findUniqueOrThrow({ where: { id }, include: { company: true, store: true, region: true } }) as Promise<Staff>;
let manager: Staff, owner: Staff, area: Staff, hq: Staff;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const base = { suburb: "Menlyn", city: "Pretoria", province: "GP" as const, postalCode: "0181", addressLine: "2 Atterbury Rd", licences: ["THC" as const], dcId: w.dc.id };
  second = await db.store.create({ data: { ...base, code: "TST02", slug: "tst02", name: "Test Two", companyId: w.owner.id, regionId: w.region.id } });
  const cape = await db.region.create({ data: { code: "WCP", name: "Western Cape" } });
  const rival = await db.company.create({ data: { kind: "FRANCHISEE", name: "Other Retail", legalName: "Other Retail (Pty) Ltd", email: "other@example.co.za" } });
  other = await db.store.create({ data: { ...base, code: "OTH01", slug: "oth01", name: "Other Store", city: "Cape Town", province: "WC", companyId: rival.id, regionId: cape.id } });
  manager = await staff(w.manager.id);
  owner = await staff((await db.user.create({ data: { name: "Olga Owner", role: "OWNER", companyId: w.owner.id } })).id);
  area = await staff((await db.user.create({ data: { name: "Andile Area", role: "AREA_MANAGER", regionId: w.region.id } })).id);
  hq = await staff((await db.user.create({ data: { name: "Hanna HQ", role: "HQ_STAFF", companyId: w.hq.id } })).id);
});
afterAll(() => db.$disconnect());

const sorted = (ids: string[]) => [...ids].sort();
const ctxFor = async (user: Staff, sp: Record<string, string>, store?: string) => {
  const def = getReport("sales-by-store")!;
  const s = store ? await storeForUser(user, store) : undefined;
  const r = await reportContext({ def, scope: s ? "store" : "hq", user, store: s, sp, mode: "csv", basePath: s ? `/store/${s.code}/reports` : "/hq/reports" });
  return { ctx: r.ctx, rows: (await def.run(r.ctx)).rows };
};

describe("store scope", () => {
  it("gives each role exactly its stores", async () => {
    expect(await scopedStoreIds(scopeOf(manager))).toEqual([w.store.id]);
    expect(sorted(await scopedStoreIds(scopeOf(owner)))).toEqual(sorted([w.store.id, second.id]));
    expect(sorted(await scopedStoreIds(scopeOf(area)))).toEqual(sorted([w.dc.id, w.store.id, second.id]));
    expect(sorted(await scopedStoreIds(scopeOf(hq)))).toEqual(sorted([w.dc.id, w.store.id, second.id, other.id]));
  });

  it("turns other stores away", async () => {
    await expect(storeForUser(manager, "TST02")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(storeForUser(owner, "OTH01")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(storeForUser(area, "OTH01")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect((await storeForUser(owner, "TST02")).id).toBe(second.id);
    expect((await storeForUser(hq, "OTH01")).id).toBe(other.id);
  });

  it("consolidates an owner's stores, never a manager's", async () => {
    const mine = await ctxFor(manager, { stores: "company" }, "TST01");
    expect(mine.ctx.storeIds).toEqual([w.store.id]);
    const group = await ctxFor(owner, { stores: "company" }, "TST01");
    expect(sorted(group.ctx.storeIds)).toEqual(sorted([w.store.id, second.id]));
    expect(group.rows.map((r) => r.code).sort()).toEqual(["TST01", "TST02"]);
    // Drill-down opens the store's own report, which the owner may see.
    expect(group.rows.find((r) => r.code === "TST02")?._href).toBe("/store/TST02/reports/sales-overview?range=30d");
    expect((await ctxFor(owner, {}, "TST01")).ctx.storeIds).toEqual([w.store.id]);
  });

  it("keeps HQ reports inside the user's scope whatever the URL asks for", async () => {
    expect(sorted((await ctxFor(area, { stores: "OTH01" })).ctx.storeIds)).toEqual(sorted([w.dc.id, w.store.id, second.id]));
    expect(sorted((await ctxFor(area, { stores: "region:WCP" })).ctx.storeIds)).toEqual(sorted([w.dc.id, w.store.id, second.id]));
    const net = await ctxFor(hq, { stores: "region:WCP", range: "7d" });
    expect(net.ctx.storeIds).toEqual([other.id]);
    expect(net.rows.map((r) => r._href)).toEqual(["/hq/reports/sales-overview?stores=OTH01&range=7d"]);
  });
});
