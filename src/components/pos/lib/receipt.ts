// Receipt layouts for ESC/POS printers (sale / tax invoice, refund / credit note, test page), built from the same
// ReceiptDTO the till shows and prints in the browser. Pure: bytes in, bytes out (snapshot-tested in tests/escpos.test.ts).
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { EscPos, type Columns, type DrawerPin } from "./escpos";
import { maskMemberNo, tenderLine } from "./rules";
import type { ReceiptDTO, ReceiptLine, ReceiptPayment, ReceiptTrade } from "@/server/pos/types";

/** What the receipt says about the store (the bootstrap's store block, or a subset of it). */
export type ReceiptStore = {
  code: string;
  name: string;
  legalName: string;
  vatNumber: string | null;
  addressLine: string;
  suburb: string;
  city: string;
  postalCode: string;
  phone: string | null;
  licenceRef: string | null;
  receiptFooter: string | null;
};

export type ReceiptOptions = {
  cols: Columns;
  store: ReceiptStore;
  devicePrefix: string;
  /** Which lines are licensed medicine (by variant id): they get the dispensing wording. */
  licensed?: (variantId: string) => boolean;
  /** Which lines are medicines that carry no incentives (CBD supplements by default). */
  noIncentive?: (variantId: string) => boolean;
  /** Training mode: the receipt is watermarked and never looks like a real invoice. */
  training?: boolean;
  /** Feed and cut at the end (off for the browser fallback and tests of partial layouts). */
  cut?: boolean;
  /** Kick the cash drawer with the receipt (cash sales, when the setting is on). */
  drawer?: DrawerPin | null;
  codePage?: number;
};

export const TRAINING_LINE = "*** TRAINING - NOT A RECEIPT ***";
export const TRADE_LINE = "Trade sale: prices ex VAT, VAT shown per line. No points, member prices or deals.";

// ── Trade tax invoices (WHOLESALE): what the lines, totals and tenders say ───
// Shared by the ESC/POS layout and the browser print view so both print the same figures. Pure.

/** A sale line's ex-VAT amount (older receipts cached on the till carry no `exCents`). */
export const lineEx = (l: Pick<ReceiptLine, "totalCents" | "vatCents"> & { exCents?: number }) => l.exCents ?? l.totalCents - l.vatCents;

/**
 * A trade line as the tax invoice prints it: the unit price ex VAT times the quantity, any promotion taken off
 * (ex VAT), the VAT on the line and what it comes to. Negative quantities (a credit note) print as positives with
 * the amounts' own signs.
 */
export function tradeLineRows(l: Pick<ReceiptLine, "qty" | "unitPriceCents" | "totalCents" | "vatCents"> & { exCents?: number }): [string, string][] {
  const qty = Math.abs(l.qty);
  const ex = lineEx(l);
  const rows: [string, string][] = [[`  ${qty} x ${zar(l.unitPriceCents)} ex VAT`, zar(ex)]];
  const off = l.unitPriceCents * qty - Math.abs(ex);
  if (off > 0) rows.push(["  Trade discount ex VAT", `-${zar(off)}`]);
  rows.push(["  VAT 15%", zar(l.vatCents)], ["  Incl VAT", zar(l.totalCents)]);
  return rows;
}

/**
 * The trade totals block: the lines ex VAT, the handling fee of a collected trade order (anything on the document
 * beyond its lines, ex VAT), the VAT and the total incl.
 */
export function tradeTotalRows(r: Pick<ReceiptDTO, "lines" | "totalCents" | "vatCents">): [string, string][] {
  const linesIncl = r.lines.reduce((n, l) => n + l.totalCents, 0);
  const linesVat = r.lines.reduce((n, l) => n + l.vatCents, 0);
  const extraIncl = r.totalCents - linesIncl;
  const extraVat = r.vatCents - linesVat;
  const rows: [string, string][] = [["Subtotal ex VAT", zar(r.lines.reduce((n, l) => n + lineEx(l), 0))]];
  if (extraIncl !== 0) rows.push(["Handling fee ex VAT", zar(extraIncl - extraVat)]);
  rows.push(["VAT 15%", zar(r.vatCents)]);
  return rows;
}

/** A tender as a trade document shows it: "On account - due 2 Nov 2026" (or "Credited to the account" on a credit note); money tenders as usual. */
export function tradeTenderLabel(t: Pick<ReceiptPayment, "method" | "amountCents" | "reference" | "cardLast4">, trade: Pick<ReceiptTrade, "dueAt"> | null | undefined, dots = "****") {
  if (t.method !== "ACCOUNT") return tenderLine(t, dots);
  if (t.amountCents < 0) return "Credited to the account";
  return `On account${trade?.dueAt ? ` - due ${fmtDate(trade.dueAt)}` : ""}`;
}

/** The same tender as paper rows: the due date gets a row of its own, so "On account" and the amount fit 58 mm paper. */
export function tradeTenderRows(t: Pick<ReceiptPayment, "method" | "amountCents" | "reference" | "cardLast4">, trade: Pick<ReceiptTrade, "dueAt"> | null | undefined, dots = "****"): [string, string][] {
  if (t.method !== "ACCOUNT") return [[tenderLine(t, dots), zar(t.amountCents)]];
  if (t.amountCents < 0) return [["Credited to the account", zar(t.amountCents)]];
  return [["On account", zar(t.amountCents)], ...(trade?.dueAt ? ([[`  Due ${fmtDate(trade.dueAt)}`, ""]] as [string, string][]) : [])];
}
export const ADULTS_LINE = "Adults 18+ only. Keep out of reach of children.";
export const LICENSED_LINE = "Licensed medicine dispensed to the named patient under their SAHPRA authorisation by an authorised dispenser. No promotions, points or discounts apply (Medicines Act s18A).";
export const CBD_LINE = "CBD complementary medicine: no promotions or points (Medicines Act s18A).";

/** Header shared by every document: the wordmark, store, legal entity, VAT number and address. */
export function storeHeader(p: EscPos, s: ReceiptStore) {
  p.align("centre").size({ width: 2, height: 2 }).bold(true).line("HERBAL HOLLAND").size().bold(false);
  p.bold(true).line(`${s.name} - ${s.code}`).bold(false);
  p.line(s.legalName);
  if (s.vatNumber) p.line(`VAT no. ${s.vatNumber}`);
  p.para(`${s.addressLine}, ${s.suburb}, ${s.city} ${s.postalCode}`);
  if (s.phone) p.line(`Tel ${s.phone}`);
  p.align("left");
}

/** A sale (tax invoice / invoice) or refund (credit note / refund) receipt. */
export function receiptBytes(r: ReceiptDTO, o: ReceiptOptions): Uint8Array {
  const p = new EscPos(o.cols).init().codePage(o.codePage);
  const licensed = o.licensed ?? (() => false);
  const noIncentive = o.noIncentive ?? (() => false);
  const training = !!o.training || !!r.training;
  const watermark = () => p.align("centre").bold(true).line(TRAINING_LINE).bold(false).align("left");

  if (training) watermark();
  storeHeader(p, o.store);
  p.rule();
  p.align("centre").bold(true).line(training ? `TRAINING ${r.title.toUpperCase()}` : r.title.toUpperCase()).bold(false).align("left");
  p.row(`No. ${r.number}`, fmtDateTime(r.createdAt));
  if (r.refundOf) p.line(`Refund of ${r.refundOf.number}`);
  p.line(`Served by ${r.staff ?? "-"} - till ${o.devicePrefix}`);
  if (r.queued) p.bold(true).line("Offline sale - synced later").bold(false);
  p.rule();

  // A trade sale (WHOLESALE) is a full tax invoice: unit prices ex VAT, VAT per line, the account's buyer block,
  // "On account" with its due date — and never points, member prices or deals.
  const trade = r.channel === "WHOLESALE" ? (r.trade ?? null) : null;
  const isTrade = r.channel === "WHOLESALE";
  const anyLicensed = r.lines.some((l) => licensed(l.variantId));
  const anyCbd = r.lines.some((l) => !licensed(l.variantId) && noIncentive(l.variantId));
  for (const l of r.lines) {
    const rx = licensed(l.variantId);
    p.para(`${l.name} - ${l.variantName}${rx ? " (Rx)" : ""}`);
    if (isTrade) {
      for (const [left, right] of tradeLineRows(l)) p.row(left, right);
      continue;
    }
    p.row(`  ${Math.abs(l.qty)} x ${zar(l.unitPriceCents)}`, zar(l.totalCents));
    if (l.discountCents > 0) p.row(l.offerCents === l.discountCents ? "  My Deals" : "  Discount", `-${zar(l.discountCents)}`);
  }
  p.rule();

  if (isTrade) {
    for (const [left, right] of tradeTotalRows(r)) p.row(left, right);
    p.bold(true).size({ height: 2 }).row("TOTAL INCL VAT", zar(r.totalCents)).size().bold(false);
  } else {
    const offer = Math.max(0, r.offerCents ?? 0);
    if (r.discountCents - offer > 0) p.row("Deals & discounts", `-${zar(r.discountCents - offer)}`);
    if (offer > 0) p.row(`My Deals${r.offers?.length ? ` (${r.offers.join(", ")})` : ""}`, `-${zar(offer)}`);
    p.bold(true).size({ height: 2 }).row("TOTAL", zar(r.totalCents)).size().bold(false);
    if (r.memberSavingsCents > 0) p.row("Rewards savings in prices", zar(r.memberSavingsCents));
    p.row(r.vatCents ? "VAT included (15%)" : "No VAT charged", r.vatCents ? zar(r.vatCents) : "");
  }
  p.rule();

  const change = r.payments.reduce((s, x) => s + (x.changeCents ?? 0), 0);
  for (const t of r.payments) {
    if (isTrade) for (const [left, right] of tradeTenderRows(t, trade)) p.row(left, right);
    else p.row(tenderLine(t, "****"), zar(t.amountCents));
    if (t.tenderedCents != null && t.tenderedCents !== t.amountCents) p.row("  Tendered", zar(t.tenderedCents));
    if (t.method === "VOUCHER" && t.balanceCents != null) p.row("  Left on the voucher", zar(t.balanceCents));
  }
  if (!isTrade && r.pointsRedeemed > 0) p.row("Points redeemed", fmtPoints(r.pointsRedeemed));
  if (change > 0) p.bold(true).size({ height: 2 }).row("CHANGE", zar(change)).size().bold(false);

  if (r.customer && !isTrade) {
    p.rule();
    p.para(`Herbal Holland Rewards - ${r.customer.name} (${maskMemberNo(r.customer.memberNo)})`);
    if (!r.queued && !training) p.row(`Points earned ${fmtPoints(r.pointsEarned)}`, `Balance ${fmtPoints(r.customer.points)}`);
  }
  if (r.buyer) {
    p.rule();
    p.para(`Buyer: ${r.buyer.name}`);
    p.para(r.buyer.address);
    if (r.buyer.vatNumber) p.line(`Buyer VAT no. ${r.buyer.vatNumber}`);
  }
  if (trade) {
    if (!r.buyer) p.rule();
    p.para(`Trade account ${trade.number} - ${trade.name}`);
    if (trade.orderNumber) p.line(`Trade order ${trade.orderNumber}`);
    if (trade.dueAt && trade.onAccountCents > 0) p.para(`Payment terms: ${trade.paymentDays} days - ${zar(trade.onAccountCents)} on account, due ${fmtDate(trade.dueAt)}`);
  }
  if (r.note) p.para(`Reason: ${r.note}`);
  p.rule();

  if (r.invoiceUrl && !training) {
    p.align("centre").qr(r.invoiceUrl, { size: o.cols === 32 ? 4 : 6 });
    p.line("Scan for your invoice");
    p.para(r.invoiceUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, ""));
    p.align("left");
  }
  p.align("centre");
  if (o.store.licenceRef) p.para(o.store.licenceRef);
  if (anyLicensed) p.para(LICENSED_LINE);
  if (anyCbd && !isTrade) p.para(CBD_LINE);
  if (isTrade) p.para(TRADE_LINE);
  p.para(ADULTS_LINE);
  if (o.store.receiptFooter) p.para(o.store.receiptFooter);
  if (r.invoiceEmail && !training) p.para(`Tax invoice emailed to ${r.invoiceEmail}`);
  p.line("Thank you - herbalholland.co.za");
  if (training) watermark();
  p.align("left");

  if (o.cut !== false) p.feed(3).cut();
  if (o.drawer != null && !training) p.drawer(o.drawer);
  return p.bytes();
}

/** A short page that proves the printer, its width setting and (if wired) the drawer. */
export function testPageBytes(o: Pick<ReceiptOptions, "cols" | "store" | "devicePrefix" | "codePage"> & { drawer?: DrawerPin | null; at?: Date }): Uint8Array {
  const p = new EscPos(o.cols).init().codePage(o.codePage);
  storeHeader(p, o.store);
  p.rule();
  p.align("centre").bold(true).line("PRINTER TEST").bold(false).align("left");
  p.row("Till", o.devicePrefix);
  p.row("Width", `${o.cols} columns`);
  p.row("Printed", fmtDateTime(o.at ?? new Date()));
  p.rule();
  p.line("0123456789".repeat(Math.ceil(o.cols / 10)).slice(0, o.cols));
  p.line("Accents: cafe crème naïve Müller");
  p.bold(true).line("Bold").bold(false).size({ height: 2 }).line("Double height").size({ width: 2 }).line("Wide").size();
  p.align("centre").qr("https://herbalholland.co.za", { size: 4 }).line("QR (invoice links)").align("left");
  p.rule();
  p.para(o.drawer != null ? "The drawer should open now." : "Drawer kick is off for this test.");
  p.para(ADULTS_LINE);
  p.feed(3).cut();
  if (o.drawer != null) p.drawer(o.drawer);
  return p.bytes();
}
