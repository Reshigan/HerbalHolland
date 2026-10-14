// Renders every email template with the test fixtures to test-results/emails/ (an index.html plus one .html and
// .txt per email) so the design can be checked in a browser or sent through an email-client preview service.
//   npx tsx scripts/preview-emails.ts [outdir]
// No database or SMTP is touched: the footer's legal line is filled with a sample franchisor.
// On the server, `--send you@example.com` instead sends every one (subject "[Test] …") through the live transport
// (Microsoft 365 or SMTP), with the real franchisor footer, to check the branding in real mail clients.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deliverEmail } from "@/server/email";
import { EMAIL_LOGO_CID } from "@/server/email-logo";
import { campaignEmail, LEGAL_MARK, legalLine, orderEmail, saleInvoiceEmail, statementEmail, stockOrderInvoiceEmail, zReportEmail, esc } from "@/server/email-templates";
import { TRICKY, courierOrder, order, refund, sale, statement, statementCompany, stockOrder, stockOrderValueIncl, tradeSale, zReport } from "../tests/fixtures/emails";
import { tradeApplicationReceivedEmail, tradeApprovedEmail, tradeCodeEmail, tradeInvoiceEmail, tradeLicenceExpiringEmail, tradeOnHoldEmail, tradeOrderEmail, tradeProFormaEmail, tradeStatementEmail, type TradeOrderEmailInfo } from "@/server/trade/emails";

const sendTo = process.argv[2] === "--send" ? process.argv[3] : undefined;
const out = (!sendTo && process.argv[2]) || "test-results/emails";
mkdirSync(out, { recursive: true });
const base = process.env.APP_URL ?? "https://shop.herbalholland.com";
const legal = legalLine({ legalName: "Herbal Holland (Pty) Ltd", regNumber: "2024/481516/07", vatNumber: "4870123456", address: "Herbal Holland House, 1 Windmill Lane, Irene, Centurion, 0157", phone: "012 004 4200", email: "hello@herbalholland.com" });

const tradeAccount = { number: "TA-000001", name: "Hatfield Pharmacy", legalName: "Hatfield Pharmacy (Pty) Ltd", email: "accounts@hatfield.co.za", terms: "ACCOUNT" as const, creditLimitCents: 1_000_000, paymentDays: 30, classes: ["CBD", "CBD_FOOD"] };
const tradeTerms = { minOrderCents: 200_000, deliveryCents: 15_000, freeDeliveryOverCents: 500_000, collectHandlingCents: 7_500, eftHoldDays: 3 };
const tradeOrder: TradeOrderEmailInfo = {
  number: "TO-000007", fulfilment: "COLLECT", payMethod: "ACCOUNT", subtotalCents: 216_000, deliveryCents: 0, handlingCents: 7_500, vatCents: 33_525, totalCents: 257_025, address: null, reference: "PO-55",
  store: { name: "Hatfield", addressLine: "1 Burnett St", suburb: "Hatfield", city: "Pretoria" }, collectionCode: "482913", invoiceNumber: "TI-000003",
  lines: [{ name: "Calm CBD Oil · 30ml", qty: 12, unitCents: 18_000, exCents: 216_000, vatCents: 32_400, shippedQty: 6 }],
};
const emails = {
  "tax-invoice": saleInvoiceEmail(sale, { url: `${base}/invoice/sale-1?t=preview`, batchCodes: { l1: ["HH-2609-0192"] }, orderCode: "X7K2P9" }),
  "credit-note": saleInvoiceEmail(refund, { url: `${base}/invoice/sale-2?t=preview` }),
  "stock-order-invoice": stockOrderInvoiceEmail(stockOrder, { url: `${base}/store/PTA01/purchasing/so-1`, valueInclCents: stockOrderValueIncl }),
  "franchise-statement": statementEmail(statement, statementCompany, { url: `${base}/store/PTA01/finance/statement?month=2026-08` }),
  "z-report": zReportEmail(zReport, { url: `${base}/store/PTA01/cash-ups/shift-9f2a7c1d/z-report` }),
  "order-placed-collect": orderEmail("placed", order),
  "order-placed-pay-in-store": orderEmail("placed", { ...order, paid: false }),
  "order-placed-courier": orderEmail("placed", courierOrder),
  "order-ready": orderEmail("ready", order),
  "order-dispatched": orderEmail("dispatched", courierOrder),
  "order-delivered": orderEmail("delivered", courierOrder),
  "order-collected": orderEmail("collected", order),
  "order-cancelled-refunded": orderEmail("cancelled", { ...courierOrder, refunded: true }),
  "trade-code": tradeCodeEmail({ code: "483 921", minutes: 10 }),
  "trade-application-received": tradeApplicationReceivedEmail({ account: tradeAccount, buyerName: "Thandi" }),
  "trade-approved": tradeApprovedEmail({ account: tradeAccount, terms: tradeTerms, url: `${base}/trade/login` }),
  "trade-pro-forma": tradeProFormaEmail({ order: { ...tradeOrder, fulfilment: "COURIER", payMethod: "EFT", address: "12 Burnett St, Hatfield, Pretoria, 0083" }, account: tradeAccount, bank: { bank: "FNB", accountName: "Herbal Holland (Pty) Ltd", accountNumber: "62000000000", branchCode: "250655" }, holdDays: 3, url: `${base}/trade/orders/1` }),
  "trade-order-confirmed": tradeOrderEmail("confirmed", { order: tradeOrder, account: tradeAccount, url: `${base}/trade/orders/1` }),
  "trade-order-ready": tradeOrderEmail("ready", { order: tradeOrder, account: tradeAccount, url: `${base}/trade/orders/1` }),
  "trade-order-shipped": tradeOrderEmail("shipped", { order: { ...tradeOrder, fulfilment: "COURIER", address: "12 Burnett St, Hatfield, Pretoria, 0083", courier: "The Courier Guy", trackingNo: "TCG123456789" }, account: tradeAccount, url: `${base}/trade/orders/1` }),
  "trade-invoice": tradeInvoiceEmail({ ...tradeSale, lines: tradeSale.lines.map((l) => ({ ...l, vatCents: l.vatCents ?? 0 })), buyer: { name: "Hatfield Pharmacy (Pty) Ltd", address: "12 Burnett St, Hatfield, Pretoria, 0083", vatNumber: "4123456789" }, tradeAccount: { number: tradeAccount.number, name: tradeAccount.name, legalName: tradeAccount.legalName, vatNumber: "4123456789" }, refundOf: null }, { url: `${base}/invoice/sale-3?t=preview`, orderNumber: "TO-000007", orderRef: "PO-55" }),
  "trade-statement": tradeStatementEmail({ account: tradeAccount, month: "2026-09", opening: 0, lines: [{ at: new Date("2026-09-15T09:00:00+02:00"), kind: "INVOICE", reference: "TI-000003", note: null, debitCents: 257_025, creditCents: 0, balanceCents: 257_025 }], closing: 257_025, ageing: { current: 257_025, d30: 0, d60: 0, d90plus: 0, overdue: 0, total: 257_025 }, url: `${base}/trade/statements/2026-09` }),
  "trade-on-hold": tradeOnHoldEmail({ account: { ...tradeAccount, holdReason: "Overdue balance" }, reason: "Your September statement is 14 days overdue", balanceCents: 257_025, overdueCents: 257_025, url: `${base}/trade/statements/2026-09` }),
  "trade-licence-expiring": tradeLicenceExpiringEmail({ account: tradeAccount, licence: "Pharmacy licence", expiresAt: new Date("2026-11-30"), url: `${base}/trade/account` }),
  campaign: campaignEmail({ subject: "Windmill Days are back", body: "Hi Lindiwe,\n\nThe Windmill Tee drop lands Friday at 10:00. Members see it first.\n\nHerbal Holland", unsubscribeUrl: `${base}/unsubscribe?c=1&ch=EMAIL&t=preview` }),
};

if (sendTo) {
  // The fixtures' escaping trap reads as a fault in a real inbox: a plain product name stands in.
  const clean = (t: string) => t.replaceAll(esc(TRICKY), "Calm CBD Oil").replaceAll(TRICKY, "Calm CBD Oil");
  for (const [name, r] of Object.entries(emails)) {
    const sent = await deliverEmail({ to: sendTo, subject: `[Test] ${clean(r.subject)}`, html: clean(r.html), text: clean(r.text) });
    console.log(`${sent ? "sent" : "not sent (no email transport set)"}: ${name}`);
  }
  process.exit(0);
}

const rows: string[] = [];
for (const [name, r] of Object.entries(emails)) {
  writeFileSync(join(out, `${name}.html`), r.html.replace(LEGAL_MARK, esc(legal)).replace(`cid:${EMAIL_LOGO_CID}`, `${base}/pwa-icon/192`));
  writeFileSync(join(out, `${name}.txt`), `Subject: ${r.subject}\n\n${r.text}\n\n${legal}\n`);
  rows.push(`<li><a href="${name}.html">${esc(name)}</a>: <span style="color:#6b5f57">${esc(r.subject)}</span> · <a href="${name}.txt">text</a> · ${(r.html.length / 1024).toFixed(1)} KB</li>`);
}
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Herbal Holland emails</title><body style="font-family:Inter,Arial,sans-serif;padding:32px;background:#fbf7f3;color:#0c0a09"><h1>Email previews</h1><ul style="line-height:1.9">${rows.join("")}</ul></body>`,
);
console.log(`${rows.length} emails written to ${out}/index.html`);
