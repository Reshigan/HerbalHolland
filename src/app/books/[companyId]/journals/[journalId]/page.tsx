import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Trash2, Undo2 } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { sourceLink } from "@/server/ledger/admin";
import { MANUAL_SOURCES } from "@/server/ledger/core";
import { db } from "@/server/db";
import { sourceLabel } from "@/lib/ledger-admin";
import { dayKey, fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { hrefWith, sp1 } from "@/server/store/rules";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Detail } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BackLink, ReadOnlyNote } from "@/components/store/ui";
import { ActionButton, ConfirmAction, FieldError } from "@/components/ui/action-form";
import { Flash } from "@/components/hq/flash";
import { approveJournalAction, deleteDraftAction, reverseJournalAction } from "../actions";

export const metadata = { title: "Journal" };
const PAGE_SIZE = 200;

export default async function JournalPage({ params, searchParams }: { params: Promise<{ companyId: string; journalId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId, journalId }, sp] = await Promise.all([params, searchParams]);
  const { user, company, role } = await requireBooks(companyId);
  const j = await db.journal.findFirst({ where: { id: journalId, companyId } });
  if (!j) notFound();
  const base = `/books/${companyId}`;
  const page = pageParam(sp.page);
  const [count, lines, debits, credits, reversedBy, reversalOf, people, link] = await Promise.all([
    db.journalLine.count({ where: { journalId } }),
    db.journalLine.findMany({ where: { journalId }, include: { account: { select: { code: true, name: true, party: true } } }, orderBy: [{ amountCents: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.journalLine.aggregate({ where: { journalId, amountCents: { gt: 0 } }, _sum: { amountCents: true } }),
    db.journalLine.aggregate({ where: { journalId, amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
    db.journal.findUnique({ where: { reversalOfId: j.id }, select: { id: true, number: true, date: true } }),
    j.reversalOfId ? db.journal.findUnique({ where: { id: j.reversalOfId }, select: { id: true, number: true } }) : null,
    db.user.findMany({ where: { id: { in: [j.createdById, j.approvedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    sourceLink(j, user),
  ]);
  const ids = (kind: string) => [...new Set(lines.flatMap((l) => (l.account.party === kind && l.partyId ? [l.partyId] : [])))];
  const [stores, trade, companies] = await Promise.all([
    db.store.findMany({ where: { id: { in: [...new Set(lines.flatMap((l) => (l.storeId ? [l.storeId] : [])).concat(j.storeId ?? []))] } }, select: { id: true, name: true } }),
    ids("TRADE_ACCOUNT").length ? db.tradeAccount.findMany({ where: { id: { in: ids("TRADE_ACCOUNT") } }, select: { id: true, name: true, number: true } }) : [],
    ids("COMPANY").length ? db.company.findMany({ where: { id: { in: ids("COMPANY") } }, select: { id: true, name: true } }) : [],
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const party = (kind: string | null, id: string | null) => {
    if (!id) return null;
    if (kind === "TRADE_ACCOUNT") {
      const t = trade.find((x) => x.id === id);
      return t ? `${t.name} (${t.number})` : "A trade account";
    }
    if (kind === "COMPANY") return companies.find((c) => c.id === id)?.name ?? "A franchisee";
    return id; // a supplier, by its name
  };
  const who = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const manual = (MANUAL_SOURCES as readonly string[]).includes(j.source);
  const reversible = j.status === "POSTED" && manual && !j.reversalOfId && !reversedBy;
  const approver = company.kind === "FRANCHISOR" ? "an HQ administrator" : "the owner";
  const debitTotal = debits._sum.amountCents ?? 0;
  const creditTotal = -(credits._sum.amountCents ?? 0);

  return (
    <>
      <BackLink href={`${base}/journals`}>Journals</BackLink>
      <PageHeader
        overline={`Journal · ${sourceLabel(j.source)}`}
        title={`Journal ${j.number}`}
        description={j.memo}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {j.status === "DRAFT" && role.approve && (
              <ActionButton action={approveJournalAction.bind(null, companyId, j.id)} variant="primary" size="md" pendingLabel="Posting…">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Approve and post
              </ActionButton>
            )}
            {j.status === "DRAFT" && role.write && (
              <ConfirmAction action={deleteDraftAction.bind(null, companyId, j.id)} label="Delete draft" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} title={`Delete draft journal ${j.number}?`} confirmLabel="Delete draft" size="md" className="max-w-sm">
                <p>It was never posted, so nothing in the books changes.</p>
              </ConfirmAction>
            )}
            {reversible && role.approve && (
              <ConfirmAction action={reverseJournalAction.bind(null, companyId, j.id)} label="Reverse" icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />} title={`Reverse journal ${j.number}?`} confirmLabel="Post the reversal" variant="dark" size="md" className="max-w-sm">
                <p>A new journal posts every line the other way round, so this one no longer counts. Then enter the right one.</p>
                <Field label="Date of the reversal" htmlFor="rev-date" hint="Usually today; a date in a closed month moves to the first open month">
                  <Input id="rev-date" name="date" type="date" defaultValue={dayKey(new Date())} />
                  <FieldError name="date" />
                </Field>
              </ConfirmAction>
            )}
          </div>
        }
      />
      <Flash message={sp1(sp.m) || undefined} />
      {j.status === "DRAFT" && !role.approve && <ReadOnlyNote className="mb-6">This draft posts once {approver} approves it.</ReadOnlyNote>}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="h-fit">
          <CardHeader title="Details" />
          <CardBody className="pt-2">
            <dl className="divide-y divide-ink-100">
              <Detail label="Status">{j.status === "DRAFT" ? <Badge tone="amber" dot>Waiting for approval</Badge> : <Badge tone="green" dot>Posted</Badge>}</Detail>
              <Detail label="Date">{fmtDate(j.date)}</Detail>
              <Detail label="Month">{fmtMonth(`${j.period}-15T12:00:00Z`)}</Detail>
              <Detail label="Source">
                {link ? (
                  <Link href={link.href} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    {link.label}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : (
                  sourceLabel(j.source)
                )}
              </Detail>
              {j.storeId && <Detail label="Store">{storeName.get(j.storeId) ?? "—"}</Detail>}
              <Detail label={manual ? "Entered by" : "Entered"}>
                {who(j.createdById) ?? "Automatically"}
                <span className="block text-xs font-normal text-ink-500">{fmtDateTime(j.createdAt)}</span>
              </Detail>
              {j.status === "POSTED" && manual && who(j.approvedById) && <Detail label="Approved by">{who(j.approvedById)}</Detail>}
              {reversalOf && (
                <Detail label="Reverses">
                  <Link href={`${base}/journals/${reversalOf.id}`} className="text-brand-700 hover:underline">
                    Journal {reversalOf.number}
                  </Link>
                </Detail>
              )}
              {reversedBy && (
                <Detail label="Reversed by">
                  <Link href={`${base}/journals/${reversedBy.id}`} className="text-brand-700 hover:underline">
                    Journal {reversedBy.number}
                  </Link>
                  <span className="block text-xs font-normal text-ink-500">{fmtDate(reversedBy.date)}</span>
                </Detail>
              )}
            </dl>
            {j.late && <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">Posted late: its own month was already closed, so it went into the first open month.</p>}
            {!manual && <p className="mt-3 text-xs text-ink-500">Posted automatically. If it&apos;s wrong, correct the {sourceLabel(j.source).toLowerCase()} itself. The books follow with a further journal for the difference.</p>}
          </CardBody>
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Lines" description={`${count} ${count === 1 ? "line" : "lines"}, debits first`} />
          <Table minWidth="40rem" className="mt-3">
            <thead>
              <tr>
                <Th>Account</Th>
                <Th className="hidden sm:table-cell">Store</Th>
                <Th>Detail</Th>
                <Th align="right">Debit</Th>
                <Th align="right">Credit</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    <Link href={`${base}/reports/ledger?account=${l.accountId}`} className="font-medium text-ink-900 hover:text-brand-700">
                      <span className="tnum text-ink-500">{l.account.code}</span> {l.account.name}
                    </Link>
                  </Td>
                  <Td className="hidden text-ink-600 sm:table-cell">{l.storeId ? (storeName.get(l.storeId) ?? "—") : "—"}</Td>
                  <Td className="text-ink-600">
                    {party(l.account.party, l.partyId) && <span className="block text-ink-800">{party(l.account.party, l.partyId)}</span>}
                    {l.memo && <span className="block text-xs">{l.memo}</span>}
                    {!l.partyId && !l.memo && "—"}
                  </Td>
                  <Td align="right" className="text-ink-900">{l.amountCents > 0 ? zar(l.amountCents) : ""}</Td>
                  <Td align="right" className="text-ink-900">{l.amountCents < 0 ? zar(-l.amountCents) : ""}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-ink-950">
                <td className="px-4 py-3 pl-5" colSpan={3}>
                  Total
                </td>
                <td className="tnum px-4 py-3 text-right">{zar(debitTotal)}</td>
                <td className="tnum px-4 py-3 pr-5 text-right">{zar(creditTotal)}</td>
              </tr>
            </tfoot>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} href={(p) => hrefWith(`${base}/journals/${j.id}`, {}, { page: p })} />
        </Card>
      </div>
    </>
  );
}
