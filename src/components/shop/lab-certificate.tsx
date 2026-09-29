// The batch's lab certificate as a panel: the numbers a member reads first (THC, CBD, packed, tested by), the safety
// panels with their PASS marks, and the door to the full public certificate at /batch/[code].
import Link from "next/link";
import { ArrowRight, FlaskConical, ShieldCheck } from "lucide-react";
import { SAFETY_PANELS, SafetyResult, type LabResults } from "./product-parts";
import { fmtDate } from "@/lib/format";

export type CertificateBatch = { code: string; labName: string | null; coaRef: string | null; packedAt: Date; expiresAt: Date | null; supplier: string };

export function LabCertificate({ batch, lab, potency, className }: { batch: CertificateBatch; lab: LabResults | null; potency: { label: string; value: string | null }[]; className?: string }) {
  const panels = SAFETY_PANELS.filter((s) => lab?.[s.key] != null);
  const passed = panels.filter((s) => String(lab?.[s.key]).toUpperCase() === "PASS").length;
  return (
    <section aria-labelledby="lab" className={className}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow text-brand-500">Lab-tested · batch-traceable</div>
          <h2 id="lab" className="mt-2 font-display text-2xl font-semibold text-white">
            Certificate of analysis
          </h2>
        </div>
        <Link href={`/batch/${batch.code}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-400 hover:underline">
          Full certificate <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="hh-bead-frame mt-5 overflow-hidden">
        <div className="grid grid-cols-1 gap-6 bg-ink-950 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">
              <FlaskConical className="h-4 w-4 text-brand-500" /> Batch
            </div>
            <div className="tnum mt-1 font-display text-3xl font-semibold tracking-wide text-white">{batch.code}</div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {potency
                .filter((p) => p.value)
                .map((p) => (
                  <div key={p.label} className="rounded-2xl border border-ink-800 bg-ink-900/70 p-3">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">{p.label}</dt>
                    <dd className="tnum mt-1 font-display text-xl font-semibold text-white">{p.value}</dd>
                  </div>
                ))}
            </dl>
            <dl className="mt-4 space-y-2 text-sm">
              {(
                [
                  ["Tested by", batch.labName],
                  ["Certificate no.", batch.coaRef],
                  ["Packed", fmtDate(batch.packedAt)],
                  ["Best before", batch.expiresAt ? fmtDate(batch.expiresAt) : null],
                  ["Grown / made by", batch.supplier],
                ] as [string, string | null][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-ink-400">{k}</dt>
                    <dd className="text-right font-medium text-ink-100">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-leaf-500" /> Safety panels
              </h3>
              {panels.length > 0 && (
                <span className="tnum text-xs text-ink-400">
                  {passed} of {panels.length} passed
                </span>
              )}
            </div>
            {panels.length ? (
              <ul className="mt-3 divide-y divide-ink-800">
                {panels.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="block text-ink-100">{s.label}</span>
                      <span className="block text-xs text-ink-450">{s.what}</span>
                    </span>
                    <SafetyResult value={lab?.[s.key] as string} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-400">Potency tested; the full panel is on the certificate.</p>
            )}
            {lab?.moisturePct != null && <p className="tnum mt-3 text-xs text-ink-400">Moisture {lab.moisturePct}%</p>}
          </div>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-400">
        <FlaskConical className="h-3.5 w-3.5" /> Scan the QR code on your pack for the certificate of the exact batch you bought.
      </p>
    </section>
  );
}
