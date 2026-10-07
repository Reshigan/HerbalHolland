// POPIA for members: the s23 export holds every table with a member's personal information; the s24 erasure leaves
// none of it anywhere in the database (only the do-not-contact list keeps their mobile and email) while sales, the
// points ledger, returns and vouchers' money stay; message bodies are blanked after 12 months. Also: HQ's sign-off on
// the legal texts and the company's directors (ECTA s43) are saved and audited.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
import { COOKIE } from "@/server/auth";
import { audit } from "@/server/audit";
import { getObject, putObject } from "@/server/storage";
import { getSettings } from "@/server/settings";
import { BODY_REMOVED, purgeMessageBodies } from "@/server/messaging";
import { ERASED } from "@/server/popia";
import { DEFAULT_COMPLIANCE } from "@/lib/compliance";
import { anonymiseCustomer } from "@/app/hq/customers/actions";
import { GET as exportMember } from "@/app/hq/customers/[id]/export/route";
import { saveCompliance } from "@/app/hq/compliance/actions";
import { saveCompany } from "@/app/hq/stores/actions";
import { buildWorld, resetDb, type World } from "./world";

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-popia-uploads-"));

const PHONE = "+27821230089";
const EMAIL = "tek.erase@example.com";
// Text that only this member's personal information holds: none of it may be left anywhere after the erasure.
const TRACES = ["Thandiwe", "Erasmus-Kgosi", "Jacaranda", "Gate code 4417", "Recipientname", "thandiwe-device", "THAN7Q2P", "tek-0089"];
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};
const redirected = { digest: expect.stringContaining("NEXT_REDIRECT") };

let w: World;
let admin: { id: string };
let member: { id: string; memberNo: string };
let keys: string[] = [];
let n = 0;

async function signIn(u: { id: string }) {
  const token = `popia-${u.id}-${++n}`;
  await db.session.create({ data: { id: sha256(token), userId: u.id, expiresAt: days(1) } });
  jar.set(COOKIE.staff, token);
}
/** Every table whose rows mention `text` anywhere (any column, JSON and arrays included). */
async function tablesHolding(text: string) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%' ORDER BY tablename`;
  const found: string[] = [];
  for (const { tablename } of tables) {
    const [{ n: rows }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${tablename}" x WHERE x::text ILIKE $1`, `%${text}%`);
    if (rows) found.push(tablename);
  }
  return found;
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  admin = await db.user.create({ data: { name: "Hanna Admin", role: "HQ_ADMIN", email: "hanna@popia.example", companyId: w.hq.id } });

  // A member with a row in every table that can hold their personal information.
  const c = await db.customer.create({
    data: {
      memberNo: "HH0000099", phone: PHONE, email: EMAIL, firstName: "Thandiwe", lastName: "Erasmus-Kgosi", dob: new Date("1991-04-02"), idHash: "hash-tek-0089", idLast4: "0089",
      ageCheck: "ID_NUMBER", ageVerifiedAt: new Date(), referralCode: "THAN7Q2P", referredById: w.walkIn.id, homeStoreId: w.store.id, interests: ["CBD"], points: 50,
      consentSms: true, consentEmail: true, consentAt: new Date(), lastSeenAt: new Date(),
    },
  });
  member = c;
  const customerId = c.id;
  await db.loyaltyEntry.createMany({ data: [{ customerId, points: 50, kind: "ADJUST", note: "opening" }, { customerId: w.walkIn.id, points: 50, kind: "REFERRAL", note: "Referral: Thandiwe" }] });
  await db.consentEvent.create({ data: { customerId, channel: "SMS", granted: true, source: "SIGNUP_WEB", wording: "Deals by SMS" } });
  await db.session.create({ data: { id: sha256("tek-member-session"), customerId, expiresAt: days(30) } });
  await db.otp.create({ data: { phone: PHONE, codeHash: "x", expiresAt: days(1) } });
  await db.earlyAccessContact.create({ data: { firstName: "Tekla", email: EMAIL, mobile: PHONE, province: "KZN", source: "home", signedUpAt: days(-30) } });
  await db.throttle.create({ data: { key: `collision:phone:${PHONE}` } });
  await db.patientAuth.create({ data: { customerId, authNumber: "S21/2026/00099", prescriber: "Dr Test", prescriberRegNo: "MP0000099", scope: "Dried flower", monthlyLimitGrams: 30, validFrom: days(-10), validTo: days(300), documentRef: "auth-docs/tek-0089.pdf" } });
  await db.address.create({ data: { customerId, line: "17 Jacaranda Lane", suburb: "Waterkloof", city: "Pretoria", province: "GP", postalCode: "0181", notes: "Gate code 4417, ask for Thandiwe", isDefault: true } });
  await db.wishlist.create({ data: { customerId, variantId: w.coffeeV.id } });
  await db.reorderReminder.create({ data: { customerId, variantId: w.coffeeV.id, everyDays: 30, nextAt: days(30) } });
  await db.stockAlert.create({ data: { customerId, variantId: w.oilV.id } });
  const drop = await db.drop.create({ data: { slug: "popia-drop", name: "Spring drop", blurb: "x", startsAt: days(5) } });
  await db.dropWatch.create({ data: { dropId: drop.id, customerId } });
  await db.pushSubscription.create({ data: { customerId, endpoint: "https://push.example.test/thandiwe-device", p256dh: "key", auth: "secret" } });
  await db.questCompletion.create({ data: { customerId, key: "reading-lab-results" } });
  await db.memberOffer.createMany({
    data: [
      { customerId, title: "15% off your coffee", kind: "PERCENT", value: 15, startsAt: days(-1), endsAt: days(6) },
      { customerId, title: "15% off your coffee", kind: "PERCENT", value: 15, startsAt: days(-9), endsAt: days(-2), redeemedAt: days(-3) },
    ],
  });
  const upcoming = await db.storeEvent.create({ data: { slug: "popia-evening", storeId: w.store.id, title: "Members' evening", blurb: "x", startsAt: days(7), endsAt: days(7.1), capacity: 40 } });
  const past = await db.storeEvent.create({ data: { slug: "popia-opening", storeId: w.store.id, title: "Opening weekend", blurb: "x", startsAt: days(-20), endsAt: days(-19), capacity: 40 } });
  await db.rsvp.createMany({ data: [{ eventId: upcoming.id, customerId, code: "POPIA1" }, { eventId: past.id, customerId, code: "POPIA2", checkedInAt: days(-20) }] });
  const order = await db.order.create({
    data: {
      code: "TEKORD", customerId, storeId: w.store.id, fulfilment: "COURIER", addressLine: "17 Jacaranda Lane", suburb: "Waterkloof", city: "Pretoria", province: "GP", postalCode: "0181",
      deliveryNotes: "Gate code 4417, ask for Thandiwe", subtotalCents: 22_900, totalCents: 22_900, vatCents: 2_987, payMethod: "ONLINE", paymentStatus: "PAID", collectionCode: "4417", events: [],
    },
  });
  await db.sale.create({
    data: { id: randomUUID(), number: "TST01-P0001", storeId: w.store.id, customerId, channel: "ONLINE", subtotalCents: 22_900, totalCents: 22_900, vatCents: 2_987, costCents: 6_500, invoiceEmail: EMAIL, buyer: { name: "Kgosi Trading CC", address: "PO Box 12, Pretoria", vatNumber: null } },
  });
  await db.messageLog.createMany({
    data: [
      { customerId, to: PHONE, channel: "SMS", kind: "TRANSACTIONAL", status: "SENT", body: "Herbal Holland: Hi Thandiwe, order TEKORD is on its way." },
      { to: PHONE, channel: "SMS", kind: "TRANSACTIONAL", status: "SENT", body: "Herbal Holland: your sign-in code is ••••••" }, // a sign-in code: no member id
    ],
  });
  // Their photos: one with a review, one with a return, one with a support message.
  const photo = async (folder: string) => {
    const key = `${folder}/2026-10/${randomUUID()}.jpg`;
    await putObject(key, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), "image/jpeg");
    keys.push(key);
    return (await db.upload.create({ data: { key, fileName: "thandiwe-parcel.jpg", contentType: "image/jpeg", sizeBytes: 6, sha256: "x", uploadedById: customerId } })).id;
  };
  const [reviewPhoto, returnPhoto, supportPhoto] = [await photo("reviews"), await photo("returns"), await photo("support")];
  const coffee = await db.product.findUniqueOrThrow({ where: { slug: "test-coffee" } });
  await db.review.create({ data: { productId: coffee.id, customerId, rating: 5, title: "Lovely, says Thandiwe", body: "Smooth and rich.", verified: true, photoUploadIds: [reviewPhoto] } });
  await db.returnRequest.create({
    data: { number: "RT-000099", orderId: order.id, customerId, storeId: w.store.id, reason: "DAMAGED", items: [{ variantId: w.coffeeV.id, qty: 1 }], note: "Box crushed. Thandiwe", photoUploadIds: [returnPhoto], status: "REFUNDED", refundCents: 22_900 },
  });
  const due = { firstResponseDueAt: days(1), resolveDueAt: days(5) };
  await db.supportTicket.create({
    data: {
      number: "ST-000099", customerId, email: EMAIL, phone: PHONE, name: "Thandiwe Erasmus-Kgosi", subject: "Parcel for Thandiwe", category: "DELIVERY", orderCode: "TEKORD", body: "The box was crushed.", ...due,
      messages: {
        create: [
          { authorType: "MEMBER", authorId: customerId, authorName: "Thandiwe Erasmus-Kgosi", body: "The box was crushed.", attachmentUploadId: supportPhoto },
          { authorType: "STAFF", authorName: "Naledi", body: "Sorry, Thandiwe: we'll collect it." },
        ],
      },
    },
  });
  // A request they sent before signing in, from their email in other capitals.
  await db.supportTicket.create({ data: { number: "ST-000100", email: "TEK.Erase@example.com", name: "Thandiwe E", subject: "Where's my parcel?", category: "ORDER", body: "Order TEKORD", ...due } });
  await db.giftVoucher.createMany({
    data: [
      { code: "HH-TEK-0001", amountCents: 50_000, balanceCents: 50_000, purchasedByCustomerId: customerId, recipientName: "Sipho Recipientname", recipientEmail: "sipho@example.com", message: "Happy birthday Sipho, from Thandiwe", status: "ACTIVE", expiresAt: days(1000) },
      { code: "HH-TEK-0002", amountCents: 20_000, balanceCents: 5_000, purchasedByCustomerId: w.walkIn.id, recipientName: "Thandiwe", recipientEmail: EMAIL, message: "For Thandiwe", status: "ACTIVE", expiresAt: days(1000) },
    ],
  });
  await audit(db, { type: "CUSTOMER", id: customerId, name: "Thandiwe" }, "customer.sign_in", { entity: "Customer", entityId: customerId });
  await audit(db, { type: "CUSTOMER", name: "Thandiwe" }, "member.collision", { data: { field: "idNumber", by: `phone:${PHONE}`, refused: false } });
  await db.user.update({ where: { id: w.budtender.id }, data: { memberId: customerId } }); // a staff member's own card
});
afterAll(() => db.$disconnect());

describe("POPIA s23: the member's export", () => {
  it("is for the HQ administrator only, audited, and holds every table with their personal information", async () => {
    const get = () => exportMember(new Request(`http://localhost/hq/customers/${member.id}/export`), { params: Promise.resolve({ id: member.id }) });
    await signIn(await db.user.create({ data: { name: "Sam Staff", role: "HQ_STAFF", email: "sam@popia.example", companyId: w.hq.id } }));
    expect((await get()).status).toBe(403);

    await signIn(admin);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="herbal-holland-HH0000099.json"');
    const { member: m, controller } = (await res.json()) as { member: Record<string, unknown> & Record<string, unknown[]>; controller: string };
    expect(controller).toMatch(/^Herbal Holland \(Pty\) Ltd \(Herbal Holland, the franchisor\)/);
    expect(m).toMatchObject({ memberNo: "HH0000099", firstName: "Thandiwe", lastName: "Erasmus-Kgosi", phone: PHONE, email: EMAIL });
    expect(m).not.toHaveProperty("idHash");
    const counts = Object.fromEntries(
      ["sessions", "consentEvents", "loyalty", "sales", "orders", "patientAuths", "reviews", "alerts", "pushSubs", "offers", "rsvps", "dropWatches", "quests", "messages", "addresses", "wishlist", "reorderReminders", "supportRequests", "returns", "giftVouchers", "photos", "activity"].map((k) => [k, m[k]?.length]),
    );
    expect(counts).toEqual({
      sessions: 1, consentEvents: 1, loyalty: 1, sales: 1, orders: 1, patientAuths: 1, reviews: 1, alerts: 1, pushSubs: 1, offers: 2, rsvps: 2, dropWatches: 1, quests: 1,
      messages: 2, addresses: 1, wishlist: 1, reorderReminders: 1, supportRequests: 2, returns: 1, giftVouchers: 2, photos: 3, activity: 1,
    });
    expect(m.addresses[0]).toMatchObject({ line: "17 Jacaranda Lane", notes: "Gate code 4417, ask for Thandiwe" });
    expect(m.wishlist[0]).toMatchObject({ sku: "COF-T-250", product: "Test CBD Coffee" });
    expect(m.returns[0]).toMatchObject({ number: "RT-000099", order: "TEKORD", note: "Box crushed. Thandiwe", photos: 1 });
    const ticket = m.supportRequests.find((t) => (t as { number: string }).number === "ST-000099") as { messages: unknown[] };
    expect(ticket.messages).toEqual(expect.arrayContaining([expect.objectContaining({ authorType: "MEMBER", photo: true }), expect.objectContaining({ authorType: "STAFF", photo: false })]));
    expect(Object.fromEntries(m.giftVouchers.map((v) => [(v as { code: string }).code, (v as { boughtByThem: boolean }).boughtByThem]))).toEqual({ "HH-TEK-0001": true, "HH-TEK-0002": false });
    expect(m.orders[0]).toMatchObject({ code: "TEKORD", deliveryNotes: "Gate code 4417, ask for Thandiwe" });
    expect(m.reviews[0]).toMatchObject({ title: "Lovely, says Thandiwe", photos: 1 });
    expect(await db.auditLog.count({ where: { action: "customer.export", entityId: member.id, actorId: admin.id } })).toBe(1);
  });
});

describe("POPIA s24: erasure", () => {
  it("needs the HQ administrator and the typed confirmation", async () => {
    await signIn(admin);
    expect(await anonymiseCustomer(member.id, {}, form({ confirm: "erase", reason: "x" }))).toMatchObject({ error: "Type ANONYMISE to confirm." });
    expect(await db.customer.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ phone: PHONE });
  });

  it("leaves nothing personal anywhere, keeps the records the law needs, and takes the photos out of storage", async () => {
    for (const text of [PHONE, EMAIL, ...TRACES]) expect(await tablesHolding(text), text).not.toEqual([]); // the sweep below finds them
    await signIn(admin);
    await expect(anonymiseCustomer(member.id, {}, form({ confirm: "anonymise", reason: "Email request 7 Oct 2026, ID verified" }))).rejects.toMatchObject(redirected);

    // Their mobile and email are left only on the do-not-contact list; nothing else they gave or sent us is anywhere.
    expect(await tablesHolding(PHONE)).toEqual(["Suppression"]);
    expect(await tablesHolding(EMAIL)).toEqual(["Suppression"]);
    for (const text of TRACES) expect(await tablesHolding(text), text).toEqual([]);

    const id = member.id;
    expect(await db.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({
      phone: `anon-${id}`, email: null, firstName: "Anonymised", lastName: null, dob: null, idHash: null, idLast4: null, referralCode: `anon-${id}`, referredById: null, interests: [],
      consentSms: false, consentEmail: false, personalisedOffers: false, points: 0, memberNo: "HH0000099",
    });
    // Deleted: what only served the member.
    const left = await Promise.all([
      db.session.count({ where: { customerId: id } }), db.otp.count({ where: { phone: PHONE } }), db.throttle.count({ where: { key: { contains: PHONE } } }), db.address.count({ where: { customerId: id } }),
      db.wishlist.count({ where: { customerId: id } }), db.reorderReminder.count({ where: { customerId: id } }), db.stockAlert.count({ where: { customerId: id } }), db.dropWatch.count({ where: { customerId: id } }),
      db.pushSubscription.count({ where: { customerId: id } }), db.questCompletion.count({ where: { customerId: id } }), db.memberOffer.count({ where: { customerId: id, redeemedAt: null } }),
      db.rsvp.count({ where: { customerId: id, checkedInAt: null } }), db.upload.count({ where: { uploadedById: id } }),
    ]);
    expect(left).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const key of keys) await expect(getObject(key)).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: w.budtender.id } })).memberId).toBeNull();

    // Kept, detached from the person: sales and the tax invoice's buyer block, the order, the points ledger, dispensing
    // records, the used deal and past attendance, the return and its refund, vouchers' money, support figures.
    expect(await db.sale.findFirstOrThrow({ where: { customerId: id } })).toMatchObject({ invoiceEmail: null, buyer: { name: "Kgosi Trading CC" }, totalCents: 22_900 });
    expect(await db.order.findFirstOrThrow({ where: { customerId: id } })).toMatchObject({ code: "TEKORD", addressLine: null, suburb: null, postalCode: null, deliveryNotes: null, totalCents: 22_900 });
    expect((await db.loyaltyEntry.findMany({ where: { customerId: id }, orderBy: { createdAt: "asc" } })).map((e) => [e.kind, e.points])).toEqual([["ADJUST", 50], ["EXPIRE", -50]]);
    expect(await db.patientAuth.findFirstOrThrow({ where: { customerId: id } })).toMatchObject({ authNumber: "S21/2026/00099", documentRef: null, status: "REVOKED" });
    expect(await db.memberOffer.count({ where: { customerId: id } })).toBe(1);
    expect(await db.rsvp.count({ where: { customerId: id } })).toBe(1);
    expect(await db.returnRequest.findFirstOrThrow({ where: { customerId: id } })).toMatchObject({ note: null, photoUploadIds: [], status: "REFUNDED", refundCents: 22_900 });
    expect(await db.review.findFirstOrThrow({ where: { customerId: id } })).toMatchObject({ rating: 5, title: null, body: null, photoUploadIds: [] });
    expect((await db.giftVoucher.findMany({ orderBy: { code: "asc" } })).map((v) => [v.code, v.balanceCents, v.recipientName, v.recipientEmail, v.message])).toEqual([
      ["HH-TEK-0001", 50_000, null, null, null],
      ["HH-TEK-0002", 5_000, null, null, null],
    ]);
    const tickets = await db.supportTicket.findMany({ include: { messages: true }, orderBy: { number: "asc" } });
    expect(tickets.map((t) => [t.number, t.name, t.email, t.phone, t.subject, t.status])).toEqual([
      ["ST-000099", "Anonymised", null, null, ERASED, "RESOLVED"],
      ["ST-000100", "Anonymised", null, null, ERASED, "RESOLVED"],
    ]);
    expect(tickets[0].messages.map((m) => [m.authorName, m.body, m.attachmentUploadId])).toEqual(expect.arrayContaining([["Anonymised", ERASED, null], ["Naledi", ERASED, null]]));
    expect(await db.messageLog.findMany({ where: { OR: [{ customerId: id }, { to: "[erased]" }] }, select: { to: true, body: true } })).toEqual([
      { to: "[erased]", body: ERASED },
      { to: "[erased]", body: ERASED },
    ]);
    expect(await db.consentEvent.count({ where: { customerId: id, granted: false } })).toBe(4);
    expect(await db.auditLog.findFirst({ where: { action: "customer.anonymise", entityId: id } })).toMatchObject({ actorId: admin.id, data: { memberNo: "HH0000099", pointsForfeited: 50, files: 3, supportRequests: 2 } });

    expect(await anonymiseCustomer(id, {}, form({ confirm: "ANONYMISE" }))).toMatchObject({ error: "This member has already been anonymised." });
  });
});

describe("Message retention", () => {
  it("blanks the text of messages sent more than 12 months ago and keeps the rest of the row", async () => {
    const now = new Date();
    const at = (d: number) => new Date(now.getTime() - d * DAY);
    const old = await db.messageLog.create({ data: { to: "+27820000777", channel: "SMS", kind: "MARKETING", status: "SENT", body: "Winter deals", createdAt: at(366) } });
    const recent = await db.messageLog.create({ data: { to: "+27820000777", channel: "SMS", kind: "MARKETING", status: "SENT", body: "Spring deals", createdAt: at(364) } });
    expect(await purgeMessageBodies(now)).toEqual({ blanked: 1 });
    expect(await db.messageLog.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ body: BODY_REMOVED, to: "+27820000777", status: "SENT", channel: "SMS" });
    expect((await db.messageLog.findUniqueOrThrow({ where: { id: recent.id } })).body).toBe("Spring deals");
    expect(await purgeMessageBodies(now)).toEqual({ blanked: 0 });
  });
});

describe("Legal texts", () => {
  const rules = () =>
    form({
      thcMode: DEFAULT_COMPLIANCE.thcMode, minAge: String(DEFAULT_COMPLIANCE.minAge), dailyLimitGrams: String(DEFAULT_COMPLIANCE.dailyLimitGrams),
      licensedOnly: DEFAULT_COMPLIANCE.licensedOnly, ageRestricted: DEFAULT_COMPLIANCE.ageRestricted, membersOnly: "on", noIncentivesShown: "1", noIncentives: DEFAULT_COMPLIANCE.noIncentives,
      ...Object.fromEntries(Object.entries(DEFAULT_COMPLIANCE.channels).map(([ch, classes]) => [`ch_${ch}`, classes])),
      legalShown: "1",
    });

  it("show the review notes until HQ records counsel's sign-off, which is audited and can be taken back", async () => {
    await signIn(admin);
    expect((await getSettings()).legal.reviewed).toBe(false);
    expect(await saveCompliance({}, rules())).toMatchObject({ ok: "No changes to save." });
    const signed = rules();
    signed.set("legalReviewed", "on");
    expect(await saveCompliance({}, signed)).toMatchObject({ ok: "Legal texts signed off: the review notes are off the live pages." });
    expect((await getSettings()).legal.reviewed).toBe(true);
    expect(await saveCompliance({}, rules())).toMatchObject({ ok: expect.stringMatching(/^Legal texts back under review/) });
    expect((await getSettings()).legal.reviewed).toBe(false);
    expect((await db.auditLog.findMany({ where: { action: "compliance.legal_review" }, orderBy: { at: "asc" } })).map((a) => [a.actorId, a.data])).toEqual([
      [admin.id, { reviewed: true }],
      [admin.id, { reviewed: false }],
    ]);
    expect(await db.auditLog.count({ where: { action: "compliance.settings" } })).toBe(0);
  });

  it("name the franchisor's directors from its company record, audited when they change", async () => {
    await signIn(admin);
    const co = (directors: string) => form({ legalName: "Vantax (Pty) Ltd", name: "Herbal Holland", vatNumber: "4870123456", email: "hello@herbalholland.com", directors });
    expect(await saveCompany(w.hq.id, w.dc.code, {}, co("Ada Director, Ben Director"))).toMatchObject({ ok: "Owner saved." });
    expect((await db.company.findUniqueOrThrow({ where: { id: w.hq.id } })).directors).toBe("Ada Director, Ben Director");
    expect(await saveCompany(w.hq.id, w.dc.code, {}, co("Ada Director, Ben Director"))).toMatchObject({ ok: "Owner saved." });
    const updates = await db.auditLog.findMany({ where: { action: "company.update", entityId: w.hq.id }, orderBy: { at: "asc" } });
    expect(updates.map((u) => u.data)).toEqual([
      { vatBefore: "4870123456", vatAfter: "4870123456", directorsBefore: null, directorsAfter: "Ada Director, Ben Director" },
      { vatBefore: "4870123456", vatAfter: "4870123456" },
    ]);
  });
});
