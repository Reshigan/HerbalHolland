import { describe, expect, it } from "vitest";
import { campaignEmail, emailLayout, LEGAL_MARK, legalLine, netPositionLabel, orderEmail, saleInvoiceEmail, statementEmail, stockOrderInvoiceEmail, zReportEmail, type Rendered } from "@/server/email-templates";
import { courierOrder, order, refund, sale, statement, statementCompany, stockOrder, stockOrderValueIncl, TRICKY, zReport } from "./fixtures/emails";

const GMAIL_CLIP = 102 * 1024;
const url = (p: string) => `https://herbalholland.co.za${p}`;
const app = (p: string) => `${process.env.APP_URL ?? "http://localhost:3000"}${p}`; // where order emails point (APP_URL)

/** Every template the platform sends, rendered once with the fixtures. */
const rendered: { name: string; r: Rendered; link: string | null; marketing?: boolean }[] = [
  { name: "tax invoice", r: saleInvoiceEmail(sale, { url: url("/invoice/sale-1?t=abc"), batchCodes: { l1: ["HH-2609-0192"] }, orderCode: "X7K2P9" }), link: url("/invoice/sale-1?t=abc") },
  { name: "credit note", r: saleInvoiceEmail(refund, { url: url("/invoice/sale-2?t=def") }), link: url("/invoice/sale-2?t=def") },
  { name: "stock-order tax invoice", r: stockOrderInvoiceEmail(stockOrder, { url: url("/store/PTA01/purchasing/so-1"), valueInclCents: stockOrderValueIncl }), link: url("/store/PTA01/purchasing/so-1") },
  { name: "franchise statement", r: statementEmail(statement, statementCompany, { url: url("/store/PTA01/finance/statement?month=2026-08") }), link: url("/store/PTA01/finance/statement?month=2026-08") },
  { name: "Z-report", r: zReportEmail(zReport, { url: url("/store/PTA01/cash-ups/shift-9f2a7c1d/z-report") }), link: url("/store/PTA01/cash-ups/shift-9f2a7c1d/z-report") },
  { name: "order placed (collect, paid)", r: orderEmail("placed", order), link: app("/orders/X7K2P9") },
  { name: "order placed (collect, pay in store)", r: orderEmail("placed", { ...order, paid: false }), link: app("/orders/X7K2P9") },
  { name: "order placed (courier)", r: orderEmail("placed", courierOrder), link: app("/orders/M3T8QA") },
  { name: "order ready", r: orderEmail("ready", order), link: app("/orders/X7K2P9") },
  { name: "order dispatched", r: orderEmail("dispatched", courierOrder), link: app("/orders/M3T8QA") },
  { name: "order delivered", r: orderEmail("delivered", courierOrder), link: app("/club") },
  { name: "order collected", r: orderEmail("collected", order), link: app("/club") },
  { name: "order cancelled (refunded)", r: orderEmail("cancelled", { ...courierOrder, refunded: true }), link: app("/shop") },
  { name: "order cancelled (unpaid)", r: orderEmail("cancelled", { ...order, paid: false }), link: app("/shop") },
  { name: "campaign", r: campaignEmail({ subject: "Windmill Days are back <3", body: "Hi Lindiwe,\n\nThe Windmill Tee & Co drop lands Friday.\n\n— Herbal Holland", unsubscribeUrl: url("/unsubscribe?c=1&ch=EMAIL&t=tok") }), link: url("/unsubscribe?c=1&ch=EMAIL&t=tok"), marketing: true },
];

describe("Email templates", () => {
  it.each(rendered.map((x) => [x.name, x] as const))("%s renders the essentials", (_name, { r, link, marketing }) => {
    expect(r.subject.trim().length).toBeGreaterThan(8);
    expect(r.html.startsWith("<!doctype html>")).toBe(true);
    expect(r.html).toContain(LEGAL_MARK);
    expect(r.html).toContain("/pwa-icon/192"); // the mark
    expect(r.html).toContain("HERBAL".charAt(0) + "erbal"); // wordmark text is there for clients without images
    expect(Buffer.byteLength(r.html, "utf8")).toBeLessThanOrEqual(GMAIL_CLIP);
    // tables balanced (a stray </td> is how email layouts break in Outlook)
    for (const tag of ["table", "tr", "td", "p"]) expect(r.html.split(`<${tag}`).length - 1, tag).toBe(r.html.split(`</${tag}>`).length - 1);
    // the button and the plain-text twin both carry the link
    if (link) {
      expect(r.html).toContain(`href="${link.replace(/&/g, "&amp;")}`);
      expect(r.text).toContain(link);
    }
    expect(r.text.trim().length).toBeGreaterThan(20);
    expect(r.text).not.toMatch(/<\/?(table|tr|td|div|span|a|br|p|h1)\b/i); // no layout HTML in the text alternative
    // unsubscribe on marketing only
    expect(/unsubscribe/i.test(r.html)).toBe(!!marketing);
  });

  it("escapes what it's given", () => {
    for (const { r } of rendered) {
      expect(r.html).not.toContain("<script>");
      expect(r.html).not.toContain(TRICKY);
    }
    const inv = rendered[0].r.html;
    expect(inv).toContain("Calm CBD Oil &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;");
    const camp = rendered.at(-1)!.r;
    expect(camp.html).toContain("Windmill Days are back &lt;3");
    expect(camp.html).toContain("Windmill Tee &amp; Co");
    expect(camp.text).toContain("Windmill Tee & Co");
  });

  it("tax invoice: figures, VAT, batch numbers, payment and Rewards", () => {
    const { r } = rendered[0];
    expect(r.subject).toBe("Your Herbal Holland tax invoice PTA01-A00042");
    for (const s of ["R1,234.50", "Total incl. VAT", "R161.02", "VAT no. 4123456789", "batch HH-2609-0192", "Online order", "X7K2P9", "Card •• 4242 (ref YC-8842) R1,000.00", "Rewards points R234.50", "You saved R37.00", "61 pts"])
      expect(r.html, s).toContain(s);
    expect(r.text).toContain("Total incl. VAT: R1,234.50");
    expect(r.text).toContain("HH-2609-0192");
    const cn = rendered[1].r;
    expect(cn.subject).toBe("Your Herbal Holland credit note PTA01-A00042-R01");
    expect(cn.html).toContain("Total credited");
    expect(cn.html).toContain("for PTA01-A00042");
  });

  it("statement and Z-report keep the subjects other systems look for", () => {
    expect(rendered[3].r.subject).toBe("Franchise statement — Hatfield, August 2026");
    expect(statement.net).toBeLessThan(0); // wholesale on account outweighs the credits in the fixture
    expect(rendered[3].r.html).toContain(netPositionLabel(statement.net));
    expect(rendered[3].r.text).toContain(netPositionLabel(statement.net));
    expect(rendered[4].r.subject.startsWith("Z-report — Hatfield (Front till)")).toBe(true);
    expect(rendered[4].r.html).toContain("Drawer short by R50.00");
    expect(rendered[4].r.html).toContain("Dispensing (licensed medicines)");
    expect(rendered[4].r.text).toContain("Counted");
  });

  it("order emails: code first, the right next step, and the phrase the texts own stays in the texts", () => {
    const placed = rendered[5].r;
    expect(placed.subject).toBe("Order X7K2P9 — we've got it");
    expect(placed.html).toContain("4821"); // collection code
    expect(placed.html).toContain("Paid online");
    expect(placed.text).not.toContain("order X7K2P9 received"); // the SMS phrase: integration tests count it once
    expect(rendered[6].r.html).toContain("Pay R1,012.00 at the counter");
    expect(rendered[8].r.subject).toBe("Order X7K2P9 is ready to collect at Hatfield");
    expect(rendered[9].r.html).toContain("HH2K7Q9D4F");
    expect(rendered[9].r.html).toContain("Have your ID (18+) ready");
    expect(rendered[12].r.html).toContain("refunded R1,111.00");
    expect(rendered[13].r.html).toContain("Nothing has been charged");
    expect(rendered[10].r.html).toContain("53 pts");
  });

  it("layout: heading escaped, CTA optional, legal line and links in the footer", () => {
    const html = emailLayout({ preheader: "Hi", heading: "Tom & Jerry <3", body: "<p>x</p>" });
    expect(html).toContain("Tom &amp; Jerry &lt;3");
    expect(html).not.toContain("border-radius:999px;background:#f5913c\"><a"); // no button without a CTA
    expect(html).toContain("Adults 18+ only");
    expect(html).toContain("/club/settings");
    expect(legalLine({ legalName: "Herbal Holland (Pty) Ltd", regNumber: "2024/481516/07", vatNumber: "4870123456", address: "1 Windmill Lane, Irene", phone: null, email: "hello@herbalholland.co.za" })).toBe(
      "Herbal Holland (Pty) Ltd · Reg. no. 2024/481516/07 · VAT no. 4870123456 · 1 Windmill Lane, Irene · hello@herbalholland.co.za",
    );
    expect(legalLine(null)).toBe("Herbal Holland");
  });
});
