// Print partner for made-to-order merch (see merch.ts). South African print-on-demand partners take orders by
// email — none has an API — so each paid order goes to them as a production order with links to our print files:
//   POD_EMAIL=orders@partner.co.za   where production orders go (also kept in HQ → Messages)
//   unset                            production orders are only recorded in HQ → Messages (development and demos)
// The partner prints, packs white-label and couriers to the customer, then emails back the tracking number, which
// the distribution centre enters on the order ("Merch shipped").
import { db } from "./db";
import { sendEmail, emailLayout, esc } from "./email";

export type PodItem = {
  code: string; // our product code for the partner (Variant.podSku)
  name: string;
  blank: string;
  size: string;
  qty: number;
  prints: { placement: string; technique: string; size: string; note: string; url: string }[];
};
export type PodOrder = {
  ref: string; // our order code
  recipient: { name: string; phone: string; email: string | null; addressLine: string; suburb: string; city: string; province: string; postalCode: string; notes: string | null };
  items: PodItem[];
};

export const partnerName = () => process.env.POD_PARTNER_NAME ?? "our print partner";

export async function sendProductionOrder(o: PodOrder) {
  const r = o.recipient;
  const address = [r.addressLine, r.suburb, r.city, r.province, r.postalCode].filter(Boolean).join(", ");
  const subject = `Production order ${o.ref} — Herbal Holland (${o.items.reduce((s, i) => s + i.qty, 0)} pcs)`;
  const text = [
    `Production order ${o.ref}. Please print, pack white-label and courier to:`,
    `${r.name} · ${r.phone}${r.email ? ` · ${r.email}` : ""}`,
    address + (r.notes ? ` (${r.notes})` : ""),
    "",
    ...o.items.flatMap((i) => [
      `${i.qty} × ${i.name} — ${i.blank}, size ${i.size} [${i.code}]`,
      ...i.prints.map((p) => `   ${p.placement}: ${p.technique}, ${p.size} — ${p.note}. File: ${p.url}`),
    ]),
    "",
    `Reply with the courier and tracking number when it ships. Our order reference: ${o.ref}.`,
  ].join("\n");
  const rows = o.items
    .map(
      (i) => `<tr><td style="padding:10px 0;border-top:1px solid #ECE5DD;vertical-align:top"><b>${i.qty} × ${esc(i.name)}</b><br/><span style="color:#6B5F57">${esc(i.blank)} · size ${esc(i.size)} · ${esc(i.code)}</span>
        ${i.prints.map((p) => `<br/><span style="font-size:13px">${esc(p.placement)}: ${esc(p.technique)}, ${esc(p.size)} — ${esc(p.note)} · <a href="${esc(p.url)}" style="color:#C05F18">print file</a></span>`).join("")}</td></tr>`,
    )
    .join("");
  const html = emailLayout({
    preheader: `Print, pack white-label and courier to ${r.name}, ${r.city}`,
    heading: `Production order ${o.ref}`,
    body: `<p style="margin:0 0 12px;font-size:15px;line-height:22px">Please print, pack white-label (no partner branding) and courier to:</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:22px"><b>${esc(r.name)}</b> · ${esc(r.phone)}${r.email ? ` · ${esc(r.email)}` : ""}<br/>${esc(address)}${r.notes ? `<br/><i>${esc(r.notes)}</i>` : ""}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family:Arial,sans-serif;font-size:14px;color:#1A1614">${rows}</table>
      <p style="margin:16px 0 0;font-size:14px;line-height:21px">Reply with the courier and tracking number when it ships, quoting <b>${esc(o.ref)}</b>. Print sizes and placements are in the brand book (Merch).</p>`,
  });
  const to = process.env.POD_EMAIL;
  if (to) return sendEmail({ to, subject, text, html });
  await db.messageLog.create({ data: { channel: "EMAIL", to: "print partner", kind: "TRANSACTIONAL", status: "SENT", body: `${subject}\n\n${text}`, reason: "logged (POD_EMAIL not set)" } });
}
