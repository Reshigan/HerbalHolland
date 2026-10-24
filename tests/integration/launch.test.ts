import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, tx } from "@/server/db";
import { saveSetting, DEFAULT_SETTINGS } from "@/server/settings";
import { assignFounding, expireTierFloors, FOUNDER_MEMBER_NO, waitlistPlace } from "@/server/launch";
import { recordPurchase } from "@/server/loyalty";
import { postPosSale, refundSale } from "@/server/sales";
import { placeOrder } from "@/server/orders";
import { quote } from "@/server/pricing";
import { dropBlocks } from "@/server/drops";
import { rsvp, checkIn } from "@/server/events";
import { generateOffers } from "@/server/offers";
import { completeQuest } from "@/server/quests";
import { franchiseStatement } from "@/server/finance";
import { send } from "@/server/messaging";
import { savePushSubscription } from "@/server/push";
import { readShare, sharePath } from "@/server/share";
import { dayKey } from "@/lib/format";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let n = 0;
const pos = () => ({ storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Staff" });
const sell = (customerId: string | null, variantId: string, qty: number, amountCents: number) =>
  postPosSale(
    { id: randomUUID(), number: `TST01-L${String(++n).padStart(5, "0")}`, customerId, lines: [{ variantId, qty }], ageCheck: "ID_SIGHTED", payments: [{ method: "CARD", amountCents }] },
    pos(),
  );
const member = (i: number, over: object = {}) =>
  db.customer.create({ data: { memberNo: `HH90${String(i).padStart(5, "0")}`, phone: `+2783000${String(i).padStart(4, "0")}`, firstName: `M${i}`, referralCode: `M${i}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date(), ...over } });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
});

describe("Founding Members list", () => {
  it("ranks the list with referral boosts, numbers Founding Members when it closes and holds their tier", async () => {
    const launchAt = new Date(Date.now() - 86_400_000);
    await saveSetting("launch", { ...DEFAULT_SETTINGS.launch, phase: "STORES", launchAt: launchAt.toISOString(), foundingCap: 3, referralBoost: 3 });
    const t0 = Date.now() - 10 * 86_400_000;
    const a = await member(1, { createdAt: new Date(t0) });
    const b = await member(2, { createdAt: new Date(t0 + 1000) });
    const c = await member(3, { createdAt: new Date(t0 + 2000) });
    await member(4, { createdAt: new Date(t0 + 3000), referredById: c.id }); // c moves up three places
    const founderCard = await member(5, { memberNo: FOUNDER_MEMBER_NO, createdAt: new Date(t0 + 4000) }); // joins last, still first
    expect((await waitlistPlace(founderCard.id))!.place).toBe(1);
    // Places (existing world members joined earlier): c jumps ahead of a and b.
    const [pa, pc] = [await waitlistPlace(a.id), await waitlistPlace(c.id)];
    expect(pc!.place).toBeLessThan(pa!.place);
    expect(pc!.referrals).toBe(1);

    expect(await assignFounding()).toMatchObject({ assigned: 3, firstYear: 2 }); // #4 joined before the close but beyond the cap: a First Year Member
    expect((await assignFounding()).assigned).toBe(0); // idempotent
    expect((await db.customer.findMany({ where: { foundingNo: null, tierFloor: "SPROUT" } })).length).toBe(2);
    expect((await db.customer.findUniqueOrThrow({ where: { id: founderCard.id } })).foundingNo).toBe(1);
    const founders = await db.customer.findMany({ where: { foundingNo: { not: null } }, orderBy: { foundingNo: "asc" } });
    expect(founders.map((f) => f.tier)).toEqual(["SPROUT", "SPROUT", "SPROUT"]);
    const founder = founders[0];

    // A small purchase would re-tier to Seed; the floor keeps Sprout.
    await tx((t) =>
      recordPurchase(t, { customerId: founder.id, storeId: w.store.id, paidCents: 1000, totalCents: 1000, multiplier: 1, saleId: randomUUID(), at: new Date(), earnPer100: 5, referralBonus: 0 }),
    );
    expect((await db.customer.findUniqueOrThrow({ where: { id: founder.id } })).tier).toBe("SPROUT");
    // When the floor lapses, the member drops to the tier their spend earns.
    await db.customer.update({ where: { id: founder.id }, data: { tierFloorUntil: new Date(Date.now() - 1000) } });
    expect((await expireTierFloors()).expired).toBe(1);
    expect(await db.customer.findUniqueOrThrow({ where: { id: founder.id } })).toMatchObject({ tier: "SEED", tierFloor: null });
    void b;
  });

  it("keeps the shop open while the Founding Members list runs", async () => {
    await saveSetting("launch", { ...DEFAULT_SETTINGS.launch, phase: "STORES", launchAt: new Date(Date.now() + 86_400_000).toISOString() });
    const m = await member(9);
    const o = await placeOrder({ customerId: m.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "IN_STORE" });
    expect(o.status).toBe("PLACED");
    expect((await waitlistPlace(m.id))?.place).toBeGreaterThan(0);
    await saveSetting("launch", { ...DEFAULT_SETTINGS.launch, phase: "STORES" });
  });
});

describe("Referral ladder boost", () => {
  const buy = (customerId: string, cents = 1000) =>
    tx((t) => recordPurchase(t, { customerId, storeId: w.store.id, paidCents: cents, totalCents: cents, multiplier: 1, saleId: randomUUID(), at: new Date(), earnPer100: 5, referralBonus: 10 }));
  const get = (id: string) => db.customer.findUniqueOrThrow({ where: { id } });
  const markers = (id: string) => db.auditLog.count({ where: { action: "customer.referral_ladder", entityId: id } });

  it("boosts above a founding floor from the next friend past 3, once, and each lapses on its own", async () => {
    const r = await member(70, { tier: "SPROUT", tierFloor: "SPROUT", tierFloorUntil: new Date(Date.now() + 200 * 86_400_000) });
    // Three friends already counted before the ladder began (no marker): the fourth's first purchase gives the boost.
    for (const i of [71, 72, 73]) await member(i, { referredById: r.id, firstPurchaseAt: new Date() });
    const fourth = await member(74, { referredById: r.id });
    await buy(fourth.id);
    expect(await get(r.id)).toMatchObject({ tier: "BLOOM", boostTier: "BLOOM", tierFloor: "SPROUT" });
    expect(await markers(r.id)).toBe(1);
    // A fifth friend: no second boost.
    await buy((await member(75, { referredById: r.id })).id);
    expect(await markers(r.id)).toBe(1);
    // The member's own small purchase keeps the boosted tier.
    await buy(r.id);
    expect((await get(r.id)).tier).toBe("BLOOM");

    // The boost lapses: back to the founding floor, which carries on.
    await db.customer.update({ where: { id: r.id }, data: { boostUntil: new Date(Date.now() - 1000) } });
    expect(await expireTierFloors()).toMatchObject({ expired: 0, boostsExpired: 1 });
    expect(await get(r.id)).toMatchObject({ tier: "SPROUT", boostTier: null, boostUntil: null, tierFloor: "SPROUT" });
    expect(await expireTierFloors()).toMatchObject({ expired: 0, boostsExpired: 0 }); // idempotent

    // The floor lapses while a boost runs: the boost holds.
    await db.customer.update({ where: { id: r.id }, data: { tier: "BLOOM", boostTier: "BLOOM", boostUntil: new Date(Date.now() + 10 * 86_400_000), tierFloorUntil: new Date(Date.now() - 1000) } });
    expect(await expireTierFloors()).toMatchObject({ expired: 1, boostsExpired: 0 });
    expect(await get(r.id)).toMatchObject({ tier: "BLOOM", boostTier: "BLOOM", tierFloor: null, tierFloorUntil: null });
  });
});

describe("Drops", () => {
  it("opens early for higher tiers, is members-only and limits each member", async () => {
    await db.drop.create({
      data: { slug: "coffee-drop", name: "Coffee drop", blurb: "x", variantIds: [w.coffeeV.id], startsAt: new Date(Date.now() + 30 * 60_000), earlyTier: "BLOOM", earlyMinutes: 60, perMemberLimit: 1 },
    });
    const line = [{ variantId: w.coffeeV.id, qty: 1 }];
    expect(await dropBlocks(w.walkIn.id, line)).toEqual([expect.stringMatching(/isn't open yet/)]);
    await db.customer.update({ where: { id: w.walkIn.id }, data: { tier: "BLOOM", tierFloor: "BLOOM", tierFloorUntil: new Date(Date.now() + 86_400_000) } });
    expect(await dropBlocks(w.walkIn.id, line)).toEqual([]);
    expect(await dropBlocks(null, line)).toEqual([expect.stringMatching(/members/)]);
    expect(await dropBlocks(w.walkIn.id, [{ variantId: w.coffeeV.id, qty: 2 }])).toEqual([expect.stringMatching(/limit 1/)]);

    const q = await quote({ storeId: w.store.id, channel: "POS", items: line, customerId: w.walkIn.id });
    await sell(w.walkIn.id, w.coffeeV.id, 1, q.totalCents);
    await expect(sell(w.walkIn.id, w.coffeeV.id, 1, q.totalCents)).rejects.toThrow(/limit 1/);
    // A card that was already charged (race with an online order): the sale stands and HQ is told.
    const raced = await postPosSale(
      { id: randomUUID(), number: `TST01-L${String(++n).padStart(5, "0")}`, customerId: w.walkIn.id, lines: [{ variantId: w.coffeeV.id, qty: 1 }], ageCheck: "ID_SIGHTED", payments: [{ method: "CARD", amountCents: q.totalCents, provider: "HALO", reference: "TAP-123" }] },
      pos(),
    );
    expect(await db.auditLog.count({ where: { action: "drop.limit_after_payment", entityId: raced.sale.id } })).toBe(1);
    await db.drop.deleteMany();
    await db.customer.update({ where: { id: w.walkIn.id }, data: { tier: "SEED", tierFloor: null, tierFloorUntil: null } });
  });
});

describe("Opening events", () => {
  it("fills to capacity and checks guests in at the right store", async () => {
    const e = await db.storeEvent.create({
      data: { slug: "tst-opening", storeId: w.store.id, title: "Opening night", blurb: "x", startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000), capacity: 1 },
    });
    const ticket = await rsvp(e.id, w.walkIn.id);
    expect((await rsvp(e.id, w.walkIn.id)).id).toBe(ticket.id); // idempotent
    await expect(rsvp(e.id, w.patient.id)).rejects.toThrow(/full/);
    await expect(checkIn(ticket.code, w.dc.id)).rejects.toThrow(/isn't for an event at this store/);
    expect(await checkIn(`HHRSVP:${ticket.code}`, w.store.id)).toMatchObject({ first: true, customer: { id: w.walkIn.id } });
    expect((await checkIn(ticket.code, w.store.id)).first).toBe(false);
  });
});

describe("Welcome gift & My Deals", () => {
  it("gives a welcome gift on a member's first purchase only", async () => {
    await db.promotion.create({
      data: { name: "Welcome gift", kind: "BUY_X_GET_Y", value: 0, getQty: 1, rewardPercent: 100, rewardProductIds: [w.coffeeV.productId, w.oilV.productId], channels: ["POS"], firstPurchaseOnly: true, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) },
    });
    const fresh = await member(50);
    const items = [{ variantId: w.coffeeV.id, qty: 1 }];
    expect((await quote({ storeId: w.store.id, channel: "POS", items, customerId: fresh.id })).totalCents).toBe(0);
    expect((await quote({ storeId: w.store.id, channel: "POS", items })).totalCents).toBeGreaterThan(0); // walk-ins: no gift
    expect((await quote({ storeId: w.store.id, channel: "POS", items, customerId: w.walkIn.id })).totalCents).toBeGreaterThan(0); // has bought before
    // Never a CBD supplement, even when the gift names it (s18A).
    expect((await quote({ storeId: w.store.id, channel: "POS", items: [{ variantId: w.oilV.id, qty: 1 }], customerId: fresh.id })).totalCents).toBe(59_500);
    await db.promotion.deleteMany();
  });

  it("loads a weekly offer on the member's favourite, applies it once and credits the store", async () => {
    const oilFan = await member(60); // only ever bought a CBD supplement: no My Deals on medicines (s18A)
    await sell(oilFan.id, w.oilV.id, 2, 2 * 59_500);
    expect((await generateOffers()).created).toBeGreaterThan(0);
    expect(await db.memberOffer.count({ where: { customerId: oilFan.id } })).toBe(0);
    const offer = await db.memberOffer.findFirstOrThrow({ where: { customerId: w.walkIn.id } });
    expect(offer.productIds).toEqual([w.coffeeV.productId]);

    const items = [{ variantId: w.coffeeV.id, qty: 1 }];
    const q = await quote({ storeId: w.store.id, channel: "POS", items, customerId: w.walkIn.id });
    expect(q.lines[0].offerCents).toBe(Math.round(q.lines[0].unitPriceCents * 0.15));
    expect(q.offerIds).toHaveLength(1);
    const { sale } = await sell(w.walkIn.id, w.coffeeV.id, 1, q.totalCents);
    expect((await db.memberOffer.findUniqueOrThrow({ where: { id: offer.id } })).saleId).toBe(sale.id);
    expect((await quote({ storeId: w.store.id, channel: "POS", items, customerId: w.walkIn.id })).offerIds).toEqual([]); // single use

    const stat = () => db.dailyStoreStat.findFirstOrThrow({ where: { storeId: w.store.id, date: new Date(`${dayKey(new Date())}T00:00:00Z`), channel: "POS" } });
    expect((await stat()).offerCents).toBe(q.lines[0].offerCents);
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.id } });
    await refundSale({ id: randomUUID(), number: `TST01-L${String(++n).padStart(5, "0")}`, saleId: sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "CARD", reason: "x", staffId: w.manager.id, staffName: "Mia" });
    expect((await stat()).offerCents).toBe(0);

    const s = await franchiseStatement(w.store.id, dayKey(new Date()).slice(0, 7));
    expect(s.lines.find((l) => l.label === "My Deals given")?.cents).toBe(0);
  });

  it("never loads offers for members who opted out", async () => {
    await db.memberOffer.deleteMany();
    await db.customer.update({ where: { id: w.walkIn.id }, data: { personalisedOffers: false } });
    await generateOffers();
    expect(await db.memberOffer.count({ where: { customerId: w.walkIn.id } })).toBe(0);
  });
});

describe("Quests, push and share cards", () => {
  it("awards quest points once", async () => {
    const before = (await db.customer.findUniqueOrThrow({ where: { id: w.patient.id } })).points;
    expect(await completeQuest(w.patient.id, "points", [0, 0])).toEqual({ passed: false, points: 0 });
    expect(await completeQuest(w.patient.id, "points", [2, 0])).toEqual({ passed: true, points: 10 });
    expect(await completeQuest(w.patient.id, "points", [2, 0])).toEqual({ passed: true, points: 0 });
    expect((await db.customer.findUniqueOrThrow({ where: { id: w.patient.id } })).points).toBe(before + 10);
  });

  it("pushes only to members who subscribed", async () => {
    const msg = { channel: "PUSH" as const, to: w.patient.id, body: "Drop is live", kind: "TRANSACTIONAL" as const, customerId: w.patient.id };
    expect((await send(msg)).status).toBe("FAILED");
    await savePushSubscription(w.patient.id, { endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } });
    expect((await send(msg)).status).toBe("SENT"); // no VAPID keys in tests: logged only
  });

  it("signs share cards so they can't be forged", () => {
    const path = sharePath({ referralCode: "PAT0001", firstName: "Pat", savedCents: 74_200, tier: "BLOOM" });
    const [, ref, qs] = path.match(/^\/s\/([^?]+)\?(.*)$/)!;
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(readShare(ref, sp)).toEqual({ referralCode: "PAT0001", firstName: "Pat", savedCents: 74_200, tier: "BLOOM" });
    expect(readShare(ref, { ...sp, s: "9999999" })).toBeNull();
  });
});
