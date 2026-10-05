// CSV exports of a company's books for its accountant, over a range of months:
//   /books/<companyId>/export/trial-balance?from=2026-03&to=2026-10[&store=<id>]
//   /books/<companyId>/export/ledger?account=<id>&from=…&to=…[&store=<id>&party=<id>]
//   /books/<companyId>/export/journals?from=…&to=…
// Read access to the books as for the pages (a not-found otherwise); every export is audited. Ledger detail and
// journals stream in batches, so a year of HQ's journals never sits in memory.
import { booksAccess } from "@/server/ledger/access";
import { accountLedgerRows, chartOf, companyStores, journalRows, thisMonth, trialBalance } from "@/server/ledger/reports";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { actorOf } from "@/server/store/context";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv";
import { CSV_BOM, csvHead, csvRow, JOURNALS_CSV, LEDGER_CSV, monthRange, TRIAL_BALANCE_CSV, yearToDate } from "@/lib/ledger-reports";

const KINDS = ["trial-balance", "ledger", "journals"];
const TYPE = { ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expense" } as const;

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
const csvHeaders = (filename: string) => ({ "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store" });

/** A CSV body written batch by batch as the rows are read. */
function csvStream(columns: CsvColumn[], batches: AsyncGenerator<Record<string, unknown>[]>) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(enc.encode(CSV_BOM + csvHead(columns)));
    },
    async pull(ctrl) {
      const { value, done } = await batches.next();
      if (done) ctrl.close();
      else ctrl.enqueue(enc.encode(value.map((r) => csvRow(columns, r)).join("")));
    },
    async cancel() {
      await batches.return(undefined);
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string; kind: string }> }) {
  const { companyId, kind } = await params;
  const access = await booksAccess(companyId, "read");
  if (!access || !KINDS.includes(kind)) return notFound();
  const { user, company } = access;
  const sp = new URL(req.url).searchParams;
  const range = monthRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, yearToDate(thisMonth(), company.yearEndMonth));
  const store = (await companyStores(companyId)).find((s) => s.id === sp.get("store")) ?? null;
  const filename = (...parts: (string | null | undefined)[]) => csvFilename("herbal-holland", company.name, kind, ...parts, range.from, range.to);
  const logged = (data: Record<string, string | number | null>) =>
    audit(db, actorOf(user), "ledger.export", { entity: "Company", entityId: companyId, data: { kind, from: range.from, to: range.to, storeId: store?.id ?? null, ...data } });

  if (kind === "trial-balance") {
    const tb = await trialBalance(companyId, { ...range, storeId: store?.id });
    const rows = tb.rows.map((r) => ({ code: r.account.code, name: r.account.name, type: TYPE[r.account.type], opening: r.opening, debit: r.debit, credit: r.credit, closing: r.closing }));
    await logged({ rows: rows.length });
    return new Response(toCsv({ columns: TRIAL_BALANCE_CSV, rows, totals: { code: "Total", ...tb.totals } }), { headers: csvHeaders(filename(store?.code)) });
  }

  if (kind === "ledger") {
    const account = (await chartOf(companyId)).find((a) => a.id === sp.get("account"));
    if (!account) return notFound();
    const partyId = sp.get("party") || null;
    await logged({ accountId: account.id, partyId });
    return new Response(csvStream(LEDGER_CSV, accountLedgerRows(companyId, account, { ...range, storeId: store?.id, partyId })), { headers: csvHeaders(filename(account.code, store?.code)) });
  }

  await logged({});
  return new Response(csvStream(JOURNALS_CSV, journalRows(companyId, range)), { headers: csvHeaders(filename()) });
}
