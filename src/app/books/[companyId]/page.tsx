import { requireBooks } from "@/server/ledger/access";
import { PageHeader } from "@/components/ui/page";

export const metadata = { title: "Books" };

// Placeholder: the overview (balances, month status, books health) is built with the reports.
export default async function BooksOverview({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { company } = await requireBooks(companyId);
  return <PageHeader overline="Books" title={company.name} description={company.legalName} />;
}
