import { Mail } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { franchiseStatement } from "@/server/finance";
import { sp1 } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { dayKey, fmtDateTime, fmtMonth } from "@/lib/format";
import { emailToOwner } from "./actions";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { Line, PrintStyles } from "@/components/store/ui";
import { AutoSelect } from "@/components/store/auto-submit";
import { ActionButton, PrintButton } from "@/components/store/action-form";
import { cn } from "@/lib/cn";

export const metadata = { title: "Franchise statement" };

export default async function StatementPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const current = dayKey(new Date()).slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = current.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
  });
  const month = months.includes(sp1(sp.month)) ? sp1(sp.month) : months[1];
  const st = await franchiseStatement(store.id, month);
  const label = fmtMonth(`${month}-15T12:00:00Z`);
  const credits = st.lines.filter((l) => l.kind === "credit");
  const debits = st.lines.filter((l) => l.kind === "debit");

  return (
    <>
      <PrintStyles />
      <PageHeader
        className="no-print"
        overline={`Money · ${store.name}`}
        title="Franchise statement"
        description="What moves between your store and HQ each month: online sales HQ collected for you, points, network trading, wholesale stock on account and franchise fees."
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="st-month" className="sr-only">Month</label>
              <AutoSelect id="st-month" name="month" defaultValue={month} wrapperClassName="w-48">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {fmtMonth(`${m}-15T12:00:00Z`)}
                    {m === current ? " (to date)" : ""}
                  </option>
                ))}
              </AutoSelect>
            </form>
            <PrintButton label="Print" />
            {canManage && (
              <ActionButton action={emailToOwner.bind(null, store.code, month)} variant="dark" size="sm">
                <Mail className="h-4 w-4" aria-hidden /> Email to owner
              </ActionButton>
            )}
          </>
        }
      />

      {month === current && <Notice tone="info" className="no-print mb-4">This month is still running — figures are to date and final once the month closes.</Notice>}

      <Card className="mx-auto max-w-4xl print:max-w-none print:border-0 print:shadow-none">
        <CardBody className="p-6 sm:p-8">
          <header className="flex flex-col justify-between gap-4 border-b-2 border-ink-900 pb-5 sm:flex-row sm:items-start">
            <div>
              <div className="eyebrow text-brand-700">Franchise statement</div>
              <h2 className="mt-1 font-display text-2xl font-semibold text-ink-950">{label}</h2>
              <p className="mt-1 text-sm text-ink-600">
                {store.company.legalName}
                {store.company.vatNumber ? ` · VAT ${store.company.vatNumber}` : " · not VAT-registered"}
                <br />
                Herbal Holland {store.name} ({store.code}) · {st.range.from} to {st.range.to}
              </p>
            </div>
            <Logo />
          </header>

          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <section>
              <h3 className="mb-2 font-display text-sm font-semibold text-ink-900">Credits — HQ owes you</h3>
              {credits.map((l) => (
                <div key={l.label} className="flex items-start justify-between gap-4 border-b border-ink-100 py-2 text-sm">
                  <span>
                    <span className="block text-ink-850">{l.label}</span>
                    <span className="text-xs text-ink-500">{l.detail}</span>
                  </span>
                  <span className={cn("tnum whitespace-nowrap font-medium", l.cents ? "text-leaf-700" : "text-ink-400")}>{zar(l.cents)}</span>
                </div>
              ))}
              <Line label="Total credits" value={zar(st.credits)} strong className="mt-1" />
            </section>
            <section>
              <h3 className="mb-2 font-display text-sm font-semibold text-ink-900">Debits — you owe HQ</h3>
              {debits.map((l) => (
                <div key={l.label} className="flex items-start justify-between gap-4 border-b border-ink-100 py-2 text-sm">
                  <span>
                    <span className="block text-ink-850">{l.label}</span>
                    <span className="text-xs text-ink-500">{l.detail}</span>
                  </span>
                  <span className={cn("tnum whitespace-nowrap font-medium", l.cents ? "text-ink-900" : "text-ink-400")}>{l.cents ? `−${zar(l.cents)}` : zar(0)}</span>
                </div>
              ))}
              <Line label="Total debits" value={`−${zar(st.debits)}`} strong className="mt-1" />
            </section>
          </div>

          <div className={cn("mt-8 flex flex-col items-start justify-between gap-2 rounded-2xl p-5 sm:flex-row sm:items-center", st.net >= 0 ? "bg-leaf-50" : "bg-ink-950 text-white")}>
            <div>
              <div className={cn("eyebrow", st.net >= 0 ? "text-leaf-700" : "text-brand-500")}>{st.net >= 0 ? "HQ pays you" : "Amount due to HQ"}</div>
              <p className={cn("mt-1 text-sm", st.net >= 0 ? "text-leaf-700" : "text-ink-300")}>{st.net >= 0 ? "Settled to you by HQ after month end." : "Settled with HQ after month end."}</p>
            </div>
            <div className={cn("font-display text-3xl font-semibold", st.net >= 0 ? "text-leaf-700" : "text-white")}>{zar(Math.abs(st.net))}</div>
          </div>

          <div className="mt-8 grid gap-8 text-sm md:grid-cols-2">
            <section>
              <h3 className="mb-2 font-display text-sm font-semibold text-ink-900">How fees were worked out</h3>
              <Line label="Net sales, all channels (ex VAT)" value={zar(st.input.netSalesExVatCents)} />
              <Line label="Online sales fulfilled (ex VAT)" value={zar(st.input.onlineSalesExVatCents)} />
              <Line label={`Royalty ${store.royaltyBps / 100}% · levy ${store.levyBps / 100}% · e-commerce ${store.ecomBps / 100}%`} value={zar(st.royalty + st.levy + st.ecom)} />
              <Line label="VAT on fees" value={zar(st.feesVat)} muted />
            </section>
            <section>
              <h3 className="mb-2 font-display text-sm font-semibold text-ink-900">Herbal Holland Rewards</h3>
              <Line label="Instant Rewards savings given" value={zar(st.memberSavingsCents)} />
              <p className="text-xs text-ink-500">Tier savings at your tills — already inside your net sales above, so no separate line.</p>
              <Line label="Points issued (funded)" value={zar(st.input.pointsIssuedCents)} className="mt-2" />
              <Line label="Points redeemed (reimbursed)" value={zar(st.input.pointsRedeemedCents)} />
            </section>
          </div>
          <p className="mt-8 border-t border-ink-100 pt-4 text-xs text-ink-400">
            Generated {fmtDateTime(new Date())}. Wholesale and network stock appear in the month they were received; each delivery has its own emailed tax invoice.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
