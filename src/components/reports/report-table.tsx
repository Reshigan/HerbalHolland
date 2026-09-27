// Generic report table: aligned numeric columns, badges, emphasised/section rows,
// a totals footer and a row cap (the CSV carries everything).
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Table, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Column, Row } from "@/server/reports/types";
import { fmtCell, isNumeric } from "./format";

const alignOf = (c: Column) => c.align ?? (isNumeric(c.format) ? "right" : "left");

function Cell({ c, row, first }: { c: Column; row: Row; first: boolean }) {
  const v = row[c.key];
  const text = fmtCell(v, c.format);
  if (c.format === "badge" && v != null && v !== "")
    return (
      <Badge tone={c.tones?.[String(v)] ?? "neutral"} dot>
        {text}
      </Badge>
    );
  if (first && row._href)
    return (
      <Link href={row._href} className="group inline-flex items-center gap-1 font-semibold text-ink-900 underline-offset-2 hover:text-oranje-700 hover:underline">
        {text}
        <ChevronRight className="h-3.5 w-3.5 text-ink-300 group-hover:text-oranje-600" aria-hidden />
      </Link>
    );
  return <>{text}</>;
}

export function ReportTable({ columns, rows, totals, limit }: { columns: Column[]; rows: Row[]; totals?: Row | null; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <Table className="print:overflow-visible">
      <thead>
        <tr>
          {columns.map((c) => (
            <Th key={c.key} align={alignOf(c)} scope="col" className="whitespace-nowrap">
              {c.label || <span className="sr-only">Line</span>}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((row, i) =>
          row._style === "section" ? (
            <tr key={i}>
              <td colSpan={columns.length} className="border-b border-ink-100 bg-ink-50/60 px-5 pb-1.5 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-oranje-700">
                {String(row[columns[0].key] ?? "")}
              </td>
            </tr>
          ) : (
            <tr key={i} className={cn("transition-colors hover:bg-oranje-50/40", row._style === "strong" && "bg-ink-50/50 font-semibold text-ink-950", row._style === "muted" && "text-ink-500")}>
              {columns.map((c, ci) => (
                <Td
                  key={c.key}
                  align={alignOf(c)}
                  className={cn(
                    "py-2.5",
                    isNumeric(c.format) || c.format === "date" || c.format === "day" || c.format === "datetime" ? "whitespace-nowrap" : "min-w-[8rem]",
                    ci === 0 && "font-medium text-ink-900",
                    row._style === "strong" && "text-ink-950",
                    typeof row[c.key] === "number" && (row[c.key] as number) < 0 && c.format === "zar" && "text-ink-700",
                  )}
                >
                  <Cell c={c} row={row} first={ci === 0} />
                </Td>
              ))}
            </tr>
          ),
        )}
      </tbody>
      {totals && shown.length > 0 && (
        <tfoot>
          <tr className="bg-ink-50">
            {columns.map((c, ci) => {
              const raw = totals[c.key];
              const v = raw === undefined && ci === 0 ? "Total" : raw;
              return (
                <td key={c.key} className={cn("border-t-2 border-ink-200 px-4 py-3 text-sm font-semibold text-ink-950 first:pl-5 last:pr-5", alignOf(c) === "right" ? "tnum whitespace-nowrap text-right" : "text-left")}>
                  {v == null || v === "" || c.format === "badge" ? "" : fmtCell(v, typeof v === "string" ? undefined : c.format)}
                </td>
              );
            })}
          </tr>
        </tfoot>
      )}
    </Table>
  );
}
