// Months with ledger activity (SAST), newest first, each with its closing balance; the current month is always there
// once the account has a ledger.
import Link from "next/link";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { ledgerEntries } from "@/server/trade/ledger";
import { Container } from "@/components/shop/ui";
import { fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { requireBuyer } from "../_lib/context";

export const metadata: Metadata = { title: "Statements", robots: { index: false, follow: false } };

const monthOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" });

export default async function TradeStatementsPage() {
  const buyer = await requireBuyer("/trade/statements");
  const entries = await ledgerEntries(buyer.tradeAccountId);
  // Running balance per month, oldest first; then listed newest first.
  const months: { month: string; closing: number; entries: number }[] = [];
  let balance = 0;
  for (const e of entries) {
    const m = monthOf.format(e.createdAt);
    balance += e.cents;
    const last = months.at(-1);
    if (last?.month === m) {
      last.closing = balance;
      last.entries++;
    } else months.push({ month: m, closing: balance, entries: 1 });
  }
  const now = monthOf.format(new Date());
  if (entries.length && months.at(-1)?.month !== now) months.push({ month: now, closing: balance, entries: 0 });
  months.reverse();

  return (
    <Container className="max-w-3xl pt-10 sm:pt-14">
      <div className="eyebrow text-brand-500">{buyer.account.name}</div>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Statements</h1>
      <p className="mt-2 text-ink-400">
        One per month, with every invoice, payment and credit note and the balance after each. Balance now: <span className="tnum font-semibold text-white">{zar(balance)}</span>.
      </p>
      {months.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-ink-800 px-6 py-16 text-center" data-testid="statements-empty">
          <FileText className="mx-auto h-9 w-9 text-brand-500" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 font-display text-xl font-semibold text-white">No statements yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">Your first statement follows your first invoice — an order that has shipped or been collected, or a till purchase on the account.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/40" data-testid="statements">
          {months.map((m) => (
            <li key={m.month}>
              <Link href={`/trade/statements/${m.month}`} className="flex items-center justify-between gap-4 p-4 transition hover:bg-ink-900 sm:p-5">
                <span>
                  <span className="block font-display text-lg font-semibold text-white">{fmtMonth(`${m.month}-15T12:00:00Z`)}</span>
                  <span className="block text-xs text-ink-400">
                    {m.entries} {m.entries === 1 ? "entry" : "entries"}
                    {m.month === now ? " · month to date" : ""}
                  </span>
                </span>
                <span className="tnum text-right">
                  <span className="block font-semibold text-white">{zar(m.closing)}</span>
                  <span className="block text-xs text-ink-400">closing balance</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
