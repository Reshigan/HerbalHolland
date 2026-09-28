import Link from "next/link";
import { ArrowUpRight, HandCoins, Lock } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { monthCommission, thisMonth } from "@/server/commission";
import { incentiveExcluded, REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { zar, zarCompact } from "@/lib/money";
import { fmtMonth, num } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Input } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { ViewOnly } from "@/components/hq/ui";
import { saveCommissionRates } from "./actions";

export const metadata = { title: "Commission" };

const CLASSES = Object.keys(REG_CLASS_LABEL) as RegClass[];
const PAGE_SIZE = 25; // every row works out the store's month live, so pages stay small
const monthLabel = (m: string) => fmtMonth(`${m}-15T12:00:00Z`);

export default async function HqCommissionPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const ids = await scopedStoreIds(scopeOf(user), { kind: "RETAIL" });
  const admin = can(user, "admin");
  const month = thisMonth();
  const [y, m] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const page = pageParam(sp.page);
  const paying = { id: { in: ids }, commissionOn: true };

  const [settings, payingCount, awaiting, approved, stores] = await Promise.all([
    getSettings(),
    db.store.count({ where: paying }),
    db.store.count({ where: { ...paying, commissionRuns: { none: { month: previous } } } }),
    db.commissionRun.aggregate({ where: { storeId: { in: ids }, month: previous }, _sum: { totalCents: true }, _count: true }),
    db.store.findMany({ where: paying, select: { id: true, code: true, name: true, company: { select: { name: true } } }, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const pageIds = stores.map((s) => s.id);
  const [estimates, latest] = await Promise.all([
    Promise.all(stores.map((s) => monthCommission(s.id, month))),
    db.commissionRun.groupBy({ by: ["storeId"], where: { storeId: { in: pageIds } }, _max: { month: true } }),
  ]);
  const lastRuns = latest.length
    ? await db.commissionRun.findMany({ where: { OR: latest.map((l) => ({ storeId: l.storeId, month: l._max.month ?? "" })) }, select: { storeId: true, month: true, totalCents: true } })
    : [];
  const lastRun = new Map(lastRuns.map((r) => [r.storeId, r]));
  const rows = stores.map((s, i) => {
    const lines = estimates[i];
    return {
      ...s,
      people: lines.length,
      held: lines.filter((l) => l.held).length,
      estimateCents: lines.reduce((t, l) => t + l.commissionCents, 0),
      last: lastRun.get(s.id) ?? null,
    };
  });
  const pageEstimate = rows.reduce((t, r) => t + r.estimateCents, 0);
  const excluded = incentiveExcluded(settings.compliance);
  const rates = settings.commission.bps;

  return (
    <>
      <PageHeader
        overline="Money"
        title="Commission"
        description="Staff commission on till sales. HQ sets one set of rates for the network; each owner decides whether their stores pay it, approves each month and pays it through their own payroll."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stores paying commission" value={`${num(payingCount)} / ${num(ids.length)}`} sub="switched on by their owners" />
        <Stat label="This month so far" value={zarCompact(pageEstimate)} sub={payingCount > PAGE_SIZE ? `the ${num(rows.length)} stores on this page` : "every store paying it"} />
        <Stat label={`Approved for ${monthLabel(previous)}`} value={zarCompact(approved._sum.totalCents ?? 0)} sub={`${num(approved._count)} ${approved._count === 1 ? "store" : "stores"}, held amounts excluded`} />
        <Stat label="Awaiting approval" value={num(awaiting)} sub={`${awaiting === 1 ? "store hasn't" : "stores haven't"} approved ${monthLabel(previous)}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Stores paying commission" description={`${monthLabel(month)} to date, worked out live · the last month each owner approved`} />
          {rows.length === 0 ? (
            <EmptyState icon={<HandCoins className="h-5 w-5" />} title="No store pays commission yet">
              Owners switch it on from their store&apos;s Commission page — they pay it.
            </EmptyState>
          ) : (
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th align="right" className="whitespace-nowrap">This month so far</Th>
                  <Th align="right" className="whitespace-nowrap">Last approved</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="min-w-48">
                      <Link href={`/hq/stores/${r.code}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-ink-500">
                        <span className="font-mono">{r.code}</span> · {r.company.name}
                      </span>
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <div className="font-semibold text-ink-950">{zar(r.estimateCents)}</div>
                      <div className="text-xs text-ink-500">
                        {r.people === 1 ? "1 person" : `${num(r.people)} people`}
                        {r.held ? <span className="text-amber-700"> · {num(r.held)} held</span> : null}
                      </div>
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      {r.last ? (
                        <>
                          <div className="font-medium text-ink-900">{zar(r.last.totalCents)}</div>
                          <div className="text-xs text-ink-500">{monthLabel(r.last.month)}</div>
                        </>
                      ) : (
                        <span className="text-ink-400">None yet</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/store/${r.code}/commission`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline">
                        Store view <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="px-5 py-3 text-xs text-ink-500">{payingCount > PAGE_SIZE ? "This page" : "Total"}</td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">{zar(pageEstimate)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={payingCount} href={(p) => `/hq/commission${qs({ page: p })}`} />
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Rates" description="A share of each person's till sales ex VAT, by product class. Stores' unapproved months use them straight away." />
          <CardBody>
            {!admin && <ViewOnly className="mb-4">View only — rates are set by the HQ administrator.</ViewOnly>}
            <ActionForm action={saveCommissionRates}>
              <fieldset disabled={!admin} className="min-w-0 divide-y divide-ink-100">
                {CLASSES.map((c) =>
                  excluded.includes(c) ? (
                    <div key={c} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-850">{REG_CLASS_LABEL[c]}</div>
                        <div className="text-xs text-ink-500">
                          {settings.compliance.thcMode === "MEDICAL" && settings.compliance.licensedOnly.includes(c) ? (
                            "Licensed medicine: no incentives, by law (Medicines Act s18A)"
                          ) : (
                            <>
                              {c === "CBD" ? "Complementary medicine: no incentives until counsel clears it" : "No incentives"} (Medicines Act s18A) ·{" "}
                              <Link href="/hq/compliance" className="font-medium text-brand-700 hover:underline">
                                Compliance
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex w-28 shrink-0 items-center justify-end gap-1.5 pr-3 text-sm font-semibold text-ink-500">
                        <Lock className="h-3.5 w-3.5" aria-hidden /> 0%
                      </span>
                    </div>
                  ) : (
                    <div key={c} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor={`rate_${c}`} className="min-w-0 text-sm font-medium text-ink-850">
                          {REG_CLASS_LABEL[c]}
                        </label>
                        <div className="relative w-28 shrink-0">
                          <Input id={`rate_${c}`} name={`rate_${c}`} defaultValue={String((rates[c] ?? 0) / 100)} inputMode="decimal" className="tnum pr-7 text-right" />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">%</span>
                        </div>
                      </div>
                      <FieldError name={`rate_${c}`} />
                    </div>
                  ),
                )}
              </fieldset>
              {admin && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-500">0–10% each</span>
                  <SubmitButton variant="outline" pendingLabel="Saving…">
                    Save rates
                  </SubmitButton>
                </div>
              )}
            </ActionForm>
            <ul className="mt-5 list-disc space-y-1.5 border-t border-ink-100 pl-5 pt-4 text-xs text-ink-600 marker:text-brand-500">
              <li>Refunds claw back from the original seller, in the month of the refund.</li>
              <li>Sales on the seller&apos;s own Rewards card don&apos;t count.</li>
              <li>Anyone with an open loss-prevention alert at the store is held until it&apos;s closed.</li>
              <li>Nobody goes below zero for a month; an owner&apos;s approval freezes the month for payroll.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
