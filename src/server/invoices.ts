// Tax invoices (SARS): every sale is invoiced by email. Abridged tax invoice up to
// R5,000; full tax invoice above (recipient name/address/VAT no.). Non-VAT vendors
// issue a plain invoice. Each invoice also has a hosted, printable copy (/invoice/[id]?t=…).
// The emails themselves are rendered by email-templates.ts (pure, unit-tested).
import { createHmac } from "node:crypto";
import { db } from "./db";
import { sendEmail } from "./email";
import { APP_URL, saleInvoiceEmail, statementEmail, stockOrderInvoiceEmail } from "./email-templates";
import { receivedValue } from "./stock-orders";
import { franchiseStatement } from "./finance";
import { tradeInvoiceEmail } from "./trade/emails";

export { APP_URL };
export const invoiceToken = (id: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(`invoice:${id}`).digest("base64url").slice(0, 22);
export const invoiceUrl = (saleId: string) => `${APP_URL()}/invoice/${saleId}?t=${invoiceToken(saleId)}`;

export async function invoiceData(saleId: string) {
  return db.sale.findUnique({
    where: { id: saleId },
    include: {
      store: { include: { company: true } },
      customer: true,
      tradeAccount: { select: { id: true, number: true, name: true, legalName: true, vatNumber: true, email: true } },
      staff: { select: { name: true } },
      lines: { include: { variant: { include: { product: { select: { name: true, regClass: true } } } } } },
      payments: true,
      refundOf: { select: { number: true } },
    },
  });
}
export type InvoiceData = NonNullable<Awaited<ReturnType<typeof invoiceData>>>;

/**
 * Consumer sales: abridged or full tax invoice by the seller's VAT status. A WHOLESALE (trade) sale is always a full
 * tax invoice — the buyer block (legal name, address, VAT number) is on the sale — titled "Tax Invoice" when the
 * seller is a VAT vendor (SARS: only vendors issue tax invoices; a non-vendor franchisee's till issues an "Invoice").
 */
export function invoiceTitle(s: Pick<InvoiceData, "kind" | "channel" | "store">) {
  if (s.kind === "REFUND") return s.store.company.vatNumber ? "Credit Note" : "Refund";
  return s.store.company.vatNumber ? "Tax Invoice" : "Invoice";
}

/** Where a sale's invoice goes by default: a trade sale to the account's billing address, a consumer sale to the member. */
export const invoiceRecipient = (s: Pick<InvoiceData, "channel" | "customer" | "tradeAccount">) => (s.channel === "WHOLESALE" ? s.tradeAccount?.email : s.customer?.email) ?? null;

type Allocation = { batchId?: string | null };

/** Batch numbers per sale line (from its FEFO allocations), for traceability on invoices. Line id → batch codes. */
export async function saleBatchCodes(lines: { id: string; allocations: unknown }[]) {
  const wanted = new Map<string, string[]>();
  for (const l of lines) {
    const ids = ((l.allocations as Allocation[] | null) ?? []).map((a) => a.batchId).filter((b): b is string => !!b);
    if (ids.length) wanted.set(l.id, [...new Set(ids)]);
  }
  const all = [...new Set([...wanted.values()].flat())];
  if (!all.length) return {} as Record<string, string[]>;
  const batches = new Map((await db.batch.findMany({ where: { id: { in: all } }, select: { id: true, code: true } })).map((b) => [b.id, b.code]));
  const out: Record<string, string[]> = {};
  for (const [lineId, ids] of wanted) {
    const codes = ids.map((id) => batches.get(id)).filter((c): c is string => !!c);
    if (codes.length) out[lineId] = codes;
  }
  return out;
}

export async function emailSaleInvoice(saleId: string, to?: string) {
  const s = await invoiceData(saleId);
  if (!s) return;
  const email = to ?? invoiceRecipient(s);
  if (!email) return;
  if (s.channel === "WHOLESALE") {
    // Trade: the full tax invoice (or credit note) with the buyer block, lines ex VAT, the order and when it's due.
    const [batchCodes, order, entry] = await Promise.all([
      saleBatchCodes(s.lines),
      db.tradeOrder.findUnique({ where: { saleId: s.id }, select: { number: true, reference: true, handlingCents: true, deliveryCents: true } }),
      db.tradeLedgerEntry.findFirst({ where: { saleId: s.id, kind: "INVOICE" }, select: { dueAt: true } }),
    ]);
    const r = tradeInvoiceEmail(s, { url: invoiceUrl(s.id), batchCodes, orderNumber: order?.number, orderRef: order?.reference, dueAt: entry?.dueAt, handlingCents: order?.handlingCents, deliveryCents: order?.deliveryCents });
    await sendEmail({ ...r, to: email });
    await db.sale.update({ where: { id: s.id }, data: { invoiceEmail: email, invoiceSentAt: new Date() } });
    return;
  }
  const [batchCodes, order] = await Promise.all([saleBatchCodes(s.lines), s.orderId ? db.order.findUnique({ where: { id: s.orderId }, select: { code: true } }) : null]);
  const r = saleInvoiceEmail(s, { url: invoiceUrl(s.id), batchCodes, orderCode: order?.code });
  await sendEmail({ ...r, to: email, customerId: s.customerId });
  await db.sale.update({ where: { id: s.id }, data: { invoiceEmail: email, invoiceSentAt: new Date() } });
}

/** Fire-and-forget so a mail outage never blocks the till; the address is kept so the scheduler retries failures. */
export function queueSaleInvoice(saleId: string, to?: string) {
  (to ? db.sale.update({ where: { id: saleId }, data: { invoiceEmail: to } }) : Promise.resolve())
    .then(() => emailSaleInvoice(saleId, to))
    .catch((e) => console.error("[invoice] email failed", saleId, e));
}

export async function emailStockOrderInvoice(stockOrderId: string) {
  const o = await db.stockOrder.findUnique({
    where: { id: stockOrderId },
    include: { buyer: { include: { company: true } }, seller: { include: { company: true } }, lines: { include: { variant: { include: { product: true } } } } },
  });
  if (!o?.buyer.company.email) return;
  const value = o.status === "RECEIVED" ? receivedValue(o) : o.totalCents;
  const r = stockOrderInvoiceEmail(o, { url: `${APP_URL()}/store/${o.buyer.code}/purchasing/${o.id}`, valueInclCents: value });
  await sendEmail({ ...r, to: o.buyer.company.email });
  await db.stockOrder.update({ where: { id: o.id }, data: { invoiceSentAt: new Date() } });
}

export async function emailStatement(storeId: string, month: string) {
  const st = await franchiseStatement(storeId, month);
  const company = await db.company.findUniqueOrThrow({ where: { id: st.store.companyId } });
  if (!company.email) return;
  const r = statementEmail(st, company, { url: `${APP_URL()}/store/${st.store.code}/finance/statement?month=${month}` });
  await sendEmail({ ...r, to: company.email });
}
