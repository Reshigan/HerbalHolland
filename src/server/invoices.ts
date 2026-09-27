// Tax invoices (SARS): every sale is invoiced by email. Abridged tax invoice up to
// R5,000; full tax invoice above (recipient name/address/VAT no.). Non-VAT vendors
// issue a plain invoice. Each invoice also has a hosted, printable copy.
import { createHmac } from "node:crypto";
import { db } from "./db";
import { sendEmail, emailLayout, esc } from "./email";
import { zar } from "@/lib/money";
import { fmtDateTime, fmtMonth } from "@/lib/format";
import { guilders } from "@/lib/loyalty-rules";
import { receivedValue } from "./stock-orders";
import { franchiseStatement } from "./finance";

export const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";
export const invoiceToken = (id: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(`invoice:${id}`).digest("base64url").slice(0, 22);
export const invoiceUrl = (saleId: string) => `${APP_URL()}/invoice/${saleId}?t=${invoiceToken(saleId)}`;

export async function invoiceData(saleId: string) {
  return db.sale.findUnique({
    where: { id: saleId },
    include: {
      store: { include: { company: true } },
      customer: true,
      staff: { select: { name: true } },
      lines: { include: { variant: { include: { product: { select: { name: true } } } } } },
      payments: true,
      refundOf: { select: { number: true } },
    },
  });
}
export type InvoiceData = NonNullable<Awaited<ReturnType<typeof invoiceData>>>;

export function invoiceTitle(s: InvoiceData) {
  if (s.kind === "REFUND") return s.store.company.vatNumber ? "Credit Note" : "Refund";
  return s.store.company.vatNumber ? "Tax Invoice" : "Invoice";
}

const PAY_LABEL: Record<string, string> = { CARD: "Card", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Guilders", ONLINE: "Paid online" };

export async function emailSaleInvoice(saleId: string, to?: string) {
  const s = await invoiceData(saleId);
  if (!s) return;
  const email = to ?? s.customer?.email;
  if (!email) return;
  const title = invoiceTitle(s);
  const rows = s.lines
    .map(
      (l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #EFE9E3">${esc(l.variant.product.name)} · ${esc(l.variant.name)}<br/><span style="color:#968A80;font-size:12px">${l.qty} × ${zar(l.unitPriceCents)}${l.discountCents ? ` · saved ${zar(l.discountCents)}` : ""}</span></td><td align="right" style="padding:6px 0;border-bottom:1px solid #EFE9E3">${zar(l.totalCents)}</td></tr>`,
    )
    .join("");
  const pays = s.payments.map((p) => `${PAY_LABEL[p.method] ?? p.method} ${zar(p.amountCents)}`).join(" · ");
  const body = `
<p style="margin:0 0 16px;color:#6B5F57;font-size:14px;line-height:21px">${esc(s.store.company.legalName)} · Herbal Holland ${esc(s.store.name)}<br/>${esc(s.store.addressLine)}, ${esc(s.store.suburb)}, ${esc(s.store.city)}${s.store.company.vatNumber ? `<br/>VAT no. ${esc(s.store.company.vatNumber)}` : ""}</p>
<p style="margin:0 0 16px;font-size:14px"><b>${title} ${esc(s.number)}</b> · ${fmtDateTime(s.createdAt)}${s.refundOf ? ` · for ${esc(s.refundOf.number)}` : ""}</p>
<table role="presentation" width="100%" style="font-size:14px">${rows}
<tr><td style="padding:10px 0 0">Total${s.vatCents ? ` (incl. VAT ${zar(s.vatCents)})` : ""}</td><td align="right" style="padding:10px 0 0;font-size:18px"><b>${zar(s.totalCents)}</b></td></tr></table>
<p style="margin:14px 0 0;color:#6B5F57;font-size:13px">${esc(pays)}${s.pointsEarned > 0 ? ` · You earned ${guilders(s.pointsEarned)}` : ""}</p>`;
  const text = `${title} ${s.number}\n${s.store.company.legalName} — ${s.store.name}\n${s.lines.map((l) => `${l.qty} x ${l.variant.product.name} ${l.variant.name}  ${zar(l.totalCents)}`).join("\n")}\nTotal ${zar(s.totalCents)}${s.vatCents ? ` (VAT ${zar(s.vatCents)})` : ""}\nView: ${invoiceUrl(s.id)}`;
  await sendEmail({
    to: email,
    customerId: s.customerId,
    subject: `Your Herbal Holland ${title.toLowerCase()} ${s.number}`,
    text,
    html: emailLayout({ preheader: `${title} ${s.number} — ${zar(s.totalCents)}`, heading: `Thanks${s.customer ? `, ${s.customer.firstName}` : ""}`, body, cta: { label: "View or print invoice", href: invoiceUrl(s.id) } }),
  });
  await db.sale.update({ where: { id: s.id }, data: { invoiceEmail: email, invoiceSentAt: new Date() } });
}

/** Fire-and-forget wrapper so a mail outage never blocks the till. */
export function queueSaleInvoice(saleId: string, to?: string) {
  emailSaleInvoice(saleId, to).catch((e) => console.error("[invoice] email failed", saleId, e));
}

export async function emailStockOrderInvoice(stockOrderId: string) {
  const o = await db.stockOrder.findUnique({
    where: { id: stockOrderId },
    include: { buyer: { include: { company: true } }, seller: { include: { company: true } }, lines: { include: { variant: { include: { product: true } } } } },
  });
  if (!o?.buyer.company.email) return;
  const value = o.status === "RECEIVED" ? receivedValue(o) : o.totalCents;
  const rows = o.lines
    .map((l) => `<tr><td style="padding:5px 0;border-bottom:1px solid #EFE9E3">${esc(l.variant.product.name)} · ${esc(l.variant.name)}</td><td align="right">${l.receivedQty ?? l.qty}</td><td align="right">${zar(l.unitCostCents)}</td></tr>`)
    .join("");
  const body = `<p style="font-size:14px;color:#6B5F57">From ${esc(o.seller.company.legalName)} (${esc(o.seller.name)})${o.seller.company.vatNumber ? `, VAT ${esc(o.seller.company.vatNumber)}` : ""}<br/>To ${esc(o.buyer.company.legalName)} (${esc(o.buyer.name)})${o.buyer.company.vatNumber ? `, VAT ${esc(o.buyer.company.vatNumber)}` : ""}</p>
<table role="presentation" width="100%" style="font-size:13px"><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Unit (ex VAT)</th></tr>${rows}</table>
<p style="font-size:16px"><b>Total ${zar(value)}</b> incl. VAT · settled on your monthly franchise statement</p>`;
  await sendEmail({
    to: o.buyer.company.email,
    subject: `Tax Invoice ${o.number} — ${o.seller.name}`,
    text: `Tax Invoice ${o.number}\nTotal ${zar(value)} incl. VAT`,
    html: emailLayout({ preheader: `Invoice ${o.number}`, heading: `Tax Invoice ${o.number}`, body, cta: { label: "Open in back office", href: `${APP_URL()}/store/${o.buyer.code}/purchasing/${o.id}` } }),
  });
  await db.stockOrder.update({ where: { id: o.id }, data: { invoiceSentAt: new Date() } });
}

export async function emailStatement(storeId: string, month: string) {
  const st = await franchiseStatement(storeId, month);
  const company = await db.company.findUniqueOrThrow({ where: { id: st.store.companyId } });
  if (!company.email) return;
  const rows = st.lines
    .map((l) => `<tr><td style="padding:5px 0;border-bottom:1px solid #EFE9E3">${esc(l.label)}<br/><span style="color:#968A80;font-size:12px">${esc(l.detail)}</span></td><td align="right">${l.kind === "debit" ? "−" : ""}${zar(l.cents)}</td></tr>`)
    .join("");
  const net = st.net >= 0 ? `HQ pays you ${zar(st.net)}` : `Amount due to HQ: ${zar(-st.net)}`;
  await sendEmail({
    to: company.email,
    subject: `Franchise statement — ${st.store.name}, ${fmtMonth(`${month}-01`)}`,
    text: `${net}`,
    html: emailLayout({ preheader: net, heading: `${fmtMonth(`${month}-01`)} statement`, body: `<table role="presentation" width="100%" style="font-size:13px">${rows}</table><p style="font-size:16px"><b>${net}</b></p>`, cta: { label: "View statement", href: `${APP_URL()}/store/${st.store.code}/finance/statement?month=${month}` } }),
  });
}
