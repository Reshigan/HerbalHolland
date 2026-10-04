// The shop's member features against the real services: saved addresses, gift vouchers (buy → pay → issue → redeem →
// release → expire), reorder reminders falling due, wishlists tracking stock, and product photos through the import.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Catalogue image addresses resolve through DNS first: the test's names resolve here, "internal." ones to a private address.
vi.mock("node:dns/promises", () => ({ lookup: async (host: string) => [{ address: host.startsWith("internal.") ? "10.0.0.5" : "93.184.216.34", family: 4 }] }));

// Before any import: photos land in a scratch folder, and links carry the shop's public address.
vi.hoisted(() => {
  process.env.UPLOAD_DIR = `/tmp/hh-shop-test-uploads-${process.pid}`;
  process.env.APP_URL = "https://shop.example.co.za";
});

import { db, tx } from "@/server/db";
import { SYSTEM } from "@/server/audit";
import { advanceOrder, markOrderPaid, placeOrder } from "@/server/orders";
import { putStock } from "@/server/inventory";
import { getSettings } from "@/server/settings";
import { ADDRESS_MAX, deleteAddress, listAddresses, rememberAddress, saveAddress, setDefaultAddress } from "@/server/shop/addresses";
import { completeVoucherOrder, ensureVoucherProduct, expireVouchers, isVoucherOrder, onOrderCancelledTx, orderDue, startVoucherPurchase, voucherForCheckout, voucherTenderOf } from "@/server/shop/vouchers";
import { cancelReminder, listReminders, reorderPath, sendDueReminders, setReminder } from "@/server/shop/reminders";
import { listWishlist, refreshWishlistStock, toggleWishlist } from "@/server/shop/wishlist";
import { importProductImages, mainImages, productImages } from "@/server/shop/images";
import { walletAvailable, googleSaveLink, passMember } from "@/server/shop/wallet";
import { DEFAULT_DELIVERY_DAYS } from "@/lib/delivery";
import { voucherExpiry } from "@/lib/vouchers";
import { buildWorld, resetDb, type World } from "./world";
import { generateKeyPairSync } from "node:crypto";

let w: World;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(() => db.$disconnect());

describe("settings", () => {
  it("carry delivery days per province by default", async () => {
    expect((await getSettings()).ecommerce.deliveryDays).toEqual(DEFAULT_DELIVERY_DAYS);
  });
});

describe("saved addresses", () => {
  it("keep up to five per member, one default, and remember the address an order ships to", async () => {
    const c = w.walkIn.id;
    const home = await saveAddress(c, { label: "Home", line: "14 Jacaranda Street", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083" });
    expect(home.isDefault).toBe(true); // the first address is the default
    const work = await saveAddress(c, { label: "Work", line: "1 Church Square", suburb: "CBD", city: "Pretoria", province: "GP", postalCode: "0002", isDefault: true });
    expect(work.isDefault).toBe(true);
    expect((await listAddresses(c)).map((a) => [a.label, a.isDefault])).toEqual([["Work", true], ["Home", false]]);
    await setDefaultAddress(c, home.id);
    expect((await db.address.findUniqueOrThrow({ where: { id: work.id } })).isDefault).toBe(false);
    // The same street address and postal code updates rather than duplicates; a new one is added.
    await rememberAddress(c, { addressLine: "14 jacaranda street", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", notes: "Gate code 1234" });
    expect(await db.address.count({ where: { customerId: c } })).toBe(2);
    expect((await db.address.findUniqueOrThrow({ where: { id: home.id } })).notes).toBe("Gate code 1234");
    for (let i = 0; i < ADDRESS_MAX - 2; i++) await rememberAddress(c, { addressLine: `${i} Other Road`, suburb: "S", city: "C", province: "WC", postalCode: "8001" }, "Other");
    expect(await db.address.count({ where: { customerId: c } })).toBe(ADDRESS_MAX);
    await expect(saveAddress(c, { line: "Too many", suburb: "S", city: "C", province: "WC", postalCode: "8001" })).rejects.toThrow(/up to 5/);
    // At the cap, the oldest non-default address makes way.
    await rememberAddress(c, { addressLine: "99 New Street", suburb: "S", city: "C", province: "KZN", postalCode: "4001" });
    const rows = await listAddresses(c);
    expect(rows).toHaveLength(ADDRESS_MAX);
    expect(rows.some((a) => a.line === "99 New Street")).toBe(true);
    expect(rows.some((a) => a.line === "1 Church Square")).toBe(false);
    await deleteAddress(c, home.id);
    expect((await listAddresses(c)).some((a) => a.isDefault)).toBe(true); // a remaining address takes over
    await expect(deleteAddress(w.patient.id, work.id)).rejects.toThrow(/isn't on your account/);
  });
});

describe("gift vouchers", () => {
  it("are bought as an order for the virtual product and issued, for three years, when that order is paid", async () => {
    const product = await ensureVoucherProduct();
    expect(product.status).toBe("DRAFT"); // never listed
    expect(product.variants.map((v) => v.sku)).toEqual(["GIFT-200", "GIFT-500", "GIFT-1000"]);
    await expect(startVoucherPurchase({ customer: w.walkIn, amountCents: 12_345 })).rejects.toThrow(/Choose an amount/);
    await expect(startVoucherPurchase({ customer: w.walkIn, amountCents: 50_000, recipientEmail: "not-an-email" })).rejects.toThrow(/email address/);
    const { order, voucher } = await startVoucherPurchase({ customer: w.walkIn, amountCents: 50_000, recipientName: "Sipho", recipientEmail: "sipho@example.co.za", message: "Happy birthday!" });
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", totalCents: 50_000, vatCents: 0, payMethod: "ONLINE" });
    expect(voucher).toMatchObject({ status: "PENDING", balanceCents: 50_000, purchaseOrderId: order.id });
    expect(voucher.code).toMatch(/^HH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const lines = await db.orderLine.findMany({ where: { orderId: order.id }, include: { variant: true } });
    expect(isVoucherOrder(lines)).toBe(true);
    // Not usable until paid.
    expect(await voucherForCheckout(voucher.code)).toMatchObject({ ok: false, error: expect.stringMatching(/hasn't been paid/) });

    const paid = await markOrderPaid(order.id, "SIM-EFT-TEST1");
    expect(paid).toMatchObject({ status: "COMPLETED", paymentStatus: "PAID", paymentRef: "SIM-EFT-TEST1" });
    const issued = await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
    expect(issued.status).toBe("ACTIVE");
    expect(issued.issuedAt).toBeInstanceOf(Date);
    expect(issued.expiresAt.toISOString()).toBe(voucherExpiry(issued.issuedAt!).toISOString());
    expect(issued.expiresAt.getTime() - issued.issuedAt!.getTime()).toBeGreaterThan(3 * 365 * 86_400_000 - 86_400_000);
    // Told: the buyer by SMS, the recipient by email (logged: no SMTP in tests).
    expect(await db.messageLog.count({ where: { customerId: w.walkIn.id, channel: "SMS", body: { contains: voucher.code.slice(-4) } } })).toBe(1); // masked: the SMS log keeps the last four
    expect(await db.messageLog.count({ where: { body: { contains: voucher.code } } })).toBe(0); // the code itself is never logged
    expect(JSON.stringify((await db.auditLog.findFirstOrThrow({ where: { action: "voucher.issue", entityId: voucher.id } })).data)).not.toContain(voucher.code);
    expect(await db.messageLog.count({ where: { to: "sipho@example.co.za", channel: "EMAIL" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "voucher.issue", entityId: voucher.id } })).toBe(1);
    // Paying twice does nothing more.
    await completeVoucherOrder({ id: order.id, code: order.code, customerId: order.customerId, events: order.events }, "again");
    expect(await db.messageLog.count({ where: { to: "sipho@example.co.za" } })).toBe(1);
  });

  it("pay for an order after points, before online payment; cancelling puts the money back; they expire", async () => {
    const { order: buy, voucher } = await startVoucherPurchase({ customer: w.walkIn, amountCents: 50_000 });
    await markOrderPaid(buy.id, "SIM-EFT-TEST2");
    const items = [{ variantId: w.coffeeV.id, qty: 3 }]; // 3 × R229 = R687, more than the R500 voucher
    await expect(placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items, payMethod: "IN_STORE", voucherCode: voucher.code })).rejects.toThrow(/Pay online/);
    await expect(placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items, payMethod: "ONLINE", voucherCode: "HH-AAAA-AAAA-AAAA" })).rejects.toThrow(/don't recognise/);
    const partial = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items, payMethod: "ONLINE", voucherCode: voucher.code });
    expect(partial.status).toBe("PENDING_PAYMENT"); // the rest is still to pay
    expect(partial.totalCents).toBeGreaterThan(50_000);
    expect(await orderDue(partial)).toBe(partial.totalCents - 50_000);
    expect(await voucherTenderOf(partial.id)).toMatchObject({ method: "VOUCHER", amountCents: 50_000, reference: voucher.code });
    let v = await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
    expect(v).toMatchObject({ balanceCents: 0, status: "REDEEMED", redeemedOrderIds: [partial.id] });
    expect(await db.auditLog.count({ where: { action: "voucher.redeem", entityId: voucher.id } })).toBe(1);
    // Cancelled unpaid: the balance comes back and the voucher is active again.
    await advanceOrder(partial.id, "CANCELLED", SYSTEM, { note: "Payment not received in time" });
    v = await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
    expect(v).toMatchObject({ balanceCents: 50_000, status: "ACTIVE" });
    expect(await db.voucherRedemption.count({ where: { orderId: partial.id, reversed: false } })).toBe(0);
    expect(await orderDue(partial)).toBe(partial.totalCents);
    // Fully covered: placed and paid by the voucher alone, with the balance left over.
    const full = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.coffeeV.id, qty: 1 }], payMethod: "ONLINE", voucherCode: voucher.code.toLowerCase() });
    expect(full).toMatchObject({ status: "PLACED", paymentStatus: "PAID", paymentRef: `VOUCHER:${voucher.code}` });
    expect(await orderDue(full)).toBe(0);
    v = await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } });
    expect(v.balanceCents).toBe(50_000 - full.totalCents);
    expect(v.status).toBe("ACTIVE");
    // Expiry: refused at checkout after three years, and marked expired by the daily job.
    await db.giftVoucher.update({ where: { id: voucher.id }, data: { expiresAt: days(-1) } });
    expect(await voucherForCheckout(voucher.code)).toMatchObject({ ok: false, error: expect.stringMatching(/expired on/) });
    expect(await expireVouchers()).toMatchObject({ expired: 1 });
    expect((await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).status).toBe("EXPIRED");
    // A purchase never paid for is cancelled when its order is.
    const { order: unpaid, voucher: pending } = await startVoucherPurchase({ customer: w.walkIn, amountCents: 20_000 });
    await tx((t) => onOrderCancelledTx(t, unpaid.id, SYSTEM));
    expect((await db.giftVoucher.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
  });
});

describe("reorder reminders", () => {
  it("are set by the member, refused for medicines, sent when due with a one-tap link, and stopped in one tap", async () => {
    const c = { id: w.walkIn.id, firstName: w.walkIn.firstName, email: null };
    await expect(setReminder(c, w.flowerV.id, 30, "SMS")).rejects.toThrow(/medicines/);
    await expect(setReminder(c, w.coffeeV.id, 30, "EMAIL")).rejects.toThrow(/email address/);
    await expect(setReminder(c, w.coffeeV.id, 7, "SMS")).rejects.toThrow(/how often/);
    const r = await setReminder(c, w.coffeeV.id, 30, "SMS");
    expect(r.nextAt.getTime()).toBeGreaterThan(days(29).getTime());
    expect(await sendDueReminders()).toMatchObject({ due: 0, sent: 0 });
    await db.reorderReminder.update({ where: { id: r.id }, data: { nextAt: days(-1) } });
    expect(await sendDueReminders()).toMatchObject({ due: 1, sent: 1, failed: 0 });
    const log = await db.messageLog.findFirstOrThrow({ where: { customerId: c.id, channel: "SMS", body: { contains: "reorder" } }, orderBy: { createdAt: "desc" } });
    expect(log.kind).toBe("TRANSACTIONAL");
    expect(log.body).toContain(reorderPath(r.id).replace(/^\//, ""));
    expect(log.body).toContain("Test CBD Coffee");
    const after = await db.reorderReminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.lastSentAt).toBeInstanceOf(Date);
    expect(after.nextAt.getTime()).toBeGreaterThan(days(29).getTime());
    expect((await listReminders(c.id)).map((x) => x.variant.product.name)).toEqual(["Test CBD Coffee"]);
    expect(await cancelReminder(c, r.id)).toBe(true);
    expect(await listReminders(c.id)).toEqual([]);
    expect(await db.auditLog.count({ where: { action: { in: ["reminder.set", "reminder.cancel"] }, entityId: r.id } })).toBe(2);
    // A product taken off sale stops its reminder on the next run.
    const again = await setReminder(c, w.coffeeV.id, 14, "SMS");
    await db.reorderReminder.update({ where: { id: again.id }, data: { nextAt: days(-1) } });
    await db.product.update({ where: { id: w.coffeeV.productId }, data: { status: "DRAFT" } });
    expect(await sendDueReminders()).toMatchObject({ due: 1, sent: 0, stopped: 1 });
    await db.product.update({ where: { id: w.coffeeV.productId }, data: { status: "ACTIVE" } });
  });
});

describe("wishlists", () => {
  it("toggle, list as cards, and flag what came back into stock", async () => {
    const c = w.walkIn.id;
    const empty = await db.variant.create({ data: { productId: w.oilV.productId, sku: "WEL-T-10", name: "10ml", priceCents: 19_900, wholesaleCents: 9_000, costCents: 5_000 } });
    expect(await toggleWishlist(c, w.coffeeV.id)).toEqual({ on: true });
    expect(await toggleWishlist(c, empty.id)).toEqual({ on: true });
    expect(await toggleWishlist(c, "nope")).toMatchObject({ on: false, error: expect.any(String) });
    let list = await listWishlist(c, { tier: "SEED", storeId: w.store.id, storeName: w.store.name });
    expect(list.map((i) => [i.variantName, i.buyable, i.restocked])).toEqual([["10ml", false, false], ["250g", true, false]]);
    expect(await refreshWishlistStock()).toMatchObject({ checked: 2, out: 1, restocked: 0 });
    const batch = await db.batch.create({ data: { variantId: empty.id, code: "OIL-10-A", supplier: "Test Farm", packedAt: new Date(), expiresAt: days(300) } });
    await tx((t) => putStock(t, { storeId: w.store.id, variantId: empty.id, batchId: batch.id, qty: 5, unitCostCents: 9_000, type: "RECEIVE", reason: "CORRECTION", userId: w.manager.id, note: "test" }));
    expect(await refreshWishlistStock()).toMatchObject({ checked: 2, out: 0, restocked: 1 });
    list = await listWishlist(c, { tier: "SEED", storeId: w.store.id, storeName: w.store.name });
    expect(list.find((i) => i.variantId === empty.id)).toMatchObject({ restocked: true, buyable: true });
    expect(await toggleWishlist(c, w.coffeeV.id)).toEqual({ on: false });
    expect(await db.wishlist.count({ where: { customerId: c } })).toBe(1);
  });
});

describe("product photos", () => {
  it("are fetched from the import's addresses, checked by their bytes, kept once and served in order", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: URL | string) => {
      const url = String(u);
      calls.push(url);
      if (url.endsWith("/missing.jpg")) return new Response("nope", { status: 404 });
      if (url.endsWith("/page.html")) return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
      if (url.endsWith("/moved.png")) return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:3000/" } });
      return new Response(new Uint8Array([...PNG, url.endsWith("/two.png") ? 2 : 1]), { status: 200, headers: { "content-type": "image/png" } });
    });
    try {
      const pid = w.coffeeV.productId;
      const r = await importProductImages(pid, ["https://cdn.example.co.za/one.png", "https://cdn.example.co.za/two.png", "https://cdn.example.co.za/missing.jpg", "https://cdn.example.co.za/page.html", "http://cdn.example.co.za/plain.png", "https://10.0.0.1/x.png"], { uploadedById: w.manager.id, alt: "Test CBD Coffee" });
      expect(r.fetched).toBe(2);
      expect(r.failed.map((f) => f.reason)).toEqual(["the server answered 404", "not a JPG, PNG or WebP image", "only public https:// addresses", "only public https:// addresses"]);
      expect(calls).toHaveLength(4); // the two refused addresses were never fetched
      // A public-looking name that resolves to a private address is never fetched; a redirect is never followed.
      const odd = await importProductImages(pid, ["https://internal.example.co.za/x.png", "https://cdn.example.co.za/moved.png"], { alt: "Test CBD Coffee" });
      expect(odd.failed.map((f) => f.reason)).toEqual(["only public https:// addresses", "it redirects — use the photo's own address"]);
      expect(calls).toHaveLength(5);
      const photos = await productImages(pid);
      expect(photos).toHaveLength(2);
      expect(photos[0].alt).toBe("Test CBD Coffee");
      expect((await mainImages([pid])).get(pid)?.id).toBe(photos[0].id);
      const uploads = await db.upload.findMany({ where: { id: { in: photos.map((p) => p.id) } } });
      expect(uploads.every((u) => u.contentType === "image/png" && u.key.startsWith(`products/${pid}/`))).toBe(true);
      // The same bytes again are skipped; a new one is added at the end.
      const again = await importProductImages(pid, ["https://cdn.example.co.za/two.png", "https://cdn.example.co.za/three.png"], { alt: "Test CBD Coffee" });
      expect(again).toMatchObject({ fetched: 0, skipped: 2 }); // three.png has the same bytes as one.png
      expect(await db.productImage.count({ where: { productId: pid } })).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("wallet passes", () => {
  it("say when they aren't set up, and build a Google save link once they are", () => {
    expect(walletAvailable()).toEqual({ apple: false, google: false });
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.WALLET_GOOGLE_ISSUER_ID = "3388000000012345678";
    process.env.WALLET_GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "wallet@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
    try {
      expect(walletAvailable()).toEqual({ apple: false, google: true });
      const url = googleSaveLink(passMember({ memberNo: "HH0000002", firstName: "Walk", tier: "SEED", points: 200, foundingNo: null }));
      expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\/[\w-]+\.[\w-]+\.[\w-]+$/);
      const body = JSON.parse(Buffer.from(url.split("/").pop()!.split(".")[1], "base64url").toString());
      expect(body.payload.genericObjects[0]).toMatchObject({ id: "3388000000012345678.HH0000002", barcode: { value: "HH0000002" } });
      expect(JSON.stringify(body)).not.toContain("+27");
    } finally {
      delete process.env.WALLET_GOOGLE_ISSUER_ID;
      delete process.env.WALLET_GOOGLE_SERVICE_ACCOUNT_JSON;
    }
  });
});
