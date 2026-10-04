// The monthly trade statement as a document on a white sheet (A4 on paper): the parties, opening balance, every
// entry with a running balance, the closing balance and its age analysis. Figures from tradeStatementFor.
import { Mark, Wordmark } from "@/components/brand/logo";
import { DocLabel, Sheet } from "@/components/finance/document";
import { LEDGER_LABEL } from "./format";
import type { tradeStatementFor } from "@/server/trade/ledger";
import { addressLineOf } from "@/lib/trade";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export type TradeStatementData = Awaited<ReturnType<typeof tradeStatementFor>>;
export type Party = { legalName: string; regNumber?: string | null; vatNumber?: string | null; address?: string | null; email?: string | null; phone?: string | null };

function Amount({ cents, sign = "" }: { cents: number; sign?: "" | "−" }) {
  return <span className="tnum whitespace-nowrap">{cents ? `${sign}${zar(cents)}` : <span className="text-ink-500">—</span>}</span>;
}

export function TradeStatementDocument({ st, hq, issuedAt, current }: { st: TradeStatementData; hq: Party | null; issuedAt: Date; current: boolean }) {
  const a = st.account;
  const monthLabel = fmtMonth(`${st.month}-15T12:00:00Z`);
  const owing = st.closing > 0;
  return (
    <Sheet aria-label={`Trade statement ${monthLabel}`}>
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-brand-500 pb-6">
        <div className="flex items-center gap-3 text-ink-950">
          <Mark className="h-12 w-12 text-brand-600" />
          <Wordmark className="text-base" />
        </div>
        <div className="text-right">
          <div className="eyebrow text-brand-700">Trade statement</div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-950">{monthLabel}</h1>
          <dl className="mt-3 space-y-0.5 text-sm text-ink-700">
            <div>
              <dt className="inline text-ink-500">Account </dt>
              <dd className="tnum inline font-semibold text-ink-900">{a.number}</dd>
            </div>
            <div>
              <dt className="inline text-ink-500">Period </dt>
              <dd className="inline">
                {fmtDate(st.from)} – {fmtDate(new Date(st.to.getTime() - 1))}
              </dd>
            </div>
            <div>
              <dt className="inline text-ink-500">Issued </dt>
              <dd className="inline">{fmtDate(issuedAt)}</dd>
            </div>
          </dl>
          {current && <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">Month to date · final after month end</span>}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-8 py-6 sm:grid-cols-2">
        <div>
          <DocLabel>From</DocLabel>
          <p className="mt-2 font-semibold text-ink-950">{hq?.legalName ?? "Herbal Holland"}</p>
          <dl className="mt-1 space-y-0.5 text-sm leading-relaxed text-ink-700">
            {hq?.address && <dd>{hq.address}</dd>}
            {hq?.regNumber && <dd className="tnum">Reg. no. {hq.regNumber}</dd>}
            {hq?.vatNumber && <dd className="tnum">VAT no. {hq.vatNumber}</dd>}
            {(hq?.email || hq?.phone) && <dd>{[hq.email, hq.phone].filter(Boolean).join(" · ")}</dd>}
          </dl>
        </div>
        <div>
          <DocLabel>To</DocLabel>
          <p className="mt-2 font-semibold text-ink-950">{a.legalName}</p>
          <dl className="mt-1 space-y-0.5 text-sm leading-relaxed text-ink-700">
            {a.name !== a.legalName && <dd>trading as {a.name}</dd>}
            <dd>{addressLineOf(a)}</dd>
            {a.regNumber && <dd className="tnum">Reg. no. {a.regNumber}</dd>}
            <dd className={cn("tnum", !a.vatNumber && "text-ink-500")}>{a.vatNumber ? `VAT no. ${a.vatNumber}` : "Not registered for VAT"}</dd>
            <dd>{a.email}</dd>
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3 rounded-2xl bg-ink-50 p-4 ring-1 ring-ink-100 print:bg-transparent print:ring-ink-200">
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">Opening balance</div>
          <div className="tnum mt-1 font-display text-xl font-semibold text-ink-950" data-testid="st-opening">{zar(st.opening)}</div>
        </div>
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">Closing balance</div>
          <div className={cn("tnum mt-1 font-display text-xl font-semibold", owing ? "text-ink-950" : "text-leaf-700")} data-testid="st-closing">{zar(st.closing)}</div>
        </div>
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">Past due</div>
          <div className={cn("tnum mt-1 font-display text-xl font-semibold", st.ageing.overdue > 0 ? "text-rose-600" : "text-ink-950")}>{zar(st.ageing.overdue)}</div>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-ink-200 text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-500">
            <th scope="col" className="py-2.5 pr-3 font-semibold">Date</th>
            <th scope="col" className="py-2.5 px-3 font-semibold">Entry</th>
            <th scope="col" className="py-2.5 px-3 text-right font-semibold">Debit</th>
            <th scope="col" className="py-2.5 px-3 text-right font-semibold">Credit</th>
            <th scope="col" className="py-2.5 pl-3 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-ink-100">
            <td className="py-2 pr-3 text-ink-600">{fmtDate(st.from)}</td>
            <td className="py-2 px-3 font-medium text-ink-900">Opening balance</td>
            <td className="py-2 px-3 text-right text-ink-500">—</td>
            <td className="py-2 px-3 text-right text-ink-500">—</td>
            <td className="tnum py-2 pl-3 text-right text-ink-900">{zar(st.opening)}</td>
          </tr>
          {st.lines.map((l, i) => (
            <tr key={i} className="border-b border-ink-100 align-top">
              <td className="py-2 pr-3 text-ink-600">{fmtDate(l.at)}</td>
              <td className="py-2 px-3">
                <span className="font-medium text-ink-900">
                  {LEDGER_LABEL[l.kind] ?? l.kind}
                  {l.reference ? <span className="tnum"> {l.reference}</span> : ""}
                </span>
                {l.note && <span className="block text-xs text-ink-500">{l.note}</span>}
              </td>
              <td className="py-2 px-3 text-right text-ink-900">
                <Amount cents={l.debitCents} />
              </td>
              <td className="py-2 px-3 text-right text-leaf-700">
                <Amount cents={l.creditCents} />
              </td>
              <td className="tnum py-2 pl-3 text-right text-ink-900">{zar(l.balanceCents)}</td>
            </tr>
          ))}
          {st.lines.length === 0 && (
            <tr className="border-b border-ink-100">
              <td colSpan={5} className="py-4 text-center text-ink-500">
                No entries this month.
              </td>
            </tr>
          )}
          <tr className="border-t-2 border-ink-900 font-semibold text-ink-950">
            <td className="py-3 pr-3" colSpan={2}>
              Closing balance
            </td>
            <td className="py-3 px-3 text-right">
              <Amount cents={st.lines.reduce((s, l) => s + l.debitCents, 0)} />
            </td>
            <td className="py-3 px-3 text-right">
              <Amount cents={st.lines.reduce((s, l) => s + l.creditCents, 0)} />
            </td>
            <td className="tnum py-3 pl-3 text-right">{zar(st.closing)}</td>
          </tr>
        </tbody>
      </table>

      <section className="mt-8 text-sm">
        <DocLabel>Age analysis at {fmtDate(st.asAt < st.to ? st.asAt : new Date(st.to.getTime() - 1))}</DocLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Current", st.ageing.current],
              ["30 days", st.ageing.d30],
              ["60 days", st.ageing.d60],
              ["90+ days", st.ageing.d90plus],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink-50 p-3 ring-1 ring-ink-100 print:bg-transparent print:ring-ink-200">
              <dt className="text-xs text-ink-500">{k}</dt>
              <dd className="tnum mt-0.5 font-semibold text-ink-900">{zar(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="mt-10 border-t border-ink-150 pt-5 text-xs leading-relaxed text-ink-500">
        <p>
          {a.terms === "ACCOUNT" ? `Invoices fall due ${a.paymentDays} days from their date. ` : "Orders are paid by EFT against their pro forma; invoices on this statement net against those payments. "}
          Pay by EFT with the invoice number as your reference. Every tax invoice and credit note is in the trade portal under Orders.
        </p>
        <p className="mt-1">
          Generated {fmtDateTime(issuedAt)}
          {hq ? ` · ${[hq.legalName, hq.regNumber ? `Reg. no. ${hq.regNumber}` : null, hq.vatNumber ? `VAT no. ${hq.vatNumber}` : null].filter(Boolean).join(" · ")}` : ""}.
        </p>
      </footer>
    </Sheet>
  );
}
