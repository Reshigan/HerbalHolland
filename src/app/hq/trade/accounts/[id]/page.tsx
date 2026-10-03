import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, ExternalLink, Mail, PackagePlus, Receipt } from "lucide-react";
import { db } from "@/server/db";
import { tradeAccountSummary } from "@/server/trade/accounts";
import { ledgerEntries, tradeStatementFor } from "@/server/trade/ledger";
import { listTradeOrders } from "@/server/trade/orders";
import { invoiceUrl } from "@/server/invoices";

import { TRADE_CLASSES, TRADE_KINDS, previousMonth } from "@/lib/trade";
import { REG_CLASS_LABEL } from "@/lib/compliance";
import { PROVINCES } from "@/lib/sa";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtMonth, num } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader, Notice, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { TabLinks } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { Detail } from "@/components/ui/misc";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/hq/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { AgeingChips, FULFIL_LABEL, LEDGER_LABEL, LEDGER_TONE, PAY_LABEL, TradeAccountBadge, TradeOrderBadge, kindLabel, termsLabel } from "@/components/admin/trade-ui";
import { accountWhere, tradeScope } from "../../scope";
import { addBuyer, adjustLedger, approveAccount, closeAccount, creditNote, holdAccount, recordPayment, releaseAccount, removeBuyer, saveDetails, saveTerms, sendStatement } from "../actions";

export const metadata = { title: "Trade account" };

type SP = { tab?: string; month?: string; page?: string; m?: string };
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "ledger", label: "Ledger & statements" },
  { key: "orders", label: "Orders" },
  { key: "buyers", label: "Buyers" },
];

export default async function TradeAccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await tradeScope();
  const [summary, inScope] = await Promise.all([tradeAccountSummary(id), s.networkWide ? 1 : db.tradeAccount.count({ where: { AND: [{ id }, accountWhere(s)] } })]);
  if (!summary || !inScope) notFound();
  const { account: a, ageing, balanceCents, availableCents, openOrders, lastOrder } = summary;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const base = `/hq/trade/accounts/${a.id}`;
  const edit = s.canEdit && a.status !== "CLOSED";
  const [lists, dcs, approver] = await Promise.all([
    db.priceList.findMany({ where: { kind: "TRADE" }, select: { id: true, name: true, active: true }, orderBy: [{ active: "desc" }, { priority: "desc" }, { name: "asc" }] }),
    db.store.findMany({ where: { kind: "WAREHOUSE", status: { not: "CLOSED" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    a.approvedById ? db.user.findUnique({ where: { id: a.approvedById }, select: { name: true } }) : null,
  ]);
  const dc = dcs.find((d) => d.id === a.dcId);

  return (
    <>
      <BackLink href="/hq/trade/accounts">Trade accounts</BackLink>
      <PageHeader
        overline={`Trade account · ${a.number}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {a.name}
            <TradeAccountBadge status={a.status} />
          </span>
        }
        description={`${a.legalName} · ${kindLabel(a.kind)} · ${a.city}, ${PROVINCES[a.province]} · ${termsLabel(a)}${a.vatNumber ? ` · VAT ${a.vatNumber}` : " · not a VAT vendor"}`}
        actions={
          s.canEdit && a.status === "APPROVED" ? (
            <ButtonLink href={`${base}/order`}>
              <PackagePlus className="h-4 w-4" aria-hidden /> Place an order
            </ButtonLink>
          ) : undefined
        }
      />
      <Flash message={sp.m} />
      {!s.canEdit && <ViewOnly className="mb-6">View only — the HQ team approves accounts, sets terms and works the ledger.</ViewOnly>}
      {a.status === "ON_HOLD" && (
        <Notice tone="warn" className="mb-6" title={a.holdReason === "overdue" ? "On hold: overdue invoices" : `On hold: ${a.holdReason ?? "held by HQ"}`}>
          Nothing new goes on account until the hold is lifted{a.holdReason === "overdue" ? " — it lifts itself once what's past due is settled" : ""}. EFT orders still work.
        </Notice>
      )}
      {a.status === "PENDING" && <Notice tone="info" className="mb-6" title="Application waiting for approval">Check the business (registration and VAT numbers are format-checked, not verified), then approve it with its terms below. The approval email carries the terms.</Notice>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance" value={zar(balanceCents)} sub={balanceCents < 0 ? "in credit" : ageing.overdue > 0 ? <span className="font-semibold text-rose-600">{zar(ageing.overdue)} overdue</span> : "nothing overdue"} />
        <Stat label="Available credit" value={a.terms === "ACCOUNT" ? zar(availableCents) : "—"} sub={a.terms === "ACCOUNT" ? `limit ${zar(a.creditLimitCents)} · ${a.paymentDays} days` : "prepaid by EFT"} />
        <Stat label="Open orders" value={num(openOrders.count)} sub={openOrders.count ? `${zar(openOrders.cents)} incl. VAT` : "none open"} />
        <Stat label="Last order" value={lastOrder ? zar(lastOrder.totalCents) : "—"} sub={lastOrder ? <Link href={`/hq/trade/orders/${lastOrder.id}`} className="font-semibold text-brand-700 hover:underline">{lastOrder.number} · {fmtDate(lastOrder.createdAt)} →</Link> : "no orders yet"} />
      </div>
      <AgeingChips ageing={ageing} className="mb-6" />

      <TabLinks className="mb-6" current={`${base}${tab === "overview" ? "" : `?tab=${tab}`}`} tabs={TABS.map((t) => ({ href: `${base}${t.key === "overview" ? "" : `?tab=${t.key}`}`, label: t.label, count: t.key === "buyers" ? a.buyers.filter((b) => b.active).length : undefined }))} />

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="min-w-0 space-y-6 xl:col-span-2">
            <Card>
              <CardHeader title={a.status === "PENDING" ? "Approve with terms" : "Terms"} description="Prepaid accounts pay each order by EFT before it's picked; accounts on credit terms are invoiced when the order ships or is collected and pay within the payment days, within the limit. Licensed medicines are never traded." />
              <CardBody>
                <ActionForm action={a.status === "PENDING" ? approveAccount.bind(null, a.id) : saveTerms.bind(null, a.id)}>
                  <fieldset disabled={!edit} className="min-w-0 grid gap-4 sm:grid-cols-3">
                    <Field label="Terms" htmlFor="terms">
                      <Select id="terms" name="terms" defaultValue={a.terms}>
                        <option value="PREPAID">Prepaid (EFT before picking)</option>
                        <option value="ACCOUNT">On account (credit terms)</option>
                      </Select>
                      <FieldError name="terms" />
                    </Field>
                    <Field label="Credit limit (R)" htmlFor="creditLimit" hint="On account only: open invoices plus unshipped on-account orders stay within it">
                      <Input id="creditLimit" name="creditLimit" defaultValue={a.creditLimitCents ? (a.creditLimitCents / 100).toFixed(2) : ""} inputMode="decimal" placeholder="20000.00" />
                      <FieldError name="creditLimit" />
                    </Field>
                    <Field label="Payment days" htmlFor="paymentDays" hint="Invoices fall due this many days after they're raised">
                      <Input id="paymentDays" name="paymentDays" defaultValue={a.paymentDays} inputMode="numeric" />
                      <FieldError name="paymentDays" />
                    </Field>
                    <div className="sm:col-span-3">
                      <span className="mb-1.5 block text-[0.78rem] font-semibold text-ink-700" id="classes-label">Ranges the account may buy</span>
                      <div className="grid gap-2 rounded-xl border border-ink-200 p-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-labelledby="classes-label">
                        {TRADE_CLASSES.map((c) => (
                          <Checkbox key={c} name="classes" value={c} defaultChecked={a.classes.includes(c)} label={REG_CLASS_LABEL[c]} />
                        ))}
                      </div>
                      <FieldError name="classes" />
                    </div>
                    <Field label="Trade price list" htmlFor="priceListId" hint="Blank: the live trade lists by priority, else the wholesale price">
                      <Select id="priceListId" name="priceListId" defaultValue={a.priceListId ?? ""}>
                        <option value="">Live trade lists (by priority)</option>
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (off)"}</option>
                        ))}
                      </Select>
                      <FieldError name="priceListId" />
                    </Field>
                    <Field label="Distribution centre" htmlFor="dcId" hint="Fulfils the account's courier orders">
                      <Select id="dcId" name="dcId" defaultValue={a.dcId ?? ""}>
                        <option value="">Default DC</option>
                        {dcs.map((d) => (
                          <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                        ))}
                      </Select>
                      <FieldError name="dcId" />
                    </Field>
                    <Field label="Notes" htmlFor="notes" hint="For the trade team — the account never sees these" className="sm:col-span-3">
                      <Textarea id="notes" name="notes" defaultValue={a.notes ?? ""} className="min-h-20" maxLength={1000} />
                      <FieldError name="notes" />
                    </Field>
                  </fieldset>
                  {edit && (
                    <div className="mt-4 flex justify-end">
                      <SubmitButton pendingLabel={a.status === "PENDING" ? "Approving…" : "Saving…"}>{a.status === "PENDING" ? "Approve account" : "Save terms"}</SubmitButton>
                    </div>
                  )}
                </ActionForm>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Business details" description="What goes on the tax invoice (VAT Act s20): the legal name, address and VAT number. Pro formas, invoices and statements go to the billing email." />
              <CardBody>
                <ActionForm action={saveDetails.bind(null, a.id)}>
                  <fieldset disabled={!edit} className="min-w-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Trading name" htmlFor="name"><Input id="name" name="name" defaultValue={a.name} maxLength={120} /></Field>
                    <Field label="Legal name" htmlFor="legalName"><Input id="legalName" name="legalName" defaultValue={a.legalName} maxLength={120} /></Field>
                    <Field label="Kind of business" htmlFor="kind">
                      <Select id="kind" name="kind" defaultValue={a.kind}>
                        {Object.entries(TRADE_KINDS).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Company registration" htmlFor="regNumber" hint="2015/123456/07, or blank"><Input id="regNumber" name="regNumber" defaultValue={a.regNumber ?? ""} /></Field>
                    <Field label="VAT number" htmlFor="vatNumber" hint="Ten digits starting with 4, or blank"><Input id="vatNumber" name="vatNumber" defaultValue={a.vatNumber ?? ""} inputMode="numeric" /></Field>
                    <Field label="Billing email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={a.email} /></Field>
                    <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={a.phone ?? ""} inputMode="tel" /></Field>
                    <Field label="Street address" htmlFor="addressLine" className="sm:col-span-2"><Input id="addressLine" name="addressLine" defaultValue={a.addressLine} maxLength={160} /></Field>
                    <Field label="Suburb" htmlFor="suburb"><Input id="suburb" name="suburb" defaultValue={a.suburb ?? ""} /></Field>
                    <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={a.city} /></Field>
                    <Field label="Province" htmlFor="province">
                      <Select id="province" name="province" defaultValue={a.province}>
                        {Object.entries(PROVINCES).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Postal code" htmlFor="postalCode"><Input id="postalCode" name="postalCode" defaultValue={a.postalCode} inputMode="numeric" maxLength={4} /></Field>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <div className="font-display text-sm font-semibold text-ink-900">Delivery address</div>
                      <p className="text-xs text-ink-500">Where courier orders go. Leave the street blank to deliver to the billing address.</p>
                    </div>
                    <Field label="Street address" htmlFor="deliveryLine" className="sm:col-span-2"><Input id="deliveryLine" name="deliveryLine" defaultValue={a.deliveryLine ?? ""} maxLength={160} /></Field>
                    <Field label="Suburb" htmlFor="deliverySuburb"><Input id="deliverySuburb" name="deliverySuburb" defaultValue={a.deliverySuburb ?? ""} /></Field>
                    <Field label="City" htmlFor="deliveryCity"><Input id="deliveryCity" name="deliveryCity" defaultValue={a.deliveryCity ?? ""} /></Field>
                    <Field label="Province" htmlFor="deliveryProvince">
                      <Select id="deliveryProvince" name="deliveryProvince" defaultValue={a.deliveryProvince ?? ""}>
                        <option value="">—</option>
                        {Object.entries(PROVINCES).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Postal code" htmlFor="deliveryPostalCode"><Input id="deliveryPostalCode" name="deliveryPostalCode" defaultValue={a.deliveryPostalCode ?? ""} inputMode="numeric" maxLength={4} /></Field>
                  </fieldset>
                  {edit && (
                    <div className="mt-4 flex justify-end">
                      <SubmitButton variant="outline" pendingLabel="Saving…">Save details</SubmitButton>
                    </div>
                  )}
                </ActionForm>
              </CardBody>
            </Card>
          </div>

          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title="Status" />
              <CardBody className="pt-3">
                <dl className="divide-y divide-ink-100">
                  <Detail label="Status"><TradeAccountBadge status={a.status} /></Detail>
                  <Detail label="Applied">{fmtDateTime(a.createdAt)}</Detail>
                  <Detail label="Terms accepted">{a.termsVersion ?? "—"}{a.termsAcceptedAt ? ` · ${fmtDate(a.termsAcceptedAt)}` : ""}</Detail>
                  <Detail label="Adults only">{a.adultAttestedAt ? "Confirmed 18+" : "—"}</Detail>
                  <Detail label="Approved">{a.approvedAt ? `${fmtDate(a.approvedAt)}${approver ? ` · ${approver.name}` : ""}` : "—"}</Detail>
                  {a.holdReason && <Detail label={a.status === "CLOSED" ? "Closed" : "Hold reason"}>{a.holdReason}</Detail>}
                  <Detail label="Price list">{a.priceList?.name ?? "Live trade lists"}</Detail>
                  <Detail label="DC">{dc ? dc.name : "Default"}</Detail>
                  <Detail label="Ranges">
                    <span className="flex flex-wrap justify-end gap-1">
                      {a.classes.length ? a.classes.map((c) => <Badge key={c}>{c}</Badge>) : "—"}
                    </span>
                  </Detail>
                </dl>
              </CardBody>
            </Card>

            {s.canEdit && a.status !== "CLOSED" && (
              <Card>
                <CardHeader title="Holds and closure" description="A hold stops new on-account orders (EFT still works); closing signs every buyer out for good." />
                <CardBody className="space-y-3">
                  {a.status === "ON_HOLD" ? (
                    <ActionButton action={releaseAccount.bind(null, a.id)} variant="primary" pendingLabel="Lifting…">Lift the hold</ActionButton>
                  ) : a.status === "APPROVED" ? (
                    <ConfirmAction action={holdAccount.bind(null, a.id)} label="Put on hold" title={`Put ${a.name} on hold?`} confirmLabel="Put on hold" variant="dark">
                      <Field label="Reason (in the email the account gets)" htmlFor="hold-reason">
                        <Textarea id="hold-reason" name="reason" className="min-h-16" placeholder="e.g. Invoice TI-000123 disputed" maxLength={200} />
                        <FieldError name="reason" />
                      </Field>
                    </ConfirmAction>
                  ) : null}
                  <ConfirmAction action={closeAccount.bind(null, a.id)} label="Close account" title={`Close ${a.name}?`} confirmLabel="Close account" typeToConfirm="CLOSE">
                    <p>Its buyers are signed out and can&apos;t sign in again. {balanceCents > 0 ? `The balance of ${zar(balanceCents)} stays due.` : "Nothing is owed."}</p>
                    <Field label="Reason (optional, in the email)" htmlFor="close-reason">
                      <Textarea id="close-reason" name="reason" className="min-h-16" maxLength={200} />
                    </Field>
                  </ConfirmAction>
                </CardBody>
              </Card>
            )}
            {a.status === "CLOSED" && (
              <Card>
                <CardBody className="text-sm text-ink-600">This account is closed{a.holdReason ? `: ${a.holdReason}` : ""}. Its buyers can&apos;t sign in; the ledger stays as it is.</CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "ledger" && <LedgerTab accountId={a.id} canEdit={s.canEdit} month={sp.month} base={base} approved={a.status !== "PENDING"} />}
      {tab === "orders" && <OrdersTab accountId={a.id} page={pageParam(sp.page)} base={base} />}
      {tab === "buyers" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Buyers" description="The people who order for this account. Owners also manage the account's details and buyers in the portal; everyone signs in with a code emailed to them." />
            <Table className="mt-4" density="comfortable">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th className="hidden sm:table-cell">Phone</Th>
                  <Th>Role</Th>
                  <Th className="hidden md:table-cell">Last sign-in</Th>
                  {s.canEdit && <Th><span className="sr-only">Actions</span></Th>}
                </tr>
              </thead>
              <tbody>
                {a.buyers.map((b) => (
                  <Tr key={b.id} className={cn(!b.active && "opacity-60")}>
                    <Td className="font-medium text-ink-900">{b.name}{!b.active && <Badge className="ml-2">Removed</Badge>}</Td>
                    <Td className="text-ink-700">{b.email}</Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{b.phone ?? "—"}</Td>
                    <Td><Badge tone={b.role === "OWNER" ? "orange" : "neutral"}>{b.role === "OWNER" ? "Owner" : "Buyer"}</Badge></Td>
                    <Td className="hidden text-ink-600 md:table-cell">{b.lastSignInAt ? fmtDateTime(b.lastSignInAt) : "never"}</Td>
                    {s.canEdit && (
                      <Td>
                        {b.active && a.status !== "CLOSED" && (
                          <ConfirmAction action={removeBuyer.bind(null, a.id, b.id)} label="Remove" title={`Remove ${b.name}?`} confirmLabel="Remove buyer">
                            <p>They&apos;re signed out everywhere and can&apos;t order for the account any more. Their past orders stay.</p>
                          </ConfirmAction>
                        )}
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {edit && (
            <Card>
              <CardHeader title="Add a buyer" description="They get a sign-in code by email the first time they sign in." />
              <CardBody>
                <ActionForm action={addBuyer.bind(null, a.id)} resetOnSuccess className="space-y-4">
                  <Field label="Name" htmlFor="buyer-name"><Input id="buyer-name" name="name" maxLength={120} required /></Field>
                  <Field label="Email" htmlFor="buyer-email" hint="Unique across the network"><Input id="buyer-email" name="email" type="email" required /></Field>
                  <Field label="Phone (optional)" htmlFor="buyer-phone"><Input id="buyer-phone" name="phone" inputMode="tel" /></Field>
                  <Field label="Role" htmlFor="buyer-role">
                    <Select id="buyer-role" name="role" defaultValue="BUYER">
                      <option value="BUYER">Buyer — places orders</option>
                      <option value="OWNER">Owner — also manages the account</option>
                    </Select>
                  </Field>
                  <div className="flex justify-end"><SubmitButton pendingLabel="Adding…">Add buyer</SubmitButton></div>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

async function LedgerTab({ accountId, canEdit, month: rawMonth, base, approved }: { accountId: string; canEdit: boolean; month?: string; base: string; approved: boolean }) {
  const month = rawMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : previousMonth(new Date());
  const [entries, statement, invoices] = await Promise.all([
    ledgerEntries(accountId),
    tradeStatementFor(accountId, month),
    db.tradeOrder.findMany({ where: { tradeAccountId: accountId, invoiceNumber: { not: null } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, invoiceNumber: true, saleId: true } }),
  ]);
  let running = 0;
  const rows = entries.map((e) => ({ ...e, balance: (running += e.cents) })).reverse();
  const orderNo = new Map(invoices.map((o) => [o.id, o]));
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Record a payment" description="An EFT that showed on the bank statement. Name the order it settles so the ageing is exact." />
            <CardBody>
              <ActionForm action={recordPayment.bind(null, accountId)} resetOnSuccess className="space-y-3">
                <Field label="Amount received (R)" htmlFor="pay-amount"><Input id="pay-amount" name="amount" inputMode="decimal" placeholder="2500.00" required /><FieldError name="amount" /></Field>
                <Field label="Bank reference" htmlFor="pay-reference"><Input id="pay-reference" name="reference" maxLength={80} placeholder="HH-TO-000123" required /><FieldError name="reference" /></Field>
                <Field label="Received on" htmlFor="pay-date" hint="Blank: today"><Input id="pay-date" name="receivedAt" type="date" /><FieldError name="receivedAt" /></Field>
                <Field label="Settles order" htmlFor="pay-order" hint="Optional: applied to that invoice first">
                  <Select id="pay-order" name="tradeOrderId" defaultValue="">
                    <option value="">Oldest invoice first</option>
                    {invoices.map((o) => (
                      <option key={o.id} value={o.id}>{o.number} · {o.invoiceNumber}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note (optional)" htmlFor="pay-note"><Input id="pay-note" name="note" maxLength={300} /></Field>
                <div className="flex justify-end"><SubmitButton pendingLabel="Recording…">Record payment</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Credit note" description="A return HQ agreed, or a price correction. Numbered TC-… unless you give a reference." />
            <CardBody>
              <ActionForm action={creditNote.bind(null, accountId)} resetOnSuccess className="space-y-3">
                <Field label="Amount to credit (R)" htmlFor="cn-amount"><Input id="cn-amount" name="amount" inputMode="decimal" required /><FieldError name="amount" /></Field>
                <Field label="Reference (optional)" htmlFor="cn-reference"><Input id="cn-reference" name="reference" maxLength={80} /></Field>
                <Field label="Why" htmlFor="cn-note"><Textarea id="cn-note" name="note" className="min-h-16" maxLength={300} required /><FieldError name="note" /></Field>
                <div className="flex justify-end"><SubmitButton variant="outline" pendingLabel="Issuing…">Issue credit note</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Adjustment" description="An HQ correction either way, always with a note. Negative reduces what the account owes." />
            <CardBody>
              <ActionForm action={adjustLedger.bind(null, accountId)} resetOnSuccess className="space-y-3">
                <Field label="Amount (R, signed)" htmlFor="adj-amount" hint="e.g. −150.00 or 42.50"><Input id="adj-amount" name="amount" inputMode="decimal" placeholder="-150.00" required /><FieldError name="amount" /></Field>
                <Field label="Reference (optional)" htmlFor="adj-reference"><Input id="adj-reference" name="reference" maxLength={80} /></Field>
                <Field label="Note" htmlFor="adj-note"><Textarea id="adj-note" name="note" className="min-h-16" maxLength={300} required /><FieldError name="note" /></Field>
                <div className="flex justify-end"><SubmitButton variant="outline" pendingLabel="Posting…">Post adjustment</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          title={`Statement · ${fmtMonth(`${month}-15T12:00:00Z`)}`}
          description="Opening balance, the month's entries with a running balance, the closing balance and its age analysis at month end. Statements go out by themselves on the statement day."
          action={
            <form method="get" action={base} className="flex items-end gap-2">
              <input type="hidden" name="tab" value="ledger" />
              <Field label="Month" htmlFor="statement-month" className="text-xs">
                <Select id="statement-month" name="month" defaultValue={month} wrapperClassName="w-44">
                  {[...new Set([month, ...months])].sort().reverse().map((m) => (
                    <option key={m} value={m}>{fmtMonth(`${m}-15T12:00:00Z`)}</option>
                  ))}
                </Select>
              </Field>
              <SubmitButtonPlain />
            </form>
          }
        />
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>Opening <b className="tnum text-ink-900">{zar(statement.opening)}</b></span>
            <span>Closing <b className="tnum text-ink-900">{zar(statement.closing)}</b></span>
            <span>Overdue at month end <b className={cn("tnum", statement.ageing.overdue > 0 ? "text-rose-600" : "text-ink-900")}>{zar(statement.ageing.overdue)}</b></span>
            {canEdit && approved && (
              <ActionForm action={sendStatement.bind(null, accountId)} notices="bottom" className="ml-auto inline-flex flex-col items-end gap-2">
                <input type="hidden" name="month" value={month} />
                <SubmitButton variant="outline" size="sm" pendingLabel="Sending…"><Mail className="h-4 w-4" aria-hidden /> Email statement</SubmitButton>
              </ActionForm>
            )}
          </div>
          {statement.lines.length === 0 ? (
            <p className="text-sm text-ink-500">No movement in {fmtMonth(`${month}-15T12:00:00Z`)}.</p>
          ) : (
            <Table density="compact">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Kind</Th>
                  <Th>Reference</Th>
                  <Th align="right">Debit</Th>
                  <Th align="right">Credit</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((l, i) => (
                  <Tr key={i}>
                    <Td className="whitespace-nowrap text-ink-600">{fmtDate(l.at)}</Td>
                    <Td><Badge tone={LEDGER_TONE[l.kind]}>{LEDGER_LABEL[l.kind]}</Badge></Td>
                    <Td className="text-ink-700"><span className="font-mono text-xs">{l.reference ?? "—"}</span>{l.note && <span className="block text-xs text-ink-500">{l.note}</span>}</Td>
                    <Td align="right">{l.debitCents ? zar(l.debitCents) : ""}</Td>
                    <Td align="right">{l.creditCents ? zar(l.creditCents) : ""}</Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(l.balanceCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ledger" description={`${num(entries.length)} entr${entries.length === 1 ? "y" : "ies"}, newest first. Invoices raise what the account owes; payments and credit notes lower it.`} />
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt className="h-5 w-5" aria-hidden />} title="Nothing on the ledger yet" className="py-10">The first invoice lands here when an order ships or is collected, or a till sale goes on account.</EmptyState>
        ) : (
          <Table className="mt-4" stickyFirst minWidth="56rem">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Kind</Th>
                <Th>Reference</Th>
                <Th className="hidden md:table-cell">Due</Th>
                <Th align="right">Debit</Th>
                <Th align="right">Credit</Th>
                <Th align="right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const o = e.tradeOrderId ? orderNo.get(e.tradeOrderId) : undefined;
                return (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-ink-600">{fmtDateTime(e.createdAt)}</Td>
                    <Td><Badge tone={LEDGER_TONE[e.kind]}>{LEDGER_LABEL[e.kind]}</Badge></Td>
                    <Td>
                      <span className="font-mono text-xs text-ink-800">{e.reference ?? "—"}</span>
                      {o && (
                        <span className="block text-xs">
                          <Link href={`/hq/trade/orders/${o.id}`} className="text-brand-700 hover:underline">{o.number}</Link>
                          {e.kind === "INVOICE" && e.saleId && (
                            <a href={invoiceUrl(e.saleId)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-ink-500 hover:text-brand-700">
                              invoice <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          )}
                        </span>
                      )}
                      {e.note && <span className="block text-xs text-ink-500">{e.note}</span>}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{e.dueAt ? fmtDate(e.dueAt) : "—"}</Td>
                    <Td align="right">{e.cents > 0 ? zar(e.cents) : ""}</Td>
                    <Td align="right">{e.cents < 0 ? zar(-e.cents) : ""}</Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(e.balance)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/** A plain submit for the GET month picker (not a server-action form). */
function SubmitButtonPlain() {
  return (
    <button type="submit" className="inline-flex h-10 items-center rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-850 hover:bg-ink-50">
      Show
    </button>
  );
}

async function OrdersTab({ accountId, page, base }: { accountId: string; page: number; base: string }) {
  const r = await listTradeOrders({ accountId, page, pageSize: 25 });
  return (
    <Card>
      <CardHeader title="Orders" description="Every order on this account, newest first." />
      {r.rows.length === 0 ? (
        <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title="No orders yet" className="py-10">Orders placed in the trade portal, or by HQ on the account&apos;s behalf, appear here.</EmptyState>
      ) : (
        <Table className="mt-4" stickyFirst minWidth="52rem">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Fulfilment</Th>
              <Th>Fulfilled by</Th>
              <Th>Payment</Th>
              <Th>Status</Th>
              <Th align="right">Total incl. VAT</Th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((o) => (
              <Tr key={o.id} href={`/hq/trade/orders/${o.id}`}>
                <Td>
                  <Link href={`/hq/trade/orders/${o.id}`} className="font-mono text-[0.8rem] font-semibold text-ink-900 hover:text-brand-700">{o.number}</Link>
                  <span className="block text-xs text-ink-500">{fmtDateTime(o.createdAt)} · {o._count.lines} line{o._count.lines === 1 ? "" : "s"}</span>
                </Td>
                <Td className="text-ink-600">{FULFIL_LABEL[o.fulfilment]}</Td>
                <Td className="text-ink-600">{o.store.name}</Td>
                <Td className="text-ink-600">{PAY_LABEL[o.payMethod] ?? o.payMethod}</Td>
                <Td><TradeOrderBadge status={o.status} /></Td>
                <Td align="right" className="font-medium">{zar(o.totalCents)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={r.page} pageSize={r.pageSize} total={r.total} href={(p) => `${base}?tab=orders&page=${p}`} />
    </Card>
  );
}

