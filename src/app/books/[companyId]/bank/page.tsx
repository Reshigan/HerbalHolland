import Link from "next/link";
import { Landmark, Plus } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { bankAccountsOf } from "@/server/ledger/bank";
import { db } from "@/server/db";
import { BANKS, FORMATS, STATEMENT_MAX_BYTES } from "@/lib/bank-import";
import { zar, zarCompact } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { plural } from "@/lib/plural";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ReadOnlyNote } from "@/components/store/ui";
import { Drawer } from "@/components/store/drawer";
import { cn } from "@/lib/cn";
import { AccountForm } from "./account-form";
import { ImportForm } from "./import-form";
import { addBankAccount, importBankStatement } from "./actions";

export const metadata = { title: "Banking" };

const day = (d: string) => fmtDate(`${d}T12:00:00Z`);

/** The company's bank accounts: the books' balance against the statement's, what's still to do, and the import. */
export default async function BankingPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { company, role } = await requireBooks(companyId);
  const [accounts, stores] = await Promise.all([
    bankAccountsOf(company.id),
    db.store.findMany({ where: { companyId: company.id, status: { not: "CLOSED" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const open = accounts.filter((a) => a.active);
  const closed = accounts.length - open.length;
  const todo = accounts.reduce((n, a) => n + a.todo, 0);
  const lastImport = accounts.flatMap((a) => (a.lastImport ? [a.lastImport] : [])).sort((a, b) => +b - +a)[0];
  const path = `/books/${company.id}/bank`;

  return (
    <>
      <PageHeader
        overline={`Books · ${company.name}`}
        title="Banking"
        description="Import each bank account's statement: lines that match what's already in the books (deposits, payments, payouts) are matched by themselves; allocate the rest, such as bank charges and card payouts. Then reconcile."
        actions={
          role.write && (
            <Drawer
              label="Add bank account"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              title="Add a bank account"
              description={accounts.length ? "It gets an account of its own in the books" : "The first carries the books' Bank account, which deposits and payments post to"}
            >
              <AccountForm action={addBankAccount.bind(null, company.id)} stores={stores} adding />
            </Drawer>
          )
        }
      />

      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="In the books" value={zarCompact(accounts.reduce((s, a) => s + a.ledgerCents, 0))} sub={`${plural(open.length, "open account")}${closed ? `, ${closed} closed` : ""}`} />
          <Stat label="On the statements" value={zarCompact(accounts.reduce((s, a) => s + (a.statement?.cents ?? 0), 0))} sub="the latest balance of each" />
          <Stat label="Lines to do" value={<span className={todo ? "text-amber-700" : "text-leaf-700"}>{todo.toLocaleString()}</span>} sub={todo ? "to match, allocate or ignore" : "all settled"} />
          <Stat label="Last import" value={lastImport ? fmtDate(lastImport) : "—"} sub={lastImport ? "the newest statement file" : "nothing imported yet"} />
        </div>
      )}

      <div className={cn("grid gap-6", accounts.length > 0 && "mt-6", role.write && open.length > 0 && "xl:grid-cols-3")}>
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Bank accounts" description="The books' balance is everything posted; the statement's is the newest imported balance." />
          {accounts.length === 0 ? (
            <EmptyState icon={<Landmark className="h-5 w-5" aria-hidden />} title="No bank accounts yet">
              {role.write
                ? "Add the company's bank account first: it carries the books' Bank account (1000), which deposits, supplier payments and statement payments post to."
                : "The owner or the company's accountant adds the bank accounts and imports their statements."}
            </EmptyState>
          ) : (
            <Table stickyFirst className="mt-4" density="comfortable">
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th className="hidden md:table-cell">In the books as</Th>
                  <Th align="right">Books balance</Th>
                  <Th align="right">Statement balance</Th>
                  <Th align="right">To do</Th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <Tr key={a.id} href={`${path}/${a.id}`} className={cn(!a.active && "opacity-60")}>
                    <Td className="min-w-48">
                      <Link href={`${path}/${a.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{a.name}</Link>
                      <div className="text-xs text-ink-500">
                        {BANKS[a.bank as keyof typeof BANKS] ?? a.bank} · ending {a.number}
                        {a.store && ` · ${a.store.name}`}
                      </div>
                      {!a.active && <Badge className="mt-1">Closed</Badge>}
                    </Td>
                    <Td className="hidden text-ink-600 md:table-cell">
                      {a.ledgerAccount ? `${a.ledgerAccount.code} · ${a.ledgerAccount.name}` : "—"}
                      {a.ledgerAccount?.key === "bank" && <div className="text-xs text-ink-500">where deposits and payments post</div>}
                    </Td>
                    <Td align="right" className="font-semibold text-ink-900">{zar(a.ledgerCents)}</Td>
                    <Td align="right">
                      {a.statement ? (
                        <>
                          <div className="text-ink-900">{zar(a.statement.cents)}</div>
                          <div className="text-xs text-ink-500">{a.statement.asOf ? `at ${day(a.statement.asOf)}` : ""}</div>
                        </>
                      ) : (
                        <span className="text-ink-500">{a.lines ? "no balances" : "nothing imported"}</span>
                      )}
                    </Td>
                    <Td align="right">
                      {a.todo ? (
                        <Link href={`${path}/${a.id}`} className="font-semibold text-amber-700 hover:underline">
                          {a.todo.toLocaleString()}
                          <span className="block text-xs font-normal text-ink-500">{zar(a.todoCents)}</span>
                        </Link>
                      ) : (
                        a.lines ? <Badge tone="green">All settled</Badge> : <span className="text-ink-500">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          {accounts.length > 0 && <div className="px-5 py-3 text-xs text-ink-500">{plural(accounts.length, "bank account")}</div>}
        </Card>

        {role.write && open.length > 0 && (
          <Card className="min-w-0">
            <CardHeader title="Import a statement" description="From FNB, Absa, Standard Bank, Nedbank or Capitec online banking, OFX, or any CSV" />
            <CardBody>
              <ImportForm
                action={importBankStatement.bind(null, company.id, null)}
                accounts={open.map((a) => ({ id: a.id, label: `${a.name} (ending ${a.number})` }))}
                formats={Object.entries(FORMATS)}
                maxBytes={STATEMENT_MAX_BYTES}
              />
            </CardBody>
          </Card>
        )}
      </div>
      {!role.write && <ReadOnlyNote className="mt-4">You can look: the owner and the company&apos;s accountant import statements and settle lines.</ReadOnlyNote>}
    </>
  );
}
