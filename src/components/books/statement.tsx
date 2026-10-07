// A financial statement as a table: section headings, account lines that drill down to their ledger, computed lines,
// subtotals and grand totals, one column per period, month or store. With `change`, also the change between two of
// the columns. Server-safe; the layouts come from @/lib/ledger-reports.
import Link from "next/link";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { delta } from "@/lib/ranges";
import type { StatementLine } from "@/lib/ledger-reports";

export type StatementColumn = { key: string; label: string; sub?: string };
/** Where a line drills down to: column −1 is its label, the others its amounts. */
export type StatementHref = (line: StatementLine, column: number) => string | undefined;

const DRILL = "underline-offset-2 hover:text-brand-700 hover:underline";

/** Growth in size for lines (costs show negative, so −R120 after −R100 is +20%); signed for profit lines, which can turn. */
function change(cur: number, prev: number, signed: boolean) {
  const d = signed ? delta(cur, prev) : delta(Math.abs(cur), Math.abs(prev));
  if (d == null || !Number.isFinite(d)) return "—";
  return `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)}%`;
}

export function StatementTable({ columns, lines, href, compare, caption, className }: {
  columns: StatementColumn[];
  lines: StatementLine[];
  href?: StatementHref;
  /** Adds a Change column: from column `previous` to column `current`. */
  compare?: { current: number; previous: number };
  caption: string;
  className?: string;
}) {
  const span = columns.length + 1 + (compare ? 1 : 0);
  const head = "border-b border-ink-150 bg-ink-50 px-4 py-2.5 text-[0.66rem] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-500 first:pl-5 last:pr-5";
  return (
    <div className={cn("overflow-x-auto print:overflow-visible", className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(head, "text-left")}>
              <span className="sr-only">Line</span>
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn(head, "whitespace-nowrap text-right")}>
                {c.label}
                {c.sub && <span className="block text-[0.62rem] font-medium normal-case tracking-normal text-ink-400">{c.sub}</span>}
              </th>
            ))}
            {compare && (
              <th scope="col" className={cn(head, "text-right")}>
                Change
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            if (line.kind === "section")
              return (
                <tr key={line.key}>
                  <td colSpan={span} className="border-b border-ink-100 bg-ink-50/60 px-5 pb-1.5 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-brand-700">
                    {line.label}
                  </td>
                </tr>
              );
            const total = line.kind === "total";
            const grand = line.kind === "total" && !!line.grand;
            const labelHref = href?.(line, -1);
            const cell = cn("border-b px-4 py-2 text-right tnum whitespace-nowrap last:pr-5", grand ? "border-ink-300 py-3" : total ? "border-ink-150" : "border-ink-100");
            return (
              <tr key={line.key} className={cn(grand ? "bg-ink-50 font-semibold text-ink-950" : total ? "font-semibold text-ink-900" : "text-ink-800 hover:bg-brand-50/40", grand && "border-t-2 border-ink-300")}>
                <th scope="row" className={cn("min-w-[14rem] border-b py-2 pr-4 text-left font-normal", total ? "pl-5 font-semibold" : "pl-8", grand ? "border-ink-300 py-3" : total ? "border-ink-150" : "border-ink-100", line.kind === "item" && "italic text-ink-700")}>
                  {labelHref ? (
                    <Link href={labelHref} className={DRILL}>
                      {line.label}
                    </Link>
                  ) : (
                    line.label
                  )}
                  {"note" in line && line.note && <span className="block text-xs font-normal not-italic text-ink-500">{line.note}</span>}
                </th>
                {line.values.map((v, i) => {
                  const h = v ? href?.(line, i) : undefined;
                  const text = v || total ? zar(v) : "—";
                  return (
                    <td key={columns[i]?.key ?? i} className={cn(cell, !v && !total && "text-ink-400")}>
                      {h ? (
                        <Link href={h} className={DRILL}>
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
                {compare && <td className={cn(cell, "text-ink-600")}>{change(line.values[compare.current], line.values[compare.previous], grand)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
