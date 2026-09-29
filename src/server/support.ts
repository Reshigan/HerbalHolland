// Member support: tickets from /support (members and guests) worked in HQ → Support, with store managers seeing the
// tickets about their own orders. Rules (SLA, moves, form checks, wording) live in @/lib/support. Every reply is
// audited; personal information stays in the ticket (the audit log keeps numbers and categories), the member is told
// by email — or by SMS when they have no email address — and resolved tickets are deleted a year after they close.
import { createHmac } from "node:crypto";
import { db, tx, type Prisma } from "./db";
import { audit, SYSTEM, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { deliverEmail, type Email } from "./email";
import { APP_URL, emailLayout, esc, para } from "./email-templates";
import { notifyCustomer } from "./messaging";
import { storePhotos, UploadError } from "./uploads";
import { gsmSafe } from "@/lib/sms";
import {
  CANNED_REPLIES,
  SUPPORT_STATUS,
  TICKET_LIMITS,
  canReopen,
  defaultPriority,
  fillCanned,
  firstNameOf,
  isSupportPriority,
  slaDue,
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
  type SupportCategoryKey,
  type SupportPriorityKey,
  type SupportStatusKey,
  type TicketErrors,
} from "@/lib/support";
import type { Customer, SupportTicket } from "@/generated/prisma/client";

/** An expected, user-facing failure (shown inline). */
export class SupportError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

const SUPPORT: Actor = { type: "SYSTEM", name: "Support" };
const HOUR = 3_600_000;
export const supportEmail = () => process.env.SUPPORT_EMAIL?.trim() || "hello@herbalholland.co.za";

/** Keyed hash of a guest's IP (HMAC-SHA-256 with SESSION_SECRET): limits repeat tickets without storing the IP. */
export const supportIpHash = (ip: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(`support-ticket:${ip}`).digest("hex");

/** Who a ticket's messages are for: HQ (everything) or a store's managers (tickets about that store's orders). */
export type SupportScope = { kind: "HQ" } | { kind: "STORES"; storeIds: string[] };
export const ticketInScope = (t: { storeId: string | null }, scope: SupportScope) => scope.kind === "HQ" || (!!t.storeId && scope.storeIds.includes(t.storeId));

// ── Opening a ticket ────────────────────────────────────────────────────────

export type TicketInput = RawTicket & { website?: string | null };
export type TicketResult = { ok: true; id: string | null; number: string | null } | { ok: false; error: string; fields?: TicketErrors };

/**
 * A support request from the form: honeypot, checks, limits (guests: 3 per connection an hour, 5 per email address a
 * day; members: 10 a day), then the ticket with its first message, the audit entry and the acknowledgement.
 */
export async function createTicket(input: TicketInput, ctx: { customer: Customer | null; ip?: string | null }): Promise<TicketResult> {
  // People never see the "website" field; form-filling bots do. They get the same thank-you, and nothing is kept.
  if (typeof input.website === "string" && input.website.trim()) return { ok: true, id: null, number: null };
  const c = ctx.customer;
  const check = validateTicket(input, c ? { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone } : null);
  if (!check.ok) return { ok: false, error: "Please check the highlighted fields.", fields: check.fields };
  const d = check.data;
  const now = Date.now();
  const hash = !c && ctx.ip ? supportIpHash(ctx.ip) : null;
  const [fromIp, fromEmail, fromMember] = await Promise.all([
    hash ? db.supportTicket.count({ where: { ipHash: hash, createdAt: { gte: new Date(now - HOUR) } } }) : 0,
    !c && d.email ? db.supportTicket.count({ where: { email: d.email, createdAt: { gte: new Date(now - 24 * HOUR) } } }) : 0,
    c ? db.supportTicket.count({ where: { customerId: c.id, createdAt: { gte: new Date(now - 24 * HOUR) } } }) : 0,
  ]);
  if (fromMember >= TICKET_LIMITS.perMemberDay || fromEmail >= TICKET_LIMITS.perEmailDay)
    return { ok: false, error: "You've sent us quite a few messages today, so we've paused new ones for a while. Reply on one of your open requests instead — we'll see it there." };
  if (fromIp >= TICKET_LIMITS.perIpHour)
    return { ok: false, error: `We've had several requests from your connection in the last hour, so we've paused new ones for a while. Please try again later, or email ${supportEmail()}.` };

  // The order it's about, when we can tie it to the person asking (a member's own order, or a guest with the order's email).
  let storeId: string | null = null;
  if (d.orderCode) {
    const order = await db.order.findUnique({ where: { code: d.orderCode }, select: { storeId: true, customerId: true, customer: { select: { email: true } } } });
    if (order && (c ? order.customerId === c.id : !!d.email && order.customer.email?.toLowerCase() === d.email)) storeId = order.storeId;
  }
  const openedAt = new Date();
  const due = slaDue(openedAt);
  const ticket = await tx(async (t) => {
    const number = ticketNumber(await nextNumber(t, "SUPPORT_TICKET"));
    const row = await t.supportTicket.create({
      data: {
        number, customerId: c?.id ?? null, email: d.email, phone: d.phone, name: d.name, subject: d.subject, category: d.category, orderCode: d.orderCode, storeId, body: d.body,
        priority: defaultPriority(d.category), firstResponseDueAt: due.firstResponseDueAt, resolveDueAt: due.resolveDueAt, ipHash: hash, createdAt: openedAt,
        messages: { create: { authorType: "MEMBER", authorId: c?.id ?? null, authorName: d.name, body: d.body, createdAt: openedAt } },
      },
    });
    await audit(t, c ? { type: "CUSTOMER", id: c.id, name: c.firstName } : SUPPORT, "support.create", {
      storeId, entity: "SupportTicket", entityId: row.id, data: { number, category: d.category, orderCode: d.orderCode, guest: !c },
    });
    return row;
  });
  await tell(ticket, ticketOpenedMessage(ticket), { link: c ? `${APP_URL()}/club/support/${ticket.id}` : null, cta: "Open your request" });
  return { ok: true, id: ticket.id, number: ticket.number };
}

// ── Working a ticket (staff) ────────────────────────────────────────────────

async function load(id: string, scope: SupportScope) {
  const t = await db.supportTicket.findUnique({ where: { id } });
  if (!t || !ticketInScope(t, scope)) throw new SupportError("Ticket not found");
  return t;
}

/** A staff reply: sent to the member, the ticket handed to them (waiting for member), the first-response clock stopped. */
export async function replyToTicket(id: string, raw: unknown, staff: { id: string; name: string }, scope: SupportScope, opts: { canned?: string | null } = {}) {
  const t = await load(id, scope);
  const check = validateReply(raw);
  if (!check.ok) throw new SupportError(check.error, "body");
  const actor: Actor = { type: "USER", id: staff.id, name: staff.name };
  const now = new Date();
  const updated = await tx(async (tr) => {
    await tr.supportMessage.create({ data: { ticketId: t.id, authorType: "STAFF", authorId: staff.id, authorName: firstNameOf(staff.name), body: check.body } });
    const row = await tr.supportTicket.update({
      where: { id: t.id },
      data: { status: statusAfterReply("STAFF"), firstRespondedAt: t.firstRespondedAt ?? now, resolvedAt: null, assignedToId: t.assignedToId ?? staff.id },
    });
    await audit(tr, actor, "support.reply", {
      storeId: t.storeId, entity: "SupportTicket", entityId: t.id,
      data: { number: t.number, chars: check.body.length, canned: opts.canned ?? null, firstResponse: !t.firstRespondedAt, withinSla: !t.firstRespondedAt ? now <= t.firstResponseDueAt : undefined },
    });
    return row;
  });
  await tell(updated, ticketReplyMessage(updated, check.body, updated.customerId ? `${APP_URL()}/club/support/${updated.id}` : null), { link: updated.customerId ? `${APP_URL()}/club/support/${updated.id}` : null, cta: "Reply" });
  return updated;
}

/** The canned reply's text for this ticket, ready to edit. */
export function cannedFor(key: string, t: { name: string; orderCode: string | null }, staffName: string) {
  const c = CANNED_REPLIES.find((x) => x.key === key);
  return c ? fillCanned(c.body, { name: firstNameOf(t.name), orderCode: t.orderCode, agent: firstNameOf(staffName) }) : null;
}

export async function assignTicket(id: string, userId: string | null, actor: Actor, scope: SupportScope) {
  const t = await load(id, scope);
  if (userId) {
    const u = await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } });
    if (!u) throw new SupportError("That person isn't an active staff member", "assignedToId");
  }
  if (t.assignedToId === userId) return { changed: false, ticket: t };
  const row = await db.supportTicket.update({ where: { id }, data: { assignedToId: userId } });
  await audit(db, actor, "support.assign", { storeId: t.storeId, entity: "SupportTicket", entityId: t.id, data: { number: t.number, from: t.assignedToId, to: userId } });
  return { changed: true, ticket: row };
}

export async function setTicketPriority(id: string, priority: unknown, actor: Actor, scope: SupportScope) {
  const t = await load(id, scope);
  if (!isSupportPriority(priority)) throw new SupportError("Choose a priority", "priority");
  if (t.priority === priority) return { changed: false, ticket: t };
  const row = await db.supportTicket.update({ where: { id }, data: { priority } });
  await audit(db, actor, "support.priority", { storeId: t.storeId, entity: "SupportTicket", entityId: t.id, data: { number: t.number, from: t.priority, to: priority } });
  return { changed: true, ticket: row };
}

/** Closes the ticket. The member is told, and can reopen it by replying within 30 days. */
export async function resolveTicket(id: string, staff: { id: string; name: string }, scope: SupportScope, note?: string | null) {
  const t = await load(id, scope);
  if (t.status === "RESOLVED") throw new SupportError("It's already resolved");
  const actor: Actor = { type: "USER", id: staff.id, name: staff.name };
  const now = new Date();
  const text = note?.trim() ? note.trim().slice(0, TICKET_LIMITS.reply) : null;
  const updated = await tx(async (tr) => {
    await tr.supportMessage.create({ data: { ticketId: t.id, authorType: "SYSTEM", authorId: staff.id, authorName: firstNameOf(staff.name), body: text ? `Marked as resolved: ${text}` : "Marked as resolved" } });
    const row = await tr.supportTicket.update({ where: { id: t.id }, data: { status: "RESOLVED", resolvedAt: now, firstRespondedAt: t.firstRespondedAt ?? now, assignedToId: t.assignedToId ?? staff.id } });
    await audit(tr, actor, "support.resolve", { storeId: t.storeId, entity: "SupportTicket", entityId: t.id, data: { number: t.number, withinSla: now <= t.resolveDueAt, note: !!text } });
    return row;
  });
  const first = firstNameOf(t.name);
  await tell(
    updated,
    {
      subject: `${t.subject} — resolved (${t.number})`,
      text: `Hi ${first},\n\nWe've marked your request ${t.number} as resolved${text ? `: ${text}` : "."}\n\nIf it isn't sorted, just reply within 30 days and it opens again.\n\nHerbal Holland`,
      sms: `Herbal Holland: your request ${t.number} is marked resolved. Not sorted? Reply within 30 days to reopen it.`,
    },
    { link: updated.customerId ? `${APP_URL()}/club/support/${updated.id}` : null, cta: "View the request" },
  );
  return updated;
}

// ── The member's side ───────────────────────────────────────────────────────

/** A member's reply on their own ticket, with an optional photo: the ticket comes back to the team (reopened if resolved). */
export async function memberReply(id: string, customer: Customer, raw: unknown, photo: File | null) {
  const t = await db.supportTicket.findFirst({ where: { id, customerId: customer.id } });
  if (!t) throw new SupportError("Request not found");
  const check = validateReply(raw);
  if (!check.ok) throw new SupportError(check.error, "body");
  if (t.status === "RESOLVED" && !canReopen(t.resolvedAt, new Date())) throw new SupportError("This request closed more than 30 days ago. Please open a new one and quote its number.");
  let attachmentUploadId: string | null = null;
  if (photo) {
    try {
      [attachmentUploadId = null] = await storePhotos({ files: [photo], max: 1, folder: "support", uploadedById: customer.id, storeId: t.storeId });
    } catch (e) {
      if (e instanceof UploadError) throw new SupportError(e.message, "photo");
      throw e;
    }
  }
  const reopened = t.status === "RESOLVED";
  return tx(async (tr) => {
    await tr.supportMessage.create({ data: { ticketId: t.id, authorType: "MEMBER", authorId: customer.id, authorName: t.name, body: check.body, attachmentUploadId } });
    const row = await tr.supportTicket.update({ where: { id: t.id }, data: { status: statusAfterReply("MEMBER"), resolvedAt: null } });
    await audit(tr, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "support.member_reply", { storeId: t.storeId, entity: "SupportTicket", entityId: t.id, data: { number: t.number, reopened, photo: !!attachmentUploadId } });
    return row;
  });
}

export async function memberTickets(customerId: string, page: number, pageSize = 10) {
  const where = { customerId };
  const [rows, total] = await Promise.all([
    db.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { messages: true } } } }),
    db.supportTicket.count({ where }),
  ]);
  return { rows, total };
}

// ── Queues and threads ──────────────────────────────────────────────────────

export type TicketFilters = { view?: string; category?: string; priority?: string; assignee?: string; q?: string };
export const TICKET_VIEWS = ["open", "mine", "unassigned", "overdue", "waiting", "resolved", "all"] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];
export const ticketView = (v: string | undefined): TicketView => ((TICKET_VIEWS as readonly string[]).includes(v ?? "") ? (v as TicketView) : "open");

/** The queue's where clause for a scope and filters. `mine` needs the user id; `overdue` is by the SLA deadlines. */
export function ticketWhere(scope: SupportScope, f: TicketFilters, ctx: { userId: string; now: Date }): Prisma.SupportTicketWhereInput {
  const q = (f.q ?? "").trim();
  const view: TicketView = q && !f.view ? "all" : ticketView(f.view); // a search with no view chosen looks through everything
  const byNumber = ticketNumberQuery(q);
  const search: Prisma.SupportTicketWhereInput = !q
    ? {}
    : byNumber
      ? { number: byNumber }
      : { OR: [{ subject: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { orderCode: { equals: q.toUpperCase() } }] };
  const byView: Prisma.SupportTicketWhereInput =
    view === "open"
      ? { status: { not: "RESOLVED" } }
      : view === "mine"
        ? { assignedToId: ctx.userId, status: { not: "RESOLVED" } }
        : view === "unassigned"
          ? { assignedToId: null, status: { not: "RESOLVED" } }
          : view === "overdue"
            ? { OR: [{ firstRespondedAt: null, firstResponseDueAt: { lt: ctx.now }, status: { not: "RESOLVED" } }, { status: "OPEN", resolveDueAt: { lt: ctx.now } }] }
            : view === "waiting"
              ? { status: "WAITING_MEMBER" }
              : view === "resolved"
                ? { status: "RESOLVED" }
                : {};
  return {
    AND: [
      scope.kind === "HQ" ? {} : { storeId: { in: scope.storeIds } },
      byView,
      f.category && f.category !== "" ? { category: f.category as SupportCategoryKey } : {},
      isSupportPriority(f.priority) ? { priority: f.priority } : {},
      f.assignee ? { assignedToId: f.assignee === "none" ? null : f.assignee } : {},
      search,
    ],
  };
}

export async function listTickets(where: Prisma.SupportTicketWhereInput, page: number, pageSize = 25) {
  const [rows, total] = await Promise.all([
    db.supportTicket.findMany({ where, orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { messages: true } } } }),
    db.supportTicket.count({ where }),
  ]);
  const ids = [...new Set(rows.flatMap((r) => (r.assignedToId ? [r.assignedToId] : [])))];
  const people = new Map((ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  return { rows: rows.map((r) => ({ ...r, assignee: r.assignedToId ? (people.get(r.assignedToId) ?? "Former staff member") : null, sla: slaState(r, new Date()) })), total };
}

/** Counts for the queue's chips (open, unassigned, overdue, waiting, resolved), within the scope. */
export async function ticketCounts(scope: SupportScope, userId: string, now = new Date()) {
  const base = scope.kind === "HQ" ? {} : { storeId: { in: scope.storeIds } };
  const [open, mine, unassigned, overdue, waiting, resolved, all] = await Promise.all(
    (["open", "mine", "unassigned", "overdue", "waiting", "resolved", "all"] as TicketView[]).map((view) => db.supportTicket.count({ where: { AND: [base, ticketWhere({ kind: "HQ" }, { view }, { userId, now })] } })),
  );
  return { open, mine, unassigned, overdue, waiting, resolved, all };
}

export async function ticketThread(id: string, scope: SupportScope) {
  const t = await db.supportTicket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t || !ticketInScope(t, scope)) return null;
  const [assignee, customer, order, history] = await Promise.all([
    t.assignedToId ? db.user.findUnique({ where: { id: t.assignedToId }, select: { id: true, name: true } }) : null,
    t.customerId ? db.customer.findUnique({ where: { id: t.customerId }, select: { id: true, memberNo: true, firstName: true, lastName: true, tier: true, phone: true, email: true } }) : null,
    t.orderCode ? db.order.findUnique({ where: { code: t.orderCode }, select: { id: true, code: true, status: true, storeId: true, customerId: true, totalCents: true, createdAt: true, store: { select: { code: true, name: true } } } }) : null,
    db.auditLog.findMany({ where: { entity: "SupportTicket", entityId: id }, orderBy: { at: "desc" }, take: 30, select: { id: true, at: true, action: true, actorName: true, data: true } }),
  ]);
  return { ticket: t, assignee, customer, order: order && (scope.kind === "HQ" || scope.storeIds.includes(order.storeId)) ? order : null, history, sla: slaState(t, new Date()) };
}

/** Active staff who can be assigned a ticket: HQ admin and team for HQ; the store's managers and owner for a store. */
export function assignableStaff(scope: SupportScope) {
  return db.user.findMany({
    where: scope.kind === "HQ" ? { active: true, role: { in: ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"] } } : { active: true, storeId: { in: scope.storeIds }, role: { in: ["MANAGER", "OWNER"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

// ── Telling the member ──────────────────────────────────────────────────────
// Email when the ticket has an address (guests always do); a text to the member's phone otherwise. Every send is
// logged under a known id, so a deleted ticket takes its messages out of the log too.

async function tell(t: SupportTicket, m: { subject: string; text: string; sms: string }, opts: { link: string | null; cta: string }) {
  const phone = t.phone ?? (t.customerId ? (await db.customer.findUnique({ where: { id: t.customerId }, select: { phone: true } }))?.phone : null);
  if (t.email) {
    const paragraphs = m.text.split(/\n{2,}/).map((p) => para(esc(p).replaceAll("\n", "<br/>"))).join("");
    const html = emailLayout({
      preheader: m.text.split("\n").find((l) => l.trim() && !/^hi /i.test(l))?.slice(0, 90) ?? m.subject,
      eyebrow: `Support · ${t.number}`,
      heading: m.subject.replace(/\s*\(ST-\d+\)$/, ""),
      body: paragraphs,
      cta: opts.link ? { label: opts.cta, href: opts.link } : undefined,
      footerHtml: `You're receiving this because you asked Herbal Holland for help (request ${esc(t.number)}). Questions? Reply to this email or write to ${esc(supportEmail())}.`,
    });
    await sendLogged(t, { to: t.email, subject: m.subject, text: m.text, html, customerId: t.customerId });
    return;
  }
  if (phone && t.customerId) await notifyCustomer({ id: t.customerId, phone }, gsmSafe(m.sms));
}

async function sendLogged(t: SupportTicket, e: Email) {
  let reason: string | null = null;
  let delivered = false;
  try {
    delivered = await deliverEmail(e);
  } catch (err) {
    reason = String((err as Error)?.message ?? err).slice(0, 300);
    console.error("[support] email failed", t.number, reason);
  }
  await db.messageLog.create({
    data: {
      id: `support-${t.id}-${Date.now().toString(36)}`, channel: "EMAIL", to: e.to, kind: "TRANSACTIONAL", status: reason ? "FAILED" : "SENT", customerId: t.customerId,
      body: `${e.subject}\n\n${e.text}`, reason: reason ?? (delivered ? null : "logged (SMTP_URL not set)"),
    },
  });
}

// ── POPIA: resolved tickets and their messages are deleted a year after they close ──────────────────────────────

export async function purgeResolvedTickets(now = new Date()) {
  const due = await db.supportTicket.findMany({ where: { status: "RESOLVED", resolvedAt: { lt: supportPurgeCutoff(now) } }, select: { id: true, number: true, storeId: true }, take: 500 });
  for (const t of due) {
    await tx(async (tr) => {
      await tr.messageLog.deleteMany({ where: { id: { startsWith: `support-${t.id}-` } } });
      await tr.supportTicket.delete({ where: { id: t.id } }); // messages go with it
      await audit(tr, SYSTEM, "support.purge", { storeId: t.storeId, entity: "SupportTicket", entityId: t.id, data: { number: t.number } });
    });
  }
  return { deleted: due.length };
}

export { SUPPORT_STATUS, type SupportStatusKey, type SupportPriorityKey };
