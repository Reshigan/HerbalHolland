// Generic report table: aligned numeric columns, badges, emphasised/section rows, a
// totals footer and a row cap (the CSV carries everything). Wide tables get denser
// cells and a sticky first column so they stay readable while scrolling sideways.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { Column, Row } from "@/server/reports/types";
import { fmtCell, isNumeric } from "./format";

const alignOf = (c: Column) => c.align ?? (isNumeric(c.format) ? "right" : "left");
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;
// Identifier-like columns never wrap.
const CODE_KEYS = new Set(["sku", "code", "batch", "number", "of", "ref", "member", "patient", "auth", "field"]);
// CSS-only scroll shadows: the covers scroll with the content, the shadows stay at the edges,
// so a shadow shows exactly when there is more table to scroll to.
const SCROLL_SHADOWS: React.CSSProperties = {
  background: [
    "linear-gradient(to right, #fff 30%, rgb(255 255 255 / 0)) left center / 48px 100% no-repeat local",
    "linear-gradient(to left, #fff 30%, rgb(255 255 255 / 0)) right center / 48px 100% no-repeat local",
    "radial-gradient(farthest-side at 0 50%, rgb(20 17 16 / 0.14), transparent) left center / 14px 100% no-repeat scroll",
    "radial-gradient(farthest-side at 100% 50%, rgb(20 17 16 / 0.14), transparent) right center / 14px 100% no-repeat scroll",
  ].join(", "),
};

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

export function ReportTable({ columns: all, rows, totals, limit }: { columns: Column[]; rows: Row[]; totals?: Row | null; limit?: number }) {
  const columns = all.filter((c) => !c.csvOnly);
  const shown = limit ? rows.slice(0, limit) : rows;
  const dense = columns.length > 8;
  const pad = dense ? "px-2.5 first:pl-5 last:pr-5" : "px-4 first:pl-5 last:pr-5";
  const stick = (ci: number) => dense && ci === 0 && "sticky left-0 z-10 shadow-[1px_0_0_var(--color-ink-150)]";
  const nowrap = (c: Column) => isNumeric(c.format) || c.format === "date" || c.format === "day" || c.format === "datetime" || c.format === "time" || c.format === "badge" || CODE_KEYS.has(c.key);
  return (
    <div className="overflow-x-auto print:overflow-visible" style={SCROLL_SHADOWS}>
      <table className={cn("w-full border-collapse", dense ? "text-[0.8rem]" : "text-sm")}>
        <thead>
          <tr>
            {columns.map((c, ci) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "border-b border-ink-150 bg-ink-50 py-2.5 align-bottom text-[0.66rem] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-500",
                  dense && ci > 0 ? "min-w-[4.5rem]" : "whitespace-nowrap",
                  pad,
                  ALIGN[alignOf(c)],
                  stick(ci),
                )}
              >
                {c.label || <span className="sr-only">Line</span>}
              </th>
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
              <tr key={i} className={cn("group/row", row._style === "strong" ? "bg-ink-50/70 font-semibold text-ink-950" : "hover:bg-oranje-50/50", row._style === "muted" && "text-ink-500")}>
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={cn(
                      "border-b border-ink-100 py-2.5 align-middle text-ink-800",
                      pad,
                      ALIGN[alignOf(c)],
                      isNumeric(c.format) && "tnum",
                      nowrap(c) ? "whitespace-nowrap" : ci === 0 ? (dense ? "min-w-[10rem]" : "min-w-[12rem]") : dense ? "min-w-[7.5rem]" : "min-w-[9rem]",
                      ci === 0 && "font-medium text-ink-900",
                      row._style === "strong" && "text-ink-950",
                      stick(ci),
                      stick(ci) && (row._style === "strong" ? "bg-ink-50" : "bg-white group-hover/row:bg-oranje-50"),
                    )}
                  >
                    <Cell c={c} row={row} first={ci === 0} />
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
        {totals && shown.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((c, ci) => {
                const raw = totals[c.key];
                const v = raw === undefined && ci === 0 ? "Total" : raw;
                return (
                  <td key={c.key} className={cn("whitespace-nowrap border-t-2 border-ink-200 bg-ink-50 py-3 font-semibold text-ink-950", pad, ALIGN[alignOf(c)], isNumeric(c.format) && "tnum", stick(ci))}>
                    {v == null || v === "" || c.format === "badge" ? "" : fmtCell(v, typeof v === "string" ? undefined : c.format)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
