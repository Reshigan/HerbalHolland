// Email transport. SMTP (any ESP — Amazon SES af-south-1, Everlytic, Postmark…) via
// SMTP_URL; without it, emails are written to the message log for review.
import { createTransport, type Transporter } from "nodemailer";
import { db } from "./db";

let transport: Transporter | null | undefined;
function smtp() {
  if (transport === undefined) transport = process.env.SMTP_URL ? createTransport(process.env.SMTP_URL) : null;
  return transport;
}

export type Email = { to: string; subject: string; html: string; text: string; customerId?: string | null; kind?: "TRANSACTIONAL" | "MARKETING" };

export async function sendEmail(e: Email) {
  const from = process.env.EMAIL_FROM ?? "Herbal Holland <invoices@herbalholland.co.za>";
  const t = smtp();
  if (t) await t.sendMail({ from, to: e.to, subject: e.subject, html: e.html, text: e.text });
  await db.messageLog.create({
    data: {
      channel: "EMAIL", to: e.to, kind: e.kind ?? "TRANSACTIONAL", status: "SENT", customerId: e.customerId,
      body: `${e.subject}\n\n${e.text}`, reason: t ? null : "logged (SMTP_URL not set)",
    },
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Branded, email-client-safe HTML shell (tables + inline styles). */
export function emailLayout(opts: { preheader: string; heading: string; body: string; cta?: { label: string; href: string } }) {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 32px 28px"><a href="${esc(opts.cta.href)}" style="display:inline-block;background:#F5913C;color:#0C0A09;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-family:Arial,sans-serif">${esc(opts.cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F4EFEA;padding:24px 0">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1A1614">
<tr><td style="background:#0C0A09;padding:22px 32px;border-bottom:6px solid #F5913C">
<span style="color:#F5913C;font-size:20px;letter-spacing:3px;font-weight:300">HERBAL</span> <span style="color:#F5913C;font-size:20px;letter-spacing:2px;font-weight:800">HOLLAND</span>
</td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 12px;font-size:22px">${esc(opts.heading)}</h1>${opts.body}</td></tr>
${cta}
<tr><td style="padding:18px 32px;background:#FBF6F1;color:#6B5F57;font-size:12px;line-height:18px">Herbal Holland · Adults 18+ only · Keep out of reach of children.<br/>You received this because you made a purchase. Manage email preferences in the Oranje Club.</td></tr>
</table></td></tr></table></body></html>`;
}
export { esc };
