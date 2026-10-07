// Member support rules: the SLA clock in South African business days, status moves, the form check, canned replies
// and the messages members get (screened like marketing copy).
import { describe, expect, it } from "vitest";
import {
  CANNED_REPLIES,
  REOPEN_DAYS,
  SLA,
  SUPPORT_CATEGORY,
  SUPPORT_MOVES,
  SUPPORT_STATUS,
  TICKET_LIMITS,
  addBusinessDays,
  businessClockStart,
  canMoveTicket,
  canReopen,
  defaultPriority,
  fillCanned,
  firstNameOf,
  isBusinessDay,
  orderCodeOf,
  slaDue,
  slaLabel,
  slaState,
  statusAfterReply,
  supportPurgeCutoff,
  ticketNumber,
  ticketNumberQuery,
  ticketOpenedMessage,
  ticketReplyMessage,
  validateReply,
  validateTicket,
  type RawTicket,
} from "@/lib/support";
import { screenCopy } from "@/lib/compliance";

const sast = (s: string) => new Date(`${s}+02:00`);
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(", ", "T");

describe("business days (SAST)", () => {
  it("knows weekends and public holidays", () => {
    expect(isBusinessDay(sast("2026-09-28T10:00:00"))).toBe(true); // Monday
    expect(isBusinessDay(sast("2026-09-26T10:00:00"))).toBe(false); // Saturday
    expect(isBusinessDay(sast("2026-09-27T10:00:00"))).toBe(false); // Sunday
    expect(isBusinessDay(sast("2026-09-24T10:00:00"))).toBe(false); // Heritage Day
    expect(isBusinessDay(sast("2026-12-25T10:00:00"))).toBe(false);
  });

  it("starts the clock at 08:00 on the next business day when a ticket arrives out of hours", () => {
    expect(iso(businessClockStart(sast("2026-09-26T14:30:00")))).toBe("2026-09-28T08:00"); // Saturday → Monday 08:00
    expect(iso(businessClockStart(sast("2026-09-24T09:00:00")))).toBe("2026-09-25T08:00"); // holiday → Friday
    expect(iso(businessClockStart(sast("2026-09-29T15:45:00")))).toBe("2026-09-29T15:45"); // a Tuesday stays
  });

  it("adds business days at the same time of day, skipping weekends and holidays", () => {
    expect(iso(addBusinessDays(sast("2026-09-29T15:45:00"), 1))).toBe("2026-09-30T15:45");
    expect(iso(addBusinessDays(sast("2026-10-02T15:45:00"), 1))).toBe("2026-10-05T15:45"); // Friday → Monday
    expect(iso(addBusinessDays(sast("2026-09-23T11:00:00"), 1))).toBe("2026-09-25T11:00"); // over Heritage Day
    expect(iso(addBusinessDays(sast("2026-09-29T15:45:00"), 5))).toBe("2026-10-06T15:45");
    expect(iso(addBusinessDays(sast("2026-09-26T14:30:00"), 1))).toBe("2026-09-29T08:00"); // Saturday → Tuesday 08:00
  });

  it("sets both SLA deadlines from the ticket's creation", () => {
    const due = slaDue(sast("2026-09-29T15:45:00"));
    expect(iso(due.firstResponseDueAt)).toBe("2026-09-30T15:45");
    expect(iso(due.resolveDueAt)).toBe("2026-10-06T15:45");
    expect(SLA).toMatchObject({ firstResponseBusinessDays: 1, resolveBusinessDays: 5 });
  });
});

describe("SLA state", () => {
  const created = sast("2026-09-29T15:45:00");
  const base = { status: "OPEN" as const, ...slaDue(created), firstRespondedAt: null, resolvedAt: null };

  it("is due, then overdue, until the first reply lands", () => {
    expect(slaState(base, sast("2026-09-30T09:00:00"))).toMatchObject({ firstResponse: "due", resolve: "due", overdue: false });
    expect(slaState(base, sast("2026-10-01T09:00:00"))).toMatchObject({ firstResponse: "overdue", resolve: "due", overdue: true });
    expect(slaState({ ...base, firstRespondedAt: sast("2026-09-30T09:00:00"), status: "WAITING_MEMBER" }, sast("2026-10-01T09:00:00"))).toMatchObject({ firstResponse: "met", resolve: "paused", overdue: false });
  });

  it("pauses the resolution clock while the member has the ball, and stops both once resolved", () => {
    const late = sast("2026-10-20T09:00:00");
    expect(slaState({ ...base, firstRespondedAt: created, status: "OPEN" }, late)).toMatchObject({ resolve: "overdue", overdue: true });
    expect(slaState({ ...base, firstRespondedAt: created, status: "WAITING_MEMBER" }, late)).toMatchObject({ resolve: "paused", overdue: false });
    expect(slaState({ ...base, firstRespondedAt: created, status: "RESOLVED", resolvedAt: late }, late)).toMatchObject({ firstResponse: "met", resolve: "met", overdue: false });
  });

  it("labels the deadline in plain words", () => {
    const now = sast("2026-09-30T09:00:00");
    expect(slaLabel(sast("2026-09-30T15:45:00"), now)).toBe("due today 15:45");
    expect(slaLabel(sast("2026-10-02T09:00:00"), now)).toBe("due in 2 d");
    expect(slaLabel(sast("2026-09-30T06:00:00"), now)).toBe("overdue by 3 h");
    expect(slaLabel(sast("2026-09-27T09:00:00"), now)).toBe("overdue by 3 d");
  });
});

describe("status moves", () => {
  it("hands the ticket back and forth and reopens on a member reply", () => {
    expect(SUPPORT_MOVES.OPEN).toEqual(["WAITING_MEMBER", "RESOLVED"]);
    expect(canMoveTicket("RESOLVED", "OPEN")).toBe(true);
    expect(canMoveTicket("RESOLVED", "WAITING_MEMBER")).toBe(false);
    expect(statusAfterReply("STAFF")).toBe("WAITING_MEMBER");
    expect(statusAfterReply("MEMBER")).toBe("OPEN");
    expect(canReopen(null, new Date())).toBe(true);
    expect(canReopen(sast("2026-09-01T10:00:00"), sast("2026-09-20T10:00:00"))).toBe(true);
    expect(canReopen(sast("2026-09-01T10:00:00"), sast(`2026-10-${String(1 + REOPEN_DAYS - 30 + 2).padStart(2, "0")}T10:00:00`))).toBe(false);
    expect(defaultPriority("DELIVERY")).toBe("HIGH");
    expect(defaultPriority("REWARDS")).toBe("NORMAL");
  });
});

describe("the support form", () => {
  const guest: RawTicket = { name: " Sipho  Dlamini ", email: " Sipho@Example.co.za ", phone: "082 555 0101", subject: " Points missing ", category: "rewards", orderCode: "", body: "I bought a grinder on Saturday and the points never showed up on my card.", consent: "on" };
  const member = { firstName: "Thandi", lastName: "Nkosi", email: "thandi@example.co.za", phone: "+27821234567" };

  it("cleans a guest's request and needs their consent to reply", () => {
    const r = validateTicket(guest, null);
    expect(r).toMatchObject({ ok: true, data: { name: "Sipho Dlamini", email: "sipho@example.co.za", phone: "+27825550101", subject: "Points missing", category: "REWARDS", orderCode: null } });
    expect(validateTicket({ ...guest, consent: "" }, null)).toMatchObject({ ok: false, fields: { consent: expect.stringContaining("Tick the box") } });
    expect(validateTicket({ ...guest, email: "" }, null)).toMatchObject({ ok: false, fields: { email: expect.stringContaining("Enter your email") } });
    expect(validateTicket({ ...guest, email: "not-an-email" }, null)).toMatchObject({ ok: false, fields: { email: expect.stringContaining("Check it for typos") } });
    expect(validateTicket({ ...guest, phone: "12345" }, null)).toMatchObject({ ok: false, fields: { phone: expect.stringContaining("South African mobile") } });
  });

  it("fills a member's details in and doesn't ask them for consent again", () => {
    const r = validateTicket({ subject: "Wrong tier", category: "REWARDS", body: "My card says Seed but I've spent well over the Sprout level this year." }, member);
    expect(r).toMatchObject({ ok: true, data: { name: "Thandi Nkosi", email: "thandi@example.co.za", phone: "+27821234567" } });
    // A member without an email address can still ask: they're texted.
    expect(validateTicket({ subject: "Wrong tier", category: "REWARDS", body: "My card says Seed but I've spent well over the Sprout level this year." }, { ...member, email: null })).toMatchObject({ ok: true, data: { email: null, phone: "+27821234567" } });
  });

  it("wants an order code for order and delivery questions, and checks its shape", () => {
    expect(validateTicket({ ...guest, category: "DELIVERY" }, null)).toMatchObject({ ok: false, fields: { orderCode: expect.stringContaining("Add the order code") } });
    expect(validateTicket({ ...guest, category: "DELIVERY", orderCode: " #7k2m9p " }, null)).toMatchObject({ ok: true, data: { orderCode: "7K2M9P", category: "DELIVERY" } });
    expect(validateTicket({ ...guest, orderCode: "7k" }, null)).toMatchObject({ ok: false, fields: { orderCode: expect.stringContaining("6 letters and digits") } });
    expect(orderCodeOf("ab12cd")).toBe("AB12CD");
    expect(orderCodeOf("hello world")).toBeNull();
  });

  it("wants a subject, a category and enough of a message", () => {
    const r = validateTicket({ ...guest, subject: "Hi", category: "SPAM", body: "Too short." }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["body", "category", "subject"]);
    expect(validateTicket({ ...guest, body: "x".repeat(TICKET_LIMITS.body + 1) }, null)).toMatchObject({ ok: false, fields: { body: expect.stringContaining("4,000") } });
    expect(validateReply("  ")).toMatchObject({ ok: false });
    expect(validateReply("Thanks,\r\n\r\n\r\nthat  sorted it.")).toEqual({ ok: true, body: "Thanks,\n\nthat sorted it." });
  });

  it("numbers tickets and finds them by number", () => {
    expect(ticketNumber(123)).toBe("ST-000123");
    expect(ticketNumberQuery("st 123")).toBe("ST-000123");
    expect(ticketNumberQuery("ST-000123")).toBe("ST-000123");
    expect(ticketNumberQuery("grinder")).toBeNull();
  });
});

describe("what members read", () => {
  it("canned replies and notifications pass the copy screen and speak to members", () => {
    const texts = [
      ...CANNED_REPLIES.map((c) => fillCanned(c.body, { name: "Thandi", orderCode: "7K2M9P", agent: "Naledi" })),
      ...Object.values(SUPPORT_CATEGORY).flatMap((c) => [c.label, c.hint]),
      ...Object.values(SUPPORT_STATUS).flatMap((s) => [s.label, s.member, s.hint]),
      ...Object.values(ticketOpenedMessage({ number: "ST-000001", name: "Thandi Nkosi", createdAt: sast("2026-09-29T15:45:00") })),
      ...Object.values(ticketReplyMessage({ number: "ST-000001", subject: "Points missing", name: "Thandi Nkosi" }, "All sorted.", "https://shop.example/club/support/x")),
      ...Object.values(ticketReplyMessage({ number: "ST-000001", subject: "Points missing", name: "Thandi Nkosi" }, "All sorted.", null)),
    ];
    expect(texts.flatMap((t) => screenCopy(t).map((f) => `“${f.term}” in: ${t}`))).toEqual([]);
    expect(texts.filter((t) => /\b(customers?|shoppers?|clients?)\b/i.test(t))).toEqual([]);
  });

  it("fills placeholders and falls back gracefully", () => {
    const c = CANNED_REPLIES.find((x) => x.key === "order-on-its-way")!;
    expect(fillCanned(c.body, { name: "Thandi", orderCode: null, agent: "Naledi" })).toContain("order your order has left us");
    expect(fillCanned(c.body, { name: "Thandi", orderCode: "7K2M9P", agent: "Naledi" })).toContain("order 7K2M9P has left us");
    expect(firstNameOf("Thandi van Wyk")).toBe("Thandi");
    const ack = ticketOpenedMessage({ number: "ST-000009", name: "Sipho Dlamini", createdAt: sast("2026-09-29T15:45:00") });
    expect(ack.subject).toBe("We've got your message (ST-000009)");
    expect(ack.text).toContain("reply by 30 Sep 2026, 15:45 at the latest");
    expect(ack.sms).toContain("We'll reply by 30 Sep 2026.");
  });

  it("keeps resolved tickets for a year", () => {
    expect(supportPurgeCutoff(sast("2026-09-29T10:00:00")).toISOString()).toBe(sast("2025-09-29T10:00:00").toISOString());
  });
});
