import { redirect } from "next/navigation";

// Statement emails link to /finance/statement (server/invoices emailStatement); the statement lives at /statement.
export default async function StatementAlias({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ code }, { month }] = await Promise.all([params, searchParams]);
  redirect(`/store/${code}/statement${month && /^\d{4}-\d{2}$/.test(month) ? `?month=${month}` : ""}`);
}
