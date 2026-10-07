// Renders every email template with the test fixtures to test-results/emails/ (an index.html plus one .html and
// .txt per email) so the design can be checked in a browser or sent through an email-client preview service.
//   npx tsx scripts/preview-emails.ts [outdir]
// No database or SMTP is touched: the footer's legal line is filled with a sample franchisor.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { campaignEmail, LEGAL_MARK, legalLine, orderEmail, saleInvoiceEmail, statementEmail, stockOrderInvoiceEmail, zReportEmail, esc } from "@/server/email-templates";
import { courierOrder, order, refund, sale, statement, statementCompany, stockOrder, stockOrderValueIncl, zReport } from "../tests/fixtures/emails";

const out = process.argv[2] ?? "test-results/emails";
mkdirSync(out, { recursive: true });
const base = process.env.APP_URL ?? "https://shop.herbalholland.com";
const legal = legalLine({ legalName: "Herbal Holland (Pty) Ltd", regNumber: "2024/481516/07", vatNumber: "4870123456", address: "Herbal Holland House, 1 Windmill Lane, Irene, Centurion, 0157", phone: "012 004 4200", email: "hello@herbalholland.com" });

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
  campaign: campaignEmail({ subject: "Windmill Days are back", body: "Hi Lindiwe,\n\nThe Windmill Tee drop lands Friday at 10:00. Members see it first.\n\nHerbal Holland", unsubscribeUrl: `${base}/unsubscribe?c=1&ch=EMAIL&t=preview` }),
};

const rows: string[] = [];
for (const [name, r] of Object.entries(emails)) {
  writeFileSync(join(out, `${name}.html`), r.html.replace(LEGAL_MARK, esc(legal)));
  writeFileSync(join(out, `${name}.txt`), `Subject: ${r.subject}\n\n${r.text}\n\n${legal}\n`);
  rows.push(`<li><a href="${name}.html">${esc(name)}</a>: <span style="color:#6b5f57">${esc(r.subject)}</span> · <a href="${name}.txt">text</a> · ${(r.html.length / 1024).toFixed(1)} KB</li>`);
}
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Herbal Holland emails</title><body style="font-family:Inter,Arial,sans-serif;padding:32px;background:#fbf7f3;color:#0c0a09"><h1>Email previews</h1><ul style="line-height:1.9">${rows.join("")}</ul></body>`,
);
console.log(`${rows.length} emails written to ${out}/index.html`);
