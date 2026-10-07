import type { Metadata } from "next";
import { requireBooks } from "@/server/ledger/access";
import { AdminShell } from "@/components/admin/shell";
import { booksNav } from "@/components/admin/nav-config";

export const metadata: Metadata = {
  manifest: "/staff/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HH Office", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};

/** A company's books, in the back-office shell: anyone without access to them gets a not-found (ids can't be probed). */
export default async function BooksLayout({ children, params }: { children: React.ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { user, company } = await requireBooks(companyId);
  return (
    <AdminShell user={user} area="books" home={`/books/${company.id}`} nav={booksNav(company.id)} store={{ code: "", name: company.name }}>
      {children}
    </AdminShell>
  );
}
