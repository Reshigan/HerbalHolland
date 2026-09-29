"use client";
// Training mode UI: the banner and orange outline that mark the sandbox, the five-step tour for new cashiers,
// the sandbox shift card and the practice-sales list (Sales tab). Rules and copy: lib/training.ts.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, Printer, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtTime } from "@/lib/format";
import { TOUR, TRAINING_BANNER } from "./lib/training";
import { loadTrainingSales } from "./lib/storage";
import { usePos } from "./context";
import { Alert, PosButton, Sheet } from "./ui";
import type { ReceiptDTO } from "@/server/pos/types";

export function TrainingBanner() {
  const pos = usePos();
  if (!pos.training) return null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 bg-brand-500 px-4 py-1.5 text-ink-950" role="status" data-testid="training-banner">
      <span className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em]">
        <GraduationCap className="h-4 w-4" /> {TRAINING_BANNER}
      </span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={pos.showTour} className="h-11 rounded-full px-3 text-sm font-semibold hover:bg-ink-950/10">
          Tour
        </button>
        <button type="button" onClick={pos.exitTraining} className="h-11 rounded-full bg-ink-950 px-4 text-sm font-semibold text-white" data-testid="banner-exit-training">
          Exit training
        </button>
      </span>
    </div>
  );
}

/** The orange outline around everything while training is on. */
export const TrainingOutline = () => <div className="pointer-events-none fixed inset-0 z-[75] border-4 border-brand-500 print:hidden" aria-hidden data-testid="training-outline" />;

export function TrainingTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;
  return (
    <Sheet open={open} onClose={onClose} title={`${i + 1}. ${step.title}`} subtitle={`Guided tour · step ${i + 1} of ${TOUR.length}`} size="md" dismissable>
      <div data-testid="tour-step" data-step={i + 1}>
        <p className="text-[1.05rem] leading-relaxed text-ink-100">{step.body}</p>
        {step.tip && <p className="mt-3 text-sm text-brand-300">{step.tip}</p>}
        <ol className="mt-5 flex gap-1.5" aria-label="Steps">
          {TOUR.map((s, k) => (
            <li key={s.title} className={cn("h-1.5 flex-1 rounded-full", k <= i ? "bg-brand-500" : "bg-ink-700")} />
          ))}
        </ol>
        <div className="mt-5 flex justify-between gap-2">
          <PosButton variant="ghost" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </PosButton>
          <div className="flex gap-2">
            {!last && (
              <PosButton variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" /> Skip
              </PosButton>
            )}
            <PosButton variant="primary" onClick={() => (last ? onClose() : setI((x) => x + 1))} data-testid="tour-next">
              {last ? "Start practising" : "Next"} {!last && <ChevronRight className="h-4 w-4" />}
            </PosButton>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** Shift tab while training: the sandbox shift, in place of open / close. */
export function TrainingShiftCard() {
  const pos = usePos();
  const shift = pos.boot.shift;
  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-brand-500/40" aria-labelledby="training-shift">
      <div className="eyebrow text-[0.62rem] text-brand-400">Training mode</div>
      <h1 id="training-shift" className="font-display text-xl font-semibold text-white">
        Practice shift
      </h1>
      <p className="mt-1 text-sm text-ink-400">
        {shift?.id === "training" ? `Sandbox shift with a ${zar(shift.openingFloatCents)} float — no real shift is open on this till.` : `Selling against the real open shift's catalogue and prices, but nothing you ring up is recorded on it.`}
      </p>
      <Alert tone="warn" className="mt-4">
        Opening, closing and cashing up are not available in training. Exit training (manager PIN) to work the real shift.
      </Alert>
    </section>
  );
}

/** Sales tab while training: the practice receipts rung up on this till, re-printable and refundable (simulated). */
export function TrainingSales() {
  const pos = usePos();
  const [rows, setRows] = useState<ReceiptDTO[]>([]);
  const count = pos.training?.sales ?? 0;
  useEffect(() => setRows(loadTrainingSales().slice().reverse()), [count]);

  const refund = (r: ReceiptDTO) => {
    const { seq, number } = pos.nextNumber();
    pos.commitSeq(seq);
    const credit: ReceiptDTO = {
      ...r,
      id: `${r.id}-refund`,
      number,
      kind: "REFUND",
      title: pos.boot.store.vatRegistered ? "Credit note" : "Refund",
      createdAt: new Date().toISOString(),
      refundOf: { id: r.id, number: r.number },
      lines: r.lines.map((l) => ({ ...l, qty: -l.qty, totalCents: -l.totalCents, vatCents: -l.vatCents, discountCents: 0, offerCents: 0 })),
      totalCents: -r.totalCents,
      vatCents: -r.vatCents,
      discountCents: 0,
      offerCents: 0,
      memberSavingsCents: 0,
      pointsEarned: 0,
      pointsRedeemed: 0,
      payments: [{ method: r.payments[0]?.method ?? "CASH", amountCents: -r.totalCents, tenderedCents: null, changeCents: null, provider: null, reference: null, cardBrand: null, cardLast4: null }],
      note: "Training refund",
      refunds: [],
      invoiceUrl: null,
      training: true,
    };
    pos.trainingSale(credit);
    pos.toast(`Practice refund ${number} — nothing is real`);
  };

  return (
    <section className="rounded-3xl bg-ink-900 p-4 ring-1 ring-brand-500/40" aria-label="Practice sales" data-testid="training-sales">
      <div className="eyebrow text-[0.62rem] text-brand-400">Training mode</div>
      <h2 className="font-display text-lg font-semibold text-white">Practice sales on this till</h2>
      <p className="text-sm text-ink-400">Never posted. Re-print them (TRAINING watermark) or practise a refund.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">No practice sales yet — ring one up on the Sell tab.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-850">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono font-semibold text-white">{r.number}</span>
                <span className="block text-xs text-ink-400">
                  {fmtTime(r.createdAt)} · {r.lines.length} line{r.lines.length === 1 ? "" : "s"} · {r.customer?.name ?? "Walk-in"}
                </span>
              </span>
              <span className={cn("font-semibold tnum", r.totalCents < 0 ? "text-[#f29b9b]" : "text-white")}>{zar(r.totalCents)}</span>
              <PosButton variant="ghost" size="sm" onClick={() => pos.print({ kind: "receipt", receipt: r })} aria-label={`Print ${r.number}`}>
                <Printer className="h-4 w-4" />
              </PosButton>
              {r.kind === "SALE" && !rows.some((x) => x.refundOf?.id === r.id) && (
                <PosButton variant="ghost" size="sm" onClick={() => refund(r)} aria-label={`Refund ${r.number}`}>
                  <RotateCcw className="h-4 w-4" />
                </PosButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
