// Messaging adapter. Every message lands in the message log (HQ → Messages) with its delivery status.
//   SMS    MESSAGING_PROVIDER=smsportal (SMSPORTAL_CLIENT_ID, SMSPORTAL_API_SECRET, optional SMS_SENDER_ID).
//          The default, "log", only records messages (development and demos).
//   Email  SMTP_URL (email.ts). Campaign emails carry a signed one-click unsubscribe link (RFC 8058).
//   WhatsApp and push have no provider: WhatsApp's commerce policy bans drug and medical products and Rewards push is
//   on the roadmap, so with a live provider those messages are logged as FAILED rather than silently dropped.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { deliverEmail, emailLayout, esc } from "./email";
import { APP_URL } from "./invoices";
import type { MsgChannel } from "@/generated/prisma/client";

export type OutboundMessage = {
  channel: MsgChannel;
  to: string;
  body: string;
  kind: "MARKETING" | "TRANSACTIONAL";
  customerId?: string | null;
  campaignId?: string | null;
  subject?: string; // email only
  logBody?: string; // what the log keeps when the body carries a secret (sign-in codes)
};

// ── Opt-out links (POPIA s69: every marketing message offers a free opt-out) ──

export const optOutToken = (customerId: string, channel: MsgChannel) =>
  createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(`optout:${customerId}:${channel}`).digest("base64url").slice(0, 22);

export const validOptOut = (customerId: string, channel: string, token: string) =>
  ["WHATSAPP", "SMS", "EMAIL", "PUSH"].includes(channel) &&
  token.length === 22 &&
  timingSafeEqual(Buffer.from(token), Buffer.from(optOutToken(customerId, channel as MsgChannel)));

const optOutQuery = (customerId: string, channel: MsgChannel) => `c=${customerId}&ch=${channel}&t=${optOutToken(customerId, channel)}`;

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

function marketingEmail(m: OutboundMessage) {
  const q = m.customerId ? optOutQuery(m.customerId, "EMAIL") : null;
  const page = q && `${APP_URL()}/unsubscribe?${q}`;
  const subject = m.subject ?? "News from Herbal Holland";
  return {
    to: m.to,
    subject,
    text: page ? `${m.body}\n\nUnsubscribe: ${page}` : m.body,
    html: emailLayout({
      preheader: m.body.slice(0, 90),
      heading: subject,
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:23px">${esc(m.body).replaceAll("\n", "<br/>")}</p>`,
      footerHtml: `You're receiving this because you opted in to Herbal Holland Rewards emails.${page ? ` <a href="${esc(page)}" style="color:#6B5F57">Unsubscribe</a>` : ""}`,
    }),
    headers: q ? { "List-Unsubscribe": `<${APP_URL()}/api/unsubscribe?${q}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}

/** Hands one channel's messages to its provider; per message, null when delivered (or only logged) else the reason. */
async function deliver(channel: MsgChannel, msgs: OutboundMessage[]): Promise<(string | null)[]> {
  const reason = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 300);
  if (channel === "EMAIL") {
    const out: (string | null)[] = [];
    for (let i = 0; i < msgs.length; i += 10)
      out.push(...(await Promise.all(msgs.slice(i, i + 10).map((m) => deliverEmail(marketingEmail(m)).then(() => null, reason)))));
    return out;
  }
  const provider = process.env.MESSAGING_PROVIDER ?? "log";
  if (provider === "log") return msgs.map(() => null);
  if (channel === "SMS" && provider === "smsportal")
    return smsPortal(msgs).then(
      () => msgs.map(() => null),
      (e) => msgs.map(() => reason(e)),
    );
  return msgs.map(() => `No ${channel} provider configured`);
}

const logRow = (m: OutboundMessage, reason: string | null) => ({
  channel: m.channel, to: m.to, body: m.logBody ?? m.body, kind: m.kind, customerId: m.customerId, campaignId: m.campaignId,
  status: reason ? "FAILED" : "SENT", reason,
});

/** Sends one message and logs it. Check `status` when the caller must know it arrived (sign-in codes). */
export async function send(m: OutboundMessage) {
  const [reason] = await deliver(m.channel, [m]);
  if (reason) console.error("[messaging]", m.channel, reason);
  return db.messageLog.create({ data: logRow(m, reason) });
}

/**
 * Transactional messages default to SMS: WhatsApp's commerce policy prohibits drug and
 * medical products, so it is optional (utility templates, neutral wording) with SMS fallback.
 */
export function notifyCustomer(c: { id: string; phone: string }, body: string) {
  const channel = process.env.TRANSACTIONAL_CHANNEL === "WHATSAPP" ? "WHATSAPP" : "SMS";
  return send({ channel, to: c.phone, body, kind: "TRANSACTIONAL", customerId: c.id });
}

/** Campaign batch (≤ 500, one channel). Returns how many were delivered; failures are logged per message. */
export async function sendBulk(rows: { campaignId: string; customerId: string; to: string; channel: MsgChannel; body: string; subject?: string }[]) {
  if (!rows.length) return 0;
  const msgs = rows.map((r): OutboundMessage => ({ ...r, kind: "MARKETING" }));
  const reasons = await deliver(rows[0].channel, msgs);
  await db.messageLog.createMany({ data: msgs.map((m, i) => logRow(m, reasons[i])) });
  return reasons.filter((r) => !r).length;
}
