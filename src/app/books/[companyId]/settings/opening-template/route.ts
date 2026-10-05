// The opening-balances template: the company's chart as CSV, for the old system's closing trial balance.
import { requireBooks } from "@/server/ledger/access";
import { booksFor } from "@/server/ledger/core";
import { db, tx } from "@/server/db";
import { csvFilename, toCsv } from "@/lib/csv";

// The hint goes in the name column (ignored on import), never the party column.
const PARTY: Record<string, string> = { SUPPLIER: "a row per supplier, its name as the party", TRADE_ACCOUNT: "a row per trade account, its number (TA-…) as the party", COMPANY: "a row per franchisee, its name as the party" };

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { company } = await requireBooks(companyId);
  await tx((t) => booksFor(t, companyId));
  const accounts = await db.ledgerAccount.findMany({ where: { companyId, active: true }, orderBy: { code: "asc" }, select: { code: true, name: true, party: true } });
  const csv = toCsv({
    columns: ["account", "name", "debit", "credit", "party", "store"].map((key) => ({ key, label: key })),
    rows: accounts.map((a) => ({ account: a.code, name: a.party ? `${a.name} (${PARTY[a.party] ?? "a row per party"})` : a.name })),
  });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename("opening-balances", company.name)}"`,
      "cache-control": "no-store",
    },
  });
}
