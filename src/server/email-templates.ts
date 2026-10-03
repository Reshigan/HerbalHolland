// One designed layout for every email the platform sends, and the templates that use it.
// Pure: no database, so the render tests (tests/email.test.ts) run without one. The legal line in the footer is filled
// in at delivery (email.ts) from the franchisor Company record; every template also returns a plain-text twin.
//
// Email clients are a museum: tables and inline styles only, Outfit/Inter with Arial fallbacks, a hosted PNG for the
// mark (Gmail strips inline SVG), a bulletproof pill button, and everything under 102 KB so Gmail never clips it.
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { DENOMINATIONS, denomLabel } from "@/components/pos/lib/rules";
import type { ZReport } from "./pos/types";
import type { StatementLine } from "@/lib/statement";

export const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The brand tokens from globals.css, as plain hex for email clients.
const C = {
  page: "#fbf7f3", card: "#ffffff", ink: "#0c0a09", text: "#2f2824", muted: "#6b5f57", faint: "#968a80",
  line: "#ece5dd", soft: "#f4eee8", brand: "#f5913c", brandDark: "#c05f18", brandSoft: "#fff5ec", leaf: "#23803f", leafSoft: "#eefaf1", rose: "#b32f2f", roseSoft: "#fdf0ef",
};
const DISPLAY = "'Outfit','Helvetica Neue',Helvetica,Arial,sans-serif";
const TEXT = "'Inter',-apple-system,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const TNUM = "font-variant-numeric:tabular-nums;font-feature-settings:'tnum'";

/** Replaced at delivery with the franchisor's legal line (email.ts). Templates never need to know it. */
export const LEGAL_MARK = "<!--hh:legal-->";

export type Rendered = { subject: string; html: string; text: string };

// ── Blocks ─────────────────────────────────────────────────────────────────────

export const para = (html: string, opts: { muted?: boolean; small?: boolean } = {}) =>
  `<p style="margin:0 0 14px;font-family:${TEXT};font-size:${opts.small ? 13 : 15}px;line-height:${opts.small ? 20 : 23}px;color:${opts.muted ? C.muted : C.text}">${html}</p>`;

/** Key / value pairs (order code, collection code, where to collect…). Values are HTML. */
export const facts = (rows: [string, string][]) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:4px 0 18px;font-family:${TEXT};font-size:14px;line-height:21px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 18px 4px 0;color:${C.muted};vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:${C.ink};font-weight:600;vertical-align:top">${v}</td></tr>`)
    .join("")}</table>`;

export type LineRow = { title: string; sub?: string | null; qty?: number | null; unit?: number | null; amountCents: number };
export type TotalRow = { label: string; cents: number; strong?: boolean; muted?: boolean; sign?: "-" | "" };

/** The order / invoice summary: items with quantity and unit price, then the totals with tabular figures. */
export function summaryTable(rows: LineRow[], totals: TotalRow[] = []) {
  const cell = (html: string, right = false, extra = "") =>
    `<td${right ? ' width="1%"' : ""} style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${TEXT};font-size:14px;line-height:20px;color:${C.text};${right ? `text-align:right;white-space:nowrap;${TNUM}` : ""}${extra}">${html}</td>`;
  const body = rows
    .map(
      (r) =>
        `<tr>${cell(`<span style="font-weight:600;color:${C.ink}">${esc(r.title)}</span>${r.sub ? `<br/><span style="font-size:12px;color:${C.faint}">${esc(r.sub)}</span>` : ""}`)}${cell(
          r.qty != null && r.unit != null ? `${r.qty} × ${zar(r.unit)}` : "",
          true,
          `color:${C.muted};font-size:13px;padding-left:12px`,
        )}${cell(zar(r.amountCents), true, "padding-left:12px;font-weight:600")}</tr>`,
    )
    .join("");
  const foot = totals
    .map(
      (t) =>
        `<tr><td colspan="2" style="padding:${t.strong ? "12px 0 0" : "6px 0 0"};font-family:${TEXT};font-size:${t.strong ? 16 : 14}px;color:${t.strong ? C.ink : t.muted ? C.faint : C.muted};font-weight:${t.strong ? 700 : 400}">${esc(t.label)}</td><td style="padding:${t.strong ? "12px 0 0" : "6px 0 0"};text-align:right;white-space:nowrap;font-family:${t.strong ? DISPLAY : TEXT};font-size:${t.strong ? 22 : 14}px;font-weight:${t.strong ? 700 : 400};color:${t.strong ? C.ink : C.text};${TNUM}">${t.sign ?? ""}${zar(t.cents)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 16px">${body}${foot}</table>`;
}

export type FigureRow = { label: string; value: string; strong?: boolean; indent?: boolean; heading?: boolean };

/** Label / figure rows for reports (Z-report, statement). */
export const figures = (rows: FigureRow[]) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 16px">${rows
    .map((r) =>
      r.heading
        ? `<tr><td colspan="2" style="padding:14px 0 4px;font-family:${DISPLAY};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.brandDark}">${esc(r.label)}</td></tr>`
        : `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid ${C.line};font-family:${TEXT};font-size:14px;line-height:20px;color:${r.strong ? C.ink : C.text};font-weight:${r.strong ? 700 : 400};${r.indent ? "padding-left:14px;" : ""}">${esc(r.label)}</td><td width="1%" style="padding:6px 0;border-bottom:1px solid ${C.line};text-align:right;white-space:nowrap;font-family:${TEXT};font-size:14px;line-height:20px;color:${C.ink};font-weight:${r.strong ? 700 : 400};${TNUM}">${esc(r.value)}</td></tr>`,
    )
    .join("")}</table>`;

/** A soft panel for the one thing to notice: a saving, a warning, a payment. */
export const callout = (html: string, tone: "brand" | "leaf" | "rose" | "soft" = "brand") => {
  const bg = { brand: C.brandSoft, leaf: C.leafSoft, rose: C.roseSoft, soft: C.soft }[tone];
  const fg = { brand: C.brandDark, leaf: C.leaf, rose: C.rose, soft: C.text }[tone];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px"><tr><td style="padding:14px 18px;background:${bg};border-radius:14px;font-family:${TEXT};font-size:14px;line-height:21px;color:${fg}">${html}</td></tr></table>`;
};

export const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:${C.brandDark};font-weight:600;text-decoration:underline">${esc(label)}</a>`;

/** The pill button: a table cell carries the colour so Outlook shows a button too. */
const button = (label: string, href: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 10px"><tr><td align="center" bgcolor="${C.brand}" style="border-radius:999px;background:${C.brand}"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${DISPLAY};font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:999px;letter-spacing:0.01em">${esc(label)}</a></td></tr></table>`;

// ── Layout ─────────────────────────────────────────────────────────────────────

export type LayoutOpts = {
  preheader: string;
  heading: string;
  body: string;
  eyebrow?: string;
  cta?: { label: string; href: string };
  /** Why the person is receiving this (one line, HTML). */
  footerHtml?: string;
  /** Marketing only: the signed one-click opt-out page (POPIA s69). Never on transactional email. */
  unsubscribeUrl?: string | null;
};

/** Branded, email-client-safe HTML shell: cream page, white card, the mark and wordmark, footer with the legal line. */
export function emailLayout(o: LayoutOpts) {
  const base = APP_URL();
  const footerWhy = o.footerHtml ?? "You received this because you shop with Herbal Holland or hold a Herbal Holland Rewards card.";
  const footerLinks = [
    `<a href="${esc(`${base}/club`)}" style="color:${C.muted};text-decoration:underline">Herbal Holland Rewards</a>`,
    `<a href="${esc(`${base}/club/settings`)}" style="color:${C.muted};text-decoration:underline">Email preferences</a>`,
    ...(o.unsubscribeUrl ? [`<a href="${esc(o.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a>`] : []),
  ].join(` <span style="color:${C.line}">&nbsp;|&nbsp;</span> `);
  return `<!doctype html>
<html lang="en-ZA" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>${esc(o.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{margin:0;padding:0;background:${C.page}} table{border-collapse:collapse} img{border:0;display:block} a{color:${C.brandDark}} @media (max-width:640px){.hh-card{border-radius:0!important} .hh-pad{padding-left:20px!important;padding-right:20px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.page}">${esc(o.preheader)}${"&#847;&zwnj;&nbsp;".repeat(20)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" class="hh-card" style="max-width:600px;width:100%;background:${C.card};border-radius:20px;overflow:hidden;font-family:${TEXT};color:${C.text}">
<tr><td class="hh-pad" style="background:${C.ink};padding:22px 32px;border-bottom:5px solid ${C.brand}">
<table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td style="padding-right:14px"><img src="${esc(`${base}/pwa-icon/192`)}" width="44" height="44" alt="" style="width:44px;height:44px;border-radius:12px"/></td>
<td style="font-family:${DISPLAY};color:${C.brand};font-size:17px;line-height:18px;text-transform:uppercase;vertical-align:middle"><span style="font-weight:300;letter-spacing:0.16em">Herbal</span><br/><span style="font-weight:800;letter-spacing:0.07em">Holland</span></td>
</tr></table>
</td></tr>
<tr><td class="hh-pad" style="padding:32px 32px 8px">
${o.eyebrow ? `<div style="margin:0 0 10px;font-family:${DISPLAY};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${C.brandDark}">${esc(o.eyebrow)}</div>` : ""}
<h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:27px;line-height:32px;font-weight:600;letter-spacing:-0.01em;color:${C.ink}">${esc(o.heading)}</h1>
${o.body}
</td></tr>
${o.cta ? `<tr><td class="hh-pad" style="padding:0 32px 26px">${button(o.cta.label, o.cta.href)}</td></tr>` : `<tr><td style="padding:0 0 16px"></td></tr>`}
<tr><td class="hh-pad" style="padding:20px 32px 24px;background:${C.soft};border-top:1px solid ${C.line};font-family:${TEXT};font-size:12px;line-height:18px;color:${C.muted}">
<p style="margin:0 0 8px;font-family:${DISPLAY};font-size:12px;font-weight:700;letter-spacing:0.02em;color:${C.ink}">Herbal Holland <span style="font-weight:400;color:${C.muted}">· Adults 18+ only · Keep out of reach of children.</span></p>
<p style="margin:0 0 8px">${footerWhy}</p>
<p style="margin:0 0 10px;color:${C.faint}">${LEGAL_MARK}</p>
<p style="margin:0">${footerLinks}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Plain-text twin: lines joined, blank line between paragraphs, never HTML. */
export const textDoc = (...parts: (string | false | null | undefined)[]) => parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n");

const textRows = (rows: [string, string][]) => {
  const w = Math.min(28, Math.max(...rows.map(([k]) => k.length), 0));
  return rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`).join("\n");
};

// ── Tax invoice (sale / refund) ───────────────────────────────────────────────

export type InvoiceEmailInput = {
  id: string;
  number: string;
  kind: "SALE" | "REFUND";
  createdAt: Date | string;
  totalCents: number;
  vatCents: number;
  discountCents: number;
  memberSavingsCents: number;
  pointsEarned: number;
  store: { name: string; addressLine: string; suburb: string; city: string; company: { legalName: string; vatNumber: string | null } };
  customer: { firstName: string } | null;
  refundOf: { number: string } | null;
  lines: { id: string; qty: number; unitPriceCents: number; discountCents: number; totalCents: number; vatCents?: number; variant: { name: string; product: { name: string } } }[];
  payments: { method: string; amountCents: number; reference?: string | null; cardLast4?: string | null }[];
  /** WHOLESALE: a trade sale — rendered as a trade tax invoice (ex-VAT lines, the buyer block, account terms; never points). */
  channel?: "POS" | "ONLINE" | "WHOLESALE";
  /** The buyer block of a full tax invoice (over R5,000, and every trade sale): `{ name, address, vatNumber }`, as the Sale row stores it (JSON). */
  buyer?: unknown;
};

type BuyerBlock = { name?: string; address?: string; vatNumber?: string };
const buyerOf = (raw: unknown): BuyerBlock => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as BuyerBlock) : {});

/** What the hosted invoice knows about a trade sale beyond the Sale row: the account, its terms and the trade order. */
export type TradeInvoiceOpts = {
  accountNumber?: string | null;
  accountName?: string | null;
  /** When an invoice on ACCOUNT terms is due (from the trade ledger entry). */
  dueAt?: Date | string | null;
  orderNumber?: string | null;
  /** The buyer's own order / PO number. */
  reference?: string | null;
  fulfilment?: "COURIER" | "COLLECT" | null;
};

export const PAY_LABEL: Record<string, string> = { CARD: "Card", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Rewards points", ONLINE: "Paid online", VOUCHER: "Gift voucher", ACCOUNT: "On account" };

export const invoiceTitleFor = (s: { kind: "SALE" | "REFUND"; store: { company: { vatNumber: string | null } } }) =>
  s.kind === "REFUND" ? (s.store.company.vatNumber ? "Credit note" : "Refund") : s.store.company.vatNumber ? "Tax invoice" : "Invoice";

/** The emailed tax invoice: what was bought, VAT, how it was paid, and a button to the hosted, printable copy. */
export function saleInvoiceEmail(s: InvoiceEmailInput, opts: { url: string; batchCodes?: Record<string, string[]>; orderCode?: string | null; trade?: TradeInvoiceOpts }): Rendered {
  if (s.channel === "WHOLESALE") return tradeInvoiceEmail(s, opts);
  const title = invoiceTitleFor(s);
  const refund = s.kind === "REFUND";
  const vendor = !!s.store.company.vatNumber;
  const abs = Math.abs;
  const total = abs(s.totalCents);
  const vat = abs(s.vatCents);
  const linesTotal = s.lines.reduce((n, l) => n + abs(l.totalCents), 0);
  const delivery = !refund ? Math.max(0, total - linesTotal) : 0;
  const rows: LineRow[] = s.lines.map((l) => {
    const batches = opts.batchCodes?.[l.id] ?? [];
    return {
      title: `${l.variant.product.name} · ${l.variant.name}`,
      sub: [l.discountCents ? `saved ${zar(abs(l.discountCents))}` : null, batches.length ? `batch ${batches.join(", ")}` : null].filter(Boolean).join(" · ") || null,
      qty: abs(l.qty),
      unit: l.unitPriceCents,
      amountCents: abs(l.totalCents),
    };
  });
  if (delivery > 0) rows.push({ title: "Delivery", amountCents: delivery });
  const totals: TotalRow[] = [
    ...(vendor ? [{ label: "Total excl. VAT", cents: total - vat, muted: true }, { label: "VAT @ 15%", cents: vat, muted: true }] : []),
    { label: refund ? "Total credited" : vendor ? "Total incl. VAT" : "Total", cents: total, strong: true },
  ];
  const pays = s.payments.map((p) => `${PAY_LABEL[p.method] ?? p.method}${p.cardLast4 ? ` •• ${p.cardLast4}` : ""}${p.reference && p.method !== "CASH" ? ` (ref ${p.reference})` : ""} ${zar(abs(p.amountCents))}`);
  const body =
    facts([
      [title, `<span style="${TNUM}">${esc(s.number)}</span>${s.refundOf ? ` <span style="font-weight:400;color:${C.muted}">for ${esc(s.refundOf.number)}</span>` : ""}`],
      ["Date", esc(fmtDateTime(s.createdAt))],
      ...(opts.orderCode ? ([["Online order", `<span style="${TNUM}">${esc(opts.orderCode)}</span>`]] as [string, string][]) : []),
      ["Sold by", `${esc(s.store.company.legalName)}<br/><span style="font-weight:400;color:${C.muted}">Herbal Holland ${esc(s.store.name)} · ${esc(s.store.addressLine)}, ${esc(s.store.suburb)}, ${esc(s.store.city)}${vendor ? ` · VAT no. ${esc(s.store.company.vatNumber!)}` : ""}</span>`],
    ]) +
    summaryTable(rows, totals) +
    (pays.length ? para(`<b>${refund ? "Refunded to" : "Paid by"}</b> ${esc(pays.join(" · "))}`, { small: true }) : "") +
    (!refund && (s.memberSavingsCents > 0 || s.pointsEarned > 0)
      ? callout(
          [s.memberSavingsCents > 0 ? `<b>You saved ${zar(s.memberSavingsCents)} with Herbal Holland Rewards.</b>` : "", s.pointsEarned > 0 ? `You earned ${fmtPoints(s.pointsEarned)} on this purchase.` : ""].filter(Boolean).join(" "),
        )
      : "") +
    para(`Keep this ${title.toLowerCase()} for your records. It's also in Herbal Holland Rewards under Invoices.`, { muted: true, small: true });
  const text = textDoc(
    `${title} ${s.number}${s.refundOf ? ` (for ${s.refundOf.number})` : ""} · ${fmtDateTime(s.createdAt)}`,
    `${s.store.company.legalName} — Herbal Holland ${s.store.name}, ${s.store.addressLine}, ${s.store.suburb}, ${s.store.city}${vendor ? ` — VAT no. ${s.store.company.vatNumber}` : ""}`,
    opts.orderCode ? `Online order ${opts.orderCode}` : null,
    "",
    ...rows.map((r) => `${r.qty != null ? `${r.qty} x ` : ""}${r.title}${r.sub ? ` (${r.sub})` : ""}  ${zar(r.amountCents)}`),
    "",
    ...totals.map((t) => `${t.label}: ${zar(t.cents)}`),
    pays.length ? `${refund ? "Refunded to" : "Paid by"}: ${pays.join(" · ")}` : null,
    s.memberSavingsCents > 0 && !refund ? `You saved ${zar(s.memberSavingsCents)} with Herbal Holland Rewards.` : null,
    s.pointsEarned > 0 && !refund ? `You earned ${fmtPoints(s.pointsEarned)}.` : null,
    "",
    `View or print: ${opts.url}`,
  );
  return {
    subject: `Your Herbal Holland ${title.toLowerCase()} ${s.number}`,
    html: emailLayout({
      preheader: `${title} ${s.number} — ${zar(total)}`,
      eyebrow: `${title} · Herbal Holland ${s.store.name}`,
      heading: refund ? `Your ${title.toLowerCase()} ${s.number}` : `Thanks${s.customer ? `, ${s.customer.firstName}` : ""}`,
      body,
      cta: { label: `View or print ${title.toLowerCase()}`, href: opts.url },
      footerHtml: `You received this because you bought from Herbal Holland ${esc(s.store.name)}. Every sale is invoiced by email (SARS).`,
    }),
    text,
  };
}

/**
 * A trade sale's tax invoice: lines ex VAT with the VAT per line, the buyer block (the business, its VAT number, its
 * account), the trade order and the buyer's reference, and the terms — "On account, due …" for an ACCOUNT tender or how
 * it was paid otherwise. Never points or member savings: a business account is not a Rewards member.
 */
function tradeInvoiceEmail(s: InvoiceEmailInput, opts: { url: string; batchCodes?: Record<string, string[]>; trade?: TradeInvoiceOpts }): Rendered {
  const title = invoiceTitleFor(s);
  const refund = s.kind === "REFUND";
  const vendor = !!s.store.company.vatNumber;
  const abs = Math.abs;
  const total = abs(s.totalCents);
  const vat = abs(s.vatCents);
  const linesTotal = s.lines.reduce((n, l) => n + abs(l.totalCents), 0);
  const linesVat = s.lines.reduce((n, l) => n + abs(l.vatCents ?? 0), 0);
  const extra = !refund ? Math.max(0, total - linesTotal) : 0;
  const extraVat = extra > 0 ? Math.max(0, vat - linesVat) : 0;
  const t = opts.trade ?? {};
  const rows: LineRow[] = s.lines.map((l) => {
    const batches = opts.batchCodes?.[l.id] ?? [];
    const qty = abs(l.qty);
    const ex = abs(l.totalCents) - abs(l.vatCents ?? 0);
    return {
      title: `${l.variant.product.name} · ${l.variant.name}`,
      sub: [`VAT ${zar(abs(l.vatCents ?? 0))}`, l.discountCents ? `less ${zar(abs(l.discountCents))}` : null, batches.length ? `batch ${batches.join(", ")}` : null].filter(Boolean).join(" · "),
      qty,
      unit: qty ? Math.round(ex / qty) : null,
      amountCents: ex,
    };
  });
  if (extra > 0) rows.push({ title: t.fulfilment === "COLLECT" ? "Collection handling fee" : "Delivery", sub: `VAT ${zar(extraVat)}`, amountCents: extra - extraVat });
  const totals: TotalRow[] = [
    { label: "Total excl. VAT", cents: total - vat, muted: true },
    { label: vendor ? "VAT @ 15%" : "VAT", cents: vat, muted: true },
    { label: refund ? "Total credited" : "Total incl. VAT", cents: total, strong: true },
  ];
  const onAccount = s.payments.some((p) => p.method === "ACCOUNT");
  const pays = s.payments.filter((p) => p.method !== "ACCOUNT").map((p) => `${PAY_LABEL[p.method] ?? p.method}${p.reference ? ` (ref ${p.reference})` : ""} ${zar(abs(p.amountCents))}`);
  const terms = refund
    ? onAccount
      ? "Credited to your trade account"
      : pays.length
        ? `Refunded to ${pays.join(" · ")}`
        : null
    : onAccount
      ? `On account${t.dueAt ? `, due ${fmtDate(t.dueAt)}` : " — due as per your account's payment terms"}`
      : pays.length
        ? `Paid by ${pays.join(" · ")}`
        : null;
  const b = buyerOf(s.buyer);
  const billTo = [b.name ? `<span style="font-weight:600">${esc(b.name)}</span>` : null, b.address ? `<span style="font-weight:400;color:${C.muted}">${esc(b.address)}</span>` : null, b.vatNumber ? `<span style="font-weight:400;color:${C.muted}">VAT no. ${esc(b.vatNumber)}</span>` : null, t.accountNumber ? `<span style="font-weight:400;color:${C.muted};${TNUM}">Trade account ${esc(t.accountNumber)}</span>` : null]
    .filter(Boolean)
    .join("<br/>");
  const body =
    facts([
      [title, `<span style="${TNUM}">${esc(s.number)}</span>${s.refundOf ? ` <span style="font-weight:400;color:${C.muted}">for ${esc(s.refundOf.number)}</span>` : ""}`],
      ["Date", esc(fmtDateTime(s.createdAt))],
      ...(t.orderNumber ? ([["Trade order", `<span style="${TNUM}">${esc(t.orderNumber)}</span>`]] as [string, string][]) : []),
      ...(t.reference ? ([["Your reference", esc(t.reference)]] as [string, string][]) : []),
      ["Sold by", `${esc(s.store.company.legalName)}<br/><span style="font-weight:400;color:${C.muted}">Herbal Holland ${esc(s.store.name)} · ${esc(s.store.addressLine)}, ${esc(s.store.suburb)}, ${esc(s.store.city)}${vendor ? ` · VAT no. ${esc(s.store.company.vatNumber!)}` : ""}</span>`],
      ...(billTo ? ([["Bill to", billTo]] as [string, string][]) : []),
    ]) +
    summaryTable(rows, totals) +
    (terms ? para(`<b>${refund ? "Credit" : "Terms"}</b> ${esc(terms)}`, { small: true }) : "") +
    para(`Prices are ex VAT; VAT is shown per line and in the total. Keep this ${title.toLowerCase()} for your records.`, { muted: true, small: true });
  const text = textDoc(
    `${title} ${s.number}${s.refundOf ? ` (for ${s.refundOf.number})` : ""} · ${fmtDateTime(s.createdAt)}`,
    `${s.store.company.legalName} — Herbal Holland ${s.store.name}, ${s.store.addressLine}, ${s.store.suburb}, ${s.store.city}${vendor ? ` — VAT no. ${s.store.company.vatNumber}` : ""}`,
    t.orderNumber ? `Trade order ${t.orderNumber}${t.reference ? ` · your reference ${t.reference}` : ""}` : t.reference ? `Your reference ${t.reference}` : null,
    b.name ? `Bill to: ${[b.name, b.address, b.vatNumber ? `VAT no. ${b.vatNumber}` : null, t.accountNumber ? `trade account ${t.accountNumber}` : null].filter(Boolean).join(", ")}` : null,
    "",
    ...rows.map((r) => `${r.qty != null ? `${r.qty} x ` : ""}${r.title}${r.sub ? ` (${r.sub})` : ""}  ${zar(r.amountCents)} ex VAT`),
    "",
    ...totals.map((x) => `${x.label}: ${zar(x.cents)}`),
    terms ? `${refund ? "Credit" : "Terms"}: ${terms}` : null,
    "",
    `View or print: ${opts.url}`,
  );
  return {
    subject: `Herbal Holland ${title.toLowerCase()} ${s.number}${b.name ? ` — ${b.name}` : ""}`,
    html: emailLayout({
      preheader: `${title} ${s.number} — ${zar(total)} incl. VAT${terms ? ` · ${terms}` : ""}`,
      eyebrow: `${title} · Herbal Holland ${s.store.name}`,
      heading: `${title} ${s.number}`,
      body,
      cta: { label: `View or print ${title.toLowerCase()}`, href: opts.url },
      footerHtml: `You received this because your business buys from Herbal Holland ${esc(s.store.name)} on a trade account. Every sale is invoiced by email (SARS).`,
    }),
    text,
  };
}

// ── Wholesale / network tax invoice (store to store) ─────────────────────────

export type StockOrderEmailInput = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  buyer: { code: string; name: string; company: { legalName: string; vatNumber: string | null } };
  seller: { name: string; company: { legalName: string; vatNumber: string | null } };
  lines: { qty: number; receivedQty: number | null; unitCostCents: number; variant: { name: string; product: { name: string } } }[];
};

export function stockOrderInvoiceEmail(o: StockOrderEmailInput, opts: { url: string; valueInclCents: number }): Rendered {
  const rows: LineRow[] = o.lines.map((l) => ({ title: `${l.variant.product.name} · ${l.variant.name}`, qty: l.receivedQty ?? l.qty, unit: l.unitCostCents, amountCents: (l.receivedQty ?? l.qty) * l.unitCostCents }));
  const ex = rows.reduce((s, r) => s + r.amountCents, 0);
  const totals: TotalRow[] = [
    { label: "Total excl. VAT", cents: ex, muted: true },
    { label: "VAT @ 15%", cents: opts.valueInclCents - ex, muted: true },
    { label: "Total incl. VAT", cents: opts.valueInclCents, strong: true },
  ];
  const body =
    facts([
      ["Tax invoice", `<span style="${TNUM}">${esc(o.number)}</span>`],
      ["From", `${esc(o.seller.company.legalName)}<br/><span style="font-weight:400;color:${C.muted}">${esc(o.seller.name)}${o.seller.company.vatNumber ? ` · VAT no. ${esc(o.seller.company.vatNumber)}` : ""}</span>`],
      ["To", `${esc(o.buyer.company.legalName)}<br/><span style="font-weight:400;color:${C.muted}">Herbal Holland ${esc(o.buyer.name)}${o.buyer.company.vatNumber ? ` · VAT no. ${esc(o.buyer.company.vatNumber)}` : ""}</span>`],
    ]) +
    summaryTable(rows, totals) +
    para("Unit prices exclude VAT. Settled on your monthly franchise statement — nothing to pay now.", { muted: true, small: true });
  const text = textDoc(
    `Tax invoice ${o.number}`,
    `From ${o.seller.company.legalName} (${o.seller.name}) to ${o.buyer.company.legalName} (Herbal Holland ${o.buyer.name})`,
    "",
    ...rows.map((r) => `${r.qty} x ${r.title} @ ${zar(r.unit!)}  ${zar(r.amountCents)}`),
    "",
    ...totals.map((t) => `${t.label}: ${zar(t.cents)}`),
    "Settled on your monthly franchise statement.",
    "",
    `Open in back office: ${opts.url}`,
  );
  return {
    subject: `Tax invoice ${o.number} — ${o.seller.name}`,
    html: emailLayout({ preheader: `Tax invoice ${o.number} · ${zar(opts.valueInclCents)} incl. VAT`, eyebrow: "Stock on account", heading: `Tax invoice ${o.number}`, body, cta: { label: "Open in back office", href: opts.url }, footerHtml: "Sent to the store's owner company because stock was received on account." }),
    text,
  };
}

// ── Franchise statement ──────────────────────────────────────────────────────

export type StatementEmailInput = {
  store: { name: string; code: string };
  month: string; // YYYY-MM
  lines: StatementLine[];
  credits: number;
  debits: number;
  net: number;
  memberSavingsCents: number;
  input: { netSalesExVatCents: number; onlineSalesExVatCents: number; tradeSalesExVatCents?: number; royaltyBps: number; levyBps: number; ecomBps: number };
};

export const netPositionLabel = (net: number) => (net >= 0 ? `HQ pays you ${zar(net)}` : `Amount due to HQ: ${zar(-net)}`);

export function statementEmail(st: StatementEmailInput, company: { legalName: string; vatNumber: string | null }, opts: { url: string }): Rendered {
  const monthLabel = fmtMonth(`${st.month}-15T12:00:00Z`);
  const net = netPositionLabel(st.net);
  const rows: FigureRow[] = [
    { label: "Credits — HQ owes you", value: "", heading: true },
    ...st.lines.filter((l) => l.kind === "credit").map((l) => ({ label: l.label, value: zar(l.cents) })),
    { label: "Total credits", value: zar(st.credits), strong: true },
    { label: "Debits — you owe HQ", value: "", heading: true },
    ...st.lines.filter((l) => l.kind === "debit").map((l) => ({ label: l.label, value: `−${zar(l.cents)}` })),
    { label: "Total debits", value: `−${zar(st.debits)}`, strong: true },
  ];
  const body =
    para(`Here is the ${monthLabel} statement between Herbal Holland HQ and <b>${esc(company.legalName)}</b> for Herbal Holland ${esc(st.store.name)} (${esc(st.store.code)})${company.vatNumber ? `, VAT no. ${esc(company.vatNumber)}` : ""}.`) +
    callout(`<span style="font-family:${DISPLAY};font-size:20px;font-weight:700;${TNUM}">${esc(net)}</span><br/>${st.net >= 0 ? "Settled to you by HQ after month end." : "Settled with HQ after month end."}`, st.net >= 0 ? "leaf" : "brand") +
    figures(rows) +
    para(
      `Fees on net sales of ${zar(st.input.netSalesExVatCents)} ex VAT (online ${zar(st.input.onlineSalesExVatCents)}${st.input.tradeSalesExVatCents ? `, trade ${zar(st.input.tradeSalesExVatCents)}` : ""}): royalty ${st.input.royaltyBps / 100}%, marketing fund levy ${st.input.levyBps / 100}%, e-commerce commission ${st.input.ecomBps / 100}% of online sales.${st.input.tradeSalesExVatCents ? " Trade sales on account are on HQ's ledger — HQ carries the credit risk and credits them to you here." : ""} Instant Rewards savings given to members (${zar(st.memberSavingsCents)}) are already inside your net sales. Wholesale and network stock appear in the month received; each delivery has its own tax invoice.`,
      { muted: true, small: true },
    );
  const text = textDoc(
    `Franchise statement — Herbal Holland ${st.store.name} (${st.store.code}), ${monthLabel}`,
    `${company.legalName}${company.vatNumber ? ` — VAT no. ${company.vatNumber}` : ""}`,
    "",
    net,
    "",
    "Credits — HQ owes you",
    textRows(st.lines.filter((l) => l.kind === "credit").map((l) => [l.label, zar(l.cents)])),
    `Total credits: ${zar(st.credits)}`,
    "",
    "Debits — you owe HQ",
    textRows(st.lines.filter((l) => l.kind === "debit").map((l) => [l.label, `-${zar(l.cents)}`])),
    `Total debits: -${zar(st.debits)}`,
    "",
    `Net sales ex VAT ${zar(st.input.netSalesExVatCents)} · online ${zar(st.input.onlineSalesExVatCents)}${st.input.tradeSalesExVatCents ? ` · trade ${zar(st.input.tradeSalesExVatCents)}` : ""} · royalty ${st.input.royaltyBps / 100}% · levy ${st.input.levyBps / 100}% · e-commerce ${st.input.ecomBps / 100}%`,
    "",
    `View or print: ${opts.url}`,
  );
  return {
    subject: `Franchise statement — ${st.store.name}, ${monthLabel}`,
    html: emailLayout({ preheader: net, eyebrow: `Franchise statement · ${monthLabel}`, heading: `Herbal Holland ${st.store.name}`, body, cta: { label: "View or print the statement", href: opts.url }, footerHtml: "Sent to the store's owner company as the franchise agreement provides. Questions: reply to this email." }),
    text,
  };
}

// ── Z-report ─────────────────────────────────────────────────────────────────

export function zReportEmail(r: ZReport, opts: { url?: string | null } = {}): Rendered {
  const variance = r.cash.varianceCents ?? 0;
  const signed = (n: number) => `${n > 0 ? "+" : ""}${zar(n)}`;
  const counts = r.cash.counts ? DENOMINATIONS.filter((d) => r.cash.counts![String(d)]).map((d) => `${denomLabel(d)} × ${r.cash.counts![String(d)]}`) : [];
  const rows: FigureRow[] = [
    { label: "Sales", value: "", heading: true },
    { label: `Sales (${r.sales.count})`, value: zar(r.sales.grossCents), strong: true },
    { label: "VAT included", value: zar(r.sales.vatCents), indent: true },
    { label: "Net of VAT", value: zar(r.sales.netCents), indent: true },
    { label: "Discounts given", value: zar(r.sales.discountCents), indent: true },
    { label: "Rewards savings given", value: zar(r.sales.memberSavingsCents), indent: true },
    { label: "Units sold", value: String(r.sales.units), indent: true },
    ...(r.online.count ? [{ label: `Online handovers (${r.online.count})`, value: zar(r.online.grossCents), indent: true }] : []),
    { label: `Refunds (${r.refunds.count})`, value: `−${zar(r.refunds.totalCents)}` },
    { label: "Net takings", value: zar(r.takingsCents), strong: true },
    { label: "By tender", value: "", heading: true },
    ...r.tenders.map((t) => ({ label: `${t.label} (${t.count})`, value: zar(t.amountCents) })),
    { label: "Points issued / redeemed", value: `${fmtPoints(r.points.issued)} / ${fmtPoints(r.points.redeemed)}` },
    { label: "Cash drawer", value: "", heading: true },
    { label: "Opening float", value: zar(r.cash.floatCents) },
    { label: "Cash sales less cash refunds", value: zar(r.cash.cashNetCents) },
    { label: "Expected in drawer", value: zar(r.cash.expectedCents), strong: true },
    { label: "Counted", value: r.cash.countedCents != null ? zar(r.cash.countedCents) : "—" },
    { label: "Variance", value: r.cash.varianceCents != null ? signed(variance) : "—", strong: true },
    ...(r.dispensing && r.dispensing.count
      ? [
          { label: "Dispensing (licensed medicines)", value: "", heading: true },
          { label: `Dispensed (${r.dispensing.count} sales)`, value: zar(r.dispensing.cents) },
          { label: "Units / grams", value: `${r.dispensing.units} / ${r.dispensing.grams.toFixed(1)} g`, indent: true },
        ]
      : []),
  ];
  const body =
    facts([
      ["Store", `${esc(r.store.legalName)}<br/><span style="font-weight:400;color:${C.muted}">Herbal Holland ${esc(r.store.name)} (${esc(r.store.code)})${r.device ? ` · ${esc(r.device.name)}` : ""}${r.store.vatNumber ? ` · VAT no. ${esc(r.store.vatNumber)}` : ""}</span>`],
      ["Opened", `${esc(fmtDateTime(r.openedAt))} <span style="font-weight:400;color:${C.muted}">by ${esc(r.openedBy)}</span>`],
      ...(r.closedAt ? ([["Closed", `${esc(fmtDateTime(r.closedAt))} <span style="font-weight:400;color:${C.muted}">by ${esc(r.closedBy ?? "—")}</span>`]] as [string, string][]) : []),
    ]) +
    (r.cash.varianceCents != null && variance !== 0
      ? callout(`<b>Drawer ${variance < 0 ? "short" : "over"} by ${zar(Math.abs(variance))}.</b> ${Math.abs(variance) > 5_000 ? "Over the R50 tolerance — a loss-prevention alert is raised for the owner." : "Within tolerance."}`, variance < 0 ? "rose" : "brand")
      : "") +
    figures(rows) +
    (counts.length ? para(`<b>Counted:</b> ${esc(counts.join(", "))}`, { small: true, muted: true }) : "") +
    (r.notes ? para(`<b>Notes:</b> ${esc(r.notes)}`, { small: true }) : "");
  const text = textDoc(
    `Z-report ${r.store.name} (${r.store.code})${r.device ? ` · ${r.device.name}` : ""}`,
    `Opened ${fmtDateTime(r.openedAt)} by ${r.openedBy}${r.closedAt ? ` · closed ${fmtDateTime(r.closedAt)} by ${r.closedBy ?? "—"}` : ""}`,
    "",
    textRows(rows.filter((x) => !x.heading).map((x) => [x.label, x.value])),
    counts.length ? `Counted: ${counts.join(", ")}` : null,
    r.notes ? `Notes: ${r.notes}` : null,
    opts.url ? `\nOpen in back office: ${opts.url}` : null,
  );
  return {
    subject: `Z-report — ${r.store.name} ${r.device ? `(${r.device.name}) ` : ""}${fmtDateTime(r.closedAt ?? r.openedAt)}`,
    html: emailLayout({
      preheader: `Takings ${zar(r.takingsCents)} · variance ${signed(variance)}`,
      eyebrow: r.closed ? "Z-report · shift closed" : "X-report · shift open",
      heading: `${r.store.name}${r.device ? ` · ${r.device.name}` : ""}`,
      body,
      cta: opts.url ? { label: "Open in back office", href: opts.url } : undefined,
      footerHtml: "Sent to the store's email at every shift close, as the till's own copy of the cash-up.",
    }),
    text,
  };
}

// ── Online order updates ─────────────────────────────────────────────────────

export type OrderEvent = "placed" | "ready" | "dispatched" | "delivered" | "collected" | "cancelled";

export type OrderEmailInput = {
  code: string;
  fulfilment: "COLLECT" | "SAME_DAY" | "COURIER";
  store: { name: string; addressLine?: string | null; suburb?: string | null; city?: string | null };
  customer: { firstName: string };
  lines: { name: string; variant: string; qty: number; totalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  pointsRedeemed: number;
  totalCents: number;
  paid: boolean;
  collectionCode?: string | null;
  address?: string | null;
  courier?: string | null;
  trackingNo?: string | null;
  ageRestricted?: boolean;
  refunded?: boolean;
  pointsEarned?: number | null;
};

const ORDER_SUBJECT: Record<OrderEvent, (o: OrderEmailInput) => string> = {
  placed: (o) => `Order ${o.code} — we've got it`,
  ready: (o) => `Order ${o.code} is ready to collect at ${o.store.name}`,
  dispatched: (o) => `Order ${o.code} is on its way`,
  delivered: (o) => `Order ${o.code} delivered — thank you`,
  collected: (o) => `Order ${o.code} collected — thank you`,
  cancelled: (o) => `Order ${o.code} has been cancelled`,
};

/** The email twin of the order texts: same facts, room for the summary and the next step. */
export function orderEmail(kind: OrderEvent, o: OrderEmailInput): Rendered {
  const base = APP_URL();
  const url = `${base}/orders/${o.code}`;
  const due = o.totalCents - o.pointsRedeemed * 100;
  const collect = o.fulfilment === "COLLECT";
  const where = collect ? `Herbal Holland ${o.store.name}${o.store.addressLine ? `, ${[o.store.addressLine, o.store.suburb, o.store.city].filter(Boolean).join(", ")}` : ""}` : (o.address ?? "your delivery address");
  const summary = summaryTable(
    o.lines.map((l) => ({ title: l.name, sub: l.variant, qty: l.qty, unit: l.qty ? Math.round(l.totalCents / l.qty) : null, amountCents: l.totalCents })),
    [
      { label: "Subtotal", cents: o.subtotalCents, muted: true },
      ...(o.discountCents > 0 ? [{ label: "Deals & Rewards savings", cents: o.discountCents, muted: true, sign: "-" as const }] : []),
      ...(o.deliveryCents > 0 ? [{ label: "Delivery", cents: o.deliveryCents, muted: true }] : []),
      ...(o.pointsRedeemed > 0 ? [{ label: `Points used (${fmtPoints(o.pointsRedeemed)})`, cents: o.pointsRedeemed * 100, muted: true, sign: "-" as const }] : []),
      { label: kind === "cancelled" ? (o.refunded ? "Total refunded" : "Order total") : o.paid ? "Total paid" : "Total to pay", cents: due, strong: true },
    ],
  );
  const totalLabel = kind === "cancelled" ? (o.refunded ? "Total refunded" : "Order total") : o.paid ? "Total paid" : "Total to pay";
  const textSummary = textDoc(...o.lines.map((l) => `${l.qty} x ${l.name} (${l.variant})  ${zar(l.totalCents)}`), `${totalLabel}: ${zar(due)}`);
  let heading = "";
  let body = "";
  let lead = "";
  let cta = { label: "Track your order", href: url };
  let intro: string[] = [];
  const id = o.ageRestricted ? " Bring your ID — we check that every collection is 18+." : "";
  switch (kind) {
    case "placed":
      heading = `Thanks, ${o.customer.firstName} — we have your order`;
      lead = collect
        ? `Herbal Holland ${o.store.name} is getting order ${o.code} ready. We'll text and email you the moment it's ready to collect.${id}`
        : `We're packing order ${o.code} at Herbal Holland ${o.store.name} and will let you know when it's on its way.${o.ageRestricted ? " The driver will ask for ID (18+) at the door." : ""}`;
      body =
        para(esc(lead)) +
        facts([
          ["Order", `<span style="${TNUM}">${esc(o.code)}</span>`],
          [collect ? "Collect from" : "Deliver to", esc(where)],
          ...(collect && o.collectionCode ? ([["Collection code", `<span style="font-family:${DISPLAY};font-size:20px;letter-spacing:0.12em;${TNUM}">${esc(o.collectionCode)}</span>`]] as [string, string][]) : []),
          ["Payment", o.paid ? "Paid online — nothing more to pay" : `Pay ${zar(due)} at the counter when you collect`],
        ]) +
        summary;
      intro = [lead, "", `Order ${o.code} · ${collect ? "Collect from" : "Deliver to"} ${where}`, collect && o.collectionCode ? `Collection code: ${o.collectionCode}` : null, o.paid ? "Paid online — nothing more to pay." : `Pay ${zar(due)} at the counter when you collect.`, "", textSummary].filter((x): x is string => x !== null);
      break;
    case "ready":
      heading = `Ready to collect at ${o.store.name}`;
      lead = `Order ${o.code} is packed and waiting. Show your collection code and your ID (18+) at the counter${o.paid ? "" : ` and pay ${zar(due)} there`}.`;
      body =
        para(esc(lead)) +
        facts([
          ["Collection code", `<span style="font-family:${DISPLAY};font-size:24px;letter-spacing:0.14em;${TNUM}">${esc(o.collectionCode ?? "")}</span>`],
          ["Collect from", esc(where)],
          ["Order", `<span style="${TNUM}">${esc(o.code)}</span>`],
        ]) +
        summary;
      cta = { label: "Order details", href: url };
      intro = [lead, "", `Collection code: ${o.collectionCode ?? ""}`, `Collect from ${where}`, "", textSummary];
      break;
    case "dispatched":
      heading = "Your order is on its way";
      lead = `Order ${o.code} has left Herbal Holland ${o.store.name}${o.courier ? ` with ${o.courier}` : ""}${o.trackingNo ? ` (tracking ${o.trackingNo})` : ""}.${o.ageRestricted ? " Have your ID (18+) ready for the driver." : ""}`;
      body =
        para(esc(lead)) +
        facts([
          ["Order", `<span style="${TNUM}">${esc(o.code)}</span>`],
          ...(o.trackingNo ? ([["Tracking", `${esc(o.courier ?? "Courier")} · <span style="${TNUM}">${esc(o.trackingNo)}</span>`]] as [string, string][]) : []),
          ["Deliver to", esc(where)],
        ]) +
        summary;
      intro = [lead, "", `Deliver to ${where}`, "", textSummary];
      break;
    case "delivered":
    case "collected":
      heading = kind === "delivered" ? "Delivered — thank you" : "Collected — thank you";
      lead = `Order ${o.code} is complete.${o.pointsEarned ? ` ${fmtPoints(o.pointsEarned)} have been added to your Herbal Holland Rewards balance.` : " Your points have been added to your Herbal Holland Rewards balance."} Your tax invoice follows in a separate email.`;
      body = para(esc(lead)) + summary + para("Something not right? Bring it back to any Herbal Holland store with this order number.", { muted: true, small: true });
      cta = { label: "See your Rewards", href: `${base}/club` };
      intro = [lead, "", textSummary];
      break;
    case "cancelled":
      heading = `Order ${o.code} cancelled`;
      lead = o.refunded
        ? `We've refunded ${zar(due)} to your original payment method — allow a few working days for your bank to show it.${o.pointsRedeemed ? ` The ${fmtPoints(o.pointsRedeemed)} you used are back in your account.` : ""}`
        : `Nothing has been charged.${o.pointsRedeemed ? ` The ${fmtPoints(o.pointsRedeemed)} you used are back in your account.` : ""}`;
      body = para(esc(lead)) + summary + para("If you didn't ask for this, or you'd like the items anyway, reply to this email or call the store and we'll sort it out.", { muted: true, small: true });
      cta = { label: "Shop again", href: `${base}/shop` };
      intro = [lead, "", textSummary];
      break;
  }
  const text = textDoc(`${heading}`, "", ...intro, "", `${cta.label}: ${cta.href}`);
  return {
    subject: ORDER_SUBJECT[kind](o),
    html: emailLayout({ preheader: lead.slice(0, 120), eyebrow: `Order ${o.code} · Herbal Holland ${o.store.name}`, heading, body, cta, footerHtml: `You received this because you placed order ${esc(o.code)} with Herbal Holland. Order updates always come by text and email.` }),
    text,
  };
}

// ── Campaign (marketing) email ───────────────────────────────────────────────

/** A campaign message as an email: the copy as typed in HQ, with the unsubscribe link marketing law requires. */
export function campaignEmail(m: { subject: string; body: string; unsubscribeUrl: string | null }): Rendered {
  const paragraphs = m.body
    .split(/\n{2,}/)
    .map((p) => para(esc(p.trim()).replaceAll("\n", "<br/>")))
    .join("");
  return {
    subject: m.subject,
    html: emailLayout({
      preheader: m.body.slice(0, 110),
      eyebrow: "Herbal Holland Rewards",
      heading: m.subject,
      body: paragraphs,
      footerHtml: "You're receiving this because you opted in to Herbal Holland Rewards emails. Adults 18+.",
      unsubscribeUrl: m.unsubscribeUrl,
    }),
    text: m.unsubscribeUrl ? `${m.body}\n\nUnsubscribe: ${m.unsubscribeUrl}` : m.body,
  };
}

/** The franchisor's legal line for the footer, from its Company record (or the brand alone when there is none). */
export function legalLine(c: { legalName: string; regNumber?: string | null; vatNumber?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null) {
  if (!c) return "Herbal Holland";
  return [c.legalName, c.regNumber ? `Reg. no. ${c.regNumber}` : null, c.vatNumber ? `VAT no. ${c.vatNumber}` : null, c.address, c.phone, c.email].filter(Boolean).join(" · ");
}

