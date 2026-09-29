// Member support: tickets from members and guests (honeypot, limits, the order tie-in), the SLA deadlines, staff replies
// (emailed, or texted when there's no email), assignment, resolution, member replies that reopen, scoping to a store,
// and the year-later purge. No email or SMS leaves: everything lands in the message log.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { placeOrder } from "@/server/orders";
import {
  assignTicket, createTicket, listTickets, memberReply, purgeResolvedTickets, replyToTicket, resolveTicket, setTicketPriority, ticketCounts, ticketThread, ticketWhere, SupportError,
} from "@/server/support";
import { isBusinessDay, slaDue } from "@/lib/support";
import { addDays } from "@/lib/format";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let n = 0;
const HQ = { kind: "HQ" as const };
const ask = (over: Record<string, string> = {}) => ({
  name: "Sipho Dlamini",
  email: `sipho.${++n}@example.co.za`,
  phone: "082 555 0101",
  subject: "Points missing after Saturday",
  category: "REWARDS",
  orderCode: "",
  body: "I bought a grinder on Saturday and the points never showed up on my card.",
  consent: "on",
  ...over,
});
const staff = () => ({ id: w.manager.id, name: w.manager.name });
const emailsTo = (to: string) => db.messageLog.findMany({ where: { channel: "EMAIL", to }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("opening a ticket", () => {
  it("a guest's request: numbered, SLA deadlines set in business days, acknowledged by email, nothing personal in the audit log", async () => {
    const r = await createTicket(ask({ email: "guest@example.co.za" }), { customer: null, ip: "196.25.1.1" });
    expect(r).toMatchObject({ ok: true, number: "ST-000001" });
    const t = await db.supportTicket.findUniqueOrThrow({ where: { number: "ST-000001" }, include: { messages: true } });
    expect(t).toMatchObject({ customerId: null, email: "guest@example.co.za", phone: "+27825550101", category: "REWARDS", status: "OPEN", priority: "NORMAL", firstRespondedAt: null });
    expect(t.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ authorType: "MEMBER", authorName: "Sipho Dlamini" });
    const due = slaDue(t.createdAt);
    expect(t.firstResponseDueAt.toISOString()).toBe(due.firstResponseDueAt.toISOString());
    expect(t.resolveDueAt.toISOString()).toBe(due.resolveDueAt.toISOString());
    expect(isBusinessDay(t.firstResponseDueAt)).toBe(true);
    expect(t.firstResponseDueAt.getTime()).toBeGreaterThan(t.createdAt.getTime());
    expect(t.resolveDueAt.getTime()).toBeGreaterThan(t.firstResponseDueAt.getTime());

    const [ack] = await emailsTo("guest@example.co.za");
    expect(ack).toMatchObject({ kind: "TRANSACTIONAL", status: "SENT", customerId: null });
    expect(ack.body).toContain("We've got your message (ST-000001)");
    expect(ack.body).toMatch(/reply by .* at the latest/);
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "support.create", entityId: t.id } });
    expect(a.data).toMatchObject({ number: "ST-000001", category: "REWARDS", guest: true });
    expect(JSON.stringify(a)).not.toMatch(/Sipho|example|\+27/);
  });

  it("the honeypot drops bots quietly; the form check reports fields; deliveries start high", async () => {
    expect(await createTicket({ ...ask(), website: "http://spam" }, { customer: null, ip: "196.25.1.2" })).toEqual({ ok: true, id: null, number: null });
    expect(await db.supportTicket.count({ where: { email: { contains: "sipho." } } })).toBe(0);
    const bad = await createTicket(ask({ email: "nope", body: "short", category: "DELIVERY" }), { customer: null, ip: "196.25.1.2" });
    expect(bad).toMatchObject({ ok: false, fields: { email: expect.any(String), body: expect.any(String), orderCode: expect.any(String) } });
    const hi = await createTicket(ask({ category: "DELIVERY", orderCode: "ABC123" }), { customer: null, ip: "196.25.1.2" });
    expect(hi.ok).toBe(true);
    expect((await db.supportTicket.findUniqueOrThrow({ where: { id: (hi as { id: string }).id } })).priority).toBe("HIGH");
  });

  it("limits guests per connection and per email address, members per day", async () => {
    for (let i = 0; i < 3; i++) expect((await createTicket(ask(), { customer: null, ip: "196.25.9.9" })).ok).toBe(true);
    expect(await createTicket(ask(), { customer: null, ip: "196.25.9.9" })).toMatchObject({ ok: false, error: expect.stringContaining("several requests from your connection") });
    const email = "busy@example.co.za";
    for (let i = 0; i < 5; i++) expect((await createTicket(ask({ email }), { customer: null, ip: `196.25.10.${i}` })).ok).toBe(true);
    expect(await createTicket(ask({ email }), { customer: null, ip: "196.25.10.9" })).toMatchObject({ ok: false, error: expect.stringContaining("quite a few messages today") });
  });

  it("a member's ticket uses their details, ties in their own order (and its store) and is acknowledged by SMS without an email", async () => {
    const order = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.coffeeV.id, qty: 1 }], payMethod: "IN_STORE" });
    const r = await createTicket({ subject: "Where is my order", category: "ORDER", orderCode: order.code.toLowerCase(), body: "I placed it this morning and haven't heard anything since then." }, { customer: w.walkIn });
    expect(r.ok).toBe(true);
    const t = await db.supportTicket.findUniqueOrThrow({ where: { id: (r as { id: string }).id } });
    expect(t).toMatchObject({ customerId: w.walkIn.id, name: "Wally", email: null, phone: w.walkIn.phone, orderCode: order.code, storeId: w.store.id, ipHash: null });
    const sms = await db.messageLog.findFirst({ where: { channel: "SMS", customerId: w.walkIn.id, body: { contains: t.number } } });
    expect(sms?.body).toMatch(/we have your message/);
    // Someone else's order code is kept, but not tied to a store.
    const other = await createTicket({ subject: "Not mine", category: "ORDER", orderCode: order.code, body: "Asking about an order that isn't mine, to see what happens." }, { customer: w.patient });
    expect((await db.supportTicket.findUniqueOrThrow({ where: { id: (other as { id: string }).id } })).storeId).toBeNull();
  });
});

describe("working a ticket", () => {
  let id: string;
  const to = "member.email@example.co.za";

  beforeAll(async () => {
    const c = await db.customer.create({ data: { memberNo: "HH0009001", phone: "+27829009001", email: to, firstName: "Thandi", lastName: "Nkosi", referralCode: "THA9001", homeStoreId: w.store.id } });
    const r = await createTicket({ subject: "Wrong tier on my card", category: "REWARDS", body: "My card says Seed but I've spent well over the Sprout level this year." }, { customer: c });
    id = (r as { id: string }).id;
  });

  it("a staff reply goes to the member by email, hands the ticket over and stops the first-response clock; every reply is audited", async () => {
    const before = await db.supportTicket.findUniqueOrThrow({ where: { id } });
    const t = await replyToTicket(id, "Hi Thandi,\n\nSorted: your card now shows Sprout.\n\nMia", staff(), HQ, { canned: "checking" });
    expect(t).toMatchObject({ status: "WAITING_MEMBER", assignedToId: w.manager.id });
    expect(t.firstRespondedAt).toBeTruthy();
    expect(t.firstRespondedAt!.getTime()).toBeLessThanOrEqual(before.firstResponseDueAt.getTime());
    const mails = await emailsTo(to);
    expect(mails.at(-1)?.body).toContain("Re: Wrong tier on my card (ST-");
    expect(mails.at(-1)?.body).toContain("Sorted: your card now shows Sprout.");
    expect(mails.at(-1)?.body).toContain("/club/support/");
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "support.reply", entityId: id } });
    expect(a).toMatchObject({ actorType: "USER", actorId: w.manager.id, data: { firstResponse: true, withinSla: true, canned: "checking" } });
    expect(await db.supportMessage.count({ where: { ticketId: id, authorType: "STAFF" } })).toBe(1);
    await expect(replyToTicket(id, "  ", staff(), HQ)).rejects.toThrow(SupportError);
  });

  it("assignment and priority are checked and audited; a store only sees its own orders' tickets", async () => {
    await expect(assignTicket(id, "nobody", { type: "USER", id: w.manager.id, name: w.manager.name }, HQ)).rejects.toThrow(/active staff member/);
    expect((await assignTicket(id, w.budtender.id, { type: "USER", id: w.manager.id, name: w.manager.name }, HQ)).ticket.assignedToId).toBe(w.budtender.id);
    expect((await setTicketPriority(id, "HIGH", { type: "USER", id: w.manager.id, name: w.manager.name }, HQ)).ticket.priority).toBe("HIGH");
    await expect(setTicketPriority(id, "URGENT", { type: "USER", id: w.manager.id, name: w.manager.name }, HQ)).rejects.toThrow(/priority/);
    expect(await db.auditLog.count({ where: { entityId: id, action: { in: ["support.assign", "support.priority"] } } })).toBe(2);
    // The store scope: this ticket has no order, so the store can't see it; HQ can.
    await expect(replyToTicket(id, "hello", staff(), { kind: "STORES", storeIds: [w.store.id] })).rejects.toThrow(/not found/);
    expect(await ticketThread(id, { kind: "STORES", storeIds: [w.store.id] })).toBeNull();
    expect((await ticketThread(id, HQ))?.ticket.number).toBeTruthy();
    const storeTickets = await listTickets(ticketWhere({ kind: "STORES", storeIds: [w.store.id] }, { view: "all" }, { userId: w.manager.id, now: new Date() }), 1);
    expect(storeTickets.rows.every((t) => t.storeId === w.store.id)).toBe(true);
    expect(storeTickets.total).toBe(1);
  });

  it("the member's reply reopens it, with a photo; resolving tells them; a reply after 30 days is refused", async () => {
    const c = await db.customer.findUniqueOrThrow({ where: { email: to } });
    process.env.UPLOAD_DIR = `${process.cwd()}/.data/uploads-test`;
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])], "proof.jpg", { type: "image/jpeg" });
    const t = await memberReply(id, c, "Thanks, but the points are still missing.", jpeg);
    expect(t.status).toBe("OPEN");
    const m = await db.supportMessage.findFirstOrThrow({ where: { ticketId: id, authorType: "MEMBER" }, orderBy: { createdAt: "desc" } });
    expect(m.attachmentUploadId).toBeTruthy();
    expect(await db.upload.findUnique({ where: { id: m.attachmentUploadId! } })).toMatchObject({ contentType: "image/jpeg", uploadedById: c.id });
    await expect(memberReply(id, c, "Here's another photo.", new File([new Uint8Array([1, 2, 3, 4])], "x.gif"))).rejects.toThrow(/JPG or PNG/);
    await expect(memberReply(id, w.walkIn, "not my ticket", null)).rejects.toThrow(/not found/);

    const done = await resolveTicket(id, staff(), HQ, "The points are on your card now.");
    expect(done.status).toBe("RESOLVED");
    expect(done.resolvedAt).toBeTruthy();
    expect((await emailsTo(to)).at(-1)?.body).toMatch(/resolved: The points are on your card now/);
    expect(await db.supportMessage.count({ where: { ticketId: id, authorType: "SYSTEM" } })).toBe(1);
    await expect(resolveTicket(id, staff(), HQ)).rejects.toThrow(/already resolved/);
    expect((await memberReply(id, c, "Still not right.", null)).status).toBe("OPEN");
    await resolveTicket(id, staff(), HQ);
    await db.supportTicket.update({ where: { id }, data: { resolvedAt: addDays(new Date(), -31) } });
    await expect(memberReply(id, c, "Too late?", null)).rejects.toThrow(/more than 30 days/);
  });

  it("the queue's views and counts: overdue means past a deadline without the reply, waiting is the member's turn", async () => {
    const now = new Date();
    const r = await createTicket(ask({ email: "late@example.co.za" }), { customer: null, ip: "196.25.20.1" });
    const lateId = (r as { id: string }).id;
    await db.supportTicket.update({ where: { id: lateId }, data: { firstResponseDueAt: addDays(now, -1), resolveDueAt: addDays(now, 3) } });
    const overdue = await listTickets(ticketWhere(HQ, { view: "overdue" }, { userId: w.manager.id, now }), 1);
    expect(overdue.rows.map((t) => t.id)).toContain(lateId);
    expect(overdue.rows.find((t) => t.id === lateId)?.sla).toMatchObject({ firstResponse: "overdue", overdue: true });
    const counts = await ticketCounts(HQ, w.manager.id, now);
    expect(counts.overdue).toBeGreaterThanOrEqual(1);
    expect(counts.all).toBeGreaterThan(counts.open);
    expect((await listTickets(ticketWhere(HQ, { q: "st 1" }, { userId: w.manager.id, now }), 1)).rows.map((t) => t.number)).toEqual(["ST-000001"]);
    expect((await listTickets(ticketWhere(HQ, { view: "all", q: "late@example" }, { userId: w.manager.id, now }), 1)).total).toBe(1);
  });

  it("deletes resolved tickets, their messages and their emails a year after they close", async () => {
    await db.supportTicket.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: addDays(new Date(), -400) } });
    expect(await purgeResolvedTickets()).toEqual({ deleted: 1 });
    expect(await db.supportTicket.findUnique({ where: { id } })).toBeNull();
    expect(await db.supportMessage.count({ where: { ticketId: id } })).toBe(0);
    expect(await db.messageLog.count({ where: { id: { startsWith: `support-${id}-` } } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "support.purge", entityId: id } })).toBe(1);
    expect(await purgeResolvedTickets()).toEqual({ deleted: 0 });
  });
});
