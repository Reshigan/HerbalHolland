import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { tradeStatementFor } from "@/server/trade/ledger";
import { getFranchisor } from "@/server/shop/context";
import { DocumentPrintStyles } from "@/components/finance/document";
import { PrintButton } from "@/components/shop/print-button";
import { Container } from "@/components/shop/ui";
import { TradeStatementDocument } from "@/components/trade/statement-doc";
import { EmailStatementButton } from "@/components/trade/email-statement";
import { fmtMonth } from "@/lib/format";
import { requireBuyer } from "../../_lib/context";

export const metadata: Metadata = { title: "Statement", robots: { index: false, follow: false } };

const monthOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" });

export default async function TradeStatementPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const buyer = await requireBuyer(`/trade/statements/${month}`);
  const [st, hq] = await Promise.all([tradeStatementFor(buyer.tradeAccountId, month), getFranchisor()]);
  const now = new Date();
  return (
    <Container className="pt-10 sm:pt-14">
      <DocumentPrintStyles />
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/trade/statements" className="text-sm text-ink-400 hover:text-white">
            ← All statements
          </Link>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Statement · {fmtMonth(`${month}-15T12:00:00Z`)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <EmailStatementButton month={month} />
          <PrintButton />
        </div>
      </div>
      <TradeStatementDocument st={st} hq={hq ? { legalName: hq.legalName, regNumber: hq.regNumber, vatNumber: hq.vatNumber, address: hq.address, email: hq.email, phone: hq.phone } : null} issuedAt={now} current={monthOf.format(now) === month} />
    </Container>
  );
}
