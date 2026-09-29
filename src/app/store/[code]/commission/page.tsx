import Link from "next/link";
import { Download, HandCoins, Lock, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { monthCommission, thisMonth, type CommissionLine } from "@/server/commission";
import { sp1 } from "@/server/store/rules";
import { incentiveExcluded, REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { zar, zarCompact } from "@/lib/money";
import { fmtDateTime, fmtMonth } from "@/lib/format";
import { approve, release, setCommission } from "./actions";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ReadOnlyNote } from "@/components/store/ui";
import { AutoSelect } from "@/components/store/auto-submit";
import { ConfirmAction } from "@/components/store/action-form";
import { Flash } from "@/components/hq/flash";

export const metadata = { title: "Commission" };

const CLASSES = Object.keys(REG_CLASS_LABEL) as RegClass[];
const monthLabel = (m: string) => fmtMonth(`${m}-15T12:00:00Z`);
const people = (n: number) => (n === 1 ? "1 person" : `${n.toLocaleString()} people`);
const sumOf = (lines: CommissionLine[], f: (l: CommissionLine) => number) => lines.reduce((t, l) => t + f(l), 0);

export default async function CommissionPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const ownerLevel = user.role === "OWNER" || user.role === "HQ_ADMIN"; // the owner pays commission
  const onlyMe = user.role === "BUDTENDER" ? user.id : undefined; // pay is personal: budtenders see their own line only
  const path = `/store/${store.code}/commission`;
  const current = thisMonth();
  const months = Array.from({ length: 13 }, (_, i) => {
    const [y, m] = current.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
  });
  const month = months.includes(sp1(sp.month)) ? sp1(sp.month) : current;
  const previous = months[1];
  const isCurrent = month === current;

  const [settings, run, prevApproved] = await Promise.all([
    getSettings(),
    db.commissionRun.findUnique({ where: { storeId_month: { storeId: store.id, month } } }),
    isCurrent && store.commissionOn && canManage ? db.commissionRun.count({ where: { storeId: store.id, month: previous } }) : 1,
  ]);
  const awaitingPrevious = prevApproved === 0; // last month has ended but isn't approved yet
  const shown = store.commissionOn || !!run; // an approved month stays on record even after commission is switched off
  const [lines, estimate, approver] = await Promise.all([
    run ? (run.lines as CommissionLine[]) : shown ? monthCommission(store.id, month, onlyMe) : [],
    // What last month would have cost at today's rates, to help the owner decide.
    !store.commissionOn && !onlyMe ? monthCommission(store.id, previous) : null,
    run ? db.user.findUnique({ where: { id: run.approvedById }, select: { name: true } }) : null,
  ]);
  const rows = onlyMe ? lines.filter((l) => l.userId === onlyMe) : lines;
  const held = rows.filter((l) => l.held);
  // In an approved month a held line can be released once the person's alerts here are closed.
  const stillOpen = new Set(
    run && held.length
      ? (await db.alert.findMany({ where: { storeId: store.id, userId: { in: held.map((l) => l.userId) }, status: { in: ["OPEN", "INVESTIGATING"] } }, select: { userId: true } })).map((a) => a.userId)
      : [],
  );

  const total = sumOf(rows, (l) => l.commissionCents);
  const heldCents = sumOf(held, (l) => l.commissionCents);
  const payable = total - heldCents;
  const sales = sumOf(rows, (l) => l.salesCents);
  const refunds = sumOf(rows, (l) => l.refundsCents);
  const lastMonthCost = estimate ? sumOf(estimate, (l) => l.commissionCents) : 0;
  const canApprove = ownerLevel && store.commissionOn && !run && !isCurrent;
  const excluded = incentiveExcluded(settings.compliance);
  const rates = CLASSES.map((c) => ({ cls: c, label: REG_CLASS_LABEL[c], medicine: excluded.includes(c), bps: excluded.includes(c) ? 0 : (settings.commission.bps[c] ?? 0) }));

  return (
    <>
      <PageHeader
        overline={`Money · ${store.name}`}
        title="Commission"
        description="What each person earned on their own till sales at HQ's rates, after refunds. The owner switches it on, approves each month once it ends and pays it through payroll."
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="cm-month" className="sr-only">Month</label>
              <AutoSelect id="cm-month" name="month" defaultValue={month} wrapperClassName="w-56">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                    {m === current ? " (to date)" : ""}
                  </option>
                ))}
              </AutoSelect>
            </form>
            {shown && (
              <a href={`${path}/export?month=${month}`} className={buttonClass("outline", "sm")} download>
                <Download className="h-4 w-4" aria-hidden /> Export CSV
              </a>
            )}
          </>
        }
      />
      <Flash message={sp1(sp.m) || undefined} />

      {!store.commissionOn && (
        <Card className="mb-6">
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <HandCoins className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-950">Commission is off at {store.name}</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-600">
                  Switch it on to reward your team for what they sell. Everyone earns a small share of their own till sales, at the rates HQ sets for the whole network. Nothing is paid
                  automatically: you approve each month once it ends and pay it through your own payroll.
                </p>
                {lastMonthCost > 0 && (
                  <p className="mt-2 text-sm text-ink-600">
                    At today&apos;s rates, your team would have earned <span className="font-semibold text-ink-900">{zar(lastMonthCost)}</span> in all on their till sales in {monthLabel(previous)}.
                  </p>
                )}
              </div>
              {ownerLevel ? (
                <ConfirmAction
                  action={setCommission.bind(null, store.code, true)}
                  label="Switch commission on"
                  icon={<HandCoins className="h-4 w-4" aria-hidden />}
                  triggerVariant="primary"
                  variant="primary"
                  size="md"
                  title="Switch commission on?"
                  confirmLabel="Switch on"
                  className="max-w-lg"
                >
                  <p>
                    {monthLabel(current)} counts in full, from the 1st. Your team sees their commission on the till straight away, and nothing is paid until you approve a month.
                  </p>
                </ConfirmAction>
              ) : (
                <ReadOnlyNote>Only the owner can switch commission on — they pay it.</ReadOnlyNote>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {awaitingPrevious && (
        <Notice tone="warn" className="mb-6">
          {monthLabel(previous)} has ended and isn&apos;t approved yet.{" "}
          {ownerLevel ? (
            <Link href={`${path}?month=${previous}`} className="font-semibold underline underline-offset-2">
              Review and approve it
            </Link>
          ) : (
            "The owner approves it for payroll."
          )}
        </Notice>
      )}

      {shown ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={onlyMe ? "Your commission" : "Commission payable"} value={zar(payable)} sub={run ? "approved for payroll" : isCurrent ? "month to date" : "not approved yet"} />
            <Stat label="Held" value={zar(heldCents)} sub={held.length ? `for ${people(held.length)}` : "nobody held"} />
            <Stat label="Commissionable sales" value={zarCompact(sales)} sub="till sales, ex VAT" />
            <Stat label="Refunds clawed back" value={zarCompact(refunds)} sub="from the original sellers" />
          </div>

          <div className="mt-6 grid gap-6 2xl:grid-cols-3">
            <Card className="min-w-0 2xl:col-span-2">
              <CardHeader
                title={monthLabel(month)}
                description={
                  run
                    ? `Approved for payroll by ${approver?.name ?? "the owner"}, ${fmtDateTime(run.approvedAt)}. These figures are frozen.`
                    : isCurrent
                      ? "Month to date — approve after the month ends."
                      : "This month has ended and is ready to approve for payroll."
                }
                action={
                  <Badge tone={run ? "green" : isCurrent ? "blue" : "amber"} dot>
                    {run ? "Approved" : isCurrent ? "Month to date" : "Awaiting approval"}
                  </Badge>
                }
              />
              {canApprove && (
                <div className="px-5 pt-4">
                  <ConfirmAction
                    action={approve.bind(null, store.code, month)}
                    label="Approve for payroll"
                    triggerVariant="primary"
                    variant="primary"
                    size="md"
                    title={`Approve ${monthLabel(month)} for payroll?`}
                    confirmLabel="Approve"
                    className="max-w-xl"
                  >
                    <p>
                      This freezes {monthLabel(month)}: {zar(payable)} to pay {people(rows.length - held.length)}
                      {held.length ? `, and ${zar(heldCents)} held for ${people(held.length)} until their alerts are closed` : ""}. Refunds after this month claw back in the month they happen.
                    </p>
                  </ConfirmAction>
                </div>
              )}
              {!run && !isCurrent && store.commissionOn && canManage && !ownerLevel && <p className="px-5 pt-3 text-xs text-ink-500">The owner approves each month for payroll.</p>}
              {rows.length === 0 ? (
                <EmptyState icon={<HandCoins className="h-5 w-5" />} title={isCurrent ? "No till sales yet this month" : `No till sales in ${monthLabel(month)}`}>
                  {onlyMe ? "Your commission shows here once you ring up sales." : "Everyone who rings up sales at the till shows here, with what they've earned."}
                </EmptyState>
              ) : (
                <Table stickyFirst className="mt-4">
                  <thead>
                    <tr>
                      <Th>Person</Th>
                      <Th align="right" className="whitespace-nowrap">Sales ex VAT</Th>
                      <Th align="right">Refunds clawed back</Th>
                      <Th align="right">Commission</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => {
                      const self = l.userId === user.id;
                      return (
                        <Tr key={l.userId}>
                          <Td className="min-w-44">
                            <div className="flex items-center gap-3">
                              <Avatar name={l.name} />
                              <span className="whitespace-nowrap font-medium text-ink-900">
                                {l.name}
                                {self && <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>}
                              </span>
                            </div>
                          </Td>
                          <Td align="right" className="whitespace-nowrap">{zar(l.salesCents)}</Td>
                          <Td align="right" className="whitespace-nowrap text-ink-600">{l.refundsCents ? zar(l.refundsCents) : <span className="text-ink-500">—</span>}</Td>
                          <Td align="right" className="whitespace-nowrap font-semibold text-ink-950">{zar(l.commissionCents)}</Td>
                          <Td className="min-w-44">
                            {l.held ? (
                              <div className="flex flex-col items-start gap-1.5">
                                <Badge tone="amber" dot>Held</Badge>
                                {self ? (
                                  // Nobody sees the alerts about themselves.
                                  <span className="text-xs text-ink-500">Talk to the owner</span>
                                ) : (
                                  (!run || stillOpen.has(l.userId)) && (
                                    <Link href={`/store/${store.code}/loss-prevention?person=${l.userId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Review open alerts
                                    </Link>
                                  )
                                )}
                                {run && ownerLevel && !self && stillOpen.has(l.userId) && <span className="text-xs text-ink-500">Release once they&apos;re closed</span>}
                                {run && ownerLevel && !stillOpen.has(l.userId) && (
                                  <ConfirmAction
                                    action={release.bind(null, store.code, month, l.userId)}
                                    label="Release"
                                    variant="primary"
                                    title={`Release ${zar(l.commissionCents)} for ${l.name}?`}
                                    confirmLabel="Release"
                                    className="min-w-64"
                                  >
                                    Their alerts here are closed. It&apos;s added to {monthLabel(month)}&apos;s payable total — pay it with the next payroll.
                                  </ConfirmAction>
                                )}
                                {run && !ownerLevel && !stillOpen.has(l.userId) && <span className="text-xs text-ink-500">Alerts closed — the owner can release it</span>}
                              </div>
                            ) : run ? (
                              <Badge tone="green" dot>Approved</Badge>
                            ) : isCurrent ? (
                              <Badge tone="blue" dot>Month to date</Badge>
                            ) : (
                              <Badge dot>Awaiting approval</Badge>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-5 py-3 text-xs text-ink-500">Total · {people(rows.length)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">{zar(sales)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">{zar(refunds)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">
                        {zar(total)}
                        <div className="text-xs font-normal text-ink-500">{heldCents ? `${zar(payable)} payable` : "all payable"}</div>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </Table>
              )}
            </Card>

            <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start 2xl:grid-cols-1">
              <HowItWorks rates={rates} code={store.code} />
              {store.commissionOn && ownerLevel && (
                <Card>
                  <CardHeader title="Switched on" description="You pay commission through your payroll, so only you can switch it off." />
                  <CardBody>
                    <ConfirmAction action={setCommission.bind(null, store.code, false)} label="Switch commission off" title="Switch commission off?" confirmLabel="Switch off">
                      <p>
                        Your team stops seeing commission on the till. Approved months stay on record, but nothing can be approved while it&apos;s off — including {monthLabel(current)} so far.
                      </p>
                    </ConfirmAction>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="max-w-3xl">
          <HowItWorks rates={rates} code={store.code} />
        </div>
      )}
    </>
  );
}

function HowItWorks({ rates, code }: { rates: { cls: RegClass; label: string; medicine: boolean; bps: number }[]; code: string }) {
  return (
    <Card>
      <CardHeader title="How commission works" description="HQ sets the rates for the whole network" />
      <CardBody>
        <dl className="divide-y divide-ink-100 rounded-xl border border-ink-150 text-sm">
          {rates.map((r) => (
            <div key={r.cls} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-ink-600">{r.label}</dt>
              <dd className="tnum font-semibold text-ink-900">
                {r.medicine ? (
                  <span className="inline-flex items-center gap-1 text-ink-500">
                    <Lock className="h-3.5 w-3.5" aria-hidden /> 0% by law
                  </span>
                ) : (
                  `${r.bps / 100}%`
                )}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-700 marker:text-brand-500">
          <li>Everyone earns their product&apos;s rate on their own till sales, ex VAT. Online orders don&apos;t count.</li>
          <li>
            {rates.filter((r) => r.medicine).map((r) => r.label).join(" and ") || "Medicines"} never earn commission: the Medicines Act (s18A) bans incentives for supplying medicine
            {rates.some((r) => r.cls === "CBD" && r.medicine) ? ", and CBD supplements count as medicine until counsel clears them" : ""}.
          </li>
          <li>A refund claws back from whoever made the original sale, in the month of the refund.</li>
          <li>
            Sales rung onto the seller&apos;s own Rewards card don&apos;t count —{" "}
            <Link href={`/store/${code}/team`} className="font-medium text-brand-700 hover:underline">
              link each person&apos;s card on the Team page
            </Link>
            .
          </li>
          <li>Anyone with an open loss-prevention alert here is held until it&apos;s closed.</li>
          <li>Nobody goes below zero for a month.</li>
          <li>Approving a month freezes it for payroll. Held amounts are released once the alerts are closed.</li>
        </ul>
      </CardBody>
    </Card>
  );
}
