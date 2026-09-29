// Returns end to end: a Peach-paid courier order is delivered, the member asks to send part of it back with photos,
// the store approves, books the collection, receives the parcel and refunds it — a partial refund through Peach (its
// API is a small in-memory fake: global fetch is mocked), a credit note at the store with the units back on the shelf,
// the member told at every step. Then a change-of-mind return of the rest, and the rules that refuse what can't come back.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { advanceOrder, markOrderPaid, placeOrder, refundOrderAmount } from "@/server/orders";
import { bookCollection, decideReturn, listReturns, receiveReturn, refundReturn, requestReturn, returnableOrder, returnCounts, returnDetail, returnWhere, ReturnError } from "@/server/returns";
import { availability, availKey } from "@/server/inventory";
import type { PeachRefund } from "@/lib/peach";
import { buildWorld, resetDb, type World } from "./world";

const ENV = { ONLINE_GATEWAY: "PEACH", PEACH_API_KEY: "snd_integration_only" };
const API = "https://app.sandbox-next.peachpayments.com/api";
const address = { addressLine: "9 Protea Road", suburb: "Brooklyn", city: "Pretoria", province: "GP" as const, postalCode: "0181" };
const HQ = { kind: "HQ" as const };
const jpeg = (name = "photo.jpg") => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])], name, { type: "image/jpeg" });
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "photo.png", { type: "image/png" });

let w: World;
let who: { type: "USER"; id: string; name: string };
let n = 0;

/** Peach's refund API in memory: /refunds/list and /refunds. */
function fakePeach() {
  const refunds: PeachRefund[] = [];
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, body });
      const path = url.slice(API.length);
      if (path === "/refunds/list") return Response.json({ count: refunds.length, data: refunds.filter((r) => r.payment_id === body.payment_id) });
      if (path === "/refunds") {
        const r: PeachRefund = { refund_id: `ref_${randomUUID().slice(0, 8)}`, payment_id: String(body.payment_id), amount: Number(body.amount), currency: "ZAR", status: "succeeded", metadata: body.metadata as Record<string, unknown> };
        refunds.push(r);
        return Response.json(r);
      }
      return Response.json({ error: { message: "Unrecognized request URL" } }, { status: 404 });
    }),
  );
  return { refunds, calls };
}

/** A member with an email address (told by email), a paid courier order of 2 oils + 1 coffee, delivered. */
async function deliveredOrder() {
  const c = await db.customer.create({ data: { memberNo: `HH0091${String(++n).padStart(4, "0")}`, phone: `+2782910${String(n).padStart(4, "0")}`, email: `ret.${n}@example.co.za`, firstName: `Rita${n}`, referralCode: `RIT${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() } });
  const placed = await placeOrder({ customerId: c.id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 2 }, { variantId: w.coffeeV.id, qty: 1 }], payMethod: "ONLINE" });
  await markOrderPaid(placed.id, `pay_${randomUUID().slice(0, 8)}`);
  for (const s of ["PICKING", "READY", "OUT_FOR_DELIVERY"] as const) await advanceOrder(placed.id, s, who, { staffId: w.manager.id, courier: "The Courier Guy", trackingNo: "TCG1" });
  await advanceOrder(placed.id, "COMPLETED", who, { idChecked: true, staffId: w.manager.id });
  const order = await db.order.findUniqueOrThrow({ where: { id: placed.id }, include: { lines: true, store: true } });
  return { c, order };
}

beforeAll(async () => {
  Object.assign(process.env, ENV);
  process.env.UPLOAD_DIR = `${process.cwd()}/.data/uploads-test`;
  await resetDb();
  w = await buildWorld();
  who = { type: "USER", id: w.manager.id, name: w.manager.name };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  await db.$disconnect();
});

describe("a faulty item comes back and is refunded through Peach", () => {
  let c: Awaited<ReturnType<typeof deliveredOrder>>["c"];
  let order: Awaited<ReturnType<typeof deliveredOrder>>["order"];
  let id: string;

  beforeAll(async () => ({ c, order } = await deliveredOrder()));

  it("the member sees what may come back, and asks to return one oil with photos", async () => {
    const r = await returnableOrder(order.code, c.id);
    expect(r?.eligibility.DEFECTIVE.ok).toBe(true);
    expect(r?.eligibility.COOLING_OFF.lines.find((l) => l.variantId === w.oilV.id)).toMatchObject({ qty: 2, sealed: true, blocked: null });
    await expect(requestReturn({ orderCode: order.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 3 }], note: "", sealedConfirmed: false, photos: [] }, c)).rejects.toThrow(/only 2 can be returned/);
    await expect(requestReturn({ orderCode: order.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "", sealedConfirmed: false, photos: [new File([new Uint8Array([1, 2, 3])], "x.gif")] }, c)).rejects.toThrow(/JPG or PNG/);
    await expect(requestReturn({ orderCode: order.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "", sealedConfirmed: false, photos: [jpeg(), jpeg(), jpeg(), jpeg()] }, c)).rejects.toThrow(/Up to 3 photos/);
    // Someone else can't return it.
    await expect(requestReturn({ orderCode: order.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "", sealedConfirmed: false, photos: [] }, w.walkIn)).rejects.toThrow(/not found/);

    const ret = await requestReturn({ orderCode: order.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "The dropper leaks.", sealedConfirmed: false, photos: [jpeg("a.jpg"), png()] }, c);
    id = ret.id;
    expect(ret).toMatchObject({ number: "RT-000001", status: "REQUESTED", orderId: order.id, customerId: c.id, storeId: order.storeId, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "The dropper leaks." });
    expect(ret.photoUploadIds).toHaveLength(2);
    expect(await db.upload.findMany({ where: { id: { in: ret.photoUploadIds } } })).toHaveLength(2);
    expect(await db.auditLog.findFirst({ where: { action: "return.request", entityId: id } })).toMatchObject({ actorType: "CUSTOMER", data: { number: "RT-000001", orderCode: order.code, units: 1, photos: 2 } });
    const mail = await db.messageLog.findFirst({ where: { to: c.email!, body: { contains: "RT-000001" } } });
    expect(mail?.body).toContain("Return RT-000001 received");
    // The unit is spoken for: a second request can take only the other one.
    expect((await returnableOrder(order.code, c.id))?.eligibility.DEFECTIVE.lines.find((l) => l.variantId === w.oilV.id)?.qty).toBe(1);
  });

  it("the store approves it, books the courier by hand and marks the parcel received — the member hears each time", async () => {
    await expect(decideReturn(id, "DECLINED", "", who, HQ)).rejects.toThrow(/Say why/);
    await expect(decideReturn(id, "APPROVED", "", who, { kind: "STORES", storeIds: [order.storeId === w.store.id ? w.dc.id : w.store.id] })).rejects.toThrow(/not found/); // another store can't
    expect((await decideReturn(id, "APPROVED", "Keep the box for the courier.", who, { kind: "STORES", storeIds: [order.storeId] })).status).toBe("APPROVED");
    await expect(bookCollection(id, { courier: "", waybill: "X" }, who, HQ)).rejects.toThrow(/Which courier/);
    expect(await bookCollection(id, { courier: "The Courier Guy", waybill: "TCG-RT1" }, who, HQ)).toMatchObject({ status: "COLLECTION_BOOKED", courier: "The Courier Guy", waybill: "TCG-RT1" });
    expect((await receiveReturn(id, who, HQ)).status).toBe("RECEIVED");
    await expect(receiveReturn(id, who, HQ)).rejects.toThrow(ReturnError);
    const mails = await db.messageLog.findMany({ where: { to: c.email!, body: { contains: "RT-000001" } }, orderBy: { createdAt: "asc" } });
    expect(mails.map((m) => m.body.split("\n")[0])).toEqual(["Return RT-000001 received", "Return RT-000001 approved", "Return RT-000001: courier booked", "Return RT-000001 has reached us"]);
    expect(mails[2].body).toContain("(The Courier Guy, waybill TCG-RT1)");
    expect(await db.auditLog.count({ where: { entityId: id, action: { in: ["return.approve", "return.book_collection", "return.receive"] } } })).toBe(3);
  });

  it("refunds one oil's share through Peach (partial refund by amount), posts the credit note and keeps the faulty unit off the shelf", async () => {
    const peach = fakePeach();
    const d = await returnDetail(id, HQ);
    expect(d?.plan).toMatchObject({ gateway: "PEACH", manual: false, breakdown: { wholeOrder: false, deliveryCents: 0 } });
    const oilLine = order.lines.find((l) => l.variantId === w.oilV.id)!;
    const share = Math.round(oilLine.totalCents / 2);
    expect(d?.plan.breakdown.totalCents).toBe(share);
    const lotBefore = (await availability([order.storeId], [w.oilV.id])).get(availKey(order.storeId, w.oilV.id))!.onHand;

    const r = await refundReturn(id, { restock: { [w.oilV.id]: false } }, who, HQ);
    expect(r).toMatchObject({ cents: share, creditNote: `${order.store.code}-RT-000001` });
    expect(peach.calls.map((x) => x.url)).toEqual([`${API}/refunds/list`, `${API}/refunds`]);
    expect(peach.calls[1].body).toMatchObject({ payment_id: order.paymentRef, amount: share, metadata: { orderId: order.id, orderCode: order.code, returnId: id, returnNumber: "RT-000001" } });
    const ret = await db.returnRequest.findUniqueOrThrow({ where: { id } });
    expect(ret).toMatchObject({ status: "REFUNDED", refundCents: share, refundRef: peach.refunds[0].refund_id });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.paymentStatus).toBe("PAID"); // only part of it is back
    expect((o.events as { note?: string }[]).at(-1)?.note).toMatch(new RegExp(`^RT-000001: Refunded R[\\d,.]+ by Peach Payments \\(refund ${peach.refunds[0].refund_id}, succeeded\\)$`));
    expect(await db.auditLog.findFirst({ where: { action: "order.refund", entityId: order.id } })).toMatchObject({ data: { returnNumber: "RT-000001", amount: share, channel: "PEACH", refundStatus: "succeeded" } });

    const note = await db.sale.findUniqueOrThrow({ where: { number: `${order.store.code}-RT-000001` }, include: { lines: true, payments: true } });
    expect(note).toMatchObject({ kind: "REFUND", channel: "ONLINE", totalCents: -share, customerId: c.id });
    expect(note.lines).toHaveLength(1);
    expect(note.lines[0]).toMatchObject({ variantId: w.oilV.id, qty: -1, totalCents: -share });
    expect(note.payments).toEqual([expect.objectContaining({ method: "ONLINE", amountCents: -share })]);
    expect((await availability([order.storeId], [w.oilV.id])).get(availKey(order.storeId, w.oilV.id))!.onHand).toBe(lotBefore); // faulty: not restocked
    expect((await db.messageLog.findFirst({ where: { to: c.email!, body: { contains: "Return RT-000001 refunded" } } }))?.body).toContain("refunded R");
    // Refunding again does nothing more.
    await expect(refundReturn(id, { restock: {} }, who, HQ)).rejects.toThrow(/can't be refunded/);
    await expect(refundOrderAmount(order.id, 100, "again", { returnId: id, actor: who })).rejects.toThrow(/already been refunded/);
  });

  it("the whole of what's left comes back for a change of mind: the delivery fee stays, units go back on the shelf, Peach refunds only the difference", async () => {
    const peach = fakePeach();
    // What Peach already holds counts first (the earlier refund), so the running total refunds just this return.
    const first = await db.returnRequest.findUniqueOrThrow({ where: { id } });
    peach.refunds.push({ refund_id: first.refundRef!, payment_id: order.paymentRef!, amount: first.refundCents!, currency: "ZAR", status: "succeeded" });
    await db.order.update({ where: { id: order.id }, data: { completedAt: new Date() } }); // delivered "today" for the 7-day window
    await expect(requestReturn({ orderCode: order.code, reason: "COOLING_OFF", items: [{ variantId: w.oilV.id, qty: 1 }, { variantId: w.coffeeV.id, qty: 1 }], note: "", sealedConfirmed: false, photos: [] }, c)).rejects.toThrow(/unopened and sealed/);
    const ret = await requestReturn({ orderCode: order.code, reason: "COOLING_OFF", items: [{ variantId: w.oilV.id, qty: 1 }, { variantId: w.coffeeV.id, qty: 1 }], note: "", sealedConfirmed: true, photos: [] }, c);
    await decideReturn(ret.id, "APPROVED", "", who, HQ);
    await receiveReturn(ret.id, who, HQ); // dropped off at the store
    const d = (await returnDetail(ret.id, HQ))!;
    const rest = order.lines.reduce((s, l) => s + l.totalCents, 0) - first.refundCents!;
    expect(d.plan.breakdown).toMatchObject({ wholeOrder: true, deliveryCents: 0, totalCents: rest });
    expect(order.deliveryCents).toBe(0); // over the free-delivery threshold, so there's no fee to keep or refund
    expect(d.plan.breakdown.note).toBe("");
    expect(d.plan.restock).toEqual({ [w.oilV.id]: true, [w.coffeeV.id]: true });
    const before = (await availability([order.storeId], [w.oilV.id, w.coffeeV.id]));
    const r = await refundReturn(ret.id, d.plan.restock, who, HQ);
    expect(r.cents).toBe(rest);
    expect(peach.calls[1].body).toMatchObject({ amount: rest }); // the difference, not the running total
    const after = await availability([order.storeId], [w.oilV.id, w.coffeeV.id]);
    expect(after.get(availKey(order.storeId, w.oilV.id))!.onHand).toBe(before.get(availKey(order.storeId, w.oilV.id))!.onHand + 1);
    expect(after.get(availKey(order.storeId, w.coffeeV.id))!.onHand).toBe(before.get(availKey(order.storeId, w.coffeeV.id))!.onHand + 1);
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.paymentStatus).toBe("REFUNDED"); // every cent paid in money is back
    expect(await returnCounts(HQ)).toMatchObject({ refunded: 2, open: 0 });
  });
});

describe("rules and other payment paths", () => {
  it("refuses returns outside the window, on undelivered orders, and a change of mind on licensed medicines", async () => {
    const { c, order } = await deliveredOrder();
    await db.order.update({ where: { id: order.id }, data: { completedAt: new Date(Date.now() - 8 * 86_400_000) } });
    await expect(requestReturn({ orderCode: order.code, reason: "COOLING_OFF", items: [{ variantId: w.coffeeV.id, qty: 1 }], note: "", sealedConfirmed: true, photos: [] }, c)).rejects.toThrow(/7-day window .* closed/);
    await db.order.update({ where: { id: order.id }, data: { completedAt: new Date(Date.now() - 200 * 86_400_000) } });
    await expect(requestReturn({ orderCode: order.code, reason: "DEFECTIVE", items: [{ variantId: w.coffeeV.id, qty: 1 }], note: "", sealedConfirmed: false, photos: [] }, c)).rejects.toThrow(/6 months/);
    const open = await placeOrder({ customerId: c.id, fulfilment: "COURIER", address, items: [{ variantId: w.coffeeV.id, qty: 1 }], payMethod: "ONLINE" });
    await expect(requestReturn({ orderCode: open.code, reason: "DEFECTIVE", items: [{ variantId: w.coffeeV.id, qty: 1 }], note: "", sealedConfirmed: false, photos: [] }, c)).rejects.toThrow(/delivered or collected/);
  });

  it("a pay-in-store collection is refunded by hand: the reference is required and recorded, the credit note posts at the store", async () => {
    const c = w.walkIn;
    const placed = await placeOrder({ customerId: c.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.coffeeV.id, qty: 2 }], payMethod: "IN_STORE" });
    for (const s of ["PICKING", "READY"] as const) await advanceOrder(placed.id, s, who);
    await advanceOrder(placed.id, "COMPLETED", who, { idChecked: true, staffId: w.manager.id, staffCanDispense: true, payments: [{ method: "CARD", amountCents: placed.totalCents }] });
    const ret = await requestReturn({ orderCode: placed.code, reason: "WRONG_ITEM", items: [{ variantId: w.coffeeV.id, qty: 2 }], note: "Decaf instead of the usual.", sealedConfirmed: false, photos: [] }, c);
    const sms = await db.messageLog.findFirst({ where: { channel: "SMS", customerId: c.id, body: { contains: ret.number } } });
    expect(sms?.body).toContain("We have your return request"); // no email address: texted
    await decideReturn(ret.id, "APPROVED", "", who, { kind: "STORES", storeIds: [w.store.id] });
    await receiveReturn(ret.id, who, HQ);
    const d = (await returnDetail(ret.id, HQ))!;
    expect(d.plan).toMatchObject({ gateway: null, manual: true, breakdown: { wholeOrder: true, totalCents: placed.totalCents } });
    await expect(refundReturn(ret.id, { restock: d.plan.restock }, who, HQ)).rejects.toThrow(/paid in store/);
    const r = await refundReturn(ret.id, { restock: d.plan.restock, manualRef: "EFT 20260929-1", manualMethod: "EFT" }, who, HQ);
    expect(r).toMatchObject({ cents: placed.totalCents, creditNote: `${w.store.code}-${ret.number}` });
    expect(await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).toMatchObject({ status: "REFUNDED", refundRef: "EFT 20260929-1" });
    expect((await db.order.findUniqueOrThrow({ where: { id: placed.id } })).paymentStatus).toBe("REFUNDED");
    const note = await db.sale.findUniqueOrThrow({ where: { number: `${w.store.code}-${ret.number}` }, include: { payments: true } });
    expect(note.payments).toEqual([expect.objectContaining({ method: "EFT", amountCents: -placed.totalCents })]);
  });

  it("a declined request tells the member why, and the queue lists and counts by view", async () => {
    const { c, order } = await deliveredOrder();
    const ret = await requestReturn({ orderCode: order.code, reason: "OTHER", items: [{ variantId: w.coffeeV.id, qty: 1 }], note: "I'd like a different blend instead of this one.", sealedConfirmed: false, photos: [] }, c);
    await decideReturn(ret.id, "DECLINED", "We can't swap opened food, but tell us if it's faulty.", who, HQ);
    expect((await db.messageLog.findFirst({ where: { to: c.email!, body: { contains: `Return ${ret.number}: we can't accept it` } } }))?.body).toContain("We can't swap opened food");
    const declined = await listReturns(returnWhere(HQ, { view: "declined" }), 1);
    expect(declined.rows.map((r) => r.id)).toContain(ret.id);
    expect(declined.rows[0]).toMatchObject({ order: { code: expect.any(String) }, customer: { memberNo: expect.any(String) }, units: 1 });
    expect((await listReturns(returnWhere(HQ, { q: order.code }), 1)).rows.map((r) => r.id)).toEqual([ret.id]);
    expect((await listReturns(returnWhere(HQ, { q: "rt 1" }), 1)).rows.map((r) => r.number)).toEqual(["RT-000001"]);
    expect((await listReturns(returnWhere({ kind: "STORES", storeIds: [w.store.id] }, { view: "all" }), 1)).rows.every((r) => r.storeId === w.store.id)).toBe(true);
  });
});
