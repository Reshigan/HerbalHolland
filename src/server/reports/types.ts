// Report registry types. A report is data in, table (+ optional chart) out, so one
// generic view renders every report and the CSV export re-runs the exact same code.
import type { Role } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/format";
import type { PresetKey } from "@/lib/ranges";
import type { CsvFormat } from "@/lib/csv";
import type { Tone } from "@/components/ui/badge";

export const GROUPS = ["Sales", "Inventory", "Purchasing", "Finance", "Customers", "Marketing", "Compliance"] as const;
export type ReportGroup = (typeof GROUPS)[number];
export type ReportScope = "store" | "hq";
/** Built-in filters. The store picker is always offered when the user can see more than one store. */
export type BuiltinFilter = "range" | "store" | "category" | "channel";
export type Format = CsvFormat;

export type Column = {
  key: string;
  label: string;
  format?: Format;
  align?: "left" | "right" | "center";
  /** format "badge": value → tone. */
  tones?: Record<string, Tone>;
};
/** Reserved keys: `_href` links the first cell, `_style` emphasises the row. */
export type Row = Record<string, unknown> & { _href?: string; _style?: "strong" | "muted" | "section" };
export type Table = { title?: string; description?: string; columns: Column[]; rows: Row[]; totals?: Row | null };

export type Summary = { label: string; value: number | string | null; format?: Format; delta?: number | null; upIsGood?: boolean; sub?: string };

export type ChartFormat = "zar" | "number" | "pct" | "units";
export type ReportChart = { title: string; description?: string; format?: ChartFormat } & (
  | { kind: "area"; labels: string[]; series: { name: string; values: number[] }[] }
  | { kind: "column"; data: { label: string; value: number; tip?: string }[] }
  | { kind: "bar"; rows: { label: string; value: number; sub?: string; tip?: string }[] }
  | { kind: "donut"; data: { label: string; value: number }[]; center?: string }
  | { kind: "heatmap"; cells: { day: number; hour: number; value: number }[]; hours: number[] }
);

export type ReportResult = Table & {
  /** Rows available at source when `rows` was limited by ctx.rowLimit. */
  totalRows?: number;
  chart?: ReportChart | null;
  summary?: Summary[];
  note?: string | null;
  /** Secondary tables (rendered below the main table and appended to the CSV). */
  extra?: Table[];
  /** Empty-state message when there are no rows. */
  empty?: string;
};

export type Option = { value: string; label: string; group?: string };

export type StoreInfo = {
  id: string;
  code: string;
  name: string;
  kind: "RETAIL" | "WAREHOUSE";
  status: string;
  region: string;
  company: string;
  companyId: string;
  vendor: boolean; // company is registered for VAT
};

export type ReportCtx = {
  key: string;
  scope: ReportScope;
  /** Scope-checked store ids the report covers. */
  storeIds: string[];
  stores: Map<string, StoreInfo>;
  /** HQ user looking at the whole network (unfiltered): network-level rows (e.g. HQ-funded Guilders) apply. */
  networkWide: boolean;
  range: DateRange & { preset: string };
  category?: { id: string; slug: string; name: string };
  channel?: "POS" | "ONLINE";
  /** Validated values of the report's own params. */
  params: Record<string, string>;
  /** Screen: 500 rows. CSV: everything up to a hard cap. */
  rowLimit: number;
  now: Date;
  /** Link to another report in the same scope (keeps the store filter). */
  href: (key: string, params?: Record<string, string>) => string;
};

export type ParamArgs = { scope: ReportScope; storeIds: string[]; multi: boolean; now: Date };
export type ParamDef = {
  key: string;
  label: string;
  options: Option[] | ((a: ParamArgs) => Option[] | Promise<Option[]>);
  default?: string | ((a: ParamArgs & { options: Option[] }) => string);
};

export type ReportDef = {
  key: string;
  title: string;
  /** The question the report answers, in one line. */
  description: string;
  group: ReportGroup;
  scopes: ReportScope[];
  filters?: BuiltinFilter[];
  params?: ParamDef[];
  defaultRange?: PresetKey;
  /** Who may run it (default: anyone who can open the scope). */
  roles?: Role[];
  /** Contains customer personal information (POPIA): restricted roles, exports audited. */
  personal?: boolean;
  run: (ctx: ReportCtx) => Promise<ReportResult>;
};

export const MANAGERS: Role[] = ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER", "OWNER", "MANAGER"];
/** Health-related records (patients, prescriptions): no general HQ staff, no budtenders. */
export const PATIENT_DATA: Role[] = ["HQ_ADMIN", "AREA_MANAGER", "OWNER", "MANAGER"];
