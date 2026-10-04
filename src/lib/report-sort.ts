// Sorting a report's on-screen table by a column (?sort=growth&dir=asc). Pure, so it's unit-tested
// (tests/report-sort.test.ts). Grouped tables (section or subtotal rows) keep their own order.

export type SortableRow = Record<string, unknown> & { _style?: string };
export type SortDir = "asc" | "desc";

/** The column to sort by when it's one of the table's columns, else null (the report's own order). */
export function reportSort(columns: { key: string }[], sort: unknown, dir: unknown): { key: string; dir: SortDir } | null {
  const key = Array.isArray(sort) ? sort[0] : sort;
  const d = Array.isArray(dir) ? dir[0] : dir;
  if (typeof key !== "string" || !columns.some((c) => c.key === key)) return null;
  return { key, dir: d === "asc" ? "asc" : "desc" };
}

/** True when the rows can be reordered without breaking sections or subtotal lines. */
export const sortable = (rows: SortableRow[]) => !rows.some((r) => r._style === "section" || r._style === "strong");

/** Rows sorted by one column: numbers numerically, text A–Z (natural), empty values always last. Stable. */
export function sortRows<R extends SortableRow>(rows: R[], key: string, dir: SortDir): R[] {
  if (!sortable(rows)) return rows;
  const m = dir === "asc" ? 1 : -1;
  const empty = (v: unknown) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = a.r[key], y = b.r[key];
      if (empty(x) || empty(y)) return empty(x) === empty(y) ? a.i - b.i : empty(x) ? 1 : -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true, sensitivity: "base" });
      return c * m || a.i - b.i;
    })
    .map(({ r }) => r);
}
