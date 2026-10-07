// "Have these ready": the documents each kind of business uploads with its application, from the same licence rules
// the form applies (src/lib/trade-licences.ts), so the list never drifts from what the form asks for.
import { FileCheck2 } from "lucide-react";
import { TRADE_KINDS, type TradeKind } from "@/lib/trade";
import { licencesToHaveReady, TRADE_LICENCES } from "@/lib/trade-licences";
import { className as classLabel } from "./format";

const doc = (k: keyof typeof TRADE_LICENCES) => TRADE_LICENCES[k].docLabel;

export function HaveReady() {
  return (
    <section aria-labelledby="have-ready" className="rounded-2xl border border-ink-800 bg-ink-900/40 p-5 sm:p-6" data-testid="have-ready">
      <div className="flex items-start gap-3">
        <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
        <div className="min-w-0">
          <h2 id="have-ready" className="font-display text-lg font-semibold text-white">
            Have these ready
          </h2>
          <p className="mt-1 text-sm text-ink-300">Your business details, the company registration and VAT numbers if you have them, and a copy of each document for your kind of business (a PDF, JPG or PNG up to 5 MB each).</p>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-ink-800 text-sm">
        {(Object.keys(TRADE_KINDS) as TradeKind[]).map((kind) => {
          const items = licencesToHaveReady(kind);
          const always = items.filter((i) => i.company === undefined && !i.classes).map((i) => doc(i.licence));
          const company = items.find((i) => i.company === true);
          const sole = items.find((i) => i.company === false);
          const byRange = items.filter((i) => i.classes);
          const parts = [
            ...always,
            ...(company && sole ? [`a company: ${doc(company.licence)}; a sole proprietor: ${doc(sole.licence)}`] : company ? [doc(company.licence)] : []),
            ...byRange.map((i) => `${doc(i.licence)} if you'll stock ${i.classes!.map(classLabel).join(" or ")}`),
          ];
          return (
            <div key={kind} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
              <dt className="font-semibold text-ink-100">{TRADE_KINDS[kind]}</dt>
              <dd className="text-ink-300">{parts.length ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(". ") + "." : "No licence documents."}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
