// The head of a books report: title and what it shows, the company and period it covers (and store, when filtered),
// Print and Download CSV — and the print styles that leave the app's sidebar, filters and buttons off the page.
import { CalendarDays, Download, Store } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { buttonClass } from "@/components/ui/button";
import { PrintButton } from "@/components/reports/frame";
import { fmtDateTime } from "@/lib/format";

export { PrintButton };

const PRINT_CSS = `@media print {
  @page { size: A4; margin: 14mm; }
  body > div.min-h-screen { display: block !important; background: #fff !important; }
  body > div.min-h-screen > aside, body > div.min-h-screen > header { display: none !important; }
  main > div { max-width: none !important; padding: 0 !important; }
  .shadow-card { box-shadow: none !important; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  table { font-size: 9pt; }
  a { color: inherit !important; text-decoration: none !important; }
}`;

/** Print styles for every books page (one sheet, so pages visited one after another never disagree). */
export function BooksPrintStyles() {
  return (
    <style href="hh-books-print" precedence="default">
      {PRINT_CSS}
    </style>
  );
}

export function ReportHeader({ company, title, description, period, store, csvHref, actions }: {
  company: { name: string; legalName: string; vatNumber: string | null };
  title: React.ReactNode;
  description?: React.ReactNode;
  /** What the figures cover: "March – October 2026", "As at 31 October 2026". */
  period: string;
  store?: string | null;
  csvHref?: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <BooksPrintStyles />
      <PageHeader
        className="mb-4"
        overline={`Books · ${company.name}`}
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {actions}
            <PrintButton />
            {csvHref && (
              <a href={csvHref} download className={buttonClass("dark", "md")}>
                <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                Download CSV
              </a>
            )}
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-600">
        <span className="font-medium text-ink-800">
          {company.legalName}
          {company.vatNumber && <span className="font-normal text-ink-500"> · VAT {company.vatNumber}</span>}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-ink-400" strokeWidth={1.9} aria-hidden />
          {period}
        </span>
        {store && (
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-4 w-4 text-ink-400" strokeWidth={1.9} aria-hidden />
            {store}
          </span>
        )}
        <span className="hidden text-ink-500 print:inline">Printed {fmtDateTime(new Date())}</span>
      </div>
    </>
  );
}
