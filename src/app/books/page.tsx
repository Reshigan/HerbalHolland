import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { booksList } from "@/server/ledger/access";
import { AdminShell } from "@/components/admin/shell";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Books" };

/** The books someone can open: straight into them when there's only one company (an owner or accountant). */
export default async function BooksIndex() {
  const user = await requireStaff();
  const companies = await booksList(user);
  if (companies.length === 1) redirect(`/books/${companies[0].id}`);
  return (
    <AdminShell user={user} area="books" nav={[]}>
      <PageHeader overline="Accounting" title="Books" description="Each company in the network keeps its own books: Herbal Holland's, and every franchisee's. Open one to see its journals, reports and month end." />
      <Card>
        {companies.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No books to show">The books are kept by each company&apos;s owner and accountant.</EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th className="hidden sm:table-cell">Registered name</Th>
                <Th>Kind</Th>
                <Th align="right">Stores</Th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <Tr key={c.id} href={`/books/${c.id}`}>
                  <Td>
                    <Link href={`/books/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700">{c.name}</Link>
                  </Td>
                  <Td className="hidden text-ink-600 sm:table-cell">{c.legalName}</Td>
                  <Td>
                    <Badge tone={c.kind === "FRANCHISOR" ? "orange" : "neutral"}>{c.kind === "FRANCHISOR" ? "Herbal Holland (HQ)" : "Franchisee"}</Badge>
                  </Td>
                  <Td align="right" className="tnum">{c._count.stores}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </AdminShell>
  );
}
