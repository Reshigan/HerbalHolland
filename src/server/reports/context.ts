// Builds a report's context from the signed-in user, the scope and the query string.
// Shared by the report pages and the CSV route so both apply exactly the same scope
// checks and filters. Store ids only ever come from the user's scope, never the URL.
import { db } from "../db";
import { scopeOf, storeWhere } from "../scope";
import type { Staff } from "../auth";
import { resolveRange } from "@/lib/ranges";
import { addDays, dayKey, fmtDate } from "@/lib/format";
import type { Option, ReportCtx, ReportDef, ReportScope, StoreInfo } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;
export const flat = (sp: SearchParams) =>
  Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v[0] ?? "" : v]]))) as Record<string, string>;

export const SCREEN_ROWS = 500;
export const CSV_ROWS = 100_000;
const MAX_DAYS = 366;

export type Control = { name: string; label: string; value: string; options: Option[] };
export type Controls = { range: { preset: string; from: string; to: string } | null; selects: Control[] };

type StoreArg = { id: string; code: string; name: string; companyId: string; company: { name: string } };

const validDay = (s?: string) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : undefined;
};

export async function reportContext(a: {
  def: ReportDef;
  scope: ReportScope;
  user: Staff;
  store?: StoreArg;
  sp: SearchParams;
  mode: "screen" | "csv";
  basePath: string;
}) {
  const q = flat(a.sp);
  const now = new Date();
  const selects: Control[] = [];
  let storeIds: string[];
  let scopeLabel: string;
  let storesValue = "";
  let networkWide = false;

  if (a.scope === "store") {
    const store = a.store!;
    // Owners (and HQ) can widen a store report to every store of the same company they may see.
    const siblings = await db.store.findMany({
      where: { AND: [storeWhere(scopeOf(a.user)), { companyId: store.companyId, kind: "RETAIL" }] },
      select: { id: true },
    });
    const company = siblings.length > 1 && q.stores === "company";
    storeIds = company ? siblings.map((s) => s.id) : [store.id];
    storesValue = company ? "company" : "";
    scopeLabel = company ? `All ${store.company.name} stores (${siblings.length})` : `${store.name} · ${store.code}`;
    if (siblings.length > 1)
      selects.push({
        name: "stores",
        label: "Stores",
        value: storesValue,
        options: [{ value: "", label: `${store.name} only` }, { value: "company", label: `All ${store.company.name} stores (${siblings.length})` }],
      });
  } else {
    const scope = scopeOf(a.user);
    const all = await db.store.findMany({
      where: storeWhere(scope),
      select: { id: true, code: true, name: true, kind: true, region: { select: { code: true, name: true } } },
      orderBy: { name: "asc" },
    });
    const regions = [...new Map(all.map((s) => [s.region.code, s.region.name]))].sort((x, y) => x[1].localeCompare(y[1]));
    const v = q.stores ?? "";
    let chosen = all;
    if (v.startsWith("region:") && regions.some(([c]) => c === v.slice(7))) {
      chosen = all.filter((s) => s.region.code === v.slice(7));
      storesValue = v;
    } else if (v && all.some((s) => s.code === v)) {
      chosen = all.filter((s) => s.code === v);
      storesValue = v;
    }
    storeIds = chosen.map((s) => s.id);
    networkWide = scope.kind === "HQ" && !storesValue;
    const everything = scope.kind === "HQ" ? "All stores" : `All stores in ${a.user.region?.name ?? "your region"}`;
    scopeLabel = !storesValue
      ? everything
      : storesValue.startsWith("region:")
        ? `${regions.find(([c]) => c === storesValue.slice(7))?.[1]} region`
        : `${chosen[0].name} · ${chosen[0].code}`;
    const options: Option[] = [{ value: "", label: everything }];
    if (regions.length > 1) options.push(...regions.map(([code, name]) => ({ value: `region:${code}`, label: `${name} (all)`, group: "Regions" })));
    for (const [code, name] of regions)
      options.push(...all.filter((s) => s.region.code === code).map((s) => ({ value: s.code, label: `${s.name} · ${s.code}${s.kind === "WAREHOUSE" ? " (DC)" : ""}`, group: name })));
    selects.push({ name: "stores", label: "Stores", value: storesValue, options });
  }

  const infos = await db.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, code: true, name: true, kind: true, status: true, region: { select: { name: true } }, company: { select: { id: true, name: true, vatNumber: true } } },
  });
  const stores = new Map<string, StoreInfo>(
    infos.map((s) => [
      s.id,
      { id: s.id, code: s.code, name: s.name, kind: s.kind, status: s.status, region: s.region.name, company: s.company.name, companyId: s.company.id, vendor: !!s.company.vatNumber },
    ]),
  );

  // Date range: presets or a custom from/to (validated, ordered, capped at a year).
  let from = validDay(q.from), to = validDay(q.to);
  if (from && to && from > to) [from, to] = [to, from];
  let range = resolveRange({ range: q.range, from, to }, a.def.defaultRange ?? "30d", now);
  let clamped = false;
  if (range.days > MAX_DAYS) {
    range = { ...resolveRange({ from: dayKey(addDays(new Date(`${range.to}T12:00:00+02:00`), -(MAX_DAYS - 1))), to: range.to }, "30d", now) };
    clamped = true;
  }
  const uses = (f: string) => a.def.filters?.includes(f as never) ?? false;

  let category: ReportCtx["category"];
  if (uses("category")) {
    const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } });
    category = cats.find((c) => c.slug === q.category);
    selects.push({ name: "category", label: "Category", value: category?.slug ?? "", options: [{ value: "", label: "All categories" }, ...cats.map((c) => ({ value: c.slug, label: c.name }))] });
  }
  let channel: ReportCtx["channel"];
  if (uses("channel")) {
    channel = q.channel === "POS" || q.channel === "ONLINE" ? q.channel : undefined;
    selects.push({ name: "channel", label: "Channel", value: channel ?? "", options: [{ value: "", label: "All channels" }, { value: "POS", label: "In store" }, { value: "ONLINE", label: "Online" }] });
  }

  const args = { scope: a.scope, storeIds, multi: storeIds.length > 1, now };
  const params: Record<string, string> = {};
  for (const p of a.def.params ?? []) {
    const options = typeof p.options === "function" ? await p.options(args) : p.options;
    const fallback = typeof p.default === "function" ? p.default({ ...args, options }) : (p.default ?? options[0]?.value ?? "");
    const v = q[p.key];
    params[p.key] = v != null && options.some((o) => o.value === v) ? v : fallback;
    if (options.length > 1) selects.push({ name: p.key, label: p.label, value: params[p.key], options });
  }

  const href = (key: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ ...(storesValue && { stores: storesValue }), ...extra }).toString();
    return `${a.basePath}/${key}${qs ? `?${qs}` : ""}`;
  };

  const ctx: ReportCtx = {
    key: a.def.key, scope: a.scope, storeIds, stores, networkWide, range, category, channel, params,
    rowLimit: a.mode === "csv" ? CSV_ROWS : SCREEN_ROWS, now, href,
  };
  const controls: Controls = { range: uses("range") ? { preset: range.preset, from: range.from, to: range.to } : null, selects };

  // The effective query (drives the filter bar, the CSV link and print header).
  const query: Record<string, string> = {};
  if (controls.range) Object.assign(query, range.preset === "custom" ? { from: range.from, to: range.to } : { range: range.preset });
  for (const s of selects) if (s.value) query[s.name] = s.value;

  const rangeLabel = uses("range") ? `${fmtDate(`${range.from}T12:00:00Z`)} – ${fmtDate(`${range.to}T12:00:00Z`)} (${range.days} day${range.days === 1 ? "" : "s"})` : `As of ${fmtDate(now)}`;
  return { ctx, controls, query, scopeLabel, rangeLabel, clamped };
}
