import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { clientIp, createLead, deleteLead, ipHash, purgeLeads, updateLead, type EnquiryInput } from "@/server/leads";
import { addDays, startOfDaySA } from "@/lib/format";
import { resetDb } from "./world";

type Person = { id: string; name: string };
let admin: Person, staff: Person, retired: Person, area: Person;
let seq = 0;
const actor = (u: Person) => ({ type: "USER" as const, id: u.id, name: u.name });
const ip = (n: number) => `196.25.1.${n}`;
const enquiry = (patch: Partial<EnquiryInput> = {}): EnquiryInput => ({
  name: "Sipho Dlamini",
  email: `sipho.${++seq}@example.co.za`,
  phone: "082 555 0101",
  area: "Ballito",
  province: "KZN",
  experience: "Ran a pharmacy in Umhlanga for twelve years, fourteen staff.",
  capital: "3-5m",
  pharmacist: "yes",
  consent: "on",
  source: "LinkedIn",
  ...patch,
});
async function lead(patch: Partial<EnquiryInput> = {}) {
  const r = await createLead(enquiry(patch), { ip: ip(200 + ++seq) });
  if (!r.ok || !r.id) throw new Error(`enquiry refused: ${JSON.stringify(r)}`);
  return db.franchiseLead.findUniqueOrThrow({ where: { id: r.id } });
}
const emails = (leadId: string) => db.messageLog.findMany({ where: { id: { in: [`lead-ack-${leadId}`, `lead-team-${leadId}`] } }, orderBy: { id: "asc" } });
const lastAudit = (entityId: string) => db.auditLog.findFirstOrThrow({ where: { entityId }, orderBy: { at: "desc" } });
const daysAgo = (n: number) => startOfDaySA(addDays(new Date(), -n));

beforeAll(async () => {
  await resetDb();
  const user = (name: string, role: "HQ_ADMIN" | "HQ_STAFF" | "AREA_MANAGER", active = true) =>
    db.user.create({ data: { name, role, active, email: `${name.split(" ")[0].toLowerCase()}@example.co.za` }, select: { id: true, name: true } });
  [admin, staff, retired, area] = await Promise.all([
    user("Naledi Khumalo", "HQ_ADMIN"),
    user("Pieter de Vries", "HQ_STAFF"),
    user("Old Timer", "HQ_STAFF", false),
    user("Karabo Molefe", "AREA_MANAGER"),
  ]);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

describe("Franchise enquiries", () => {
  it("creates a numbered lead with a keyed IP hash and an audit entry free of personal details", async () => {
    const r = await createLead(enquiry({ name: "Thandi  Nkosi", email: " Thandi.Nkosi@Example.co.za " }), { ip: ip(1) });
    expect(r).toMatchObject({ ok: true, number: "FL-000001" });
    const l = await db.franchiseLead.findUniqueOrThrow({ where: { number: "FL-000001" } });
    expect(l).toMatchObject({ name: "Thandi Nkosi", email: "thandi.nkosi@example.co.za", phone: "+27825550101", area: "Ballito", province: "KZN", capital: "3-5m", pharmacist: true, source: "linkedin", status: "NEW", ownerId: null });
    expect(l.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(l.ipHash).toBe(ipHash(ip(1)));
    expect(JSON.stringify(l)).not.toContain(ip(1));

    const a = await db.auditLog.findFirstOrThrow({ where: { action: "lead.create", entityId: l.id } });
    expect(a).toMatchObject({ actorType: "SYSTEM", actorName: "herbalholland.com", data: { number: "FL-000001", area: "Ballito" } });
    expect(JSON.stringify(a.data)).not.toMatch(/Thandi|example|\+27/);
  });

  it("emails the team (a link, no contact details) and acknowledges the enquirer (no marketing)", async () => {
    vi.stubEnv("FRANCHISE_EMAIL", "franchise-team@example.co.za");
    const l = await lead({ name: "Johan van der Merwe", email: "johan@example.co.za", area: "Pietermaritzburg", source: "fasa-2027" });
    const [ack, team] = await emails(l.id);
    expect(ack).toMatchObject({ channel: "EMAIL", kind: "TRANSACTIONAL", status: "SENT", to: "johan@example.co.za" });
    expect(ack.body).toContain(`Your franchise enquiry ${l.number}`);
    expect(ack.body).toMatch(/Hello Johan,/);
    expect(ack.body).toMatch(/reply by email within a few working days/);
    expect(ack.body).toMatch(/information evening/);
    expect(ack.body).toMatch(/disclosure document at least 14 days before anything is signed/);
    expect(ack.body).not.toMatch(/unsubscribe|special|offer|deal/i);

    expect(team).toMatchObject({ channel: "EMAIL", kind: "TRANSACTIONAL", status: "SENT", to: "franchise-team@example.co.za" });
    expect(team.body).toContain(`New franchise enquiry ${l.number}: Pietermaritzburg, KwaZulu-Natal`);
    expect(team.body).toMatch(new RegExp(`https?://[^\\s]+/hq/franchise/${l.id}`));
    expect(team.body).toMatch(/Capital you could put in: R3–5 million/);
    expect(team.body).toMatch(/Came from: fasa-2027/);
    expect(team.body).not.toMatch(/Johan|johan@|555|pharmacy in Umhlanga/);
  });

  it("refuses an incomplete enquiry field by field and keeps nothing", async () => {
    const before = await db.franchiseLead.count();
    const r = await createLead({ ...enquiry(), email: "sipho@", phone: "011 555 0101", experience: "Shop owner", consent: "" }, { ip: ip(2) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("Please check the highlighted fields.");
    expect(Object.keys(r.fields ?? {}).sort()).toEqual(["consent", "email", "experience", "phone"]);
    expect(await db.franchiseLead.count()).toBe(before);
  });

  it("thanks a bot that fills the honeypot, and keeps and sends nothing", async () => {
    const [leads, mails] = await Promise.all([db.franchiseLead.count(), db.messageLog.count()]);
    expect(await createLead({ ...enquiry(), website: "https://cheap-pills.example" }, { ip: ip(3) })).toEqual({ ok: true, number: null });
    expect([await db.franchiseLead.count(), await db.messageLog.count()]).toEqual([leads, mails]);
    const next = await lead();
    expect(next.number).toBe(`FL-${String(leads + 1).padStart(6, "0")}`); // no number was used up
  });

  it("takes three enquiries an hour from one connection", async () => {
    for (let i = 0; i < 3; i++) expect((await createLead(enquiry(), { ip: ip(4) })).ok).toBe(true);
    const r = await createLead(enquiry(), { ip: ip(4) });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/several enquiries from your connection in the last hour/) });
    expect((await createLead(enquiry(), { ip: ip(5) })).ok).toBe(true); // another connection
    expect((await createLead(enquiry(), {})).ok).toBe(true); // no IP known: only the email limit applies
    await db.$executeRaw`UPDATE "FranchiseLead" SET "createdAt" = now() - interval '61 minutes' WHERE "ipHash" = ${ipHash(ip(4))}`;
    expect((await createLead(enquiry(), { ip: ip(4) })).ok).toBe(true); // an hour on
  });

  it("takes two enquiries a day from one email address", async () => {
    expect((await createLead(enquiry({ email: "repeat@example.co.za" }), { ip: ip(6) })).ok).toBe(true);
    expect((await createLead(enquiry({ email: "Repeat@Example.co.za" }), { ip: ip(7) })).ok).toBe(true);
    const r = await createLead(enquiry({ email: "repeat@example.co.za" }), { ip: ip(8) });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/already have your enquiry from today/) });
  });

  it("reads the visitor's IP from Cloudflare, else the hop our own proxy added (earlier hops are the client's claim)", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "196.25.1.9", "x-forwarded-for": "10.0.0.1" }))).toBe("196.25.1.9");
    expect(clientIp(new Headers({ "x-forwarded-for": " 6.6.6.6, 41.13.2.3" }))).toBe("41.13.2.3");
    expect(clientIp(new Headers({ "x-forwarded-for": "2c0f:f4c0::1" }))).toBe("2c0f:f4c0::1");
    expect(clientIp(new Headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("Working franchise leads", () => {
  it("moves a lead on with a dated note, audits from/to without the note, and ignores stale screens", async () => {
    const l = await lead();
    const r = await updateLead(l.id, { status: "CONTACTED", expectStatus: "NEW", note: "Called; keen on Ballito, has a site in mind." }, actor(staff));
    expect(r.lead.status).toBe("CONTACTED");
    expect(r.lead.notes).toMatch(/^\d{1,2} \w{3} \d{4} · Pieter de Vries · New → Contacted: Called; keen on Ballito, has a site in mind\.$/);
    expect(r.lead.updatedAt.getTime()).toBeGreaterThan(l.updatedAt.getTime());
    const a = await lastAudit(l.id);
    expect(a).toMatchObject({ action: "lead.update", actorName: "Pieter de Vries", data: { number: l.number, status: { from: "NEW", to: "CONTACTED" }, note: "added" } });
    expect(JSON.stringify(a.data)).not.toMatch(/site in mind/);

    await expect(updateLead(l.id, { status: "INFO_EVENING", expectStatus: "NEW" }, actor(admin))).rejects.toThrow(/moved it to “Contacted” a moment ago/);
    await expect(updateLead(l.id, { status: "SIGNED" }, actor(admin))).rejects.toThrow(/can't move to “Signed”/);
    await expect(updateLead(l.id, { notes: "Mine now", expectUpdatedAt: l.updatedAt }, actor(admin))).rejects.toThrow(/since you opened it/);
    await expect(updateLead(l.id, { note: "Just a note" }, actor(admin))).rejects.toThrow(/goes with a status change/);

    const notes = await updateLead(l.id, { notes: "Meeting on Friday.", expectUpdatedAt: r.lead.updatedAt }, actor(admin));
    expect(notes.lead.notes).toBe("Meeting on Friday.");
    expect((await lastAudit(l.id)).data).toEqual({ number: l.number, notes: "edited" });
    expect(await updateLead(l.id, { notes: "Meeting on Friday." }, actor(admin))).toMatchObject({ changed: [] }); // nothing to audit
  });

  it("won't mark a lead signed until 14 days after the disclosure document", async () => {
    const l = await lead();
    await updateLead(l.id, { status: "CONTACTED" }, actor(staff));
    await expect(updateLead(l.id, { status: "DISCLOSURE_SENT" }, actor(staff))).rejects.toThrow(/day the disclosure document was sent/);
    await expect(updateLead(l.id, { disclosureSentAt: addDays(new Date(), 2) }, actor(staff))).rejects.toThrow(/can't be in the future/);

    await updateLead(l.id, { status: "DISCLOSURE_SENT", disclosureSentAt: daysAgo(10) }, actor(staff));
    await expect(updateLead(l.id, { status: "SIGNED" }, actor(staff))).rejects.toThrow(/Not yet: .* the earliest signing day is/);
    expect((await db.franchiseLead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("DISCLOSURE_SENT");
    await expect(updateLead(l.id, { disclosureSentAt: null }, actor(staff))).rejects.toThrow(/needs the day/);

    // It actually went out four days earlier.
    await updateLead(l.id, { disclosureSentAt: daysAgo(14) }, actor(staff));
    const moved = await lastAudit(l.id);
    expect((moved.data as { disclosureSentAt: unknown }).disclosureSentAt).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    const signed = await updateLead(l.id, { status: "SIGNED", expectStatus: "DISCLOSURE_SENT" }, actor(admin));
    expect(signed.lead.status).toBe("SIGNED");
    expect((await lastAudit(l.id)).data).toMatchObject({ status: { from: "DISCLOSURE_SENT", to: "SIGNED" } });
    await expect(updateLead(l.id, { disclosureSentAt: daysAgo(20) }, actor(admin))).rejects.toThrow(/signed: the disclosure date is part of the record/);
  });

  it("assigns leads to active HQ admin and HQ team members only", async () => {
    const l = await lead();
    await expect(updateLead(l.id, { ownerId: area.id }, actor(admin))).rejects.toThrow(/HQ team/);
    await expect(updateLead(l.id, { ownerId: retired.id }, actor(admin))).rejects.toThrow(/HQ team/);
    await expect(updateLead(l.id, { ownerId: "no-such-user" }, actor(admin))).rejects.toThrow(/HQ team/);
    const r = await updateLead(l.id, { ownerId: staff.id }, actor(admin));
    expect(r.lead.ownerId).toBe(staff.id);
    expect((await lastAudit(l.id)).data).toEqual({ number: l.number, owner: { from: null, to: "Pieter de Vries" } });
    await updateLead(l.id, { ownerId: admin.id }, actor(admin));
    expect((await lastAudit(l.id)).data).toMatchObject({ owner: { from: "Pieter de Vries", to: "Naledi Khumalo" } });
    await updateLead(l.id, { ownerId: null }, actor(admin));
    expect((await db.franchiseLead.findUniqueOrThrow({ where: { id: l.id } })).ownerId).toBeNull();
  });

  it("deletes a lead at the person's request and blanks its emails", async () => {
    const l = await lead({ name: "Ayanda Zulu", email: "ayanda@example.co.za" });
    expect(await deleteLead(l.id, actor(admin))).toBe(l.number);
    expect(await db.franchiseLead.findUnique({ where: { id: l.id } })).toBeNull();
    expect((await lastAudit(l.id)).data).toEqual({ number: l.number });
    for (const m of await emails(l.id)) expect(m).toMatchObject({ to: "[erased]", body: "[erased with the franchise enquiry]" });
    expect(await db.messageLog.count({ where: { OR: [{ to: "ayanda@example.co.za" }, { body: { contains: "Ayanda" } }] } })).toBe(0);
    await expect(deleteLead(l.id, actor(admin))).rejects.toThrow(/already been deleted/);
  });

  it("deletes not-a-fit leads a year after their last change", async () => {
    const [old, recent, open] = await Promise.all([lead(), lead(), lead()]);
    for (const l of [old, recent]) await updateLead(l.id, { status: "NOT_A_FIT" }, actor(staff));
    const age = (id: string, days: number) => db.$executeRaw`UPDATE "FranchiseLead" SET "updatedAt" = ${addDays(new Date(), -days)} WHERE id = ${id}`;
    await Promise.all([age(old.id, 366), age(recent.id, 300), age(open.id, 400)]);

    expect(await purgeLeads()).toEqual({ purged: 1 });
    const left = await db.franchiseLead.findMany({ where: { id: { in: [old.id, recent.id, open.id] } }, select: { id: true } });
    expect(left.map((l) => l.id).sort()).toEqual([recent.id, open.id].sort());
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "lead.purge" }, orderBy: { at: "desc" } });
    expect(a).toMatchObject({ actorType: "SYSTEM", data: { count: 1 } });
    for (const m of await emails(old.id)) expect(m.to).toBe("[erased]");
    expect((await emails(recent.id)).every((m) => m.to !== "[erased]")).toBe(true);

    expect(await purgeLeads()).toEqual({ purged: 0 });
    expect(await db.auditLog.count({ where: { action: "lead.purge" } })).toBe(1); // nothing to purge, nothing audited
  });
});
