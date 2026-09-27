// Building blocks shared by the product page and the public COA page.
import { CheckCircle2, CircleMinus, CircleX } from "lucide-react";
import { cn } from "@/lib/cn";

export type Terp = { name: string; pct: number };
export type LabResults = {
  microbials?: string;
  pesticides?: string;
  heavyMetals?: string;
  mycotoxins?: string;
  residualSolvents?: string;
  moisturePct?: number | null;
  terpenes?: Terp[];
};

export const asTerps = (v: unknown): Terp[] =>
  Array.isArray(v) ? v.filter((t): t is Terp => !!t && typeof t === "object" && typeof (t as Terp).name === "string" && typeof (t as Terp).pct === "number") : [];
export const asLab = (v: unknown): LabResults | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as LabResults) : null);

export function TerpeneBars({ terps, className }: { terps: Terp[]; className?: string }) {
  const sorted = [...terps].sort((a, b) => b.pct - a.pct);
  const max = Math.max(1, ...sorted.map((t) => t.pct));
  return (
    <ul className={cn("space-y-3", className)}>
      {sorted.map((t) => (
        <li key={t.name}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-ink-100">{t.name}</span>
            <span className="tnum text-ink-300">{t.pct.toFixed(2)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800" aria-hidden>
            <div className="h-full rounded-full bg-oranje-500" style={{ width: `${(t.pct / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const SAFETY_PANELS: { key: keyof LabResults; label: string; what: string }[] = [
  { key: "microbials", label: "Microbials", what: "Moulds, yeasts and bacteria such as E. coli and Salmonella" },
  { key: "pesticides", label: "Pesticides", what: "Residues from crop protection products" },
  { key: "heavyMetals", label: "Heavy metals", what: "Lead, cadmium, arsenic and mercury" },
  { key: "mycotoxins", label: "Mycotoxins", what: "Toxins from moulds, e.g. aflatoxins and ochratoxin A" },
  { key: "residualSolvents", label: "Residual solvents", what: "Left-over extraction solvents (extracts only)" },
];

export function SafetyResult({ value }: { value?: string }) {
  const v = (value ?? "").toUpperCase();
  if (v === "PASS")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-500/15 px-2.5 py-1 text-xs font-bold text-leaf-100 ring-1 ring-inset ring-leaf-500/40">
        <CheckCircle2 className="h-3.5 w-3.5" /> PASS
      </span>
    );
  if (v === "FAIL")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-100 ring-1 ring-inset ring-rose-500/40">
        <CircleX className="h-3.5 w-3.5" /> FAIL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-xs font-semibold text-ink-300 ring-1 ring-inset ring-ink-700">
      <CircleMinus className="h-3.5 w-3.5" /> {v === "N/A" ? "Not applicable" : "Not tested"}
    </span>
  );
}

/** "17–21%" / "0.2%" / null */
export function range(min?: number | null, max?: number | null, unit = "%") {
  if (min == null && max == null) return null;
  if (min === 0 && max) return `≤ ${max}${unit}`;
  if (min != null && max != null && min !== max) return `${min}–${max}${unit}`;
  return `${max ?? min}${unit}`;
}
