// Email transport. SMTP (any ESP, e.g. Amazon SES af-south-1, Everlytic, Postmark…) via
// SMTP_URL; without it, emails are written to the message log for review (HQ → Messages).
// The layout and templates live in email-templates.ts (pure, unit-tested); this file only delivers and logs.
import { createTransport, type Transporter } from "nodemailer";
import { db } from "./db";
import { esc, emailLayout, LEGAL_MARK, legalLine } from "./email-templates";

let transport: Transporter | null | undefined;
function smtp() {
  // Short timeouts: a mail host that hangs must fail one send in seconds, not hold up every send in a job for minutes.
  if (transport === undefined) transport = process.env.SMTP_URL ? createTransport({ url: process.env.SMTP_URL, pool: true, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 }) : null;
  return transport;
}

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  logText?: string; // what the message log keeps instead of `text`, when the text carries a link that is a credential
  customerId?: string | null;
  kind?: "TRANSACTIONAL" | "MARKETING";
  headers?: Record<string, string>;
};

// ── Sender identity ────────────────────────────────────────────────────────────
// The footer's legal line comes from the franchisor Company record (HQ → Stores → the distribution centre → Owner), cached briefly so a
// burst of invoices doesn't query it every time. A database hiccup never stops an email: the brand name stands in.
type Sender = { legalName: string; regNumber: string | null; vatNumber: string | null; address: string | null; phone: string | null; email: string | null } | null;
let sender: { at: number; value: Sender } | undefined;
const SENDER_TTL = 10 * 60_000;

export async function senderIdentity(): Promise<Sender> {
  if (sender && Date.now() - sender.at < SENDER_TTL) return sender.value;
  try {
    const c = await db.company.findFirst({ where: { kind: "FRANCHISOR" }, select: { legalName: true, regNumber: true, vatNumber: true, address: true, phone: true, email: true } });
    sender = { at: Date.now(), value: c };
  } catch (e) {
    console.error("[email] couldn't read the franchisor company for the footer", e);
    sender = { at: Date.now() - SENDER_TTL + 30_000, value: sender?.value ?? null };
  }
  return sender.value;
}

/** Fills the layout's legal line (HTML) and appends it to the plain text. Safe to call twice: the mark is consumed once. */
export async function finalizeEmail(e: Email): Promise<Email> {
  if (!e.html.includes(LEGAL_MARK)) return e;
  const line = legalLine(await senderIdentity());
  return { ...e, html: e.html.replace(LEGAL_MARK, esc(line)), text: `${e.text.trimEnd()}\n\n${line}\nAdults 18+ only. Keep out of reach of children.` };
}

/** Hands an email to SMTP; false when SMTP_URL isn't set (nothing sent). Throws on SMTP failure. */
export async function deliverEmail(e: Email) {
  const m = await finalizeEmail(e);
  const t = smtp();
  if (!t) return false;
  const from = process.env.EMAIL_FROM ?? "Herbal Holland <invoices@herbalholland.com>";
  await t.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text, headers: m.headers });
  return true;
}

/** Sends and logs. An SMTP failure is logged as FAILED (with the reason) and rethrown so callers can retry or tell the user. */
export async function sendEmail(e: Email) {
  const m = await finalizeEmail(e);
  const row = { channel: "EMAIL" as const, to: m.to, kind: m.kind ?? ("TRANSACTIONAL" as const), customerId: m.customerId, body: `${m.subject}\n\n${e.logText ?? m.text}` };
  let delivered = false;
  try {
    delivered = await deliverEmail(m);
  } catch (err) {
    await db.messageLog.create({ data: { ...row, status: "FAILED", reason: String((err as Error)?.message ?? err).slice(0, 300) } }).catch(() => {});
    throw err;
  }
  await db.messageLog.create({ data: { ...row, status: "SENT", reason: delivered ? null : "logged (SMTP_URL not set)" } });
}

export { esc, emailLayout };
