// Till refunds: who may approve one, and which money tender it goes back to.

/** Roles that may approve a refund (and other manager-PIN actions) at the till. */
export const TILL_MANAGER_ROLES = ["MANAGER", "OWNER"] as const;
export const isTillManager = (role: string | null | undefined) => (TILL_MANAGER_ROLES as readonly string[]).includes(role ?? "");

export const REFUND_METHODS = ["CARD", "CASH", "PAYSHAP", "EFT"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

type Paid = { method: string; amountCents: number };

const moneyPaid = (payments: Paid[]) => {
  const by = new Map<RefundMethod, number>();
  for (const p of payments)
    if ((REFUND_METHODS as readonly string[]).includes(p.method) && p.amountCents > 0) by.set(p.method as RefundMethod, (by.get(p.method as RefundMethod) ?? 0) + p.amountCents);
  return [...by].map(([method, cents]) => ({ method, cents }));
};

/**
 * The money part of a refund spread over the sale's own money tenders in proportion to what each paid (largest
 * remainder, so the parts add up exactly). Vouchers, points and the account are settled before this, by the server.
 */
export function refundSplit(payments: Paid[], toTenderCents: number): { method: RefundMethod; cents: number }[] {
  const paid = moneyPaid(payments);
  const total = paid.reduce((s, p) => s + p.cents, 0);
  const amount = Math.max(0, Math.round(toTenderCents));
  if (!total || !amount) return [];
  const parts = paid.map((p) => ({ method: p.method, exact: (amount * p.cents) / total }));
  const out = parts.map((p) => ({ method: p.method, cents: Math.floor(p.exact) }));
  let left = amount - out.reduce((s, p) => s + p.cents, 0);
  for (const i of parts.map((p, i) => ({ i, r: p.exact - Math.floor(p.exact) })).sort((a, b) => b.r - a.r).map((x) => x.i)) {
    if (left <= 0) break;
    out[i].cents++;
    left--;
  }
  return out.filter((p) => p.cents > 0);
}

/** The tender a refund defaults to: the one that paid most of the sale (card when no money tender paid). */
export function defaultRefundMethod(payments: Paid[]): RefundMethod {
  return moneyPaid(payments).sort((a, b) => b.cents - a.cents)[0]?.method ?? "CARD";
}

/** Cash only goes back out of the drawer when cash paid for the sale (a card sale is refunded to a card). */
export const cashRefundAllowed = (payments: Paid[]) => moneyPaid(payments).some((p) => p.method === "CASH");
