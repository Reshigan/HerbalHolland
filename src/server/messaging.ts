// Messaging adapter. Every message lands in the message log (HQ → Messages) with its delivery status.
//   SMS    MESSAGING_PROVIDER=smsportal (SMSPORTAL_CLIENT_ID, SMSPORTAL_API_SECRET, optional SMS_SENDER_ID).
//          The default, "log", only records messages (development and demos).
//   Email  SMTP_URL (email.ts). Campaign emails carry a signed one-click unsubscribe link (RFC 8058).
//   Push   Web Push to the Rewards app (push.ts; VAPID keys).
//   WhatsApp has no provider (its commerce policy bans drug and medical products): with a live SMS provider, WhatsApp
//   messages are logged as FAILED rather than silently dropped.
// Copy rules for texts (sender name first, order code next, one GSM-7 segment where possible) live in @/lib/sms.
import { createHmac } from "node:crypto";
import { db } from "./db";
import { deliverEmail, sendEmail } from "./email";
import { APP_URL, campaignEmail, orderEmail, type OrderEvent } from "./email-templates";
import { pushToCustomer } from "./push";
import { gsmSafe, orderSms, shortLink } from "@/lib/sms";
import type { MsgChannel } from "@/generated/prisma/client";
import { appSecret } from "./secret";
import { safeEqual } from "./crypto";
import { addDays } from "@/lib/format";

export type OutboundMessage = {
  channel: MsgChannel;
  to: string;
  body: string;
  kind: "MARKETING" | "TRANSACTIONAL";
  customerId?: string | null;
  campaignId?: string | null;
  subject?: string; // email subject / push title
  url?: string; // push: where a tap opens
  logBody?: string; // what the log keeps when the body carries a secret (sign-in codes)
};

// ── Opt-out links (POPIA s69: every marketing message offers a free opt-out) ──

export const optOutToken = (customerId: string, channel: MsgChannel) =>
  createHmac("sha256", appSecret()).update(`optout:${customerId}:${channel}`).digest("base64url").slice(0, 22);

export const validOptOut = (customerId: string, channel: string, token: string) =>
  ["WHATSAPP", "SMS", "EMAIL", "PUSH"].includes(channel) && safeEqual(token, optOutToken(customerId, channel as MsgChannel));

const optOutQuery = (customerId: string, channel: MsgChannel) => `c=${customerId}&ch=${channel}&t=${optOutToken(customerId, channel)}`;

/** A short, tappable link into the app for texts: herbalholland.co.za/orders/X7K2P9. */
export const smsLink = (path: string) => shortLink(APP_URL(), path);

// ── Providers ──────────────────────────────────────────────────────────────────

async function smsPortal(msgs: OutboundMessage[]) {
  const auth = Buffer.from(`${process.env.SMSPORTAL_CLIENT_ID}:${process.env.SMSPORTAL_API_SECRET}`).toString("base64");
  const res = await fetch("https://rest.smsportal.com/v3/BulkMessages", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(process.env.SMS_SENDER_ID && { sendOptions: { senderId: process.env.SMS_SENDER_ID } }),
      messages: msgs.map((m) => ({ content: m.body, destination: m.to.replace(/^\+/, "") })), // ≤ 500 per request
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`SMSPortal ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** A campaign message as an email: branded layout, and the unsubscribe link + one-click headers on marketing only. */
function bulkEmail(m: OutboundMessage) {
  const q = m.kind === "MARKETING" && m.customerId ? optOutQuery(m.customerId, "EMAIL") : null;
  const page = q ? `${APP_URL()}/unsubscribe?${q}` : null;
  const r = campaignEmail({ subject: m.subject ?? "News from Herbal Holland", body: m.body, unsubscribeUrl: page });
  return {
    to: m.to,
    subject: r.subject,
    text: r.text,
    html: r.html,
    kind: m.kind,
    customerId: m.customerId,
    headers: q ? { "List-Unsubscribe": `<${APP_URL()}/api/unsubscribe?${q}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}

/** Hands one channel's messages to its provider; per message, null when delivered (or only logged) else the reason. */
async function deliver(channel: MsgChannel, msgs: OutboundMessage[]): Promise<(string | null)[]> {
  const reason = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);
  if (channel === "EMAIL") {
    const out: (string | null)[] = [];
    for (let i = 0; i < msgs.length; i += 10)
      out.push(...(await Promise.all(msgs.slice(i, i + 10).map((m) => deliverEmail(bulkEmail(m)).then(() => null, reason)))));
    return out;
  }
  if (channel === "PUSH")
    return Promise.all(
      msgs.map((m) =>
        m.customerId ? pushToCustomer(m.customerId, { title: m.subject ?? "Herbal Holland", body: m.body, url: m.url }).then(() => null, reason) : "No member",
      ),
    );
  const provider = process.env.MESSAGING_PROVIDER ?? "log";
  if (provider === "log") return msgs.map(() => null);
  if (channel === "SMS" && provider === "smsportal")
    return smsPortal(msgs).then(
      () => msgs.map(() => null),
      (e) => msgs.map(() => reason(e)),
    );
  return msgs.map(() => `No ${channel} provider configured`);
}

/** Texts go out in the GSM alphabet so one message stays one segment (a curly quote would double the cost). */
const tidy = (m: OutboundMessage): OutboundMessage => (m.channel === "SMS" ? { ...m, body: gsmSafe(m.body), logBody: m.logBody && gsmSafe(m.logBody) } : m);

const logRow = (m: OutboundMessage, reason: string | null) => ({
  channel: m.channel, to: m.to, body: m.logBody ?? m.body, kind: m.kind, customerId: m.customerId, campaignId: m.campaignId,
  status: reason ? "FAILED" : "SENT", reason,
});

/** Sends one message and logs it. Check `status` when the caller must know it arrived (sign-in codes). */
export async function send(msg: OutboundMessage) {
  const m = tidy(msg);
  const [reason] = await deliver(m.channel, [m]);
  if (reason) console.error("[messaging]", m.channel, reason);
  return db.messageLog.create({ data: logRow(m, reason) });
}

/**
 * Transactional messages default to SMS: WhatsApp's commerce policy prohibits drug and
 * medical products, so it is optional (utility templates, neutral wording) with SMS fallback.
 */
/** `logBody`: what the message log keeps instead, when the text carries something that must not be stored (a code). */
export function notifyCustomer(c: { id: string; phone: string }, body: string, logBody?: string) {
  const channel = process.env.TRANSACTIONAL_CHANNEL === "WHATSAPP" ? "WHATSAPP" : "SMS";
  return send({ channel, to: c.phone, body, logBody, kind: "TRANSACTIONAL", customerId: c.id });
}

// ── Online order updates ─────────────────────────────────────────────────────

export type OrderForNotice = {
  code: string;
  fulfilment: "COLLECT" | "SAME_DAY" | "COURIER";
  collectionCode: string;
  paymentStatus: string;
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  pointsRedeemed: number;
  totalCents: number;
  addressLine: string | null;
  suburb: string | null;
  city: string | null;
  postalCode: string | null;
  store: { name: string; addressLine: string; suburb: string; city: string };
  customer: { id: string; phone: string; firstName: string; email: string | null };
  lines: { qty: number; totalCents: number; variant: { name: string; product: { name: string } } }[];
};

/**
 * Tells the member where their order stands: a text (the primary channel, code first, one segment) and, when they
 * gave us an email address, the same news as a branded email with the order summary. An email outage never blocks
 * the order: the text has gone, the failure is in the message log.
 */
export async function notifyOrder(o: OrderForNotice, kind: OrderEvent, extra: { courier?: string | null; trackingNo?: string | null; ageRestricted?: boolean; refunded?: boolean; pointsEarned?: number | null } = {}) {
  const paid = o.paymentStatus === "PAID";
  await notifyCustomer(o.customer, orderSms(kind, { code: o.code, fulfilment: o.fulfilment, storeName: o.store.name, link: smsLink(`/orders/${o.code}`), collectionCode: o.collectionCode, courier: extra.courier, trackingNo: extra.trackingNo, ageRestricted: extra.ageRestricted, paid }));
  if (!o.customer.email) return;
  const r = orderEmail(kind, {
    code: o.code,
    fulfilment: o.fulfilment,
    store: o.store,
    customer: o.customer,
    lines: o.lines.map((l) => ({ name: l.variant.product.name, variant: l.variant.name, qty: l.qty, totalCents: l.totalCents })),
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    deliveryCents: o.deliveryCents,
    pointsRedeemed: o.pointsRedeemed,
    totalCents: o.totalCents,
    paid,
    collectionCode: o.collectionCode,
    address: [o.addressLine, o.suburb, o.city, o.postalCode].filter(Boolean).join(", ") || null,
    courier: extra.courier,
    trackingNo: extra.trackingNo,
    ageRestricted: extra.ageRestricted,
    refunded: extra.refunded,
    pointsEarned: extra.pointsEarned,
  });
  await sendEmail({ ...r, to: o.customer.email, customerId: o.customer.id }).catch((e) => console.error("[messaging] order email failed", o.code, e));
}

/** A batch (≤ 500, one channel) — campaigns and alerts. Returns how many were delivered; failures are logged per message. */
export async function sendBulk(
  rows: { campaignId?: string; customerId: string; to: string; channel: MsgChannel; body: string; subject?: string; url?: string }[],
  kind: OutboundMessage["kind"] = "MARKETING",
) {
  if (!rows.length) return 0;
  const msgs = rows.map((r): OutboundMessage => tidy({ ...r, kind }));
  const reasons = await deliver(rows[0].channel, msgs);
  await db.messageLog.createMany({ data: msgs.map((m, i) => logRow(m, reasons[i])) });
  return reasons.filter((r) => !r).length;
}

// ── Retention (POPIA: kept no longer than needed) ─────────────────────────────

/** How long a message's text is kept. No retention is set for the message log elsewhere, so 12 months. */
export const MESSAGE_BODY_DAYS = 365;
export const BODY_REMOVED = "[removed after 12 months]";

/**
 * Blanks the text of every message sent more than 12 months ago (daily job; safe to run again). The row stays, with
 * the recipient, channel, kind, status and time, as the record that it went out: campaign figures and the trade
 * statements' sent receipts read it.
 */
export async function purgeMessageBodies(now = new Date()) {
  const { count } = await db.messageLog.updateMany({
    where: { createdAt: { lt: addDays(now, -MESSAGE_BODY_DAYS) }, NOT: { body: BODY_REMOVED } },
    data: { body: BODY_REMOVED },
  });
  return { blanked: count };
}
