import Link from "next/link";
import { Banknote, BadgeCheck, ChartColumn, ExternalLink, FileText, ImageIcon, MessageSquareWarning, PiggyBank } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { canVerify, waitingCash } from "@/server/banking";
import { getSettings } from "@/server/settings";
import { MANAGERS } from "@/server/reports/types";
import { hrefWith, plural, sp1 } from "@/server/store/rules";
import { zar, zarCompact } from "@/lib/money";
import { addDays, dayKey, fmtDate, fmtDateTime, fmtDay, fmtMonth, fmtTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { addDeposit, queryDeposit, verifyDeposit } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, ReadOnlyNote } from "@/components/store/ui";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/store/action-form";
import { CashUpPicker, SlipInput } from "@/components/store/deposit-form";
import type { DepositStatus, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Banking" };
const PAGE_SIZE = 25;
const STATUS: Record<DepositStatus, { label: string; tone: Tone }> = {
  RECORDED: { label: "Awaiting check", tone: "amber" },
  QUERIED: { label: "Queried", tone: "red" },
  VERIFIED: { label: "Verified", tone: "green" },
};
const STATUSES = Object.keys(STATUS) as DepositStatus[];

/** "26 Sep", "24 – 26 Sep": the days a deposit's cash-ups closed. */
function closedSpan(dates: Date[]) {
  if (!dates.length) return "";
  const [a, b] = [fmtDay(dates[0]), fmtDay(dates[dates.length - 1])];
  return a === b ? a : `${a} – ${b}`;
}

export default async function BankingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const checker = canVerify(user.role);
  const path = `/store/${store.code}/banking`;
  const now = new Date();
  const today = dayKey(now);
  const status = STATUSES.find((s) => s === sp1(sp.status)) ?? null;
  const where: Prisma.CashDepositWhereInput = { storeId: store.id, ...(status && { status }) };

  // ?dep=DEP-000123 (links from cash-ups) opens the page of the list that holds that deposit, so #DEP-000123 lands.
  const dep = sp1(sp.dep);
  let page = pageParam(sp.page);
  if (dep && !status && !sp.page) {
    const d = await db.cashDeposit.findFirst({ where: { storeId: store.id, number: dep }, select: { bankedOn: true, createdAt: true } });
    if (d) {
      const before = await db.cashDeposit.count({ where: { storeId: store.id, OR: [{ bankedOn: { gt: d.bankedOn } }, { bankedOn: d.bankedOn, createdAt: { gt: d.createdAt } }] } });
      page = Math.floor(before / PAGE_SIZE) + 1;
    }
  }

  const [{ banking }, waiting, total, deposits, month, byStatus] = await Promise.all([
    getSettings(),
    waitingCash(store.id, now),
    db.cashDeposit.count({ where }),
    db.cashDeposit.findMany({
      where,
      orderBy: [{ bankedOn: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { slip: { select: { contentType: true, sizeBytes: true } } },
    }),
    db.cashDeposit.aggregate({ where: { storeId: store.id, bankedOn: { gte: new Date(`${today.slice(0, 7)}-01T00:00:00Z`) } }, _sum: { amountCents: true }, _count: true }),
    db.cashDeposit.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
  ]);
  const [users, covered] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set([...waiting.map((s) => s.closedById), ...deposits.flatMap((d) => [d.createdById, d.reviewedById])].filter((x): x is string => !!x))] } },
      select: { id: true, name: true },
    }),
    // The cash-ups each deposit covers, looked up within this store (Shift has no index on depositId).
    deposits.length
      ? db.shift.findMany({ where: { storeId: store.id, depositId: { in: deposits.map((d) => d.id) } }, select: { depositId: true, closedAt: true }, orderBy: { closedAt: "asc" } })
      : Promise.resolve([]),
  ]);
  const who = new Map(users.map((u) => [u.id, u.name]));
  const closedFor = new Map<string, Date[]>();
  for (const s of covered) if (s.depositId && s.closedAt) closedFor.set(s.depositId, [...(closedFor.get(s.depositId) ?? []), s.closedAt]);

  const wpage = pageParam(sp.wp);
  const waitRows = waiting.slice((wpage - 1) * PAGE_SIZE, wpage * PAGE_SIZE); // the service returns at most 200, oldest first
  const waitingCents = waiting.reduce((t, s) => t + s.cashCents, 0);
  const overdue = waiting.filter((s) => s.overdue);
  const overdueCents = overdue.reduce((t, s) => t + s.cashCents, 0);
  const count = (s: DepositStatus) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const allDeposits = byStatus.reduce((t, x) => t + x._count, 0);
  const dueText = banking.dueBusinessDays === 1 ? "by the next business day" : `within ${banking.dueBusinessDays} business days`;
  const withActions = checker && deposits.some((d) => d.status !== "VERIFIED");

  return (
    <>
      <PageHeader
        overline={`Money · ${store.name}`}
        title="Banking"
        description={`The cash from every cash-up goes to the bank ${dueText}, with a photo of the stamped deposit slip. The owner, area manager or HQ then checks each deposit against the bank statement.`}
        actions={
          <>
            <ButtonLink href={`/store/${store.code}/cash-ups`} variant="outline" size="sm">
              <Banknote className="h-4 w-4" strokeWidth={1.9} aria-hidden /> Cash-ups
            </ButtonLink>
            {MANAGERS.includes(user.role) && (
              <ButtonLink href={`/store/${store.code}/reports/cash-banking`} variant="ghost" size="sm">
                <ChartColumn className="h-4 w-4" strokeWidth={1.9} aria-hidden /> Report
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash waiting to be banked" value={zarCompact(waitingCents)} sub={waiting.length ? plural(waiting.length, "cash-up") : "all banked"} />
        <Stat
          label="Overdue"
          value={<span className={overdueCents ? "text-rose-600" : "text-leaf-700"}>{zarCompact(overdueCents)}</span>}
          sub={
            overdue.length ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Badge tone="red" dot>Overdue</Badge>
                {plural(overdue.length, "cash-up")} past the bank-by day
              </span>
            ) : (
              "nothing overdue"
            )
          }
        />
        <Stat label="Banked this month" value={zarCompact(month._sum.amountCents ?? 0)} sub={`${plural(month._count, "deposit")} in ${fmtMonth(now).split(" ")[0]}`} />
        <Stat label="Deposits awaiting a check" value={count("RECORDED").toLocaleString()} sub={count("QUERIED") ? `${plural(count("QUERIED"), "deposit")} queried` : "none queried"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Cash waiting to be banked" description="Closed cash-ups whose cash isn't in a deposit yet, oldest first. Cash to bank is what was counted, less the float that stays in the till." />
          {waiting.length === 0 ? (
            <EmptyState icon={<PiggyBank className="h-5 w-5" aria-hidden />} title="All banked">
              Every closed cash-up&apos;s cash is in a deposit.
            </EmptyState>
          ) : (
            <Table stickyFirst className="mt-4">
              <thead>
                <tr>
                  <Th>Closed · by</Th>
                  <Th align="right">Counted</Th>
                  <Th align="right">Float</Th>
                  <Th align="right" className="whitespace-nowrap">Cash to bank</Th>
                  <Th>Due</Th>
                </tr>
              </thead>
              <tbody>
                {waitRows.map((s) => (
                  <Tr key={s.id}>
                    <Td className="whitespace-nowrap">
                      <Link href={`/store/${store.code}/cash-ups/${s.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                        {fmtDate(s.closedAt!)}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {fmtTime(s.closedAt!)} · {(s.closedById && who.get(s.closedById)) ?? "—"}
                      </div>
                    </Td>
                    <Td align="right">{zar(s.countedCashCents ?? 0)}</Td>
                    <Td align="right" className="text-ink-600">{zar(s.openingFloatCents)}</Td>
                    <Td align="right" className="font-semibold text-ink-900">{zar(s.cashCents)}</Td>
                    <Td className="whitespace-nowrap">
                      <div className="text-ink-700">{fmtDate(`${s.dueOn}T12:00:00Z`)}</div>
                      {s.overdue ? (
                        <Badge tone="red" dot>Overdue</Badge>
                      ) : s.dueOn === today ? (
                        <Badge tone="amber" dot>Due today</Badge>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="px-5 py-3 text-xs text-ink-500">
                    {plural(waiting.length, "cash-up")} waiting{overdue.length ? ` · ${overdue.length} overdue` : ""}
                    {waiting.length >= 200 && " · the oldest 200 are listed — bank these first"}
                  </td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">{zar(waitingCents)}</td>
                  <td />
                </tr>
              </tfoot>
            </Table>
          )}
          {waiting.length > PAGE_SIZE && (
            <div className="border-t border-ink-100">
              <Pagination page={wpage} pageSize={PAGE_SIZE} total={waiting.length} href={(p) => hrefWith(path, sp, { wp: p, dep: null })} />
            </div>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Record a deposit" description="Once the cash is in the bank" />
          <CardBody>
            {!canManage ? (
              <ReadOnlyNote>Managers and owners record deposits.</ReadOnlyNote>
            ) : waiting.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing to bank right now. Cash-ups show up here once they&apos;re closed at the till.</p>
            ) : (
              <ActionForm action={addDeposit.bind(null, store.code)} className="space-y-4" resetOnSuccess notices="bottom" aria-label="Record a deposit">
                <CashUpPicker
                  items={waiting.map((s) => ({
                    id: s.id,
                    label: `${fmtDate(s.closedAt!)} · ${fmtTime(s.closedAt!)}`,
                    sub: [(s.closedById && who.get(s.closedById)) || null, s.overdue ? "overdue" : `due ${fmtDay(`${s.dueOn}T12:00:00Z`)}`].filter(Boolean).join(" · "),
                    cents: s.cashCents,
                    overdue: s.overdue,
                  }))}
                >
                  <FieldError name="shift" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount banked" htmlFor="dep-amount">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500">R</span>
                        <Input id="dep-amount" name="amount" inputMode="decimal" placeholder="0.00" autoComplete="off" className="pl-7" />
                      </div>
                      <FieldError name="amount" />
                    </Field>
                    <Field label="Banked on" htmlFor="dep-day">
                      <Input id="dep-day" name="bankedOn" type="date" defaultValue={today} max={today} min={dayKey(addDays(now, -60))} />
                      <FieldError name="bankedOn" />
                    </Field>
                  </div>
                </CashUpPicker>
                <Field label="Deposit reference" htmlFor="dep-ref" hint="As printed on the slip">
                  <Input id="dep-ref" name="reference" maxLength={40} autoComplete="off" placeholder={`${store.code}-${today.replaceAll("-", "").slice(2)}`} />
                  <FieldError name="reference" />
                </Field>
                <Field
                  label={
                    <>
                      Stamped deposit slip <span className="font-normal text-ink-500">— a phone photo is fine</span>
                    </>
                  }
                  htmlFor="dep-slip"
                  hint="A photo (JPEG, PNG, HEIC, WebP) or a PDF, up to 10 MB"
                >
                  <SlipInput id="dep-slip" />
                  <FieldError name="slip" />
                </Field>
                <Field label="Note (optional)" htmlFor="dep-note">
                  <Input id="dep-note" name="note" maxLength={300} placeholder="Anything the checker should know" />
                </Field>
                <SubmitButton className="w-full" pendingLabel="Uploading the slip…">
                  Record deposit
                </SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Deposits"
          description={`Newest first. ${checker ? "Check each one against the bank statement — a verified deposit is locked. You can't check a deposit you recorded." : "The owner, area manager or HQ checks each one against the bank statement; a verified deposit is locked."}`}
        />
        <div className="mt-4 border-y border-ink-100 p-4 sm:px-5">
          <Chips
            label="Deposit status"
            current={status ?? "ALL"}
            items={[
              { key: "ALL", label: "All", count: allDeposits, href: hrefWith(path, sp, { status: null, page: null, dep: null }) },
              ...STATUSES.map((s) => ({ key: s, label: STATUS[s].label, count: count(s), tone: STATUS[s].tone, href: hrefWith(path, sp, { status: s, page: null, dep: null }) })),
            ]}
          />
        </div>
        {deposits.length === 0 ? (
          <EmptyState icon={<PiggyBank className="h-5 w-5" aria-hidden />} title={status ? `No deposits ${STATUS[status].label.toLowerCase()}` : "No deposits yet"}>
            {status ? "Nothing in this list right now." : "Deposits show here once they're recorded with their slip."}
          </EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Banked on</Th>
                <Th>Deposit</Th>
                <Th align="right">Amount</Th>
                <Th>Cash-ups</Th>
                <Th>Status</Th>
                <Th>Slip</Th>
                {withActions && <Th className="text-right">Check</Th>}
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => {
                const diff = d.amountCents - d.expectedCents;
                const st = STATUS[d.status];
                const pdf = d.slip.contentType === "application/pdf";
                return (
                  <Tr key={d.id} id={d.number} className={cn("scroll-mt-24 target:bg-brand-50", d.number === dep && "bg-brand-50/60")}>
                    <Td className="whitespace-nowrap">
                      <div className="font-medium text-ink-900">{fmtDate(d.bankedOn)}</div>
                      <div className="text-xs text-ink-500">recorded {fmtDateTime(d.createdAt)}</div>
                    </Td>
                    <Td className="min-w-44">
                      <div className="font-semibold text-ink-900">{d.number}</div>
                      <div className="text-xs text-ink-600">Ref {d.reference}</div>
                      <div className="text-xs text-ink-500">by {who.get(d.createdById) ?? "—"}</div>
                      {d.note && <div className="mt-1 max-w-64 text-xs italic text-ink-500">“{d.note}”</div>}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <div className="font-semibold text-ink-900">{zar(d.amountCents)}</div>
                      <div className="mt-0.5">
                        {diff === 0 ? (
                          <Badge tone="green">Matches</Badge>
                        ) : (
                          <Badge tone={diff < 0 && -diff > banking.shortToleranceCents ? "red" : "amber"}>
                            {diff < 0 ? "Short" : "Over"} {zar(Math.abs(diff))}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">of {zar(d.expectedCents)} counted</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="text-ink-800">{plural(closedFor.get(d.id)?.length ?? 0, "cash-up")}</div>
                      {closedFor.has(d.id) && <div className="text-xs text-ink-500">closed {closedSpan(closedFor.get(d.id)!)}</div>}
                    </Td>
                    <Td className="min-w-40">
                      <Badge tone={st.tone} dot>{st.label}</Badge>
                      {d.reviewNote && <div className={cn("mt-1 max-w-64 text-xs", d.status === "QUERIED" ? "font-medium text-rose-600" : "text-ink-600")}>{d.reviewNote}</div>}
                      {d.reviewedAt && (
                        <div className="mt-0.5 text-xs text-ink-500">
                          {d.status === "QUERIED" ? "queried" : "checked"} by {(d.reviewedById && who.get(d.reviewedById)) ?? "—"} · {fmtDate(d.reviewedAt)}
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <a
                        href={`${path}/${d.id}/slip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full text-sm font-medium text-ink-800 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      >
                        {pdf ? <FileText className="h-4 w-4" strokeWidth={1.9} aria-hidden /> : <ImageIcon className="h-4 w-4" strokeWidth={1.9} aria-hidden />}
                        View slip
                        <ExternalLink className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.9} aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                      <div className="text-xs text-ink-500">{pdf ? "PDF" : "Photo"} · {Math.max(1, Math.round(d.slip.sizeBytes / 1024)).toLocaleString()} KB</div>
                    </Td>
                    {withActions && (
                      <Td className="text-right">
                        {d.status === "VERIFIED" ? null : d.createdById === user.id ? (
                          <span className="text-xs text-ink-500">You recorded it — someone else checks it</span>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-2">
                            <ConfirmAction
                              action={verifyDeposit.bind(null, store.code, d.id)}
                              label="Verify"
                              icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
                              title={`Verify ${d.number}?`}
                              confirmLabel="Verify and lock"
                              variant="dark"
                              className="min-w-64"
                            >
                              <p>
                                Only once {zar(d.amountCents)} with reference <b>{d.reference}</b> shows on the bank statement. It can&apos;t be changed after this.
                              </p>
                              <Field label="Note (optional)" htmlFor={`verify-${d.id}`}>
                                <Input id={`verify-${d.id}`} name="note" maxLength={300} placeholder="e.g. On the statement of 29 Sep" />
                              </Field>
                            </ConfirmAction>
                            <ConfirmAction
                              action={queryDeposit.bind(null, store.code, d.id)}
                              label="Query"
                              icon={<MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />}
                              triggerVariant="ghost"
                              title={`Query ${d.number}`}
                              confirmLabel="Send query"
                              variant="dark"
                              className="min-w-64"
                            >
                              <Field label="What doesn't match the bank statement?" htmlFor={`query-${d.id}`}>
                                <Textarea id={`query-${d.id}`} name="note" maxLength={300} className="min-h-20" placeholder="e.g. Only R4,300 shows on the statement" />
                                <FieldError name="note" />
                              </Field>
                            </ConfirmAction>
                          </div>
                        )}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p, dep: null })} />
        </div>
      </Card>
    </>
  );
}
