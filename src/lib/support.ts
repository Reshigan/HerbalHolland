// Member support: what a ticket is, the SLA clock (business days in SAST), the status moves and the wording members
// see. Pure: safe on the server, in the browser and in tests (tests/support.test.ts).
import { addDays, dayKey, fmtDate, fmtDateTime, TZ } from "./format";
import { normalisePhone, publicHolidays } from "./sa";

// ── Categories, statuses, priorities ────────────────────────────────────────

export const SUPPORT_CATEGORIES = ["ORDER", "DELIVERY", "PRODUCT", "REWARDS", "ACCOUNT", "OTHER"] as const;
export type SupportCategoryKey = (typeof SUPPORT_CATEGORIES)[number];
export const isSupportCategory = (v: unknown): v is SupportCategoryKey => typeof v === "string" && (SUPPORT_CATEGORIES as readonly string[]).includes(v);

export const SUPPORT_CATEGORY: Record<SupportCategoryKey, { label: string; hint: string }> = {
  ORDER: { label: "An order", hint: "Something about an order you placed" },
  DELIVERY: { label: "Delivery or collection", hint: "Where it is, when it's coming, who can collect" },
  PRODUCT: { label: "A product", hint: "A question, a fault or a lab result" },
  REWARDS: { label: "Rewards & points", hint: "Points, your tier, your card" },
  ACCOUNT: { label: "My account", hint: "Your details, sign-in, privacy" },
  OTHER: { label: "Something else", hint: "Anything we haven't listed" },
};

export const SUPPORT_STATUSES = ["OPEN", "WAITING_MEMBER", "RESOLVED"] as const;
export type SupportStatusKey = (typeof SUPPORT_STATUSES)[number];
export const isSupportStatus = (v: unknown): v is SupportStatusKey => typeof v === "string" && (SUPPORT_STATUSES as readonly string[]).includes(v);

export const SUPPORT_STATUS: Record<SupportStatusKey, { label: string; member: string; hint: string }> = {
  OPEN: { label: "Open", member: "With our team", hint: "Waiting for our reply" },
  WAITING_MEMBER: { label: "Waiting for member", member: "We've replied", hint: "Our reply is out; the member's turn" },
  RESOLVED: { label: "Resolved", member: "Resolved", hint: "Closed; a member reply reopens it" },
};

export const SUPPORT_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type SupportPriorityKey = (typeof SUPPORT_PRIORITIES)[number];
export const isSupportPriority = (v: unknown): v is SupportPriorityKey => typeof v === "string" && (SUPPORT_PRIORITIES as readonly string[]).includes(v);
export const SUPPORT_PRIORITY: Record<SupportPriorityKey, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High" };

/** Deliveries are time-critical: they start high. Everything else starts normal; staff can change it. */
export const defaultPriority = (category: SupportCategoryKey): SupportPriorityKey => (category === "DELIVERY" ? "HIGH" : "NORMAL");

// ── Status moves ────────────────────────────────────────────────────────────

/** Where a ticket can go: staff reply → waiting for the member; member reply → open again; resolve from anywhere open. */
export const SUPPORT_MOVES: Record<SupportStatusKey, readonly SupportStatusKey[]> = {
  OPEN: ["WAITING_MEMBER", "RESOLVED"],
  WAITING_MEMBER: ["OPEN", "RESOLVED"],
  RESOLVED: ["OPEN"],
};
export const canMoveTicket = (from: SupportStatusKey, to: SupportStatusKey) => SUPPORT_MOVES[from].includes(to);

/** The status after a reply: a staff reply hands the ticket to the member; a member reply (even on a resolved one) brings it back. */
export const statusAfterReply = (author: "MEMBER" | "STAFF"): SupportStatusKey => (author === "STAFF" ? "WAITING_MEMBER" : "OPEN");

/** A member may reply to (and so reopen) a resolved ticket for this long; after that they open a new one. */
export const REOPEN_DAYS = 30;
export const canReopen = (resolvedAt: Date | null, now: Date) => !resolvedAt || now.getTime() - resolvedAt.getTime() <= REOPEN_DAYS * 86_400_000;

// ── SLA: first reply within 1 business day, resolved within 5 (SAST) ─────────

export const SLA = { firstResponseBusinessDays: 1, resolveBusinessDays: 5, dayStartHour: 8 } as const;

/** Monday to Friday, not a public holiday (Public Holidays Act), in South African time. */
export function isBusinessDay(d: Date) {
  const key = dayKey(d);
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !publicHolidays(Number(key.slice(0, 4))).has(key);
}

/** The moment the clock starts: `d` itself on a business day, else 08:00 on the next business day. */
export function businessClockStart(d: Date) {
  if (isBusinessDay(d)) return d;
  let day = d;
  for (let i = 0; i < 20; i++) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) return new Date(`${dayKey(day)}T${String(SLA.dayStartHour).padStart(2, "0")}:00:00+02:00`);
  }
  return day;
}

/** `n` business days after `from`, at the same time of day (SAST has no daylight saving, so a day is 24 hours). */
export function addBusinessDays(from: Date, n: number) {
  let t = businessClockStart(from);
  for (let count = 0; count < n; ) {
    t = addDays(t, 1);
    if (isBusinessDay(t)) count++;
  }
  return t;
}

/** When the first reply and the resolution are due for a ticket opened at `createdAt`. */
export const slaDue = (createdAt: Date) => ({
  firstResponseDueAt: addBusinessDays(createdAt, SLA.firstResponseBusinessDays),
  resolveDueAt: addBusinessDays(createdAt, SLA.resolveBusinessDays),
});

export type SlaClock = "met" | "due" | "overdue" | "paused";
export type SlaState = { firstResponse: SlaClock; resolve: SlaClock; overdue: boolean; firstResponseLeftMs: number; resolveLeftMs: number };

/**
 * Where a ticket stands against its SLA. The resolution clock pauses while the ticket waits for the member (their
 * silence isn't our delay); a resolved ticket has both clocks met.
 */
export function slaState(
  t: { status: SupportStatusKey; firstResponseDueAt: Date; firstRespondedAt: Date | null; resolveDueAt: Date; resolvedAt: Date | null },
  now: Date,
): SlaState {
  const firstResponse: SlaClock = t.firstRespondedAt ? "met" : now > t.firstResponseDueAt ? "overdue" : "due";
  const resolve: SlaClock = t.status === "RESOLVED" || t.resolvedAt ? "met" : t.status === "WAITING_MEMBER" ? "paused" : now > t.resolveDueAt ? "overdue" : "due";
  return {
    firstResponse,
    resolve,
    overdue: firstResponse === "overdue" || resolve === "overdue",
    firstResponseLeftMs: t.firstResponseDueAt.getTime() - now.getTime(),
    resolveLeftMs: t.resolveDueAt.getTime() - now.getTime(),
  };
}

/** "due in 3 h", "overdue by 2 d", "due today 16:00" — the queue's SLA column. */
export function slaLabel(dueAt: Date, now: Date) {
  const ms = dueAt.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const span = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))} min` : abs < 86_400_000 ? `${Math.round(abs / 3_600_000)} h` : `${Math.round(abs / 86_400_000)} d`;
  if (ms < 0) return `overdue by ${span}`;
  return dayKey(dueAt) === dayKey(now) ? `due today ${new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(dueAt)}` : `due in ${span}`;
}

// ── The form ────────────────────────────────────────────────────────────────

export const TICKET_LIMITS = {
  name: 100,
  email: 254,
  subject: 120,
  bodyMin: 20,
  body: 4_000,
  reply: 4_000,
  perIpHour: 3, // guest tickets from one connection (keyed IP hash) in an hour
  perEmailDay: 5, // tickets from one email address in 24 hours
  perMemberDay: 10, // tickets from one member in 24 hours
} as const;

export type TicketField = "name" | "email" | "phone" | "subject" | "category" | "orderCode" | "body" | "consent";
export type RawTicket = Partial<Record<TicketField | "website", string | boolean | null | undefined>>;
export type CleanTicket = { name: string; email: string | null; phone: string | null; subject: string; category: SupportCategoryKey; orderCode: string | null; body: string };
export type TicketErrors = Partial<Record<TicketField, string>>;
export type TicketCheck = { ok: true; data: CleanTicket } | { ok: false; fields: TicketErrors };
/** The signed-in member, when there is one: their details fill the gaps and consent is covered by their membership. */
export type TicketMember = { firstName: string; lastName: string | null; email: string | null; phone: string } | null;

const text = (v: unknown) => (typeof v === "string" ? v : "");
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const line = (v: unknown) => text(v).replace(CONTROL, "").replace(/\s+/g, " ").trim();
const para = (v: unknown) =>
  text(v)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const ticked = (v: unknown) => v === true || (typeof v === "string" && ["on", "true", "yes", "1"].includes(v.trim().toLowerCase()));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const count = (n: number) => n.toLocaleString("en-US");

/** "ab12cd", " AB12CD " → "AB12CD"; null when it isn't an order code (6–12 letters and digits). */
export function orderCodeOf(raw: unknown) {
  const s = line(raw).toUpperCase().replace(/^#/, "");
  return /^[A-Z0-9]{6,12}$/.test(s) ? s : null;
}

/** Checks a support request field by field: the cleaned ticket, or a plain-English message per field. */
export function validateTicket(input: RawTicket, member: TicketMember): TicketCheck {
  const fields: TicketErrors = {};
  const L = TICKET_LIMITS;

  let name = line(input.name);
  if (!name && member) name = [member.firstName, member.lastName].filter(Boolean).join(" ");
  if (!name) fields.name = "Tell us your name";
  else if (name.length > L.name) fields.name = `Keep your name under ${L.name} characters`;
  else if (!/\p{L}/u.test(name)) fields.name = "Enter your name in letters";

  const email = line(input.email).toLowerCase() || (member?.email ?? "").toLowerCase();
  if (email && (email.length > L.email || !EMAIL.test(email))) fields.email = "That doesn't look like an email address — check it for typos";
  else if (!email && !member) fields.email = "Enter your email address — we reply by email";

  const rawPhone = line(input.phone);
  const phone = rawPhone ? normalisePhone(rawPhone) : (member?.phone ?? null);
  if (rawPhone && !phone) fields.phone = "Enter a South African mobile number, e.g. 082 123 4567";

  const subject = line(input.subject);
  if (subject.length < 3) fields.subject = "Give your message a short subject";
  else if (subject.length > L.subject) fields.subject = `Keep the subject under ${L.subject} characters`;

  const category = line(input.category).toUpperCase();
  if (!isSupportCategory(category)) fields.category = "Choose what it's about";

  const rawCode = line(input.orderCode);
  const orderCode = rawCode ? orderCodeOf(rawCode) : null;
  if (rawCode && !orderCode) fields.orderCode = "An order code is 6 letters and digits, like 7K2M9P — it's in your order confirmation";
  else if (!orderCode && (category === "ORDER" || category === "DELIVERY")) fields.orderCode = "Add the order code so we can find it — it's in your confirmation and in Rewards → Orders";

  const body = para(input.body);
  if (!body) fields.body = "Tell us what happened";
  else if (body.length < L.bodyMin) fields.body = `A little more, please — at least ${L.bodyMin} characters`;
  else if (body.length > L.body) fields.body = `Keep it under ${count(L.body)} characters`;

  if (!member && !ticked(input.consent)) fields.consent = "Tick the box so we can use your details to reply";

  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, data: { name, email: email || null, phone, subject, category: category as SupportCategoryKey, orderCode, body } };
}

/** A reply from either side: one paragraph or many, within the limit. */
export function validateReply(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = para(raw);
  if (body.length < 2) return { ok: false, error: "Write a reply first" };
  if (body.length > TICKET_LIMITS.reply) return { ok: false, error: `Keep it under ${count(TICKET_LIMITS.reply)} characters` };
  return { ok: true, body };
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** ST-000123 (from the SUPPORT_TICKET counter). */
export const ticketNumber = (n: number) => `ST-${String(n).padStart(6, "0")}`;

/** "ST-123", "st000123" or "ST 123" typed into a search → "ST-000123"; null when it isn't a ticket number. */
export function ticketNumberQuery(q: string) {
  const m = q.trim().match(/^st[\s-]*0*(\d{1,7})$/i);
  return m ? ticketNumber(Number(m[1])) : null;
}

// ── Canned replies ──────────────────────────────────────────────────────────
// {name} is the member's first name, {orderCode} the order, {agent} the staff member's first name. Plain, warm, no
// promises the team can't keep, and nothing that reads as marketing or a health claim (tests run screenCopy).

export const CANNED_REPLIES = [
  {
    key: "checking",
    label: "We're looking into it",
    body: "Hi {name},\n\nThanks for getting in touch. I'm looking into this now and will come back to you within one business day with an answer.\n\n{agent}\nHerbal Holland",
  },
  {
    key: "order-on-its-way",
    label: "Order: on its way",
    body: "Hi {name},\n\nGood news: order {orderCode} has left us and is on its way. You'll get an SMS with the courier's tracking number, and you can follow it under Rewards → Orders. The courier will ask to see your ID (18+) at the door.\n\n{agent}\nHerbal Holland",
  },
  {
    key: "delivery-delay",
    label: "Delivery: running late",
    body: "Hi {name},\n\nI'm sorry order {orderCode} hasn't reached you yet. I've asked the courier for an update and will let you know as soon as I hear back. If it hasn't arrived within two working days, we'll send a replacement or refund you — your choice.\n\n{agent}\nHerbal Holland",
  },
  {
    key: "return-how",
    label: "Returns: how to send it back",
    body: "Hi {name},\n\nSorry to hear that. You can start a return from Rewards → Orders → the order → “Return or report a problem”: choose the items, tell us what went wrong and add a photo if you can. We'll book a courier to collect it and refund you once it reaches us. Faulty items can come back within 6 months; a change of mind within 7 days of delivery.\n\n{agent}\nHerbal Holland",
  },
  {
    key: "points-missing",
    label: "Rewards: points missing",
    body: "Hi {name},\n\nThanks for flagging this. Points from an online order are added when it's handed over or delivered, and points from a store visit when the sale is rung up on your card. I've checked your account and added what was missing — you'll see it under Rewards → Points.\n\n{agent}\nHerbal Holland",
  },
  {
    key: "account-details",
    label: "Account: change your details",
    body: "Hi {name},\n\nYou can change your name, email address and home store yourself under Rewards → Settings. Your mobile number is how you sign in, so if it has changed, reply here from the new number's account and we'll move your membership across.\n\n{agent}\nHerbal Holland",
  },
  {
    key: "closing",
    label: "Closing: all sorted",
    body: "Hi {name},\n\nGlad we could sort that out. I'm closing this request now — if anything else comes up, just reply and it reopens.\n\n{agent}\nHerbal Holland",
  },
] as const;
export type CannedKey = (typeof CANNED_REPLIES)[number]["key"];

/** The reply with its placeholders filled in (an unknown order code reads “your order”). */
export function fillCanned(body: string, f: { name: string; orderCode?: string | null; agent: string }) {
  return body.replaceAll("{name}", f.name).replaceAll("{orderCode}", f.orderCode ?? "your order").replaceAll("{agent}", f.agent);
}

/** "Thandiwe" from "Thandiwe van Wyk". */
export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ── Member-facing messages ──────────────────────────────────────────────────

/** The acknowledgement when a ticket is opened. */
export function ticketOpenedMessage(t: { number: string; name: string; createdAt: Date }) {
  const due = addBusinessDays(t.createdAt, SLA.firstResponseBusinessDays);
  return {
    subject: `We've got your message (${t.number})`,
    text: `Hi ${firstNameOf(t.name)},\n\nThanks for getting in touch. Your request is ${t.number}; quote it if you write to us again. A member of our team will reply by ${fmtDateTime(due)} at the latest.\n\nHerbal Holland`,
    sms: `Herbal Holland: thanks, we have your message (${t.number}). We'll reply by ${fmtDate(due)}.`,
  };
}

/** A staff reply, sent to the member. */
export function ticketReplyMessage(t: { number: string; subject: string; name: string }, body: string, link: string | null) {
  return {
    subject: `Re: ${t.subject} (${t.number})`,
    text: `${body}\n\n${link ? `Reply from your Rewards account: ${link}` : `To reply, write back quoting ${t.number}.`}`,
    sms: `Herbal Holland: we've replied to your request ${t.number}. ${link ? `Read it at ${link}` : "Check your email."}`,
  };
}

// ── POPIA: resolved tickets are deleted a year after they close ─────────────

export const SUPPORT_RETENTION_DAYS = 365;
export const supportPurgeCutoff = (now: Date) => addDays(now, -SUPPORT_RETENTION_DAYS);
