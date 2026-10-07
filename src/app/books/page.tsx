import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { booksList } from "@/server/ledger/access";
import { booksHealth } from "@/server/ledger/checks";
import { db } from "@/server/db";
import { fmtMonth } from "@/lib/format";
import { hrefWith, sp1 } from "@/server/store/rules";
import { AdminShell } from "@/components/admin/shell";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { SearchForm } from "@/components/store/ui";

export const metadata = { title: "Books", robots: { index: false, follow: false } };
const PAGE_SIZE = 50;

/**
 * The books someone can open: straight into them when there's only one company (an owner or accountant). For HQ and
 * area managers, each company's month end at a glance: closed through, drafts waiting, and the checks that can be read
 * across companies at once (the full checks run on each company's month-end page).
 */
export default async function BooksIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireStaff();
  const companies = await booksList(user);
  if (companies.length === 1) redirect(`/books/${companies[0].id}`);
  const q = sp1(sp.q).trim().slice(0, 80);
  const found = q ? companies.filter((c) => `${c.name} ${c.legalName}`.toLowerCase().includes(q.toLowerCase())) : companies;
  const page = pageParam(sp.page);
  const rows = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [health, books] = await Promise.all([
    booksHealth(rows),
    db.company.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, booksLockedThrough: true } }),
  ]);
  const closedThrough = new Map(books.map((b) => [b.id, b.booksLockedThrough]));
  return (
    <AdminShell user={user} area="books" nav={[]}>
      <PageHeader
        overline="Accounting"
        title="Books"
        description="Each company in the network keeps its own books: Herbal Holland's, and every franchisee's. Open one to see its journals, reports and month end."
      />
      <Card>
        {companies.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No books to show">
            The books are kept by each company&apos;s owner and accountant.
          </EmptyState>
        ) : (
          <>
            {companies.length > 10 && (
              <div className="border-b border-ink-100 p-4">
                <SearchForm path="/books" q={q} placeholder="Find a company" />
              </div>
            )}
            <Table stickyFirst minWidth="48rem">
              <thead>
                <tr>
                  <Th>Company</Th>
                  <Th>Kind</Th>
                  <Th align="right" className="hidden md:table-cell">Stores</Th>
                  <Th>Closed through</Th>
                  <Th align="right">Drafts</Th>
                  <Th>Checks</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <TableEmpty cols={6} title="No company matches">Try another name.</TableEmpty>
                ) : (
                  rows.map((c) => {
                    const h = health.get(c.id);
                    const locked = closedThrough.get(c.id);
                    return (
                      <Tr key={c.id} href={`/books/${c.id}`}>
                        <Td>
                          <Link href={`/books/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                            {c.name}
                          </Link>
                          <div className="text-xs text-ink-500">{c.legalName}</div>
                        </Td>
                        <Td>
                          <Badge tone={c.kind === "FRANCHISOR" ? "orange" : "neutral"}>{c.kind === "FRANCHISOR" ? "Herbal Holland (HQ)" : "Franchisee"}</Badge>
                        </Td>
                        <Td align="right" className="hidden md:table-cell">{c._count.stores}</Td>
                        <Td className="whitespace-nowrap text-ink-700">{locked ? fmtMonth(`${locked}-15T12:00:00Z`) : <span className="text-ink-500">Nothing closed</span>}</Td>
                        <Td align="right">
                          {h?.drafts ? (
                            <Link href={`/books/${c.id}/journals?status=DRAFT`} className="font-semibold text-amber-700 hover:underline">
                              {h.drafts}
                            </Link>
                          ) : (
                            <span className="text-ink-500">—</span>
                          )}
                        </Td>
                        <Td>
                          {h?.issues.length ? (
                            <Link href={`/books/${c.id}/close`} className="block hover:underline">
                              <Badge tone="red" dot>
                                {h.issues.length} to look at
                              </Badge>
                              <span className="mt-0.5 block text-xs text-ink-500">{h.issues.join(" · ")}</span>
                            </Link>
                          ) : (
                            <Badge tone="green" dot>
                              Nothing flagged
                            </Badge>
                          )}
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={found.length} href={(p) => hrefWith("/books", { q: q || undefined }, { page: p })} />
          </>
        )}
      </Card>
      {companies.length > 1 && <p className="mt-3 text-xs text-ink-500">Checks here: debits equal credits, failed postings, unmatched bank lines and last month&apos;s current account against HQ&apos;s. Each company&apos;s month end runs the full set.</p>}
    </AdminShell>
  );
}

