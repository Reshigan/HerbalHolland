// CSV export (RFC 4180) tuned for spreadsheets: money in rands with 2 decimals (no
// symbol or separators, so it stays numeric), percentages as "12.35%", ISO dates in
// SAST, CRLF line endings, a UTF-8 BOM so Excel reads accents and symbols, and text cells
// guarded against formula injection.
import { TZ, dayKey } from "./format";

export type CsvFormat = "zar" | "number" | "pct" | "date" | "day" | "datetime" | "time" | "text" | "badge" | "points";
export type CsvColumn = { key: string; label: string; format?: CsvFormat };
export type CsvTable = { title?: string; columns: CsvColumn[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> | null };

const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const toDate = (v: unknown) => (v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-09-27 14:05" in South African time. */
export function sastStamp(d: Date) {
  const p = Object.fromEntries(stamp.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Formats one value for a CSV cell (unquoted). Empty string for null / not-a-number. */
export function csvValue(v: unknown, format: CsvFormat = "text"): string {
  if (v == null || v === "") return "";
  switch (format) {
    case "zar": {
      const n = Number(v);
      return Number.isFinite(n) ? (Math.round(n) / 100).toFixed(2) : "";
    }
    case "pct": {
      const n = Number(v);
      return Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "";
    }
    case "number":
    case "points": {
      const n = Number(v);
      if (!Number.isFinite(n)) return "";
      return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
    }
    case "date":
    case "day": {
      if (typeof v === "string" && DATE_ONLY.test(v)) return v;
      const d = toDate(v);
      return d && !isNaN(d.getTime()) ? dayKey(d) : "";
    }
    case "datetime":
    case "time": {
      const d = toDate(v);
      return d && !isNaN(d.getTime()) ? sastStamp(d) : "";
    }
    default: {
      const s = typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join("; ") : String(v);
      // A cell starting with = + - @ (or a tab/CR) is executed as a formula by spreadsheets.
      return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    }
  }
}

/** Quotes a cell when it contains a delimiter, quote or line break. */
export function csvEscape(s: string) {
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const line = (cells: string[]) => cells.map(csvEscape).join(",");

function tableLines(t: CsvTable) {
  const out: string[] = [];
  if (t.title) out.push(line([csvValue(t.title)]));
  out.push(line(t.columns.map((c) => csvValue(c.label))));
  for (const r of t.rows) out.push(line(t.columns.map((c) => csvValue(r[c.key], c.format))));
  if (t.totals) {
    const first = t.columns[0]?.key;
    const totals = first && t.totals[first] == null ? { ...t.totals, [first]: "Total" } : t.totals;
    // Text in a totals row is a label ("Total", "Closed shifts"), whatever the column's format.
    out.push(line(t.columns.map((c) => csvValue(totals[c.key], typeof totals[c.key] === "string" ? "text" : c.format))));
  }
  return out;
}

/** One or more tables → CSV text. Several tables are separated by a blank line. */
export function toCsv(tables: CsvTable | CsvTable[], opts: { bom?: boolean } = {}) {
  const list = Array.isArray(tables) ? tables : [tables];
  const body = list.map((t) => tableLines(t).join("\r\n")).join("\r\n\r\n");
  return `${opts.bom === false ? "" : "﻿"}${body}\r\n`;
}

/** Safe download filename: herbal-holland_sales-overview_PTA01_2026-08-29_2026-09-27.csv */
export function csvFilename(...parts: (string | null | undefined)[]) {
  const slug = parts
    .filter((p): p is string => !!p)
    .map((p) => p.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("_");
  return `${slug || "report"}.csv`;
}
