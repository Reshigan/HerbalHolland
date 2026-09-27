"use client";
// Count sheet: scan or type to jump to a line, Enter to move on, autosave as you go.
// Blind counts never receive expected quantities from the server.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Loader2, Minus, Plus, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/page";
import { Kbd } from "@/components/ui/misc";
import type { ActionState } from "@/server/store/context";

export type SheetLine = {
  id: string;
  sku: string;
  barcode: string | null;
  productName: string;
  variantName: string;
  category: string;
  batchCode: string;
  blocked: boolean;
  expiry: string | null; // pre-formatted
  expected: number | null; // null on blind counts
  counted: number | null;
};

type Filter = "all" | "todo" | "done" | "variance";
const parse = (s: string): number | null | typeof NaN => {
  const t = s.trim();
  if (t === "") return null;
  return /^\d{1,6}$/.test(t) ? Number(t) : NaN;
};

export function CountSheet({ lines, blind, canEdit, save, reviewHref }: {
  lines: SheetLine[];
  blind: boolean;
  canEdit: boolean;
  save: (counts: { lineId: string; qty: number | null }[]) => Promise<ActionState>;
  reviewHref: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, l.counted == null ? "" : String(l.counted)])));
  const [saved, setSaved] = useState<Record<string, number | null>>(() => Object.fromEntries(lines.map((l) => [l.id, l.counted])));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [zeroAsk, setZeroAsk] = useState(false);
  const [saving, startSaving] = useTransition();
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const scan = useRef<HTMLInputElement>(null);
  const fromScan = useRef(false);
  const latest = useRef({ values, saved });
  latest.current = { values, saved };

  const dirtyIds = useMemo(
    () => lines.filter((l) => { const v = parse(values[l.id]); return !Number.isNaN(v) && v !== saved[l.id]; }).map((l) => l.id),
    [lines, values, saved],
  );
  const invalid = lines.filter((l) => Number.isNaN(parse(values[l.id]))).length;

  const flush = useCallback(async () => {
    const { values: v, saved: s } = latest.current;
    const payload = lines
      .map((l) => ({ lineId: l.id, qty: parse(v[l.id]) }))
      .filter((p): p is { lineId: string; qty: number | null } => !Number.isNaN(p.qty) && p.qty !== s[p.lineId]);
    if (!payload.length) return true;
    const r = await save(payload);
    if (r.error) {
      setError(r.error);
      return false;
    }
    setSaved((prev) => ({ ...prev, ...Object.fromEntries(payload.map((p) => [p.lineId, p.qty])) }));
    setSavedAt(new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()));
    setError(null);
    return true;
  }, [lines, save]);

  // Autosave 1.5 s after the last keystroke.
  useEffect(() => {
    if (!canEdit || !dirtyIds.length) return;
    const t = setTimeout(() => startSaving(async () => void (await flush())), 1500);
    return () => clearTimeout(t);
  }, [values, dirtyIds.length, canEdit, flush]);

  // Warn before leaving with unsaved counts; Ctrl/Cmd+S saves.
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirtyIds.length) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        startSaving(async () => void (await flush()));
      }
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("keydown", key);
    return () => (window.removeEventListener("beforeunload", before), window.removeEventListener("keydown", key));
  }, [dirtyIds.length, flush]);

  const matches = useCallback(
    (l: SheetLine, q: string) => {
      const t = q.trim().toLowerCase();
      if (!t) return true;
      if (l.barcode === q.trim() || l.sku.toLowerCase() === t || l.batchCode.toLowerCase() === t) return true;
      const hay = `${l.productName} ${l.variantName} ${l.sku} ${l.batchCode} ${l.barcode ?? ""}`.toLowerCase();
      return t.split(/\s+/).every((w) => hay.includes(w));
    },
    [],
  );

  const visible = lines.filter((l) => {
    if (!matches(l, query)) return false;
    const v = parse(values[l.id]);
    if (filter === "todo") return v == null || Number.isNaN(v);
    if (filter === "done") return v != null && !Number.isNaN(v);
    if (filter === "variance") return l.expected != null && v != null && !Number.isNaN(v) && v !== l.expected;
    return true;
  });

  const focusLine = (id: string | undefined) => {
    if (!id) return;
    const el = inputs.current.get(id);
    if (!el) return;
    el.focus();
    el.select();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const jump = () => {
    const q = query.trim();
    if (!q) return;
    const hits = lines.filter((l) => matches(l, q));
    if (!hits.length) {
      setMiss(q);
      return;
    }
    setMiss(null);
    if (filter !== "all") setFilter("all");
    const target = hits.find((l) => parse(values[l.id]) == null) ?? hits[0];
    fromScan.current = true;
    requestAnimationFrame(() => focusLine(target.id));
  };

  const next = (id: string, dir: 1 | -1) => {
    if (fromScan.current && dir === 1) {
      fromScan.current = false;
      setQuery("");
      scan.current?.focus();
      return;
    }
    const i = visible.findIndex((l) => l.id === id);
    focusLine(visible[i + dir]?.id);
  };

  const bump = (id: string, d: number) => {
    const cur = parse(values[id]);
    const base = cur == null || Number.isNaN(cur) ? 0 : cur;
    setValues((v) => ({ ...v, [id]: String(Math.max(0, base + d)) }));
  };

  const counted = lines.filter((l) => { const v = parse(values[l.id]); return v != null && !Number.isNaN(v); });
  const units = counted.reduce((s, l) => s + (parse(values[l.id]) as number), 0);
  const uncounted = lines.length - counted.length;
  const variances = blind ? 0 : lines.filter((l) => { const v = parse(values[l.id]); return l.expected != null && v != null && !Number.isNaN(v) && v !== l.expected; }).length;

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All lines", n: lines.length },
    { key: "todo", label: "To count", n: uncounted },
    { key: "done", label: "Counted", n: counted.length },
    ...(!blind ? [{ key: "variance" as Filter, label: "Variances", n: variances }] : []),
  ];

  let lastCat = "";
  return (
    <div>
      <div className="sticky top-14 z-30 -mx-4 border-b border-ink-150 bg-ink-50/95 px-4 pb-3 pt-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-72">
            <span className="sr-only">Scan a barcode or search the count sheet</span>
            <ScanLine className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-oranje-600" aria-hidden />
            <input
              ref={scan}
              autoFocus={canEdit}
              value={query}
              onChange={(e) => (setQuery(e.target.value), setMiss(null))}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.preventDefault(), jump());
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Scan a barcode, or type a SKU, batch or name"
              className="h-12 w-full rounded-2xl border border-ink-200 bg-white pl-11 pr-4 text-base text-ink-900 shadow-card placeholder:text-ink-400 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15"
              aria-describedby="scan-help"
            />
          </label>
          <div className="flex items-center gap-2 text-sm" aria-live="polite">
            {saving ? (
              <span className="inline-flex items-center gap-1.5 text-ink-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving…</span>
            ) : dirtyIds.length ? (
              <span className="text-amber-700">{dirtyIds.length} unsaved</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1.5 text-leaf-700"><Check className="h-4 w-4" aria-hidden /> Saved {savedAt}</span>
            ) : null}
            {canEdit && (
              <Button type="button" variant="outline" size="sm" disabled={!dirtyIds.length || saving} onClick={() => startSaving(async () => void (await flush()))}>
                Save
              </Button>
            )}
            {reviewHref && (
              <Button
                type="button"
                size="sm"
                disabled={saving || invalid > 0}
                onClick={() => startSaving(async () => { if (await flush()) router.push(reviewHref); })}
              >
                Review & approve
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show lines">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                onClick={() => setFilter(t.key)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", filter === t.key ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900")}
              >
                {t.label} <span className="tnum opacity-70">{t.n}</span>
              </button>
            ))}
          </div>
          <p id="scan-help" className={cn("hidden text-xs text-ink-500", canEdit && "md:block")}>
            <Kbd>Enter</Kbd> jumps to the item · <Kbd>Enter</Kbd> in a count moves on · <Kbd>Esc</Kbd> back to scan · <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> saves
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-150" role="meter" aria-label="Lines counted" aria-valuenow={counted.length} aria-valuemin={0} aria-valuemax={lines.length}>
          <div className="h-full rounded-full bg-oranje-500 transition-[width] duration-300" style={{ width: `${lines.length ? (counted.length / lines.length) * 100 : 0}%` }} />
        </div>
        <div className="mt-1.5 text-xs text-ink-500">
          <span className="tnum font-semibold text-ink-800">{counted.length}</span> of <span className="tnum">{lines.length}</span> lines counted · <span className="tnum">{units.toLocaleString()}</span> units
          {!blind && variances > 0 && <> · <span className="font-semibold text-amber-700">{variances} with a variance</span></>}
        </div>
      </div>

      {miss && (
        <Notice tone="warn" className="mt-4">
          Nothing on this count sheet matches “{miss}”. If you found stock that isn&apos;t listed, finish the count and book it with a <b>Found</b> adjustment.
        </Notice>
      )}
      {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
      {invalid > 0 && <Notice tone="warn" className="mt-4">{invalid} count{invalid > 1 ? "s aren't" : " isn't"} a whole number — fix {invalid > 1 ? "them" : "it"} before approving.</Notice>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-150 bg-white shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
              <th className="border-b border-ink-150 bg-ink-50 px-4 py-2.5 sm:px-5">Item</th>
              <th className="hidden border-b border-ink-150 bg-ink-50 px-4 py-2.5 sm:table-cell">Batch</th>
              {!blind && <th className="hidden border-b border-ink-150 bg-ink-50 px-4 py-2.5 text-right sm:table-cell">Expected</th>}
              <th className="border-b border-ink-150 bg-ink-50 px-2 py-2.5 text-center sm:px-4">Counted</th>
              {!blind && <th className="hidden border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-right sm:table-cell">Variance</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => {
              const v = parse(values[l.id]);
              const bad = Number.isNaN(v);
              const done = v != null && !bad;
              const diff = done && l.expected != null ? (v as number) - l.expected : null;
              const header = l.category !== lastCat ? ((lastCat = l.category), true) : false;
              return (
                <Fragment key={l.id}>
                  {header && (
                    <tr>
                      <td colSpan={blind ? 3 : 5} className="border-b border-ink-100 bg-ink-50/60 px-5 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-500">
                        {l.category}
                      </td>
                    </tr>
                  )}
                  <tr className={cn("transition-colors", focusId === l.id ? "bg-oranje-50" : done ? "bg-white" : "bg-white hover:bg-ink-50/60")}>
                    <td className="border-b border-ink-100 px-4 py-2.5 sm:px-5">
                      <div className="flex items-center gap-2">
                        {done ? <Check className="h-4 w-4 shrink-0 text-leaf-600" aria-label="Counted" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-ink-200" aria-label="Not counted" />}
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900">
                            {l.productName} <span className="text-ink-500">· {l.variantName}</span>
                          </div>
                          <div className="hidden font-mono text-xs text-ink-400 sm:block">{l.sku}</div>
                          <div className="font-mono text-xs text-ink-600 sm:hidden">
                            {l.batchCode}
                            {l.blocked && <Badge tone="red" className="ml-1">Blocked</Badge>}
                          </div>
                          <div className="text-xs text-ink-400 sm:hidden">
                            {l.expiry ?? "No expiry"}
                            {!blind && l.expected != null && (
                              <>
                                {" "}· expected <span className="tnum font-semibold text-ink-700">{l.expected}</span>
                                {diff != null && diff !== 0 && <span className={cn("tnum ml-1 font-semibold", diff > 0 ? "text-leaf-700" : "text-rose-600")}>({diff > 0 ? "+" : "−"}{Math.abs(diff)})</span>}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap border-b border-ink-100 px-4 py-2.5 sm:table-cell">
                      <div className="font-mono text-xs font-semibold text-ink-700">{l.batchCode}</div>
                      <div className="flex items-center gap-1 text-xs text-ink-400">
                        {l.expiry ?? "No expiry"}
                        {l.blocked && <Badge tone="red">Blocked</Badge>}
                      </div>
                    </td>
                    {!blind && <td className="tnum hidden border-b border-ink-100 px-4 py-2.5 text-right text-ink-600 sm:table-cell">{l.expected}</td>}
                    <td className="border-b border-ink-100 px-2 py-2 sm:px-4">
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                        {canEdit && (
                          <button type="button" tabIndex={-1} onClick={() => bump(l.id, -1)} className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`One less ${l.productName} ${l.variantName}`}>
                            <Minus className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                        <input
                          ref={(el) => {
                            if (el) inputs.current.set(l.id, el);
                            else inputs.current.delete(l.id);
                          }}
                          value={values[l.id]}
                          disabled={!canEdit}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          aria-label={`Count for ${l.productName} ${l.variantName}, batch ${l.batchCode}`}
                          aria-invalid={bad || undefined}
                          onFocus={(e) => (setFocusId(l.id), e.currentTarget.select())}
                          onBlur={() => setFocusId((f) => (f === l.id ? null : f))}
                          onChange={(e) => setValues((prev) => ({ ...prev, [l.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 6) }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.preventDefault(), next(l.id, e.shiftKey ? -1 : 1));
                            if (e.key === "Escape") (e.preventDefault(), (fromScan.current = false), scan.current?.focus());
                          }}
                          placeholder="–"
                          className={cn(
                            "tnum h-10 w-16 rounded-xl border bg-white text-center text-base font-semibold text-ink-950 focus:outline-none focus:ring-4 sm:w-20",
                            bad ? "border-rose-500 focus:ring-rose-500/15" : done ? "border-leaf-500/50 focus:border-oranje-500 focus:ring-oranje-500/15" : "border-ink-200 focus:border-oranje-500 focus:ring-oranje-500/15",
                            "disabled:bg-ink-50",
                          )}
                        />
                        {canEdit && (
                          <button type="button" tabIndex={-1} onClick={() => bump(l.id, 1)} className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`One more ${l.productName} ${l.variantName}`}>
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                    {!blind && (
                      <td className="tnum hidden border-b border-ink-100 px-5 py-2.5 text-right font-semibold sm:table-cell">
                        {diff == null ? <span className="text-ink-300">—</span> : diff === 0 ? <span className="text-leaf-700">0</span> : <span className={diff > 0 ? "text-leaf-700" : "text-rose-600"}>{diff > 0 ? "+" : "−"}{Math.abs(diff)}</span>}
                      </td>
                    )}
                  </tr>
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={blind ? 3 : 5} className="px-5 py-10 text-center text-sm text-ink-500">
                  {query ? `No lines match “${query}”.` : filter === "todo" ? "Everything has been counted." : "Nothing to show."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && uncounted > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-150 bg-white p-4 text-sm">
          <CircleAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p className="min-w-0 flex-1 text-ink-600">
            <b className="text-ink-900">{uncounted} line{uncounted > 1 ? "s" : ""} not counted.</b> Uncounted lines are left unchanged on approval. If they&apos;re genuinely not on the shelf, count them as zero.
          </p>
          {zeroAsk ? (
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="dark"
                size="sm"
                onClick={() => {
                  setValues((prev) => {
                    const out = { ...prev };
                    for (const l of lines) if (parse(out[l.id]) == null) out[l.id] = "0";
                    return out;
                  });
                  setZeroAsk(false);
                }}
              >
                Yes, count {uncounted} as zero
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setZeroAsk(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setZeroAsk(true)}>
              Count the rest as zero
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
