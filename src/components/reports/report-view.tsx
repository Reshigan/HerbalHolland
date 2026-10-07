// The one view every report renders through: header + actions, one filter row, stat
// tiles, the chart (with its table twin below), secondary tables, notes and print styles.
import Link from "next/link";
import { CalendarDays, ChevronRight, Download, FileSpreadsheet, Info, Lock, MapPin } from "lucide-react";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import type { Format, ReportDef, ReportResult, Table } from "@/server/reports/types";
import type { Controls } from "@/server/reports/context";
import { PrintButton, ReportBody, ReportFrame } from "./frame";
import { FilterBar } from "./filter-bar";
import { ReportChart } from "./report-chart";
import { ReportTable } from "./report-table";
import { ReportIcon } from "./icons";
import { fmtTile } from "./format";
import { reportSort } from "@/lib/report-sort";

export const SCREEN_LIMIT = 200;

const TILE_COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-3 xl:grid-cols-6" };

// Print: drop the app chrome and filters, let tables run full width across pages.
const PRINT_CSS = `@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body > div.min-h-screen { display: block !important; background: #fff !important; }
  body > div.min-h-screen > aside, body > div.min-h-screen > header { display: none !important; }
  main > div { max-width: none !important; padding: 0 !important; }
  .shadow-card { box-shadow: none !important; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  table { font-size: 9pt; }
}`;

type Props = {
  def: Pick<ReportDef, "key" | "title" | "description" | "group" | "personal">;
  result: ReportResult;
  controls: Controls;
  query: Record<string, string>;
  path: string;
  catalogueHref: string;
  csvHref: string;
  scopeLabel: string;
  rangeLabel: string;
  clamped?: boolean;
  /** Extra header actions (e.g. the HQ "Email me this" schedule control). */
  extraActions?: React.ReactNode;
  /** ?sort= and ?dir= from the URL: sorts the main table by one of its columns. */
  sort?: string | string[];
  dir?: string | string[];
};

function tileValue(v: number | string | null, format?: Format) {
  const text = fmtTile(v, format);
  return typeof v === "string" && text.length > 14 ? <span className="block text-[1.05rem] leading-snug">{text}</span> : text;
}

function SecondaryTable({ t }: { t: Table }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={t.title ?? "More detail"} description={t.description} />
      <div className="mt-4">
        {t.rows.length ? <ReportTable columns={t.columns} rows={t.rows} totals={t.totals} limit={SCREEN_LIMIT} /> : <p className="px-5 pb-5 text-sm text-ink-500">Nothing to show.</p>}
      </div>
    </Card>
  );
}

export function ReportView({ def, result, controls, query, path, catalogueHref, csvHref, scopeLabel, rangeLabel, clamped, extraActions, sort: sortParam, dir: dirParam }: Props) {
  const sort = reportSort(result.columns, sortParam, dirParam);
  const sortHref = (key: string, dir: "asc" | "desc") => `${path}?${new URLSearchParams({ ...query, sort: key, dir })}`;
  const tiles = result.summary ?? [];
  const chart = result.rows.length || result.chart?.kind === "area" ? result.chart : null;
  const aside = !!chart && (chart.kind === "bar" || chart.kind === "donut");
  const total = result.totalRows ?? result.rows.length;
  const shown = Math.min(result.rows.length, SCREEN_LIMIT);
  const before = (result.extra ?? []).filter((t) => t.position === "before");
  const after = (result.extra ?? []).filter((t) => t.position !== "before");
  const download = (
    <a href={csvHref} className={buttonClass("dark", "md")} download>
      <Download className="h-4 w-4" strokeWidth={1.9} aria-hidden />
      Download CSV
    </a>
  );
  const note = result.note && (
    <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-500">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} aria-hidden />
      <span>{result.note}</span>
    </p>
  );

  return (
    <ReportFrame>
      <style href="hh-report-print" precedence="default">
        {PRINT_CSS}
      </style>
      <PageHeader
        className="mb-4"
        overline={
          <span className="inline-flex items-center gap-1">
            <Link href={catalogueHref} className="hover:underline print:no-underline">
              Reports
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            {def.group}
          </span>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 print:hidden">
              <ReportIcon reportKey={def.key} className="h-5 w-5" />
            </span>
            {def.title}
          </span>
        }
        description={def.description}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton />
            {extraActions}
            {download}
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-ink-400" strokeWidth={1.9} aria-hidden />
          {scopeLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-ink-400" strokeWidth={1.9} aria-hidden />
          {rangeLabel}
        </span>
        {def.personal && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-100">
            <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Personal information · exports are logged
          </span>
        )}
        <span className="hidden text-ink-500 print:inline">Printed {fmtDateTime(new Date())}</span>
      </div>

      <FilterBar path={path} query={query} controls={controls} />
      {clamped && (
        <Notice tone="warn" className="mb-6">
          Reports cover at most a year, so this shows the last 366 days of the range you picked.
        </Notice>
      )}

      <ReportBody className="space-y-6">
        {tiles.length > 0 && (
          <div className={cn("grid grid-cols-2 gap-3", TILE_COLS[tiles.length] ?? "lg:grid-cols-4")}>
            {tiles.map((t) => (
              <Stat
                key={t.label}
                label={t.label}
                value={tileValue(t.value, t.format)}
                delta={t.delta}
                deltaLabel={t.sub || tiles.length > 4 ? "vs prev." : "vs previous period"}
                upIsGood={t.upIsGood ?? true}
                sub={t.sub}
                className="break-inside-avoid"
              />
            ))}
          </div>
        )}

        {chart &&
          (aside ? (
            <Card className="break-inside-avoid">
              <CardHeader title={chart.title} description={chart.description} />
              <CardBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="min-w-0">
                  <ReportChart chart={chart} />
                </div>
                <aside aria-label="About this report" className="flex flex-col gap-4 border-t border-ink-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <h3 className="eyebrow text-brand-700">About this report</h3>
                  {note || (
                    <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-500">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} aria-hidden />
                      <span>Live figures. The filters above apply to the tiles, the chart and the table alike, and to the CSV.</span>
                    </p>
                  )}
                  <div className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600 print:hidden">
                    <div className="flex items-center gap-2 font-semibold text-ink-850">
                      <FileSpreadsheet className="h-4 w-4 text-brand-700" strokeWidth={1.9} aria-hidden />
                      {total.toLocaleString("en-US")} row{total === 1 ? "" : "s"}
                    </div>
                    <p className="mt-1 text-xs text-ink-500">The CSV has every row, with money in rands and dates in SAST. It&apos;s ready for Excel or your accountant.</p>
                    <a href={csvHref} download className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      Download CSV <ChevronRight className="h-3 w-3" aria-hidden />
                    </a>
                  </div>
                </aside>
              </CardBody>
            </Card>
          ) : (
            <Card className="break-inside-avoid">
              <CardHeader title={chart.title} description={chart.description} />
              <CardBody>
                <ReportChart chart={chart} />
              </CardBody>
            </Card>
          ))}

        {before.map((t, i) => (
          <SecondaryTable key={`b${i}`} t={t} />
        ))}

        <Card className="overflow-hidden">
          <CardHeader
            title={result.title ?? "Details"}
            description={result.rows.length ? (total > shown ? `Showing ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} rows` : `${total.toLocaleString("en-US")} row${total === 1 ? "" : "s"}`) : undefined}
          />
          <div className="mt-4">
            {result.rows.length ? (
              <ReportTable columns={result.columns} rows={result.rows} totals={result.totals} limit={SCREEN_LIMIT} sort={sort} sortHref={sortHref} />
            ) : (
              <EmptyState icon={<ReportIcon reportKey={def.key} className="h-5 w-5" />} title={result.emptyTitle ?? "Nothing to show"} className="border-t border-ink-100">
                {result.empty ?? "No data for these filters. Try a longer date range or another store."}
              </EmptyState>
            )}
          </div>
          {total > shown && (
            <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-3 text-xs text-ink-600 print:hidden">
              The screen shows the first {shown.toLocaleString("en-US")} rows.{" "}
              <a href={csvHref} download className="font-semibold text-brand-700 hover:underline">
                Download the CSV
              </a>{" "}
              for all {total.toLocaleString("en-US")}.
            </div>
          )}
        </Card>

        {after.map((t, i) => (
          <SecondaryTable key={`a${i}`} t={t} />
        ))}

        {!aside && note}
      </ReportBody>
    </ReportFrame>
  );
}

/** Shown instead of a report the signed-in role may not open. */
export function ReportDenied({ title, catalogueHref }: { title: string; catalogueHref: string }) {
  return (
    <Card>
      <EmptyState icon={<Lock className="h-5 w-5" />} title={`${title} is restricted`} action={<Link href={catalogueHref} className={buttonClass("outline", "md")}>Back to reports</Link>}>
        This report contains financial or personal information and is available to managers, owners and HQ. Ask your manager if you need it.
      </EmptyState>
    </Card>
  );
}
