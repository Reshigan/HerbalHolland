// Pure formatting for the trade portal (server and client): plain names for the ranges, case-pack wording, stock
// states and the labels and tones for order and account statuses.
import { zar } from "@/lib/money";
import type { TagTone } from "@/components/shop/ui";

/** Plain names for the ranges a trade account may buy (REG_CLASS_LABEL is the regulatory name). */
export const CLASS_NAME: Record<string, string> = {
  CBD: "CBD supplements",
  CBD_FOOD: "CBD food & drink",
  CBD_TOPICAL: "CBD skin care",
  HEMP: "Hemp",
  SUPPLEMENT: "Supplements",
  ACCESSORY: "Accessories",
  APPAREL: "Apparel",
  GROW: "Grow",
  THC: "Licensed (THC)",
};
export const CLASS_BLURB: Record<string, string> = {
  CBD: "Oils and softgels (Schedule 0 complementary medicines)",
  CBD_FOOD: "Coffee, tea and protein with the CBD naturally in their ingredients",
  CBD_TOPICAL: "Creams and balms",
  HEMP: "Hemp seed and fibre products",
  SUPPLEMENT: "Collagen, protein and other supplements (no cannabis)",
  ACCESSORY: "Grinders, glass, papers and gear",
  APPAREL: "Clothing and merch",
  GROW: "Soil, nutrients, lights and seeds",
};
export const className = (c: string) => CLASS_NAME[c] ?? c;

/** "2 cases (12 units)", "1 case (6 units)", or "3 units" when the pack is one. */
export function fmtCases(qty: number, caseQty: number) {
  const c = Math.max(1, Math.floor(caseQty || 1));
  if (c === 1) return `${qty} ${qty === 1 ? "unit" : "units"}`;
  const n = Math.ceil(qty / c);
  return `${n} ${n === 1 ? "case" : "cases"} (${qty} units)`;
}

/** "R180.00 ex VAT each · case of 6 · R1,080.00 a case". */
export const casePriceLine = (unitCents: number, caseQty: number) =>
  caseQty > 1 ? `${zar(unitCents)} ex VAT each · case of ${caseQty} · ${zar(unitCents * caseQty)} a case` : `${zar(unitCents)} ex VAT each`;

export type StockState = "in" | "low" | "out";
/** Low means fewer than three cases (or ten units) available after reservations. */
export const stockState = (available: number, caseQty: number): StockState => (available <= 0 ? "out" : available < Math.max(3 * Math.max(1, caseQty), 10) ? "low" : "in");
export const STOCK_LABEL: Record<StockState, string> = { in: "In stock", low: "Low stock", out: "Out of stock" };
export const STOCK_TONE: Record<StockState, TagTone> = { in: "green", low: "amber", out: "red" };

export const ORDER_STATUS: Record<string, [string, TagTone]> = {
  PENDING_PAYMENT: ["Awaiting EFT", "amber"],
  PLACED: ["Confirmed", "orange"],
  PICKING: ["Being picked", "violet"],
  READY: ["Ready to collect", "green"],
  SHIPPED: ["Shipped", "green"],
  COLLECTED: ["Collected", "neutral"],
  CANCELLED: ["Cancelled", "red"],
};
export const orderStatus = (s: string): [string, TagTone] => ORDER_STATUS[s] ?? [s.replaceAll("_", " ").toLowerCase(), "neutral"];

export const ACCOUNT_STATUS: Record<string, [string, TagTone]> = {
  PENDING: ["Under review", "amber"],
  APPROVED: ["Approved", "green"],
  ON_HOLD: ["On hold", "red"],
  CLOSED: ["Closed", "neutral"],
};
export const accountStatus = (s: string): [string, TagTone] => ACCOUNT_STATUS[s] ?? [s.toLowerCase(), "neutral"];

export const FULFILMENT_LABEL: Record<string, string> = { COURIER: "Courier from the DC", COLLECT: "Click & collect", SAME_DAY: "Same-day delivery" };
export const PAY_LABEL: Record<string, string> = { EFT: "EFT (pro forma)", ACCOUNT: "On account" };
export const LEDGER_LABEL: Record<string, string> = { INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", ADJUSTMENT: "Adjustment" };
