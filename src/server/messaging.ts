// Messaging adapter. In development messages are logged (visible in HQ → Messages).
// Production adapters: WhatsApp Business Platform via a BSP, bulk SMS, email.
import { db } from "./db";
import type { MsgChannel } from "@/generated/prisma/client";

export type OutboundMessage = {
  channel: MsgChannel;
  to: string;
  body: string;
  kind: "MARKETING" | "TRANSACTIONAL";
  customerId?: string | null;
  campaignId?: string | null;
};

export async function send(m: OutboundMessage) {
  const provider = process.env.MESSAGING_PROVIDER ?? "log";
  if (provider !== "log") {
    // Adapter slot: WhatsApp (Cloud API via BSP), SMS gateway, email ESP. See docs/INTEGRATIONS.md.
    throw new Error(`Messaging provider "${provider}" is not configured`);
  }
  return db.messageLog.create({
    data: { channel: m.channel, to: m.to, body: m.body, kind: m.kind, status: "SENT", customerId: m.customerId, campaignId: m.campaignId },
  });
}

/**
 * Transactional messages default to SMS: WhatsApp's commerce policy prohibits drug and
 * medical products, so it is optional (utility templates, neutral wording) with SMS fallback.
 */
export function notifyCustomer(c: { id: string; phone: string }, body: string) {
  const channel = process.env.TRANSACTIONAL_CHANNEL === "WHATSAPP" ? "WHATSAPP" : "SMS";
  return send({ channel, to: c.phone, body, kind: "TRANSACTIONAL", customerId: c.id });
}

/** Bulk marketing send. The log provider writes straight to the message log. */
export async function sendBulk(rows: { campaignId: string; customerId: string; to: string; channel: MsgChannel; body: string }[]) {
  if (!rows.length) return;
  if ((process.env.MESSAGING_PROVIDER ?? "log") !== "log") throw new Error("Bulk messaging provider not configured");
  await db.messageLog.createMany({ data: rows.map((r) => ({ ...r, kind: "MARKETING", status: "SENT" })) });
}
