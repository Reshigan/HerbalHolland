// Data tables for the back office and HQ console. Server-safe; the frame (client) adds sideways scrolling, a pinned
// first column on wide tables, and row links. Numbers go in align="right" cells (tabular figures), rows are zebra-free
// with a hover, and the header sticks to the top of the page (see .hh-table in globals.css).
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./page";
import { TableFrame } from "./table-frame";

export type Density = "compact" | "comfortable";
export type SortDir = "asc" | "desc";

/**
 * `density` — compact (default: dense lists) or comfortable (rows that hold buttons or several lines).
 * `stickyFirst` — pin the first column while the table scrolls sideways (wide lists on small screens).
 * `minWidth` — e.g. "56rem": below this the table scrolls instead of squeezing its columns.
 */
export function Table({ className, children, density = "compact", stickyFirst, minWidth }: { className?: string; children: React.ReactNode; density?: Density; stickyFirst?: boolean; minWidth?: string }) {
  return (
    <TableFrame className={className} density={density} stickyFirst={stickyFirst}>
      <table className="w-full border-collapse text-sm" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </TableFrame>
  );
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function Th({ className, align = "left", ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-ink-150 bg-ink-50/95 px-4 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500 backdrop-blur first:pl-5 last:pr-5 [[data-density=compact]_&]:py-2",
        align === "right" && "tnum",
        ALIGN[align],
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, align = "left", ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "border-b border-ink-100 px-4 py-3 align-middle text-ink-800 first:pl-5 last:pr-5 [[data-density=compact]_&]:py-2",
        align === "right" && "tnum whitespace-nowrap",
        ALIGN[align],
        className,
      )}
      {...props}
    />
  );
}

/** A row. With `href`, clicking anywhere on it opens the link (keep a real link in a cell for the keyboard). */
export function Tr({ className, href, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { href?: string }) {
  return <tr data-href={href} className={cn("transition-colors hover:bg-brand-50/40", className)} {...props} />;
}

/**
 * Sortable column header: the URL carries the sort. Clicking a sorted column flips it; numeric columns start
 * descending. `aria-sort` tells screen readers which column the list is ordered by.
 */
export function SortableTh({ label, sortKey, sort, dir, href, align = "left", className, title }: {
  label: React.ReactNode;
  sortKey: string;
  sort: string;
  dir: SortDir;
  href: (sort: string, dir: SortDir) => string;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  const active = sort === sortKey;
  const next: SortDir = active ? (dir === "asc" ? "desc" : "asc") : align === "right" ? "desc" : "asc";
  return (
    <Th align={align} className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link
        href={href(sortKey, next)}
        title={title}
        className={cn("group/sort inline-flex items-center gap-1 rounded-md hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40", active && "text-ink-900", align === "right" && "flex-row-reverse")}
      >
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60" aria-hidden />
        )}
        <span className="sr-only">{active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}` : ", sort by this column"}</span>
      </Link>
    </Th>
  );
}

/** Parses ?sort= and ?dir= against a page's allowed keys. */
export function sortParams<K extends string>(keys: readonly K[], sort: string | string[] | undefined, dir: string | string[] | undefined, fallback: K, fallbackDir: SortDir = "asc"): { sort: K; dir: SortDir } {
  const s = Array.isArray(sort) ? sort[0] : sort;
  const d = Array.isArray(dir) ? dir[0] : dir;
  const key = (keys as readonly string[]).includes(s ?? "") ? (s as K) : fallback;
  return { sort: key, dir: d === "asc" || d === "desc" ? d : key === fallback ? fallbackDir : "asc" };
}

/** Empty state that spans every column of a table. */
export function TableEmpty({ cols, icon, title, children, action, className }: { cols: number; icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <tr>
      <td colSpan={cols} className={cn("px-5", className)}>
        <EmptyState icon={icon} title={title} action={action} className="py-10">
          {children}
        </EmptyState>
      </td>
    </tr>
  );
}

/** Placeholder rows while a list loads (route loading states, transitions). */
export function TableSkeleton({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("hh-table", className)} data-density="compact" aria-hidden>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} className="border-b border-ink-150 bg-ink-50/95 px-4 py-2.5 first:pl-5 last:pr-5">
                <span className="block h-2.5 w-16 rounded-full bg-ink-150" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} className="border-b border-ink-100 px-4 py-3 first:pl-5 last:pr-5">
                  <span className={cn("block h-3 animate-pulse rounded-full bg-ink-100", c === 0 ? "w-40" : "w-16", c > 0 && "ml-auto")} style={{ animationDelay: `${r * 60}ms` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
