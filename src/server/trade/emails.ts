// The trade channel's emails: pure renders on the shared branded layout (src/server/email-templates.ts), each with a
// plain-text twin. Subjects start "Herbal Holland Trade". Nothing here touches the database; the callers
// (accounts, orders, ledger, auth, invoices) send them.
import { APP_URL, callout, emailLayout, esc, facts, figures, para, summaryTable, textDoc, type FigureRow, type LineRow, type Rendered, type TotalRow } from "../email-templates";
import { zar } from "@/lib/money";
import { asList } from "@/lib/json-list";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { TRADE_KINDS, addressLineOf, eftReference, type StatementLine, type Ageing } from "@/lib/trade";

const SUBJECT = "Herbal Holland Trade";
const FOOTER = (legalName: string) => `You received this because ${esc(legalName)} holds, or has applied for, a Herbal Holland trade account.`;
export const tradePortalUrl = (path = "") => `${APP_URL()}/trade${path}`;

export type TradeAccountInfo = {
  number: string;
  name: string;
  legalName: string;
  email: string;
  kind?: string;
  terms: "PREPAID" | "ACCOUNT";
  creditLimitCents: number;
  paymentDays: number;
  classes: unknown; // the row's JSON list (asList)
  holdReason?: string | null;
};

export type TradeTermsInfo = { minOrderCents: number; deliveryCents: number; freeDeliveryOverCents: number; collectHandlingCents: number; eftHoldDays: number };

const classList = (classes: unknown) => asList<string>(classes).map((c) => REG_CLASS_LABEL[c as RegClass] ?? c).join(", ");

// ── Sign-in code ─────────────────────────────────────────────────────────────

export function tradeCodeEmail(a: { code: string; minutes: number }): Rendered {
  const body =
    para("Here's your one-time code to sign in to the Herbal Holland trade portal.") +
    callout(`<span style="font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:0.18em">${esc(a.code)}</span><br/>It expires in ${a.minutes} minutes and works once.`) +
    para("If you didn't ask for a code, you can ignore this email: nobody can sign in without it.", { muted: true, small: true });
  return {
    subject: `${SUBJECT} sign-in code`,
    html: emailLayout({ preheader: `Your sign-in code is ${a.code}`, eyebrow: "Trade portal", heading: "Your sign-in code", body, footerHtml: "You received this because someone asked to sign in to the Herbal Holland trade portal with this address." }),
    text: textDoc("Your Herbal Holland Trade sign-in code:", "", a.code, "", `It expires in ${a.minutes} minutes and works once. If you didn't ask for a code, ignore this email.`),
  };
}

// ── Applications and account status ──────────────────────────────────────────

export function tradeApplicationReceivedEmail(a: { account: TradeAccountInfo; buyerName: string }): Rendered {
  const body =
    para(`Hi ${esc(a.buyerName)}, thanks for applying for a Herbal Holland trade account for <b>${esc(a.account.legalName)}</b>.`) +
    facts([
      ["Application", `<span style="font-variant-numeric:tabular-nums">${esc(a.account.number)}</span>`],
      ["Business", `${esc(a.account.name)}${a.account.kind ? ` · ${esc(TRADE_KINDS[a.account.kind as keyof typeof TRADE_KINDS] ?? a.account.kind)}` : ""}`],
      ["Ranges requested", esc(classList(a.account.classes))],
    ]) +
    para("Our trade team reads every application and replies by email within a few working days. Once the account is approved you'll be able to sign in with a code sent to this address, see trade prices and place your first order.") +
    para("Licensed medicines aren't part of the trade range. Everything else is priced ex VAT, with VAT shown on every line.", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: application ${a.account.number} received`,
    html: emailLayout({ preheader: `Application ${a.account.number} received. We'll reply within a few working days`, eyebrow: "Trade account", heading: "We've got your application", body, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`Hi ${a.buyerName}, thanks for applying for a Herbal Holland trade account for ${a.account.legalName}.`, "", `Application: ${a.account.number}`, `Business: ${a.account.name}`, `Ranges requested: ${classList(a.account.classes)}`, "", "Our trade team replies by email within a few working days."),
  };
}

/** The notice to the trade team: the business and what it asked for; contact details stay in HQ (POPIA). */
export function tradeApplicationNoticeEmail(a: { account: TradeAccountInfo & { city?: string | null; province?: string | null }; url: string }): Rendered {
  const rows: [string, string][] = [
    ["Application", esc(a.account.number)],
    ["Business", `${esc(a.account.legalName)}${a.account.name !== a.account.legalName ? ` (trading as ${esc(a.account.name)})` : ""}`],
    ["Kind", esc(TRADE_KINDS[a.account.kind as keyof typeof TRADE_KINDS] ?? a.account.kind ?? "")],
    ["Where", esc([a.account.city, a.account.province].filter(Boolean).join(", "))],
    ["Ranges requested", esc(classList(a.account.classes))],
  ];
  const body = para("A new trade account application came in on the trade portal.") + facts(rows) + para("The contact details and notes are in HQ; we keep them out of email (POPIA).", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: new application ${a.account.number} from ${a.account.legalName}`,
    html: emailLayout({ preheader: `New trade application: ${a.account.legalName}`, eyebrow: "HQ · Trade", heading: "New trade application", body, cta: { label: "Open it in HQ", href: a.url }, footerHtml: "Sent to the trade team's address (TRADE_EMAIL / FRANCHISE_EMAIL)." }),
    text: textDoc("A new trade account application came in on the trade portal.", "", ...rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, "")}`), "", `Open it in HQ: ${a.url}`),
  };
}

export function tradeApprovedEmail(a: { account: TradeAccountInfo; terms: TradeTermsInfo; url: string }): Rendered {
  const onAccount = a.account.terms === "ACCOUNT";
  const rows: [string, string][] = [
    ["Account", `<span style="font-variant-numeric:tabular-nums">${esc(a.account.number)}</span>`],
    ["Terms", onAccount ? `On account · ${a.account.paymentDays} days from invoice · credit limit ${zar(a.account.creditLimitCents)}` : "Prepaid · EFT before we pick your order"],
    ["Ranges", esc(classList(a.account.classes))],
    ["Minimum order", `${zar(a.terms.minOrderCents)} ex VAT`],
    ["Courier from the DC", a.terms.freeDeliveryOverCents > 0 ? `${zar(a.terms.deliveryCents)} ex VAT, free from ${zar(a.terms.freeDeliveryOverCents)}` : `${zar(a.terms.deliveryCents)} ex VAT`],
    ["Click & collect", `${zar(a.terms.collectHandlingCents)} handling ex VAT at a participating store`],
  ];
  const body =
    para(`Good news: the trade account for <b>${esc(a.account.legalName)}</b> is approved. Sign in with a code sent to your buyer's email address and you'll see trade prices, case packs and live stock.`) +
    facts(rows) +
    para(onAccount ? `Orders on account are invoiced when they ship or are collected and fall due ${a.account.paymentDays} days later. You can always pay an order by EFT instead; the pro forma shows the reference and bank details.` : `Each order comes with a pro forma: pay by EFT with the reference shown and we pick it as soon as the payment is confirmed (within ${a.terms.eftHoldDays} days, or the order lapses).`) +
    para("Prices are ex VAT with VAT shown per line. No points, member prices or consumer deals apply to trade purchases.", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: account ${a.account.number} approved`,
    html: emailLayout({ preheader: `Your trade account is approved. Sign in to order`, eyebrow: "Trade account", heading: "You're approved", body, cta: { label: "Sign in to the trade portal", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`The trade account for ${a.account.legalName} is approved.`, "", ...rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, "")}`), "", `Sign in: ${a.url}`),
  };
}

export function tradeOnHoldEmail(a: { account: TradeAccountInfo; reason: string; balanceCents: number; overdueCents: number; url: string }): Rendered {
  const overdue = a.reason === "overdue";
  const body =
    para(`The trade account <b>${esc(a.account.legalName)}</b> (${esc(a.account.number)}) has been put on hold${overdue ? " because an invoice is past its due date" : ""}.`) +
    (overdue
      ? callout(`<b>${zar(a.overdueCents)} is overdue</b> on a balance of ${zar(a.balanceCents)}. Settle it and the hold lifts automatically.`, "rose")
      : callout(`<b>Reason:</b> ${esc(a.reason)}`, "rose")) +
    para("While the account is on hold you can still sign in, see prices and pay for orders by EFT, but nothing new goes on account. Your statement in the portal shows every open invoice.") +
    para("Questions? Reply to this email and the trade team will help.", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: account ${a.account.number} on hold`,
    html: emailLayout({ preheader: overdue ? `${zar(a.overdueCents)} overdue. The hold lifts when it's settled` : "Your trade account is on hold", eyebrow: "Trade account", heading: "Account on hold", body, cta: { label: "See your statement", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`The trade account ${a.account.legalName} (${a.account.number}) is on hold${overdue ? " because an invoice is past its due date" : ""}.`, overdue ? `${zar(a.overdueCents)} is overdue on a balance of ${zar(a.balanceCents)}. Settle it and the hold lifts automatically.` : `Reason: ${a.reason}`, "", "You can still pay for orders by EFT; nothing new goes on account.", "", `Statement: ${a.url}`),
  };
}

export function tradeHoldLiftedEmail(a: { account: TradeAccountInfo; url: string; licence?: boolean }): Rendered {
  const line = a.licence ? "is back in good standing: its licences are in order and orders can go through again" : "is back in good standing and orders can go on account again";
  const body = para(`Thanks. The account <b>${esc(a.account.legalName)}</b> (${esc(a.account.number)}) ${line}.`);
  return {
    subject: `${SUBJECT}: account ${a.account.number} hold lifted`,
    html: emailLayout({ preheader: "Your trade account is back in good standing", eyebrow: "Trade account", heading: "Hold lifted", body, cta: { label: "Place an order", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`The account ${a.account.legalName} (${a.account.number}) ${line}.`, "", `Order: ${a.url}`),
  };
}

export function tradeClosedEmail(a: { account: TradeAccountInfo; reason?: string | null; balanceCents: number }): Rendered {
  const body =
    para(`The trade account <b>${esc(a.account.legalName)}</b> (${esc(a.account.number)}) has been closed${a.reason ? `: ${esc(a.reason)}` : "."}`) +
    (a.balanceCents > 0 ? callout(`The closing balance of <b>${zar(a.balanceCents)}</b> is still due on the terms of each invoice.`, "soft") : "") +
    para("Buyers on the account can no longer sign in. If this is a mistake, reply to this email.", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: account ${a.account.number} closed`,
    html: emailLayout({ preheader: "Your trade account has been closed", eyebrow: "Trade account", heading: "Account closed", body, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`The trade account ${a.account.legalName} (${a.account.number}) has been closed${a.reason ? `: ${a.reason}` : "."}`, a.balanceCents > 0 ? `The closing balance of ${zar(a.balanceCents)} is still due.` : null),
  };
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type TradeOrderEmailLine = { name: string; qty: number; unitCents: number; exCents: number; vatCents: number; shippedQty?: number | null };
export type TradeOrderEmailInfo = {
  number: string;
  fulfilment: "COURIER" | "COLLECT" | "SAME_DAY";
  payMethod: string;
  paymentRef?: string | null;
  subtotalCents: number; // ex VAT
  deliveryCents: number; // ex VAT
  handlingCents: number; // ex VAT
  vatCents: number;
  totalCents: number; // incl. VAT
  address: string | null;
  reference?: string | null;
  store: { name: string; addressLine: string; suburb?: string | null; city: string; phone?: string | null };
  collectionCode?: string | null;
  courier?: string | null;
  trackingNo?: string | null;
  invoiceNumber?: string | null;
  lines: TradeOrderEmailLine[];
};
export type BankDetails = { bank: string; accountName: string; accountNumber: string; branchCode: string };

const orderRows = (o: TradeOrderEmailInfo, shipped = false): LineRow[] =>
  o.lines
    .filter((l) => !shipped || (l.shippedQty ?? l.qty) > 0)
    .map((l) => {
      const qty = shipped ? (l.shippedQty ?? l.qty) : l.qty;
      const short = shipped && l.shippedQty != null && l.shippedQty < l.qty;
      return { title: l.name, sub: short ? `ordered ${l.qty}, ${qty} supplied` : null, qty, unit: l.unitCents, amountCents: shipped ? l.unitCents * qty : l.exCents };
    });
const orderTotals = (o: TradeOrderEmailInfo): TotalRow[] => [
  { label: "Subtotal ex VAT", cents: o.subtotalCents, muted: true },
  ...(o.deliveryCents ? [{ label: "Courier ex VAT", cents: o.deliveryCents, muted: true }] : []),
  ...(o.handlingCents ? [{ label: "Handling ex VAT", cents: o.handlingCents, muted: true }] : []),
  { label: "VAT @ 15%", cents: o.vatCents, muted: true },
  { label: "Total incl. VAT", cents: o.totalCents, strong: true },
];
const storeLine = (s: TradeOrderEmailInfo["store"]) => `Herbal Holland ${s.name}, ${[s.addressLine, s.suburb, s.city].filter(Boolean).join(", ")}${s.phone ? ` · ${s.phone}` : ""}`;
const textLines = (rows: LineRow[]) => rows.map((r) => `${r.qty} x ${r.title}${r.sub ? ` (${r.sub})` : ""} @ ${zar(r.unit!)}  ${zar(r.amountCents)}`);
const textTotals = (totals: TotalRow[]) => totals.map((t) => `${t.label}: ${zar(t.cents)}`);

/** The pro forma for an EFT order: pay with the reference and we pick it once the payment is confirmed. */
export function tradeProFormaEmail(a: { order: TradeOrderEmailInfo; account: TradeAccountInfo; bank: BankDetails; holdDays: number; url: string }): Rendered {
  const o = a.order;
  const ref = eftReference(o.number);
  const rows = orderRows(o);
  const totals = orderTotals(o);
  const bank = a.bank.accountNumber
    ? [["Bank", a.bank.bank], ["Account name", a.bank.accountName], ["Account number", a.bank.accountNumber], ["Branch code", a.bank.branchCode]].filter(([, v]) => v)
    : [];
  const body =
    para(`Thanks for your order, ${esc(a.account.name)}. This is a pro forma: pay <b>${zar(o.totalCents)}</b> by EFT with the reference below and we'll pick your order as soon as the payment is confirmed. Unpaid orders lapse after ${a.holdDays} days.`) +
    callout(`<b>Reference: ${esc(ref)}</b><br/>Amount: ${zar(o.totalCents)}${bank.length ? `<br/>${bank.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}` : ""}`) +
    facts([
      ["Pro forma", `<span style="font-variant-numeric:tabular-nums">${esc(o.number)}</span>`],
      [o.fulfilment === "COLLECT" ? "Collect from" : "Deliver to", o.fulfilment === "COLLECT" ? esc(storeLine(o.store)) : esc(o.address ?? "")],
      ...(o.reference ? ([["Your reference", esc(o.reference)]] as [string, string][]) : []),
    ]) +
    summaryTable(rows, totals) +
    para("Unit prices exclude VAT. Stock is reserved when the payment is confirmed; a tax invoice follows when the order ships or is collected.", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: pro forma ${o.number}: pay ${zar(o.totalCents)} with reference ${ref}`,
    html: emailLayout({ preheader: `Pay ${zar(o.totalCents)} by EFT, reference ${ref}`, eyebrow: "Pro forma", heading: `Pro forma ${o.number}`, body, cta: { label: "See the order", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`Pro forma ${o.number} for ${a.account.legalName}`, "", `Pay ${zar(o.totalCents)} by EFT with reference ${ref} within ${a.holdDays} days.`, ...bank.map(([k, v]) => `${k}: ${v}`), "", o.fulfilment === "COLLECT" ? `Collect from ${storeLine(o.store)}` : `Deliver to ${o.address ?? ""}`, o.reference ? `Your reference: ${o.reference}` : null, "", ...textLines(rows), "", ...textTotals(totals), "", `See the order: ${a.url}`),
  };
}

export type TradeOrderEvent = "confirmed" | "ready" | "shipped" | "collected" | "cancelled";

/** Order news: confirmed (stock reserved), ready to collect, shipped, collected, cancelled. */
export function tradeOrderEmail(kind: TradeOrderEvent, a: { order: TradeOrderEmailInfo; account: TradeAccountInfo; url: string; invoiceUrl?: string | null; note?: string | null; refundByHand?: boolean }): Rendered {
  const o = a.order;
  const collect = o.fulfilment === "COLLECT";
  const posted = kind === "shipped" || kind === "collected";
  const rows = orderRows(o, posted);
  const totals = orderTotals(o);
  const where = collect ? ["Collect from", esc(storeLine(o.store))] : ["Deliver to", esc(o.address ?? "")];
  const onAccount = o.payMethod === "ACCOUNT";
  const headings: Record<TradeOrderEvent, { eyebrow: string; heading: string; preheader: string; lead: string }> = {
    confirmed: {
      eyebrow: "Order confirmed", heading: `Order ${o.number} is confirmed`, preheader: `${o.number} · ${zar(o.totalCents)} · stock reserved`,
      lead: `Thanks, ${esc(a.account.name)}. Your stock is reserved${collect ? ` at Herbal Holland ${esc(o.store.name)}, and we'll email you when it's packed and ready to collect` : " at the distribution centre and the order is in the picking queue"}. ${onAccount ? `It's on account: the tax invoice follows when it ${collect ? "is collected" : "ships"} and falls due ${a.account.paymentDays} days later.` : "It's paid by EFT; the tax invoice follows when it " + (collect ? "is collected." : "ships.")}`,
    },
    ready: {
      eyebrow: "Ready to collect", heading: `Order ${o.number} is ready`, preheader: `Ready at ${o.store.name} · collection code ${o.collectionCode ?? ""}`,
      lead: `Your order is packed and waiting at <b>Herbal Holland ${esc(o.store.name)}</b>. Give the collection code at the counter and bring your ID: everyone collecting for a trade account must be 18 or older.`,
    },
    shipped: {
      eyebrow: "Shipped", heading: `Order ${o.number} has shipped`, preheader: `${o.courier ?? "Courier"}${o.trackingNo ? ` · ${o.trackingNo}` : ""} · invoice ${o.invoiceNumber ?? ""}`,
      lead: `Your order left the distribution centre with <b>${esc(o.courier ?? "the courier")}</b>${o.trackingNo ? `, tracking <b>${esc(o.trackingNo)}</b>` : ""}. The tax invoice${o.invoiceNumber ? ` ${esc(o.invoiceNumber)}` : ""} is attached to your account${onAccount ? ` and falls due ${a.account.paymentDays} days from today` : ""}.`,
    },
    collected: {
      eyebrow: "Collected", heading: `Order ${o.number} collected`, preheader: `Collected at ${o.store.name} · invoice ${o.invoiceNumber ?? ""}`,
      lead: `Thanks for collecting from Herbal Holland ${esc(o.store.name)}. The tax invoice${o.invoiceNumber ? ` ${esc(o.invoiceNumber)}` : ""} is on your account${onAccount ? ` and falls due ${a.account.paymentDays} days from today` : ""}.`,
    },
    cancelled: {
      eyebrow: "Cancelled", heading: `Order ${o.number} was cancelled`, preheader: `${o.number} cancelled${a.note ? ` · ${a.note}` : ""}`,
      lead: `Order ${esc(o.number)} has been cancelled${a.note ? `: ${esc(a.note)}` : "."}${a.refundByHand ? ` The EFT payment of ${zar(o.totalCents)} (reference ${esc(o.paymentRef ?? eftReference(o.number))}) will be refunded by hand. The trade team will be in touch for your bank details if we don't have them.` : ""} Any stock reserved for it is back on sale.`,
    },
  };
  const h = headings[kind];
  const subject: Record<TradeOrderEvent, string> = { confirmed: "is confirmed", ready: "is ready to collect", shipped: "has shipped", collected: "collected", cancelled: "was cancelled" };
  const body =
    para(h.lead) +
    (kind === "ready" && o.collectionCode ? callout(`<span style="font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:0.16em">${esc(o.collectionCode)}</span><br/>Collection code · bring your ID`, "leaf") : "") +
    facts([
      ["Order", `<span style="font-variant-numeric:tabular-nums">${esc(o.number)}</span>`],
      where as [string, string],
      ...(o.reference ? ([["Your reference", esc(o.reference)]] as [string, string][]) : []),
      ...(posted && o.invoiceNumber ? ([["Tax invoice", `<span style="font-variant-numeric:tabular-nums">${esc(o.invoiceNumber)}</span>`]] as [string, string][]) : []),
    ]) +
    (kind === "cancelled" ? "" : summaryTable(rows, totals)) +
    (posted && rows.some((r) => r.sub) ? para("Short-supplied lines are invoiced for what was supplied.", { muted: true, small: true }) : "") +
    (posted && a.invoiceUrl ? para(`The tax invoice is attached to your account: <a href="${esc(a.invoiceUrl)}" style="color:#C05F18;font-weight:600">view or print it</a>.`, { small: true }) : "");
  return {
    subject: `${SUBJECT}: order ${o.number} ${subject[kind]}`,
    html: emailLayout({ preheader: h.preheader, eyebrow: h.eyebrow, heading: h.heading, body, cta: { label: kind === "cancelled" ? "Place a new order" : "See the order", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(
      h.heading,
      h.lead.replace(/<[^>]+>/g, ""),
      kind === "ready" && o.collectionCode ? `Collection code: ${o.collectionCode} (bring your ID)` : null,
      `${where[0]}: ${where[1].replace(/<[^>]+>/g, "")}`,
      o.reference ? `Your reference: ${o.reference}` : null,
      posted && o.invoiceNumber ? `Tax invoice: ${o.invoiceNumber}` : null,
      ...(kind === "cancelled" ? [] : ["", ...textLines(rows), "", ...textTotals(totals)]),
      posted && a.invoiceUrl ? `View or print the invoice: ${a.invoiceUrl}` : null,
      "",
      `${kind === "cancelled" ? "Place a new order" : "See the order"}: ${a.url}`,
    ),
  };
}

/** The ready-to-collect text (order, store, code, ID) in one GSM segment. */
export const tradeReadySms = (o: { number: string; storeName: string; collectionCode: string }) =>
  `Trade order ${o.number} is ready at Herbal Holland ${o.storeName}. Collection code ${o.collectionCode}. Bring your ID (18+).`;

// ── Tax invoice / credit note for a WHOLESALE sale ───────────────────────────

export type TradeInvoiceSale = {
  id: string;
  number: string;
  kind: "SALE" | "REFUND";
  createdAt: Date | string;
  totalCents: number;
  vatCents: number;
  buyer: unknown;
  store: { name: string; addressLine: string; suburb: string; city: string; company: { legalName: string; vatNumber: string | null } };
  tradeAccount: { number: string; name: string; legalName: string; vatNumber: string | null } | null;
  refundOf: { number: string } | null;
  lines: { id: string; qty: number; unitPriceCents: number; totalCents: number; vatCents: number; variant: { name: string; product: { name: string } } }[];
  payments: { method: string; amountCents: number; reference?: string | null }[];
};

export const tradeInvoiceTitle = (s: { kind: "SALE" | "REFUND"; store: { company: { vatNumber: string | null } } }) =>
  s.kind === "REFUND" ? (s.store.company.vatNumber ? "Credit note" : "Refund") : s.store.company.vatNumber ? "Tax invoice" : "Invoice";

/** The emailed trade tax invoice: seller and buyer blocks (VAT Act s20), lines ex VAT, VAT, total, how it was paid or when it's due. */
export function tradeInvoiceEmail(s: TradeInvoiceSale, opts: { url: string; batchCodes?: Record<string, string[]>; orderNumber?: string | null; orderRef?: string | null; dueAt?: Date | null; handlingCents?: number; deliveryCents?: number }): Rendered {
  const title = tradeInvoiceTitle(s);
  const refund = s.kind === "REFUND";
  const vendor = !!s.store.company.vatNumber;
  const abs = Math.abs;
  const buyer = (s.buyer ?? {}) as { name?: string; address?: string; vatNumber?: string };
  const rows: LineRow[] = s.lines.map((l) => {
    const batches = opts.batchCodes?.[l.id] ?? [];
    return { title: `${l.variant.product.name} · ${l.variant.name}`, sub: batches.length ? `batch ${batches.join(", ")}` : null, qty: abs(l.qty), unit: l.unitPriceCents, amountCents: abs(l.totalCents) - abs(l.vatCents) };
  });
  const linesIncl = s.lines.reduce((n, l) => n + abs(l.totalCents), 0);
  const extraIncl = Math.max(0, abs(s.totalCents) - linesIncl);
  const extraEx = extraIncl - Math.round((extraIncl * 15) / 115);
  if (extraIncl > 0) rows.push({ title: opts.handlingCents ? "Handling (click & collect)" : "Courier", amountCents: extraEx });
  const ex = abs(s.totalCents) - abs(s.vatCents);
  const totals: TotalRow[] = [
    { label: "Total excl. VAT", cents: ex, muted: true },
    ...(vendor ? [{ label: "VAT @ 15%", cents: abs(s.vatCents), muted: true }] : []),
    { label: refund ? "Total credited" : "Total incl. VAT", cents: abs(s.totalCents), strong: true },
  ];
  const account = s.payments.filter((p) => p.method === "ACCOUNT").reduce((n, p) => n + abs(p.amountCents), 0);
  const pays = s.payments.map((p) => `${p.method === "ACCOUNT" ? "On account" : p.method === "EFT" ? "EFT" : p.method === "CARD" ? "Card" : p.method === "CASH" ? "Cash" : p.method === "PAYSHAP" ? "PayShap" : p.method}${p.reference && p.method !== "CASH" ? ` (ref ${p.reference})` : ""} ${zar(abs(p.amountCents))}`);
  const body =
    facts([
      [title, `<span style="font-variant-numeric:tabular-nums">${esc(s.number)}</span>${s.refundOf ? ` <span style="font-weight:400;color:#6b5f57">for ${esc(s.refundOf.number)}</span>` : ""}`],
      ["Date", esc(fmtDateTime(s.createdAt))],
      ...(opts.orderNumber ? ([["Trade order", `<span style="font-variant-numeric:tabular-nums">${esc(opts.orderNumber)}</span>${opts.orderRef ? ` <span style="font-weight:400;color:#6b5f57">your ref ${esc(opts.orderRef)}</span>` : ""}`]] as [string, string][]) : []),
      ["Sold by", `${esc(s.store.company.legalName)}<br/><span style="font-weight:400;color:#6b5f57">Herbal Holland ${esc(s.store.name)} · ${esc(s.store.addressLine)}, ${esc(s.store.suburb)}, ${esc(s.store.city)}${vendor ? ` · VAT no. ${esc(s.store.company.vatNumber!)}` : ""}</span>`],
      ["Sold to", `${esc(buyer.name ?? s.tradeAccount?.legalName ?? "")}<br/><span style="font-weight:400;color:#6b5f57">${esc(buyer.address ?? "")}${buyer.vatNumber ? ` · VAT no. ${esc(buyer.vatNumber)}` : ""}${s.tradeAccount ? ` · account ${esc(s.tradeAccount.number)}` : ""}</span>`],
    ]) +
    summaryTable(rows, totals) +
    (pays.length ? para(`<b>${refund ? "Credited to" : "Paid by"}</b> ${esc(pays.join(" · "))}${!refund && account > 0 && opts.dueAt ? ` · <b>due ${esc(fmtDate(opts.dueAt))}</b>` : ""}`, { small: true }) : "") +
    para(`Unit prices exclude VAT. ${vendor ? `This ${title.toLowerCase()} is issued under section 20 of the VAT Act. ` : ""}It's also in the trade portal under Invoices.`, { muted: true, small: true });
  const text = textDoc(
    `${title} ${s.number}${s.refundOf ? ` (for ${s.refundOf.number})` : ""} · ${fmtDateTime(s.createdAt)}`,
    opts.orderNumber ? `Trade order ${opts.orderNumber}${opts.orderRef ? ` (your ref ${opts.orderRef})` : ""}` : null,
    `Sold by ${s.store.company.legalName} · Herbal Holland ${s.store.name}, ${s.store.addressLine}, ${s.store.suburb}, ${s.store.city}${vendor ? ` · VAT no. ${s.store.company.vatNumber}` : ""}`,
    `Sold to ${buyer.name ?? s.tradeAccount?.legalName ?? ""}${buyer.address ? `, ${buyer.address}` : ""}${buyer.vatNumber ? ` · VAT no. ${buyer.vatNumber}` : ""}${s.tradeAccount ? ` · account ${s.tradeAccount.number}` : ""}`,
    "",
    ...rows.map((r) => `${r.qty != null ? `${r.qty} x ` : ""}${r.title}${r.sub ? ` (${r.sub})` : ""}${r.unit != null ? ` @ ${zar(r.unit)}` : ""}  ${zar(r.amountCents)}`),
    "",
    ...totals.map((t) => `${t.label}: ${zar(t.cents)}`),
    pays.length ? `${refund ? "Credited to" : "Paid by"}: ${pays.join(" · ")}${!refund && account > 0 && opts.dueAt ? ` · due ${fmtDate(opts.dueAt)}` : ""}` : null,
    "",
    `View or print: ${opts.url}`,
  );
  return {
    subject: `${SUBJECT}: ${title.toLowerCase()} ${s.number}${s.tradeAccount ? ` for ${s.tradeAccount.name}` : ""}`,
    html: emailLayout({
      preheader: `${title} ${s.number} for ${zar(abs(s.totalCents))}${account > 0 && opts.dueAt && !refund ? `, due ${fmtDate(opts.dueAt)}` : ""}`,
      eyebrow: `${title} · Herbal Holland ${s.store.name}`,
      heading: `${title} ${s.number}`,
      body,
      cta: { label: `View or print ${title.toLowerCase()}`, href: opts.url },
      footerHtml: FOOTER(s.tradeAccount?.legalName ?? buyer.name ?? "your business"),
    }),
    text,
  };
}

// ── Statement ────────────────────────────────────────────────────────────────

export type TradeStatementEmailInput = {
  account: TradeAccountInfo;
  month: string; // YYYY-MM
  opening: number;
  lines: StatementLine[];
  closing: number;
  ageing: Ageing;
  url: string;
};

const KIND_LABEL: Record<string, string> = { INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", ADJUSTMENT: "Adjustment" };

export function tradeStatementEmail(st: TradeStatementEmailInput): Rendered {
  const monthLabel = fmtMonth(`${st.month}-15T12:00:00Z`);
  const position = st.closing > 0 ? `Balance due: ${zar(st.closing)}` : st.closing < 0 ? `In credit: ${zar(-st.closing)}` : "Nothing owing";
  const rows: FigureRow[] = [
    { label: `Opening balance`, value: zar(st.opening), strong: true },
    ...st.lines.map((l) => ({ label: `${fmtDate(l.at)} · ${KIND_LABEL[l.kind] ?? l.kind}${l.reference ? ` ${l.reference}` : ""}${l.note ? ` · ${l.note}` : ""}`, value: l.debitCents ? zar(l.debitCents) : `−${zar(l.creditCents)}`, indent: true })),
    { label: "Closing balance", value: zar(st.closing), strong: true },
    { label: "Age analysis", value: "", heading: true },
    { label: "Current", value: zar(st.ageing.current) },
    { label: "30 days", value: zar(st.ageing.d30) },
    { label: "60 days", value: zar(st.ageing.d60) },
    { label: "90+ days", value: zar(st.ageing.d90plus) },
  ];
  const body =
    para(`Here is the ${monthLabel} statement for <b>${esc(st.account.legalName)}</b> (${esc(st.account.number)}).`) +
    callout(`<span style="font-family:'Outfit','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums">${esc(position)}</span>${st.ageing.overdue > 0 ? `<br/>${zar(st.ageing.overdue)} of it is past due. Please settle it to keep the account open.` : st.account.terms === "ACCOUNT" ? `<br/>Invoices fall due ${st.account.paymentDays} days from their date.` : ""}`, st.ageing.overdue > 0 ? "rose" : st.closing > 0 ? "brand" : "leaf") +
    figures(rows) +
    para("Pay by EFT with the invoice number as your reference. Every tax invoice and credit note is in the trade portal.", { muted: true, small: true });
  return {
    subject: `${SUBJECT}: statement ${st.account.number}, ${monthLabel}`,
    html: emailLayout({ preheader: position, eyebrow: `Statement · ${monthLabel}`, heading: esc(st.account.name), body, cta: { label: "View or print the statement", href: st.url }, footerHtml: FOOTER(st.account.legalName) }),
    text: textDoc(
      `Trade statement for ${st.account.legalName} (${st.account.number}), ${monthLabel}`,
      "",
      position,
      "",
      `Opening balance: ${zar(st.opening)}`,
      ...st.lines.map((l) => `${fmtDate(l.at)}  ${KIND_LABEL[l.kind] ?? l.kind}${l.reference ? ` ${l.reference}` : ""}  ${l.debitCents ? zar(l.debitCents) : `-${zar(l.creditCents)}`}  (balance ${zar(l.balanceCents)})`),
      `Closing balance: ${zar(st.closing)}`,
      "",
      `Age analysis: current ${zar(st.ageing.current)} · 30 days ${zar(st.ageing.d30)} · 60 days ${zar(st.ageing.d60)} · 90+ days ${zar(st.ageing.d90plus)}`,
      "",
      `View or print: ${st.url}`,
    ),
  };
}

/** The account's address on one line, for emails and the buyer block. */
export const accountAddress = addressLineOf;

// ── Licences ─────────────────────────────────────────────────────────────────

/** To the trade team: a licence document to check (a new application's, or a renewal from the portal). */
export function tradeLicenceNoticeEmail(a: { account: TradeAccountInfo; licence: string; number: string; expiresAt: Date | null; url: string }): Rendered {
  const rows: [string, string][] = [
    ["Account", `${esc(a.account.number)} · ${esc(a.account.legalName)}`],
    ["Licence", esc(a.licence)],
    ["Number", esc(a.number)],
    ["Expires", a.expiresAt ? esc(fmtDate(a.expiresAt)) : "—"],
  ];
  const body = para("A trade account uploaded a licence for checking. Compare the document with the issuer's register before you verify it.") + facts(rows);
  return {
    subject: `${SUBJECT}: licence to check for ${a.account.legalName}`,
    html: emailLayout({ preheader: `${a.licence} to check for ${a.account.legalName}`, eyebrow: "HQ · Trade", heading: "A licence to check", body, cta: { label: "Open it in HQ", href: a.url }, footerHtml: "Sent to the trade team's address (TRADE_EMAIL / FRANCHISE_EMAIL)." }),
    text: textDoc("A trade account uploaded a licence for checking.", "", ...rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, "")}`), "", `Open it in HQ: ${a.url}`),
  };
}

/** To the account: HQ couldn't accept a licence document. */
export function tradeLicenceRejectedEmail(a: { account: TradeAccountInfo; licence: string; reason: string; url: string }): Rendered {
  const body =
    para(`We couldn't accept the <b>${esc(a.licence)}</b> uploaded for <b>${esc(a.account.legalName)}</b> (${esc(a.account.number)}).`) +
    callout(`<b>Why:</b> ${esc(a.reason)}`, "soft") +
    para("Upload a clear copy of the current licence under Account › Licences in the trade portal and we'll check it again.");
  return {
    subject: `${SUBJECT}: ${a.licence} not accepted (${a.account.number})`,
    html: emailLayout({ preheader: `We couldn't accept the ${a.licence}`, eyebrow: "Trade account", heading: "Licence not accepted", body, cta: { label: "Upload it again", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`We couldn't accept the ${a.licence} uploaded for ${a.account.legalName} (${a.account.number}).`, `Why: ${a.reason}`, "", `Upload it again: ${a.url}`),
  };
}

/** To the account: a licence lapses soon. */
export function tradeLicenceExpiringEmail(a: { account: TradeAccountInfo; licence: string; expiresAt: Date; url: string }): Rendered {
  const body =
    para(`The <b>${esc(a.licence)}</b> we hold for <b>${esc(a.account.legalName)}</b> (${esc(a.account.number)}) expires on <b>${esc(fmtDate(a.expiresAt))}</b>.`) +
    para("Upload the renewed licence under Account › Licences before then so ordering carries on without a pause. We can't supply the account once a required licence has lapsed.");
  return {
    subject: `${SUBJECT}: ${a.licence} expires ${fmtDate(a.expiresAt)}`,
    html: emailLayout({ preheader: `Your ${a.licence} expires on ${fmtDate(a.expiresAt)}`, eyebrow: "Trade account", heading: "A licence is about to expire", body, cta: { label: "Upload the renewal", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`The ${a.licence} we hold for ${a.account.legalName} (${a.account.number}) expires on ${fmtDate(a.expiresAt)}.`, "Upload the renewed licence under Account › Licences before then so ordering carries on without a pause.", "", `Upload: ${a.url}`),
  };
}

/** To the account: trading is paused because a required licence lapsed. */
export function tradeLicenceHoldEmail(a: { account: TradeAccountInfo; problems: string[]; url: string }): Rendered {
  const body =
    para(`Ordering for <b>${esc(a.account.legalName)}</b> (${esc(a.account.number)}) is paused: we can't supply the account until its licences are in order.`) +
    callout(a.problems.map((p) => esc(p)).join("<br>"), "soft") +
    para("Upload the renewed licence under Account › Licences. As soon as we've checked it the account is back in good standing, usually within a working day.");
  return {
    subject: `${SUBJECT}: ordering paused for ${a.account.number} (licence)`,
    html: emailLayout({ preheader: "A required licence has lapsed", eyebrow: "Trade account", heading: "Ordering paused", body, cta: { label: "Upload the renewal", href: a.url }, footerHtml: FOOTER(a.account.legalName) }),
    text: textDoc(`Ordering for ${a.account.legalName} (${a.account.number}) is paused until its licences are in order.`, ...a.problems, "", `Upload: ${a.url}`),
  };
}
