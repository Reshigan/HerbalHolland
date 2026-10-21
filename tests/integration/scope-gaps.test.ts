// Scope gaps: a store outside someone's scope is a not-found (inside their own shell), shelf prices are the franchisee's,
// area managers open only their region's trade licence files and promotions, scheduled exports reach only people who
// may see everything in them, and tickets go only to people on the team.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The request's cookies, as the session readers see them; server actions' cache calls do nothing here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));

import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { COOKIE, type Staff } from "@/server/auth";
import { shellStoreFor, storeForUser } from "@/server/scope";
import { putObject } from "@/server/storage";
import { createSchedule, exportUrl, runExport } from "@/server/exports";
import { assignTicket, createTicket, type SupportScope } from "@/server/support";
import { savePrices, bulkPrices } from "@/app/store/[code]/pricing/actions";
import { saveShelfPrice } from "@/app/store/[code]/inventory/actions";
import { saveCampaign } from "@/app/hq/marketing/actions";
import { GET as licenceFile } from "@/app/trade/licences/[id]/file/route";
import { GET as exportFile } from "@/app/api/exports/[id]/route";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let other: { id: string; code: string };
let manager: Staff, owner: Staff, area: Staff, areaWest: Staff, hqAdmin: Staff, hqStaff: Staff, hqTwo: Staff, otherManager: Staff;
const staff = (id: string) => db.user.findUniqueOrThrow({ where: { id }, include: { company: true, store: true, region: true } }) as Promise<Staff>;
const user = async (data: { name: string; role: "OWNER" | "AREA_MANAGER" | "HQ_ADMIN" | "HQ_STAFF" | "MANAGER"; email: string; companyId?: string; regionId?: string; storeId?: string }) =>
  staff((await db.user.create({ data })).id);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
let n = 0;
async function signIn(u: { id: string }) {
  const token = `scope-gaps-${u.id}-${++n}`;
  await db.session.create({ data: { id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.set(COOKIE.staff, token);
}
const notFoundError = { digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") };
const redirected = { digest: expect.stringContaining("NEXT_REDIRECT") };

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const west = await db.region.create({ data: { code: "WCP", name: "Western Cape" } });
  const rival = await db.company.create({ data: { kind: "FRANCHISEE", name: "Other Retail", legalName: "Other Retail (Pty) Ltd", email: "other@example.co.za" } });
  other = await db.store.create({
    data: { code: "OTH01", slug: "oth01", name: "Other Store", companyId: rival.id, regionId: west.id, addressLine: "1 Long St", suburb: "City Bowl", city: "Cape Town", province: "WC", postalCode: "8001" },
  });
  await db.user.update({ where: { id: w.manager.id }, data: { email: "mia@scope.example" } });
  manager = await staff(w.manager.id);
  owner = await user({ name: "Olga Owner", role: "OWNER", companyId: w.owner.id, email: "olga@scope.example" });
  area = await user({ name: "Andile Area", role: "AREA_MANAGER", regionId: w.region.id, email: "andile@scope.example" });
  areaWest = await user({ name: "Wendy West", role: "AREA_MANAGER", regionId: west.id, email: "wendy@scope.example" });
  hqAdmin = await user({ name: "Hanna Admin", role: "HQ_ADMIN", companyId: w.hq.id, email: "hanna@scope.example" });
  hqStaff = await user({ name: "Sam Staff", role: "HQ_STAFF", companyId: w.hq.id, email: "sam@scope.example" });
  hqTwo = await user({ name: "Tumi Team", role: "HQ_STAFF", companyId: w.hq.id, email: "tumi@scope.example" });
  otherManager = await user({ name: "Oscar Other", role: "MANAGER", storeId: other.id, email: "oscar@scope.example" });
});
afterAll(() => db.$disconnect());

describe("Store pages outside the scope", () => {
  it("are a not-found (like a store that doesn't exist), never a trip to the sign-in page", async () => {
    await expect(storeForUser(manager, "OTH01")).rejects.toMatchObject(notFoundError);
    await expect(storeForUser(manager, "NOPE1")).rejects.toMatchObject(notFoundError);
    await expect(storeForUser(owner, "OTH01")).rejects.toMatchObject(notFoundError);
    await expect(storeForUser(area, "OTH01")).rejects.toMatchObject(notFoundError);
    expect((await storeForUser(owner, "TST01")).id).toBe(w.store.id);
    expect((await storeForUser(hqStaff, "OTH01")).id).toBe(other.id);
  });

  it("keep the person's own back office around the not-found", async () => {
    expect(await shellStoreFor(manager, "OTH01")).toMatchObject({ code: "TST01" });
    expect(await shellStoreFor(manager, "TST01")).toMatchObject({ code: "TST01", name: "Test Store", slug: "tst01" });
    expect(await shellStoreFor(areaWest, "TST01")).toMatchObject({ code: "OTH01" });
    expect(await shellStoreFor(area, "NOPE1")).toMatchObject({ code: "TST01" });
    expect(await shellStoreFor(hqAdmin, "OTH01")).toMatchObject({ code: "OTH01" });
  });
});

describe("Shelf prices are the franchisee's to set", () => {
  const key = () => ({ storeId_variantId: { storeId: w.store.id, variantId: w.flowerV.id } });

  it("refuses HQ (the administrator and area managers alike) on every price action", async () => {
    for (const who of [hqAdmin, area]) {
      await signIn(who);
      expect(await savePrices("TST01", [{ variantId: w.flowerV.id, priceCents: 60_000 }])).toMatchObject({ error: "Shelf prices are the franchisee's to set" });
      expect(await bulkPrices("TST01", {}, form({ mode: "pct", pct: "-5" }))).toMatchObject({ error: "Shelf prices are the franchisee's to set" });
      expect(await saveShelfPrice("TST01", w.flowerV.id, {}, form({ price: "600.00" }))).toMatchObject({ error: "Shelf prices are the franchisee's to set", fields: { price: "Shelf prices are the franchisee's to set" } });
    }
    expect((await db.storeVariant.findUniqueOrThrow({ where: key() })).priceCents).toBeNull();
    expect(await db.auditLog.count({ where: { action: "price.override" } })).toBe(0);
  });

  it("lets the store's manager set and clear them", async () => {
    await signIn(manager);
    expect((await savePrices("TST01", [{ variantId: w.flowerV.id, priceCents: 60_000 }])).ok).toMatch(/^Saved 1 price\./);
    expect((await db.storeVariant.findUniqueOrThrow({ where: key() })).priceCents).toBe(60_000);
    expect((await saveShelfPrice("TST01", w.flowerV.id, {}, form({ price: "" }))).ok).toMatch(/Back to the list price/);
    expect((await db.storeVariant.findUniqueOrThrow({ where: key() })).priceCents).toBeNull();
  });
});

describe("Trade licence files", () => {
  let inRegion: string, elsewhere: string;
  beforeAll(async () => {
    const account = (number: string, dcId: string | null) =>
      db.tradeAccount.create({ data: { number, name: number, legalName: `${number} (Pty) Ltd`, email: `${number.toLowerCase()}@trade.example`, addressLine: "1 Main Rd", city: "Pretoria", province: "GP", postalCode: "0001", dcId } });
    const licence = async (tradeAccountId: string, key: string) => {
      await putObject(key, new TextEncoder().encode("%PDF-1.4 test") as Uint8Array<ArrayBuffer>, "application/pdf");
      const up = await db.upload.create({ data: { key, fileName: "licence.pdf", contentType: "application/pdf", sizeBytes: 13, sha256: "x" } });
      return (await db.tradeLicence.create({ data: { tradeAccountId, kind: "CIPC_REGISTRATION", number: "2020/123456/07", uploadId: up.id } })).id;
    };
    inRegion = await licence((await account("TA-GPN01", w.dc.id)).id, "trade-licences/scope-gaps/gpn.pdf"); // served by a DC in GPN
    elsewhere = await licence((await account("TA-NONE01", null)).id, "trade-licences/scope-gaps/none.pdf"); // trades with no store yet
  });
  const open = (id: string) => licenceFile(new Request(`http://localhost/trade/licences/${id}/file`), { params: Promise.resolve({ id }) });

  it("opens for an area manager only when the account is in their region; the HQ team sees every account", async () => {
    await signIn(area);
    expect((await open(inRegion)).status).toBe(200);
    expect((await open(elsewhere)).status).toBe(404);
    await signIn(areaWest);
    expect((await open(inRegion)).status).toBe(404);
    await signIn(hqStaff);
    expect((await open(elsewhere)).status).toBe(200);
    await signIn(manager);
    expect((await open(inRegion)).status).toBe(404);
    expect(await db.auditLog.count({ where: { action: "trade.licence.file_view" } })).toBe(2);
  });
});

describe("Scheduled exports", () => {
  const actor = (u: Staff) => ({ type: "USER" as const, id: u.id, name: u.name });
  const schedule = (u: Staff, params: Record<string, string>, recipients: string[]) =>
    createSchedule(u, { reportKey: "sales-by-store", params: { range: "7d", ...params }, cadence: "WEEKLY", dayOfWeek: 1, recipients }, actor(u));

  it("sends a network-wide report to the HQ team only, a region's to the people who look after it", async () => {
    await expect(schedule(hqAdmin, { scope: "hq" }, ["mia@scope.example"])).rejects.toThrow("A network-wide report goes to the HQ team only: mia@scope.example can't receive it");
    await expect(schedule(hqAdmin, { scope: "hq" }, ["andile@scope.example", "sam@scope.example"])).rejects.toThrow("andile@scope.example can't receive it");
    await expect(schedule(hqAdmin, { scope: "hq", stores: "region:GPN" }, ["wendy@scope.example"])).rejects.toThrow("wendy@scope.example can't see every store in this report");
    await expect(schedule(hqAdmin, { scope: "hq", stores: "region:GPN" }, ["olga@scope.example"])).rejects.toThrow("can't see every store");
    expect((await schedule(hqAdmin, { scope: "hq", stores: "region:GPN" }, ["andile@scope.example", "sam@scope.example"])).recipients).toEqual(["andile@scope.example", "sam@scope.example"]);
    // An area manager's own report covers their region, whatever store filter it carries.
    await expect(schedule(area, { scope: "hq", stores: "OTH01" }, ["wendy@scope.example"])).rejects.toThrow("can't see every store");
    expect((await schedule(area, { scope: "hq" }, ["andile@scope.example", "tumi@scope.example"])).recipients).toHaveLength(2);
  });

  it("checks again when it runs and when the file is downloaded", async () => {
    const s = await schedule(hqAdmin, { scope: "hq" }, ["sam@scope.example", "tumi@scope.example"]);
    // Sam moves to an area manager's job before the run: the network-wide file no longer goes to him.
    await db.user.update({ where: { id: hqStaff.id }, data: { role: "AREA_MANAGER", regionId: w.region.id, companyId: null } });
    const uploadId = await runExport(s);
    expect(uploadId).toBeTruthy();
    const sent = await db.messageLog.findMany({ where: { channel: "EMAIL", body: { contains: `/api/exports/${uploadId}` } }, select: { to: true } });
    expect(sent.map((m) => m.to)).toEqual(["tumi@scope.example"]);

    const link = new URL(exportUrl(uploadId!));
    const download = () => exportFile(new Request(`http://localhost${link.pathname}${link.search}`), { params: Promise.resolve({ id: uploadId! }) });
    await signIn(hqStaff); // still on the recipient list, but no longer on the HQ team
    expect((await download()).status).toBe(403);
    await signIn(hqTwo);
    expect((await download()).status).toBe(200);
    await signIn(hqAdmin); // who scheduled it
    expect((await download()).status).toBe(200);
    await db.user.update({ where: { id: hqStaff.id }, data: { role: "HQ_STAFF", regionId: null, companyId: w.hq.id } });
  });
});

describe("Assigning a support ticket", () => {
  let id: string;
  const by = { type: "USER" as const, id: "agent", name: "Agent" };
  const HQ: SupportScope = { kind: "HQ" };
  let STORE: SupportScope;
  beforeAll(async () => {
    STORE = { kind: "STORES", storeIds: [w.store.id] };
    const c = await db.customer.create({ data: { memberNo: "HH0009101", phone: "+27829009101", email: "lebo@scope.example", firstName: "Lebo", lastName: "Dube", referralCode: "LEB9101", homeStoreId: w.store.id } });
    const r = await createTicket({ subject: "Holiday hours", category: "OTHER", body: "What time does the store close on public holidays, please?" }, { customer: c });
    expect(r.ok).toBe(true);
    id = (r as { id: string }).id;
    await db.supportTicket.update({ where: { id }, data: { storeId: w.store.id } });
  });

  it("takes only someone the team's list offers, or nobody", async () => {
    await expect(assignTicket(id, w.budtender.id, by, HQ)).rejects.toThrow("You can only assign to people on this team");
    await expect(assignTicket(id, "nobody", by, HQ)).rejects.toThrow("You can only assign to people on this team");
    expect((await assignTicket(id, hqTwo.id, by, HQ)).ticket.assignedToId).toBe(hqTwo.id);
    await expect(assignTicket(id, otherManager.id, by, STORE)).rejects.toThrow("You can only assign to people on this team");
    await expect(assignTicket(id, hqTwo.id, by, STORE)).rejects.toThrow("You can only assign to people on this team");
    expect((await assignTicket(id, w.manager.id, by, STORE)).ticket.assignedToId).toBe(w.manager.id);
    await db.user.update({ where: { id: hqTwo.id }, data: { active: false } });
    await expect(assignTicket(id, hqTwo.id, by, HQ)).rejects.toThrow("You can only assign to people on this team");
    await db.user.update({ where: { id: hqTwo.id }, data: { active: true } });
    expect((await assignTicket(id, null, by, STORE)).ticket.assignedToId).toBeNull();
    expect(await db.auditLog.count({ where: { action: "support.assign", entityId: id } })).toBe(3);
  });
});

describe("Campaign promotions", () => {
  let hqPromo: string, gpnPromo: string, westPromo: string;
  beforeAll(async () => {
    const promo = async (name: string, ownerStoreId: string | null) =>
      (await db.promotion.create({ data: { name, kind: "PERCENT", value: 10, ownerStoreId, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000) } })).id;
    hqPromo = await promo("Network deal", null);
    gpnPromo = await promo("Test Store deal", w.store.id);
    westPromo = await promo("Cape deal", other.id);
  });
  const draft = (promotionId: string) =>
    saveCampaign(null, {}, form({ intent: "draft", name: `Evening ${promotionId.slice(-4)}`, channel: "SMS", segment: "ALL", storeId: w.store.id, message: "Join us for a members' evening at Test Store this Friday.", promotionId }));

  it("lets an area manager link an HQ promotion or their region's, never another region's", async () => {
    await signIn(area);
    expect(await draft(westPromo)).toMatchObject({ fields: { promotionId: "That promotion belongs to another region" } });
    expect(await db.campaign.count()).toBe(0);
    await expect(draft(gpnPromo)).rejects.toMatchObject(redirected);
    await expect(draft(hqPromo)).rejects.toMatchObject(redirected);
    expect((await db.campaign.findMany({ select: { promotionId: true } })).map((c) => c.promotionId).sort()).toEqual([gpnPromo, hqPromo].sort());
    await signIn(hqStaff); // the HQ team works across the network
    await expect(draft(westPromo)).rejects.toMatchObject(redirected);
  });
});
