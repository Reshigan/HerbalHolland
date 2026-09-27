// Small pure rules for the till: receipt numbering, cash handling, compliance block
// types, order SLAs and Guilders redemption. Isomorphic and unit-tested (tests/pos.test.ts).
import type { BlockKind } from "@/server/pos/types";

/** Device-local receipt number, e.g. PTA01-B00042 (store code · device prefix · sequence). */
export const receiptNumber = (storeCode: string, prefix: string, seq: number) => `${storeCode}-${prefix}${String(seq).padStart(5, "0")}`;

/** South African notes and coins, in cents (R200 … 10c). */
export const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10] as const;
export const denomLabel = (cents: number) => (cents >= 100 ? `R${cents / 100}` : `${cents}c`);
export const isNote = (cents: number) => cents >= 1000;

export function countCash(counts: Record<string, number>) {
  return DENOMINATIONS.reduce((s, d) => s + d * Math.max(0, Math.floor(counts[String(d)] ?? 0)), 0);
}

/** Tendered-amount shortcuts: exact, then the next round amounts a customer is likely to hand over. */
export function quickCash(dueCents: number): number[] {
  if (dueCents <= 0) return [];
  const out = new Set<number>([dueCents]);
  for (const step of [1000, 2000, 5000, 10000, 20000, 50000]) out.add(Math.ceil(dueCents / step) * step);
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

/** Maps the compliance engine's messages to the action the cashier can take. */
export function classifyBlock(message: string): BlockKind {
  if (/^Age verification required/i.test(message)) return "AGE";
  if (/^Customer is under/i.test(message)) return "UNDERAGE";
  if (/patient authorisation/i.test(message)) return "PATIENT";
  if (/authorised quantity/i.test(message)) return "QUANTITY";
  if (/authorised dispenser/i.test(message)) return "DISPENSER";
  if (/needs a licence/i.test(message)) return "LICENCE";
  if (/^Daily limit/i.test(message)) return "DAILY_LIMIT";
  if (/can't be sold via|in-store only/i.test(message)) return "CHANNEL";
  return "OTHER";
}

export type SlaState = "ok" | "warn" | "late";

/** Age of an online order against the ready-for-collection SLA (default 15 minutes). */
export function orderSla(placedAt: Date | string, doneAt: Date | string | null, now: Date, limitMin = 15): { minutes: number; state: SlaState } {
  const end = doneAt ? new Date(doneAt) : now;
  const minutes = Math.max(0, Math.floor((end.getTime() - new Date(placedAt).getTime()) / 60_000));
  return { minutes, state: minutes >= limitMin ? "late" : minutes >= Math.ceil((limitMin * 2) / 3) ? "warn" : "ok" };
}

/**
 * Guilders a member can put towards this sale: whole Guilders (ƒ1 = R1), within their
 * balance, within what's still due, never against medicines, and only once they hold
 * the programme minimum.
 */
export function maxRedeemable(a: { balance: number; eligibleCents: number; dueCents: number; minRedeem: number }) {
  if (a.balance < a.minRedeem) return 0;
  const cap = Math.floor(Math.min(a.eligibleCents, a.dueCents) / 100);
  return Math.max(0, Math.min(a.balance, cap));
}

export const TENDER_LABEL: Record<string, string> = {
  CARD: "Card",
  CASH: "Cash",
  PAYSHAP: "PayShap",
  EFT: "EFT",
  LOYALTY: "Guilders",
  ONLINE: "Paid online",
};

/** 082 ••• 1234 — enough for the cashier to confirm who they're serving. */
export function maskPhone(e164: string) {
  const local = e164.startsWith("+27") ? `0${e164.slice(3)}` : e164;
  return local.length >= 10 ? `${local.slice(0, 3)} ••• ${local.slice(-4)}` : local;
}

/** Extracts a Windmill Club member number from a scanned QR / typed value. */
export const memberNoFrom = (text: string) => text.toUpperCase().match(/HH\d{7}/)?.[0] ?? null;

/** Parses "123.45" / "R 1 234,50" style amounts into cents; null when not a number. */
export function parseRands(input: string): number | null {
  const s = input.replace(/[R\s]/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
