// The printable Z-report for a shift, in the back office: the same document the till prints, on A4 or as a PDF
// for the accountant. Linked from the Z-report email and the cash-up page.
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { zReport } from "@/server/pos/shift";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/store/ui";
import { PrintButton } from "@/components/shop/print-button";
import { DocumentPrintStyles } from "@/components/finance/document";
import { ZReportDocument, ZReportStyles } from "@/components/pos/z-report";

export const metadata = { title: "Z-report" };

export default async function ZReportPage({ params }: { params: Promise<{ code: string; shiftId: string }> }) {
  const { code, shiftId } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const shift = await db.shift.findFirst({ where: { id: shiftId, storeId: store.id }, select: { id: true, closedAt: true, openedAt: true } });
  if (!shift) notFound();
  const z = await zReport(shift.id);
  const address = `${store.addressLine}, ${store.suburb}, ${store.city}`;

  return (
    <>
      <DocumentPrintStyles />
      <ZReportStyles />
      <div className="no-print">
        <BackLink href={`/store/${store.code}/cash-ups/${shift.id}`}>Cash-up</BackLink>
        <PageHeader
          overline={`Money · ${store.name}`}
          title={z.closed ? "Z-report" : "X-report"}
          description={`Shift opened ${fmtDateTime(shift.openedAt)}${shift.closedAt ? `, closed ${fmtDateTime(shift.closedAt)}` : " — still trading, so these are live figures"}. Prints on A4 or 80 mm receipt paper; “Save as PDF” in the print dialog keeps a copy.`}
          actions={<PrintButton label="Print or save as PDF" />}
        />
      </div>
      <ZReportDocument z={z} printedAt={new Date()} address={address} />
    </>
  );
}
