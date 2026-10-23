"use client";
// Shift: open with a counted float (default R1,000); close with a denomination count, then
// expected vs counted (finance.shiftCash), variance and a Z-report that prints at the till
// and is emailed to the store. Also this till's device details and the signed-in person's commission.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudOff, LogOut, Printer, RefreshCw, Tablet, Wallet } from "lucide-react";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { DEFAULT_LOSS } from "@/lib/loss";
import { isTillManager } from "@/lib/pos-refund";
import { api, ApiError, errorText } from "./lib/api";
import { countCash, DENOMINATIONS, denomLabel, isNote } from "./lib/rules";
import { usePos } from "./context";
import { CommissionTile } from "./commission-tile";
import { InviteTile } from "./invite-tile";
import { DisplayCard, PrinterCard, TrainingCard } from "./hardware-panel";
import { TrainingShiftCard } from "./training";
import { Alert, Confirm, EmptyPanel, Field, PosButton, Spinner, TextArea } from "./ui";
import type { BootShift, ZReport } from "@/server/pos/types";

const FLOATS = [50000, 100000, 150000, 200000];
// Phones: the primary action rides at the bottom of the screen (thumb reach) while counting.
const STICKY_ACTION = "sticky bottom-0 z-10 -mx-5 -mb-5 mt-4 rounded-b-3xl bg-ink-900/95 px-5 pb-5 pt-3 backdrop-blur lg:static lg:m-0 lg:mt-4 lg:bg-transparent lg:p-0 lg:backdrop-blur-none";

export function ShiftPanel() {
  const pos = usePos();
  const { boot, online } = pos;
  const shift = boot.shift;
  const [x, setX] = useState<ZReport | null>(null);
  const [closed, setClosed] = useState<ZReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadX = useCallback(async () => {
    if (!online) return;
    try {
      const r = await api<{ shift: BootShift | null; report: ZReport | null }>("/api/pos/shift");
      setX(r.report);
      if (!pos.training && (r.shift?.id ?? null) !== (pos.boot.shift?.id ?? null)) pos.setShift(r.shift);
    } catch (e) {
      setError(errorText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  useEffect(() => void loadX(), [loadX, shift?.id, pos.me.id]); // re-read on a hand-over: the X-report is blind for non-managers

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {error && <Alert>{error}</Alert>}
          {pos.training ? (
            <TrainingShiftCard />
          ) : closed ? (
            <ZReportCard report={closed} onPrint={() => pos.print({ kind: "z", report: closed })} onDone={() => setClosed(null)} />
          ) : shift ? (
            <CloseShift shift={shift} x={x} onClosed={(r) => (setClosed(r), pos.setShift(null))} />
          ) : (
            <OpenShift onOpened={(s) => pos.setShift(s)} />
          )}
        </div>
        <div className="space-y-5">
          <CommissionTile />
          {!pos.training && <InviteTile />}
          {shift && x && !closed && !pos.training && <XReportCard x={x} onRefresh={loadX} onPrint={() => pos.print({ kind: "z", report: x })} />}
          {!shift && !closed && !pos.training && <LastShift />}
          <DeviceCard />
          <PrinterCard />
          <DisplayCard />
          <TrainingCard />
        </div>
      </div>
    </div>
  );
}

function OpenShift({ onOpened }: { onOpened: (s: BootShift) => void }) {
  const pos = usePos();
  const [floatCents, setFloat] = useState(100000);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counted = countCash(counts);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ shift: BootShift }>("/api/pos/shift", { body: counting ? { action: "open", counts } : { action: "open", floatCents } });
      onOpened(r.shift);
      pos.toast(`Shift open with a ${zar(r.shift.openingFloatCents)} float`);
      pos.goTo("sell");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!pos.online)
    return (
      <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800">
        <EmptyPanel icon={<CloudOff className="h-6 w-6" />} title="Opening a shift needs a connection">
          Connect the till to open a shift. Shifts already open keep working offline.
        </EmptyPanel>
      </section>
    );

  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-labelledby="open-shift">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500 text-ink-950">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <h1 id="open-shift" className="font-display text-xl font-semibold text-white">
            Open a shift
          </h1>
          <p className="text-sm text-ink-400">Count the float into the drawer before the first sale.</p>
        </div>
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      {!counting ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FLOATS.map((f) => (
              <PosButton key={f} variant={floatCents === f ? "primary" : "secondary"} size="lg" onClick={() => setFloat(f)} aria-pressed={floatCents === f}>
                {zar(f).replace(".00", "")}
              </PosButton>
            ))}
          </div>
          <button type="button" onClick={() => setCounting(true)} className="mt-3 h-12 text-sm font-semibold text-brand-400 hover:underline">
            Count the float by denomination instead
          </button>
        </>
      ) : (
        <div className="mt-5">
          <DenominationGrid counts={counts} onChange={setCounts} />
          <button type="button" onClick={() => setCounting(false)} className="mt-2 h-12 text-sm font-semibold text-brand-400 hover:underline">
            Use a standard float instead
          </button>
        </div>
      )}
      <div className={STICKY_ACTION}>
        <PosButton variant="primary" size="xl" className="w-full" busy={busy} disabled={counting && counted === 0} onClick={() => void open()} data-testid="open-shift">
          Open shift with {zar(counting ? counted : floatCents)}
        </PosButton>
      </div>
    </section>
  );
}

function CloseShift({ shift, x, onClosed }: { shift: BootShift; x: ZReport | null; onClosed: (r: ZReport) => void }) {
  const pos = usePos();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteNeeded, setNoteNeeded] = useState(false);
  const counted = countCash(counts);
  // Blind cash-up: only a manager sees what the drawer should hold before the count is in (the server leaves it out).
  const manager = isTillManager(pos.me.role);
  const expected = manager && x && !x.blind ? x.cash.expectedCents : null;
  const variance = expected != null ? counted - expected : null;
  // Out by more than the cash-short tolerance: a note is needed (the server checks it against the HQ setting too).
  const needNote = (noteNeeded || (variance != null && Math.abs(variance) > DEFAULT_LOSS.cashShortCents)) && !notes.trim();
  const queued = pos.outbox.filter((o) => !o.deviceId || o.deviceId === pos.boot.device.id).length;
  const blocked = queued > 0 ? `Sync ${queued} offline sale${queued === 1 ? "" : "s"} before closing` : !pos.online ? "Closing a shift needs a connection" : null;

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ report: ZReport }>("/api/pos/shift", { body: { action: "close", shiftId: shift.id, counts, notes: notes.trim() || undefined } });
      onClosed(r.report);
      pos.toast("Shift closed and Z-report ready");
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOTE_REQUIRED") {
        setNoteNeeded(true);
        document.getElementById("shift-notes")?.focus();
      } else setError(errorText(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-labelledby="close-shift">
      <h1 id="close-shift" className="font-display text-xl font-semibold text-white">
        Cash up &amp; close shift
      </h1>
      <p className="text-sm text-ink-400">
        Open since {fmtTime(shift.openedAt)} · {shift.openedBy} · float {zar(shift.openingFloatCents)}. Count every note and coin in the drawer.
      </p>
      {error && <Alert className="mt-4">{error}</Alert>}
      <div className="mt-5">
        <DenominationGrid counts={counts} onChange={setCounts} />
      </div>
      {manager ? (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-ink-950 p-4 ring-1 ring-ink-800 sm:grid-cols-3">
          <Figure label="Expected" value={expected != null ? zar(expected) : "…"} />
          <Figure label="Counted" value={zar(counted)} />
          <Figure
            className="col-span-2 sm:col-span-1"
            label="Variance"
            value={variance != null ? `${variance > 0 ? "+" : ""}${zar(variance)}` : "…"}
            tone={variance == null || variance === 0 ? "ok" : Math.abs(variance) <= 1000 ? "warn" : "bad"}
            testId="variance"
          />
        </div>
      ) : (
        <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl bg-ink-950 p-4 ring-1 ring-ink-800">
          <Figure label="Counted" value={zar(counted)} />
          <p className="max-w-[16rem] text-right text-xs text-ink-400">Blind count: what the drawer should hold shows on the Z-report once you close.</p>
        </div>
      )}
      <Field
        label={needNote ? "Notes (needed)" : "Notes (optional)"}
        htmlFor="shift-notes"
        className="mt-4"
        error={needNote && noteNeeded ? "The count doesn't match what the till expects. Count again, or explain the difference here." : undefined}
        hint={needNote ? "The count is out by more than the tolerance, so explain it. It goes on the Z-report." : variance ? "Explain any variance. It goes on the Z-report." : undefined}
      >
        <TextArea id="shift-notes" value={notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={needNote && noteNeeded ? true : undefined} placeholder="e.g. R50 paid out for milk, slip in drawer" />
      </Field>
      {blocked && <Alert tone="warn" className="mt-4">{blocked}</Alert>}
      <div className={STICKY_ACTION}>
        <PosButton variant="primary" size="xl" className="w-full" disabled={!!blocked || busy || (needNote && variance != null)} onClick={() => setConfirm(true)} data-testid="close-shift">
          Close shift &amp; print Z-report
        </PosButton>
      </div>
      <Confirm
        open={confirm}
        title="Close this shift?"
        body={
          <>
            Counted <b>{zar(counted)}</b>
            {expected != null && (
              <>
                {" "}
                against <b>{zar(expected)}</b> expected
              </>
            )}
            {variance ? (
              <>
                , a variance of <b>{zar(variance)}</b>
              </>
            ) : null}
            . Sales can&apos;t continue on this till until a new shift is opened.
          </>
        }
        confirmLabel="Close shift"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void close()}
      />
    </section>
  );
}

function DenominationGrid({ counts, onChange }: { counts: Record<string, number>; onChange: (c: Record<string, number>) => void }) {
  const set = (d: number, v: number) => onChange({ ...counts, [String(d)]: Math.max(0, Math.min(9999, v)) });
  const row = (d: number) => {
    const n = counts[String(d)] ?? 0;
    return (
      <div key={d} className="flex items-center gap-2 rounded-2xl bg-ink-850 px-2 py-1.5 ring-1 ring-ink-800">
        <span className="w-16 shrink-0 text-center leading-tight">
          <span className={cn("block font-display text-base font-semibold", isNote(d) ? "text-white" : "text-ink-300")}>{denomLabel(d)}</span>
          <span className="block text-[0.7rem] text-ink-500 tnum">{n ? zar(d * n) : " "}</span>
        </span>
        <button type="button" aria-label={`One fewer ${denomLabel(d)}`} onClick={() => set(d, n - 1)} disabled={n <= 0} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink-800 text-lg font-semibold text-white active:scale-95 disabled:opacity-30">
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Number of ${denomLabel(d)} ${isNote(d) ? "notes" : "coins"}`}
          value={n || ""}
          placeholder="0"
          onChange={(e) => set(d, Number(e.target.value.replace(/\D/g, "")) || 0)}
          className="h-12 w-full min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900 text-center font-display text-lg font-semibold text-white tnum placeholder:text-ink-600 focus:border-brand-500 focus:outline-none"
          data-testid={`denom-${d}`}
        />
        <button type="button" aria-label={`One more ${denomLabel(d)}`} onClick={() => set(d, n + 1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink-800 text-lg font-semibold text-white active:scale-95">
          +
        </button>
      </div>
    );
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-2">
        <div className="eyebrow text-[0.62rem] text-ink-400">Notes</div>
        {DENOMINATIONS.filter(isNote).map(row)}
      </div>
      <div className="space-y-2">
        <div className="eyebrow text-[0.62rem] text-ink-400">Coins</div>
        {DENOMINATIONS.filter((d) => !isNote(d)).map(row)}
      </div>
    </div>
  );
}

function Figure({ label, value, tone = "ok", testId, className }: { label: string; value: string; tone?: "ok" | "warn" | "bad"; testId?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-ink-400">{label}</div>
      <div className={cn("whitespace-nowrap font-display text-xl font-semibold tnum lg:text-2xl", tone === "ok" ? "text-white" : tone === "warn" ? "text-[#f3c65a]" : "text-[#f29b9b]")} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function XReportCard({ x, onRefresh, onPrint }: { x: ZReport; onRefresh: () => void; onPrint: () => void }) {
  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-label="Shift so far">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-white">Shift so far</h2>
        <div className="flex gap-1">
          <PosButton variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </PosButton>
          <PosButton variant="ghost" size="sm" onClick={onPrint}>
            <Printer className="h-4 w-4" /> X-report
          </PosButton>
        </div>
      </div>
      <ReportFigures r={x} />
    </section>
  );
}

function ReportFigures({ r }: { r: ZReport }) {
  const rows: [string, string][] = [
    ["Sales", `${r.sales.count} · ${zar(r.sales.grossCents)}`],
    ["VAT included", zar(r.sales.vatCents)],
    ["Discounts given", zar(r.sales.discountCents)],
    ["Rewards savings given", zar(r.sales.memberSavingsCents)],
    ["Refunds", `${r.refunds.count} · ${zar(r.refunds.totalCents)}`],
    // Where the refunds went, a line per tender (a refund back to how they paid can be part cash, part card).
    ...(r.refundTenders ?? []).map((t) => [`Refunds · ${t.label} (${t.count})`, `−${zar(t.amountCents)}`] as [string, string]),
    ...(r.online.count ? ([["Online handovers", `${r.online.count} · ${zar(r.online.grossCents)}`]] as [string, string][]) : []),
    ...(r.trade?.count
      ? ([
          ["Trade sales (ex VAT · VAT · incl)", `${r.trade.count} · ${zar(r.trade.exCents)} · ${zar(r.trade.vatCents)} · ${zar(r.trade.inclCents)}`],
          ["On account (invoiced, not money)", zar(r.trade.onAccountCents)],
        ] as [string, string][])
      : []),
    ...r.tenders.map((t) => [t.label, zar(t.amountCents)] as [string, string]),
    ["Points issued / redeemed", `${fmtPoints(r.points.issued)} / ${fmtPoints(r.points.redeemed)}`],
    ["Cash expected in drawer", r.blind ? "After the count" : zar(r.cash.expectedCents)],
  ];
  return (
    <dl className="mt-3 divide-y divide-ink-850 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-2">
          <dt className="text-ink-400">{k}</dt>
          <dd className="font-semibold text-white tnum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ZReportCard({ report, onPrint, onDone }: { report: ZReport; onPrint: () => void; onDone: () => void }) {
  const v = report.cash.varianceCents ?? 0;
  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-labelledby="zr" data-testid="z-report">
      <div className="eyebrow text-[0.62rem] text-brand-400">Z-report</div>
      <h1 id="zr" className="font-display text-xl font-semibold text-white">
        Shift closed {report.closedAt ? fmtDateTime(report.closedAt) : ""}
      </h1>
      <p className="text-sm text-ink-400">
        {report.openedBy} opened · {report.closedBy} closed{report.emailedTo ? ` · emailed to ${report.emailedTo}` : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-ink-950 p-4 ring-1 ring-ink-800 sm:grid-cols-3">
        <Figure label="Takings" value={zar(report.takingsCents)} />
        <Figure label="Cash counted" value={report.cash.countedCents != null ? zar(report.cash.countedCents) : "—"} />
        <Figure className="col-span-2 sm:col-span-1" label="Variance" value={`${v > 0 ? "+" : ""}${zar(v)}`} tone={v === 0 ? "ok" : Math.abs(v) <= 1000 ? "warn" : "bad"} />
      </div>
      <ReportFigures r={report} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <PosButton variant="outline" size="lg" onClick={onPrint}>
          <Printer className="h-5 w-5" /> Print Z-report
        </PosButton>
        <PosButton variant="primary" size="lg" onClick={onDone}>
          Done
        </PosButton>
      </div>
    </section>
  );
}

function LastShift() {
  const pos = usePos();
  const [r, setR] = useState<ZReport | null | undefined>(undefined);
  useEffect(() => {
    if (!pos.online) return;
    api<{ report: ZReport }>("/api/pos/shift/report", { quiet401: true })
      .then((x) => setR(x.report))
      .catch(() => setR(null));
  }, [pos.online]);
  if (!r) return r === undefined && pos.online ? <Spinner /> : null;
  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-white">Last shift</h2>
        <PosButton variant="ghost" size="sm" onClick={() => pos.print({ kind: "z", report: r })}>
          <Printer className="h-4 w-4" /> Re-print
        </PosButton>
      </div>
      <p className="text-sm text-ink-400">
        {fmtDateTime(r.openedAt)} → {r.closedAt ? fmtDateTime(r.closedAt) : "open"}
      </p>
      <ReportFigures r={r} />
    </section>
  );
}

function DeviceCard() {
  const pos = usePos();
  const { boot } = pos;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const manager = pos.me.role === "MANAGER";
  const staffCount = useMemo(() => boot.staff.length, [boot.staff]);

  return (
    <section className="rounded-3xl bg-ink-900 p-5 ring-1 ring-ink-800" aria-label="This till">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink-800 text-ink-200">
          <Tablet className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-white">{boot.device.name}</h2>
          <p className="text-sm text-ink-400">
            {boot.store.name} ({boot.store.code}) · receipts {boot.store.code}-{boot.device.prefix}#####
          </p>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-ink-850 text-sm">
        <div className="flex justify-between py-2">
          <dt className="text-ink-400">Catalogue downloaded</dt>
          <dd className="text-white">{fmtDateTime(boot.fetchedAt)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-ink-400">Products · staff</dt>
          <dd className="text-white tnum">
            {boot.products.length} · {staffCount}
          </dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-ink-400">Waiting to sync</dt>
          <dd className="text-white tnum">{pos.outbox.length}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-ink-400">Card payments</dt>
          <dd className="text-white">{{ SIMULATED: "Tap on glass (simulated)", HALO_APPLINK: "Halo Dot tap on glass", YOCO: "Yoco card machine", EXTERNAL: "Bank terminal" }[boot.tapProvider] ?? "Bank terminal"}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <PosButton
          variant="secondary"
          busy={refreshing}
          disabled={!pos.online}
          onClick={async () => {
            setRefreshing(true);
            await pos.refreshBoot();
            setRefreshing(false);
            pos.toast("Catalogue, prices and stock refreshed");
          }}
        >
          <RefreshCw className="h-4 w-4" /> Refresh catalogue
        </PosButton>
        <InstallPrompt app="till" variant="button" />
        {manager && (
          <PosButton variant="ghost" onClick={() => setConfirm(true)} disabled={!pos.online || !!boot.shift}>
            <LogOut className="h-4 w-4" /> Unpair this till
          </PosButton>
        )}
      </div>
      {manager && boot.shift && <p className="mt-2 text-xs text-ink-500">Close the shift before unpairing.</p>}
      <Confirm
        open={confirm}
        title="Unpair this till?"
        body={`It stops working for ${boot.store.name} immediately. A manager will need to pair it again to sell.`}
        confirmLabel="Unpair"
        danger
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api("/api/pos/device", { method: "DELETE" });
            window.location.assign("/pos/pair");
          } catch (e) {
            pos.toast(errorText(e), "error");
            setBusy(false);
            setConfirm(false);
          }
        }}
      />
    </section>
  );
}
