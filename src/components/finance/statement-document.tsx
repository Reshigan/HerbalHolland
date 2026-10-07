// The monthly franchise statement as a document: who it's between, the period, credits and debits netted to one
// amount, how the fees were worked out. Rendered in the store back office and HQ, printed (A4) or saved as a PDF
// through the browser's print dialog; the emailed version (email-templates.ts) carries the same figures.
import { Mark, Wordmark } from "@/components/brand/logo";
import { DocLabel, Sheet } from "./document";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { franchiseStatement } from "@/server/finance";

export type Statement = Awaited<ReturnType<typeof franchiseStatement>>;
export type Party = { legalName: string; regNumber?: string | null; vatNumber?: string | null; address?: string | null; email?: string | null; phone?: string | null };

export const statementNumber = (storeCode: string, month: string) => `ST-${storeCode}-${month.replace("-", "")}`;

function Amount({ cents, sign = "" }: { cents: number; sign?: "" | "−" }) {
  return <span className="tnum whitespace-nowrap">{cents ? `${sign}${zar(cents)}` : <span className="text-ink-500">—</span>}</span>;
}

export function StatementDocument({ st, company, hq, current, issuedAt }: { st: Statement; company: Party; hq: Party | null; current: boolean; issuedAt: Date }) {
  const s = st.store;
  const monthLabel = fmtMonth(`${st.month}-15T12:00:00Z`);
  const credits = st.lines.filter((l) => l.kind === "credit");
  const debits = st.lines.filter((l) => l.kind === "debit");
  const owed = st.net >= 0;
  return (
    <Sheet aria-label={`Franchise statement ${monthLabel}`}>
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-brand-500 pb-6">
        <div className="flex items-center gap-3 text-ink-950">
          <Mark className="h-12 w-12 text-brand-600" />
          <Wordmark className="text-base" />
        </div>
        <div className="text-right">
          <div className="eyebrow text-brand-700">Franchise statement</div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-950">{monthLabel}</h1>
          <dl className="mt-3 space-y-0.5 text-sm text-ink-700">
            <div>
              <dt className="inline text-ink-500">Statement </dt>
              <dd className="tnum inline font-semibold text-ink-900">{statementNumber(s.code, st.month)}</dd>
            </div>
            <div>
              <dt className="inline text-ink-500">Period </dt>
              <dd className="inline">
                {fmtDate(st.range.from)} – {fmtDate(st.range.to)}
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
          <DocLabel>From · Franchisor</DocLabel>
          <p className="mt-2 font-semibold text-ink-950">{hq?.legalName ?? "Herbal Holland"}</p>
          <dl className="mt-1 space-y-0.5 text-sm leading-relaxed text-ink-700">
            {hq?.address && <dd>{hq.address}</dd>}
            {hq?.regNumber && (
              <div>
                <dt className="inline text-ink-500">Reg. no. </dt>
                <dd className="tnum inline">{hq.regNumber}</dd>
              </div>
            )}
            {hq?.vatNumber && (
              <div>
                <dt className="inline text-ink-500">VAT no. </dt>
                <dd className="tnum inline">{hq.vatNumber}</dd>
              </div>
            )}
            {(hq?.email || hq?.phone) && <dd>{[hq.email, hq.phone].filter(Boolean).join(" · ")}</dd>}
          </dl>
        </div>
        <div>
          <DocLabel>To · Franchisee</DocLabel>
          <p className="mt-2 font-semibold text-ink-950">{company.legalName}</p>
          <dl className="mt-1 space-y-0.5 text-sm leading-relaxed text-ink-700">
            <dd>
              Herbal Holland {s.name} ({s.code}) · {s.addressLine}, {s.suburb}, {s.city}
            </dd>
            {company.regNumber && (
              <div>
                <dt className="inline text-ink-500">Reg. no. </dt>
                <dd className="tnum inline">{company.regNumber}</dd>
              </div>
            )}
            <div>
              {company.vatNumber ? (
                <>
                  <dt className="inline text-ink-500">VAT no. </dt>
                  <dd className="tnum inline">{company.vatNumber}</dd>
                </>
              ) : (
                <dd className="text-ink-500">Not registered for VAT</dd>
              )}
            </div>
            {company.email && <dd>{company.email}</dd>}
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3 rounded-2xl bg-ink-50 p-4 ring-1 ring-ink-100 print:bg-transparent print:ring-ink-200">
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">Net sales ex VAT</div>
          <div className="tnum mt-1 font-display text-xl font-semibold text-ink-950">{zar(st.input.netSalesExVatCents)}</div>
        </div>
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">Online sales ex VAT</div>
          <div className="tnum mt-1 font-display text-xl font-semibold text-ink-950">{zar(st.input.onlineSalesExVatCents)}</div>
        </div>
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-500">{owed ? "HQ pays you" : "Due to HQ"}</div>
          <div className={cn("tnum mt-1 font-display text-xl font-semibold", owed ? "text-leaf-700" : "text-ink-950")}>{zar(Math.abs(st.net))}</div>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-ink-200 text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-500">
            <th className="py-2.5 pr-3 font-semibold">Line</th>
            <th className="hidden py-2.5 px-3 font-semibold sm:table-cell print:table-cell">Basis</th>
            <th className="py-2.5 px-3 text-right font-semibold">Credit</th>
            <th className="py-2.5 pl-3 text-right font-semibold">Debit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} className="pt-4 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-leaf-700">
              Credits (HQ owes you)
            </td>
          </tr>
          {credits.map((l) => (
            <tr key={l.label} className="border-b border-ink-100 align-top">
              <td className="py-2 pr-3 font-medium text-ink-900">
                {l.label}
                <span className="block text-xs font-normal text-ink-500 sm:hidden print:hidden">{l.detail}</span>
              </td>
              <td className="hidden py-2 px-3 text-ink-600 sm:table-cell print:table-cell">{l.detail}</td>
              <td className="py-2 px-3 text-right text-leaf-700">
                <Amount cents={l.cents} />
              </td>
              <td className="py-2 pl-3 text-right text-ink-500">—</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="pt-5 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-brand-700">
              Debits (you owe HQ)
            </td>
          </tr>
          {debits.map((l) => (
            <tr key={l.label} className="border-b border-ink-100 align-top">
              <td className="py-2 pr-3 font-medium text-ink-900">
                {l.label}
                <span className="block text-xs font-normal text-ink-500 sm:hidden print:hidden">{l.detail}</span>
              </td>
              <td className="hidden py-2 px-3 text-ink-600 sm:table-cell print:table-cell">{l.detail}</td>
              <td className="py-2 px-3 text-right text-ink-500">—</td>
              <td className="py-2 pl-3 text-right text-ink-900">
                <Amount cents={l.cents} sign="−" />
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink-900 font-semibold text-ink-950">
            <td className="py-3 pr-3" colSpan={2}>
              Totals
            </td>
            <td className="tnum py-3 px-3 text-right">{zar(st.credits)}</td>
            <td className="tnum py-3 pl-3 text-right">−{zar(st.debits)}</td>
          </tr>
        </tbody>
      </table>

      <div className={cn("mt-6 flex flex-col items-start justify-between gap-2 rounded-2xl p-5 sm:flex-row sm:items-center print:ring-1 print:ring-ink-200", owed ? "bg-leaf-50" : "bg-ink-950 text-white print:bg-transparent print:text-ink-950")}>
        <div>
          <div className={cn("eyebrow", owed ? "text-leaf-700" : "text-brand-500 print:text-brand-700")}>{owed ? "Net position · HQ pays you" : "Net position · amount due to HQ"}</div>
          <p className={cn("mt-1 text-sm", owed ? "text-leaf-700" : "text-ink-300 print:text-ink-600")}>{owed ? "Settled to your nominated account by HQ after month end." : "Settled with HQ after month end, as the franchise agreement provides."}</p>
        </div>
        <div className={cn("tnum font-display text-3xl font-semibold", owed ? "text-leaf-700" : "text-white print:text-ink-950")}>{zar(Math.abs(st.net))}</div>
      </div>

      <div className="mt-8 grid gap-8 text-sm sm:grid-cols-2">
        <section>
          <DocLabel>How the fees were worked out</DocLabel>
          <dl className="mt-2 divide-y divide-ink-100">
            {[
              ["Net sales, all channels (ex VAT)", zar(st.input.netSalesExVatCents)],
              ["Online sales fulfilled by the store (ex VAT)", zar(st.input.onlineSalesExVatCents)],
              ["Trade sales (ex VAT)", zar(st.input.tradeSalesExVatCents ?? 0)],
              [`Royalty ${s.royaltyBps / 100}% of net sales`, zar(st.royalty)],
              [`Marketing fund levy ${s.levyBps / 100}% of net sales`, zar(st.levy)],
              [`E-commerce commission ${s.ecomBps / 100}% of online sales`, zar(st.ecom)],
              ["VAT on fees at 15%", zar(st.feesVat)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-ink-600">{k}</dt>
                <dd className="tnum text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <DocLabel>Herbal Holland Rewards</DocLabel>
          <dl className="mt-2 divide-y divide-ink-100">
            {[
              ["Instant Rewards savings given to members", zar(st.memberSavingsCents)],
              ["Points issued (funds the network pool)", zar(st.input.pointsIssuedCents)],
              ["Points redeemed in store (reimbursed)", zar(st.input.pointsRedeemedCents)],
              ["My Deals given (marketing fund)", zar(st.input.offersFundedCents ?? 0)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-ink-600">{k}</dt>
                <dd className="tnum text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-500">Tier savings at your tills are already inside your net sales, so they carry no separate line.</p>
        </section>
      </div>

      <footer className="mt-10 border-t border-ink-150 pt-5 text-xs leading-relaxed text-ink-500">
        <p>
          Wholesale and network stock appear in the month they were received; each delivery carries its own tax invoice, so this statement is a reconciliation and not a tax invoice for those lines. Fees are invoiced by {hq?.legalName ?? "the franchisor"} and include VAT as shown.
        </p>
        <p className="mt-1">
          Trade sales are sales to business accounts rung up at your tills or collected at your store. HQ collected the money (online, by EFT, or on its trade ledger for sales on account, where HQ carries the credit risk) and credits it to you above, as it does online sales. Royalty and the marketing levy apply to trade sales at the standard rates; the e-commerce commission does not.
        </p>
        <p className="mt-1">
          Generated {fmtDateTime(issuedAt)}
          {hq ? ` · ${[hq.legalName, hq.regNumber ? `Reg. no. ${hq.regNumber}` : null, hq.vatNumber ? `VAT no. ${hq.vatNumber}` : null].filter(Boolean).join(" · ")}` : ""}. Queries: {hq?.email ?? "your area manager"}.
        </p>
      </footer>
    </Sheet>
  );
}
