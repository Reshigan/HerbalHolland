import { Mail } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { franchiseStatement } from "@/server/finance";
import { statementPayments } from "@/server/ledger/statement-payments";
import { sp1 } from "@/server/store/rules";
import { dayKey, fmtMonth } from "@/lib/format";
import { emailToOwner } from "./actions";
import { PageHeader, Notice } from "@/components/ui/page";
import { AutoSelect } from "@/components/store/auto-submit";
import { ActionButton, PrintButton } from "@/components/store/action-form";
import { DocumentPrintStyles } from "@/components/finance/document";
import { StatementDocument } from "@/components/finance/statement-document";
import { StatementPayments } from "@/components/finance/statement-payments";
import { pageParam } from "@/components/ui/pagination";

export const metadata = { title: "Franchise statement" };
const PAY_PAGE = 10;

export default async function StatementPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ month?: string; page?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const current = dayKey(new Date()).slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = current.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
  });
  const month = months.includes(sp1(sp.month)) ? sp1(sp.month) : months[1];
  const payPage = pageParam(sp.page);
  const [st, hq, pays] = await Promise.all([franchiseStatement(store.id, month), db.company.findFirst({ where: { kind: "FRANCHISOR" } }), statementPayments(store.id, month, payPage, PAY_PAGE)]);

  return (
    <>
      <DocumentPrintStyles />
      <PageHeader
        className="no-print"
        overline={`Money · ${store.name}`}
        title="Franchise statement"
        description="What moves between your store and HQ each month: online sales HQ collected for you, points, network trading, wholesale stock on account and franchise fees. Print it, save it as a PDF or email it to the owner."
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="st-month" className="sr-only">Month</label>
              <AutoSelect id="st-month" name="month" defaultValue={month} wrapperClassName="w-48">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {fmtMonth(`${m}-15T12:00:00Z`)}
                    {m === current ? " (to date)" : ""}
                  </option>
                ))}
              </AutoSelect>
            </form>
            <PrintButton label="Print or save as PDF" />
            {canManage && (
              <ActionButton action={emailToOwner.bind(null, store.code, month)} variant="dark" size="sm">
                <Mail className="h-4 w-4" aria-hidden /> Email to owner
              </ActionButton>
            )}
          </>
        }
      />

      {month === current && <Notice tone="info" className="no-print mb-4">This month is still running — figures are to date and final once the month closes.</Notice>}

      <StatementDocument st={st} company={store.company} hq={hq} current={month === current} issuedAt={new Date()} />
      {store.company.kind === "FRANCHISEE" && (
        <StatementPayments
          perspective="store"
          netCents={st.net}
          paidCents={pays.paidCents}
          rows={pays.rows}
          total={pays.total}
          page={payPage}
          pageSize={PAY_PAGE}
          current={month === current}
          href={(p) => `/store/${store.code}/statement?month=${month}&page=${p}`}
        />
      )}
    </>
  );
}
