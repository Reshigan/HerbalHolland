// Aged balances for trade accounts, from the account's ledger: invoices raise what it owes, payments and credit notes
// settle the oldest open invoices first (FIFO by due date), and whatever is still open is aged by how far past its due
// date it is as of `now`. Pure, so the Trade aged balances report and its test share one definition.
//
// Buckets, as the HQ trade screens show them: current (not yet due) · 30 days (1–30 past due) · 60 days (31–60) ·
// 90+ days (more than 60 past due: on 30-day terms, an invoice at least 90 days old). Unapplied credit (an overpayment,
// or a credit note bigger than what is open) is a credit balance: it shows as negative `current`, so `total` always
// equals the ledger balance (the sum of the entries).
import { dayKey } from "./format";

export type LedgerEntry = {
  tradeAccountId: string;
  kind: "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
  /** Signed: invoices and positive adjustments add to the balance; payments, credit notes and negative adjustments reduce it. */
  cents: number;
  /** Invoices on ACCOUNT terms carry a due date; anything without one is due when it was raised. */
  dueAt?: Date | string | null;
  createdAt: Date | string;
};

export const AGE_EDGES = [30, 60] as const;
export type AgeBucket = "current" | "d30" | "d60" | "d90plus";
export const AGE_BUCKETS: { key: AgeBucket; label: string; detail: string }[] = [
  { key: "current", label: "Current", detail: "not yet due" },
  { key: "d30", label: "30 days", detail: "1–30 days past due" },
  { key: "d60", label: "60 days", detail: "31–60 days past due" },
  { key: "d90plus", label: "90+ days", detail: "more than 60 days past due" },
];

export type AgedBalance = Record<AgeBucket, number> & {
  /** Everything past its due date (d30 + d60 + d90plus). */
  overdue: number;
  /** The ledger balance: current + overdue (negative = the account is in credit). */
  total: number;
  /** The due date (YYYY-MM-DD, SAST) of the oldest open overdue item, and how many days past due it is. */
  oldestDue: string | null;
  daysOverdue: number;
  /** Open items (invoices or positive adjustments) with something left to pay. */
  openItems: number;
};

const DAY = 86_400_000;
const at = (d: Date | string) => (d instanceof Date ? d : new Date(d)).getTime();

/** Whole days `now` is past `due` (negative while `due` is still ahead). */
export const daysPastDue = (due: Date | string, now: Date) => Math.floor((now.getTime() - at(due)) / DAY);

export function ageBucket(daysPast: number): AgeBucket {
  if (daysPast <= 0) return "current";
  if (daysPast <= AGE_EDGES[0]) return "d30";
  if (daysPast <= AGE_EDGES[1]) return "d60";
  return "d90plus";
}

export const emptyAgedBalance = (): AgedBalance => ({ current: 0, d30: 0, d60: 0, d90plus: 0, overdue: 0, total: 0, oldestDue: null, daysOverdue: 0, openItems: 0 });

/** FIFO ageing of one account's entries (any order). */
export function ageLedger(entries: LedgerEntry[], now = new Date()): AgedBalance {
  // Open items are what raised the balance, each with a due date; every reduction is credit applied oldest-due first.
  const items = entries
    .filter((e) => e.cents > 0)
    .map((e) => ({ due: e.dueAt ?? e.createdAt, raised: at(e.createdAt), remaining: e.cents }))
    .sort((a, b) => at(a.due) - at(b.due) || a.raised - b.raised);
  let credit = entries.filter((e) => e.cents < 0).reduce((s, e) => s - e.cents, 0);
  for (const it of items) {
    if (credit <= 0) break;
    const applied = Math.min(credit, it.remaining);
    it.remaining -= applied;
    credit -= applied;
  }
  const b = emptyAgedBalance();
  for (const it of items) {
    if (it.remaining <= 0) continue;
    b.openItems++;
    const days = daysPastDue(it.due, now);
    b[ageBucket(days)] += it.remaining;
    if (days > 0 && days > b.daysOverdue) {
      b.daysOverdue = days;
      b.oldestDue = dayKey(new Date(at(it.due)));
    }
  }
  b.current -= credit; // unapplied credit: the account is in credit by this much
  b.overdue = b.d30 + b.d60 + b.d90plus;
  b.total = b.current + b.overdue;
  return b;
}

/** Ages every account's entries: account id → aged balance. */
export function ageTradeLedger(entries: LedgerEntry[], now = new Date()): Map<string, AgedBalance> {
  const by = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const list = by.get(e.tradeAccountId);
    if (list) list.push(e);
    else by.set(e.tradeAccountId, [e]);
  }
  return new Map([...by].map(([id, list]) => [id, ageLedger(list, now)]));
}

/** Column-wise sum of aged balances (a totals row). */
export function sumAgedBalances(list: Iterable<AgedBalance>): AgedBalance {
  const t = emptyAgedBalance();
  for (const b of list) {
    for (const k of ["current", "d30", "d60", "d90plus", "overdue", "total", "openItems"] as const) t[k] += b[k];
    if (b.daysOverdue > t.daysOverdue) {
      t.daysOverdue = b.daysOverdue;
      t.oldestDue = b.oldestDue;
    }
  }
  return t;
}
