import { requireBooks } from "@/server/ledger/access";
import { booksFor } from "@/server/ledger/core";
import { db, tx } from "@/server/db";
import { dayKey, fmtMonth } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { BackLink } from "@/components/store/ui";
import { JournalForm } from "./journal-form";
import { createJournal } from "../actions";

export const metadata = { title: "New journal" };

/** A manual journal: accruals, depreciation, the payroll provider's journal, corrections. */
export default async function NewJournalPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { company, role } = await requireBooks(companyId, "write");
  await tx((t) => booksFor(t, companyId));
  const [accounts, stores, companies] = await Promise.all([
    db.ledgerAccount.findMany({ where: { companyId, active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true, party: true } }),
    db.store.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    company.kind === "FRANCHISOR" ? db.company.findMany({ where: { kind: "FRANCHISEE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const base = `/books/${companyId}`;
  return (
    <>
      <BackLink href={`${base}/journals`}>Journals</BackLink>
      <PageHeader
        overline="Books · new journal"
        title="New journal"
        description={role.approve ? "Post it straight away, or save it as a draft to finish later." : `It's saved as a draft and posts once ${company.kind === "FRANCHISOR" ? "an HQ administrator" : "the owner"} approves it.`}
      />
      <Card>
        <CardBody>
          <JournalForm
            action={createJournal.bind(null, companyId)}
            accounts={accounts}
            stores={stores.length > 1 ? stores : []}
            companies={companies}
            canPost={role.approve}
            approver={company.kind === "FRANCHISOR" ? "an HQ administrator" : "the owner"}
            today={dayKey(new Date())}
            closedThrough={company.booksLockedThrough ? fmtMonth(`${company.booksLockedThrough}-15T12:00:00Z`) : null}
          />
        </CardBody>
      </Card>
    </>
  );
}
