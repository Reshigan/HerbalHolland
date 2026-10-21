// Franchise enquiries (herbalholland.com's enquiry form sent them; it's closed now), worked by HQ (admin + HQ team) in
// HQ → Franchise leads. Rules live in @/lib/leads.
// POPIA: the personal information stays in the lead, which only HQ can open. The audit log keeps numbers, areas,
// statuses and staff names, never the enquirer's details or notes; the team's notification email carries no contact
// details; not-a-fit leads are deleted a year after their last change (purgeLeads, in the daily job) and deleteLead
// serves a data subject's request. Both also erase the lead's two emails from the message log.
import { createHmac } from "node:crypto";
import { db, tx, type Tx } from "./db";
import { audit, SYSTEM, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { deliverEmail, emailLayout, esc, type Email } from "./email";
import { APP_URL } from "./invoices";
import { PROVINCES } from "@/lib/sa";
import { dayKey, fmtDate, startOfDaySA } from "@/lib/format";
import {
  CAPITAL_LABEL,
  DISCLOSURE_DAYS,
  LEAD_LIMITS,
  LEAD_STATUS,
  OPEN_STATUSES,
  appendNote,
  capitalLabel,
  checkDisclosureDate,
  checkMove,
  firstName,
  isLeadStatus,
  leadNumber,
  noteLine,
  numberQuery,
  purgeCutoff,
  validateLead,
  type LeadErrors,
  type LeadStatusKey,
  type RawLead,
} from "@/lib/leads";
import type { FranchiseLead, Prisma, Role } from "@/generated/prisma/client";
import { appSecret } from "./secret";
import { clientIpFrom } from "@/lib/client-ip";
import { inBatches } from "@/lib/json-list";

/** Who may see and work franchise leads: HQ admin and the HQ team, not area managers. */
export const LEAD_ROLES: Role[] = ["HQ_ADMIN", "HQ_STAFF"];

/** An expected, user-facing failure (shown inline in HQ). */
export class LeadError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export const franchiseEmail = () => process.env.FRANCHISE_EMAIL?.trim() || "franchise@herbalholland.com";
const SITE: Actor = { type: "SYSTEM", name: "herbalholland.com" };
const HOUR = 3_600_000;

// ── Enquiries ───────────────────────────────────────────────────────────────

/** Keyed hash of the visitor's IP (HMAC-SHA-256 with SESSION_SECRET): limits repeat enquiries without storing the IP. */
export const ipHash = (ip: string) => createHmac("sha256", appSecret()).update(`franchise-lead:${ip}`).digest("hex");

/** The visitor's IP as Cloudflare (or our own proxy) reports it; null when there's none that looks like an IP. */
export const clientIp = clientIpFrom;

export type EnquiryInput = RawLead & { website?: string | null };
export type EnquiryResult =
  | { ok: true; number: string | null; id?: string } // number null: the honeypot caught a bot (nothing stored)
  | { ok: false; error: string; fields?: LeadErrors };

/**
 * A franchise enquiry from the site: honeypot, validation, limits (3 per connection an hour, 2 per email address a
 * day), then the lead (FL-000123), its audit entry, and two emails (the team's notification and the enquirer's
 * acknowledgement). An email that can't be sent never loses the enquiry.
 */
export async function createLead(input: EnquiryInput, meta: { ip?: string | null } = {}): Promise<EnquiryResult> {
  // People never see the "website" field; form-filling bots do. They get the same thank-you, and nothing is kept.
  if (typeof input.website === "string" && input.website.trim()) return { ok: true, number: null };
  const check = validateLead(input);
  if (!check.ok) return { ok: false, error: "Please check the highlighted fields.", fields: check.fields };
  const data = check.data;
  const hash = meta.ip ? ipHash(meta.ip) : null;
  const now = Date.now();
  const [fromIp, fromEmail] = await Promise.all([
    hash ? db.franchiseLead.count({ where: { ipHash: hash, createdAt: { gte: new Date(now - HOUR) } } }) : 0,
    db.franchiseLead.count({ where: { email: data.email, createdAt: { gte: new Date(now - 24 * HOUR) } } }),
  ]);
  if (fromEmail >= LEAD_LIMITS.perEmailDay)
    return { ok: false, error: `We already have your enquiry from today, so there's no need to send it again: we'll reply by email within a few working days. To add something, email ${franchiseEmail()}.` };
  if (fromIp >= LEAD_LIMITS.perIpHour)
    return { ok: false, error: `We've had several enquiries from your connection in the last hour, so we've paused new ones for a while. Please try again later, or email ${franchiseEmail()}.` };

  const lead = await tx(async (t) => {
    const number = leadNumber(await nextNumber(t, "FRANCHISE_LEAD"));
    const row = await t.franchiseLead.create({ data: { ...data, number, ipHash: hash } });
    await audit(t, SITE, "lead.create", { entity: "FranchiseLead", entityId: row.id, data: { number, area: row.area } });
    return row;
  });
  await notify(lead);
  return { ok: true, number: lead.number, id: lead.id };
}

// ── Emails ──────────────────────────────────────────────────────────────────
// Logged under known ids (not sendEmail's random ones), so erasing a lead's emails is a key lookup rather than a
// search through the whole message log.
const logIds = (leadId: string) => [`lead-ack-${leadId}`, `lead-team-${leadId}`] as const;

async function sendLogged(id: string, e: Email) {
  let reason: string | null = null;
  let delivered = false;
  try {
    delivered = await deliverEmail(e);
  } catch (err) {
    reason = String((err as Error)?.message ?? err).slice(0, 300);
    console.error("[leads] email failed", id, reason);
  }
  await db.messageLog.create({
    data: {
      id, channel: "EMAIL", to: e.to, kind: "TRANSACTIONAL", status: reason ? "FAILED" : "SENT",
      body: `${e.subject}\n\n${e.text}`, reason: reason ?? (delivered ? null : "logged (MS_* not set)"),
    },
  });
}

const para = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:23px">${s}</p>`;

async function notify(l: FranchiseLead) {
  const where = `${l.area}${l.province && Object.hasOwn(PROVINCES, l.province) ? `, ${PROVINCES[l.province as keyof typeof PROVINCES]}` : ""}`;
  const link = `${APP_URL()}/hq/franchise/${l.id}`;
  const team = franchiseEmail();
  const facts: [string, string][] = [
    ["Where", where],
    [CAPITAL_LABEL, capitalLabel(l.capital)],
    ["Pharmacist partner", l.pharmacist ? "Yes" : "No"],
    ...(l.source ? ([["Came from", l.source]] as [string, string][]) : []),
  ];
  const steps = [
    "We read every enquiry and reply by email within a few working days.",
    "If it looks like a fit, we'll invite you to an information evening to meet the team and see how a Herbal Holland store works.",
    `If you'd like to go further, you'll get our disclosure document at least ${DISCLOSURE_DAYS} days before anything is signed, as the Consumer Protection Act's franchise regulations require.`,
  ];
  const results = await Promise.allSettled([
    // The team: what it's about and where to open it. Contact details stay in HQ, out of inboxes.
    sendLogged(logIds(l.id)[1], {
      to: team,
      subject: `New franchise enquiry ${l.number}: ${where}`,
      text: [`A new franchise enquiry came in on herbalholland.com.`, "", ...facts.map(([k, v]) => `${k}: ${v}`), "", `Open it in HQ: ${link}`, "", "Their contact details and what they wrote are in HQ; we keep them out of email (POPIA)."].join("\n"),
      html: emailLayout({
        preheader: `${where} · ${capitalLabel(l.capital)}`,
        heading: `Franchise enquiry ${l.number}`,
        body:
          para("A new franchise enquiry came in on herbalholland.com.") +
          `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px;font-size:14px;line-height:21px">${facts.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#6B5F57">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>` +
          para("Their contact details and what they wrote are in HQ; we keep them out of email (POPIA)."),
        cta: { label: "Open it in HQ", href: link },
        footerHtml: "Sent to the franchise team because a franchise enquiry arrived.",
      }),
    }),
    // The enquirer: a one-off acknowledgement with their reference, and no marketing.
    sendLogged(logIds(l.id)[0], {
      to: l.email,
      subject: `Your franchise enquiry ${l.number}`,
      text: [
        `Hello ${firstName(l.name)},`,
        "",
        `Thank you for your interest in opening a Herbal Holland store. We have your enquiry: your reference is ${l.number}.`,
        "",
        "What happens next",
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        `Questions in the meantime? Reply to this email or write to ${team}, quoting ${l.number}.`,
        "",
        "Herbal Holland",
      ].join("\n"),
      html: emailLayout({
        preheader: `Your reference is ${l.number}. We reply within a few working days.`,
        heading: `Thank you, ${firstName(l.name)}`,
        body:
          para(`Thank you for your interest in opening a Herbal Holland store. We have your enquiry: your reference is <b>${esc(l.number)}</b>.`) +
          `<p style="margin:18px 0 8px;font-size:15px"><b>What happens next</b></p><ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:23px">${steps.map((s) => `<li style="margin:0 0 8px">${esc(s)}</li>`).join("")}</ol>` +
          para(`Questions in the meantime? Reply to this email or write to <a href="mailto:${esc(team)}" style="color:#C05F18">${esc(team)}</a>, quoting ${esc(l.number)}.`),
        footerHtml: "You're receiving this because you sent a franchise enquiry on herbalholland.com. It's a one-off reply: we won't add you to a mailing list.",
      }),
      headers: { "Reply-To": team },
    }),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("[leads] couldn't log an enquiry email", r.reason);
}

/** Blanks a lead's two emails in the message log (the enquirer's address and name, what they were told). */
async function eraseMessages(t: Tx, leadIds: string[]) {
  if (!leadIds.length) return;
  await inBatches(leadIds.flatMap(logIds), (part) => t.messageLog.updateMany({ where: { id: { in: part } }, data: { to: "[erased]", body: "[erased with the franchise enquiry]" } }).then((r) => [r]));
}

// ── Working a lead (HQ) ─────────────────────────────────────────────────────

export type LeadPatch = {
  status?: LeadStatusKey;
  /** The status the person saw: if someone moved the lead meanwhile, nothing changes. */
  expectStatus?: LeadStatusKey;
  /** The lead's last change when the form was opened: guards the notes against overwriting someone else's edit. */
  expectUpdatedAt?: Date;
  /** With a status change: a dated line added to the notes. */
  note?: string | null;
  ownerId?: string | null;
  notes?: string | null;
  disclosureSentAt?: Date | null;
};

const tidy = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
const day = (d: Date | null) => (d ? dayKey(d) : null);

/**
 * Moves a lead on, assigns it, edits its notes or records when the disclosure document went out (any mix), checked
 * against the pipeline rules (a signed agreement no sooner than 14 days after the disclosure document) and audited
 * as `lead.update` with each change's from/to. Throws LeadError with a message for the person.
 */
export async function updateLead(id: string, patch: LeadPatch, actor: Actor, now = new Date()) {
  const lead = await db.franchiseLead.findUnique({ where: { id } });
  if (!lead) throw new LeadError("That enquiry isn't here any more: it may have been deleted.");
  if (patch.expectStatus && patch.expectStatus !== lead.status)
    throw new LeadError(`Someone moved it to “${LEAD_STATUS[lead.status].label}” a moment ago. Refresh to see where it stands.`);
  if (patch.expectUpdatedAt && patch.expectUpdatedAt.getTime() !== lead.updatedAt.getTime())
    throw new LeadError("Someone else changed this lead since you opened it. Copy what you typed, refresh and try again.");

  const data: Prisma.FranchiseLeadUpdateManyMutationInput = {};
  const change: Record<string, Prisma.InputJsonValue> = {};
  const status = patch.status && patch.status !== lead.status ? patch.status : lead.status;

  // When the disclosure document went out (a SAST day).
  let disclosure = lead.disclosureSentAt;
  if (patch.disclosureSentAt !== undefined) {
    const next = patch.disclosureSentAt ? startOfDaySA(patch.disclosureSentAt) : null;
    if (day(next) !== day(lead.disclosureSentAt)) {
      const why = checkDisclosureDate(status, next, now);
      if (why) throw new LeadError(why, "sentOn");
      disclosure = next;
      data.disclosureSentAt = next;
      change.disclosureSentAt = { from: day(lead.disclosureSentAt), to: day(next) };
    }
  }

  let notes = lead.notes;
  if (patch.notes !== undefined) {
    const next = tidy(patch.notes) || null;
    if (next && next.length > LEAD_LIMITS.notes) throw new LeadError(`Keep the notes under ${LEAD_LIMITS.notes.toLocaleString("en-US")} characters.`, "notes");
    if (next !== (lead.notes ?? null)) {
      notes = next;
      data.notes = next;
      change.notes = "edited";
    }
  }

  if (status !== lead.status) {
    const why = checkMove(lead.status, status, { disclosureSentAt: disclosure, now });
    if (why) throw new LeadError(why);
    data.status = status;
    change.status = { from: lead.status, to: status };
    const note = tidy(patch.note);
    if (note.length > LEAD_LIMITS.note) throw new LeadError(`Keep the note under ${LEAD_LIMITS.note.toLocaleString("en-US")} characters.`, "note");
    if (note) {
      notes = appendNote(notes, noteLine({ at: now, by: actor.name ?? "HQ", from: lead.status, to: status, note }));
      if (notes.length > LEAD_LIMITS.notes) throw new LeadError("The notes are full: tidy them up first, then add this note.", "note");
      data.notes = notes;
      change.note = "added";
    }
  } else if (tidy(patch.note)) throw new LeadError("A note goes with a status change: add it to the notes instead.", "note");

  if (patch.ownerId !== undefined && (patch.ownerId || null) !== lead.ownerId) {
    const ids = [lead.ownerId, patch.ownerId].filter((x): x is string => !!x);
    const people = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true, active: true } });
    const next = patch.ownerId ? people.find((p) => p.id === patch.ownerId) : null;
    if (patch.ownerId && (!next || !next.active || !LEAD_ROLES.includes(next.role)))
      throw new LeadError("Choose someone in the HQ team: franchise leads are followed up by HQ admin or HQ team members.", "ownerId");
    data.ownerId = next?.id ?? null;
    change.owner = { from: people.find((p) => p.id === lead.ownerId)?.name ?? null, to: next?.name ?? null };
  }

  if (!Object.keys(change).length) return { lead, changed: [] as string[] };
  const updated = await tx(async (t) => {
    // Only from the state this change was checked against: a concurrent move or edit changes nothing.
    const { count } = await t.franchiseLead.updateMany({ where: { id, status: lead.status, updatedAt: lead.updatedAt }, data });
    if (!count) throw new LeadError("Someone else changed this lead a moment ago. Refresh to see the latest.");
    await audit(t, actor, "lead.update", { entity: "FranchiseLead", entityId: id, data: { number: lead.number, ...change } });
    return t.franchiseLead.findUniqueOrThrow({ where: { id } });
  });
  return { lead: updated, changed: Object.keys(change) };
}

// ── The HQ list and its export ──────────────────────────────────────────────

/** ?status=: still being worked (default), everything, or one status. */
export type LeadView = "open" | "all" | LeadStatusKey;
export const leadView = (v?: string | null): LeadView => (v === "all" || isLeadStatus(v) ? v : "open");
export const viewWhere = (v: LeadView): Prisma.FranchiseLeadWhereInput =>
  v === "all" ? {} : v === "open" ? { status: { in: [...OPEN_STATUSES] } } : { status: v };

/** ?q=: a lead number (however it's typed), or part of a name, email address or area. */
export function leadSearch(raw?: string | null): Prisma.FranchiseLeadWhereInput {
  const q = (raw ?? "").trim().slice(0, 100);
  if (!q) return {};
  const like = { contains: q };
  const number = numberQuery(q);
  return { OR: [...(number ? [{ number }] : []), { number: like }, { name: like }, { email: like }, { area: like }] };
}

/** Deletes a lead and blanks its emails in the message log, for a data subject's request (POPIA s24). HQ admin only. */
export async function deleteLead(id: string, actor: Actor) {
  const lead = await db.franchiseLead.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!lead) throw new LeadError("That enquiry has already been deleted.");
  await tx(async (t) => {
    await t.franchiseLead.delete({ where: { id } });
    await eraseMessages(t, [id]);
    await audit(t, actor, "lead.delete", { entity: "FranchiseLead", entityId: id, data: { number: lead.number } });
  });
  return lead.number;
}

/** Deletes not-a-fit leads a year after their last change (POPIA: kept no longer than needed). Daily job; bounded. */
export async function purgeLeads(now = new Date()) {
  const cutoff = purgeCutoff(now);
  const where = { status: "NOT_A_FIT", updatedAt: { lt: cutoff } } satisfies Prisma.FranchiseLeadWhereInput;
  const due = await db.franchiseLead.findMany({ where, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 500 });
  if (!due.length) return { purged: 0 };
  const ids = due.map((l) => l.id);
  const purged = await tx(async (t) => {
    const count = (await inBatches(ids, (part) => t.franchiseLead.deleteMany({ where: { ...where, id: { in: part } } }).then((r) => [r.count]))).reduce((s, n) => s + n, 0);
    const kept = new Set((await inBatches(ids, (part) => t.franchiseLead.findMany({ where: { id: { in: part } }, select: { id: true } }))).map((l) => l.id)); // reopened meanwhile
    await eraseMessages(t, ids.filter((x) => !kept.has(x)));
    if (count) await audit(t, SYSTEM, "lead.purge", { entity: "FranchiseLead", data: { count, lastChangedBefore: fmtDate(cutoff) } });
    return count;
  });
  return { purged };
}
