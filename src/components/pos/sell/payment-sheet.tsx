"use client";
// Payment: amount due and split tenders — card (tap on glass), a separate bank terminal,
// cash (quick amounts, change due), PayShap (payment-request QR) and points. Over R5,000
// the buyer's details are captured for a full tax invoice. Reused for order handovers.
import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, Landmark, Nfc, QrCode, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtPoints } from "@/lib/loyalty-rules";
import { errorText } from "../lib/api";
import { maxRedeemable, parseRands, quickCash } from "../lib/rules";
import { Alert, Field, PosButton, Sheet, TextInput } from "../ui";
import { TapOverlay } from "./tap-overlay";
import type { QueuedTender } from "../lib/storage";
import type { TapProviderKind } from "@/server/pos/types";

export type Buyer = { name: string; address: string; vatNumber?: string };
export type PaymentResult = { tenders: QueuedTender[]; points: number; buyer: Buyer | null };

type Panel = "cash" | "external" | "payshap" | "points" | null;

export const FULL_INVOICE_OVER_CENTS = 500_000;

export function PaymentSheet({
  open,
  title,
  dueCents,
  savingsCents = 0,
  discountCents = 0,
  reference,
  online,
  tapProvider,
  storeCode,
  points,
  needsBuyer,
  onComplete,
  onClose,
}: {
  open: boolean;
  title: string;
  dueCents: number;
  savingsCents?: number; // instant Rewards savings already in the prices
  discountCents?: number; // promotions
  reference: string;
  online: boolean;
  tapProvider: TapProviderKind;
  storeCode: string;
  points?: { balance: number; eligibleCents: number; minRedeem: number } | null;
  needsBuyer?: boolean;
  onComplete: (r: PaymentResult) => Promise<void>;
  onClose: () => void;
}) {
  const [tenders, setTenders] = useState<(QueuedTender & { key: number })[]>([]);
  const [pts, setPts] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [amountText, setAmountText] = useState<string | null>(null); // null = "whatever is still due"
  const [tapping, setTapping] = useState<number | null>(null);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", address: "", vatNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cashText, setCashText] = useState("");
  const [extRef, setExtRef] = useState("");
  const [extLast4, setExtLast4] = useState("");
  const [payshapRef, setPayshapRef] = useState("");
  const keySeq = useRef(0);
  const completing = useRef(false);

  const paid = tenders.reduce((s, t) => s + t.amountCents, 0) + pts * 100;
  const remaining = Math.max(0, dueCents - paid);
  const amount = (amountText != null ? parseRands(amountText) : null) ?? remaining;
  const charge = Math.min(Math.max(0, amount), remaining);
  const buyerOk = !needsBuyer || (buyer.name.trim().length > 1 && buyer.address.trim().length > 4);
  const change = tenders.reduce((s, t) => s + (t.changeCents ?? 0), 0);

  // Fresh state each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTenders([]);
    setPts(0);
    setPanel(online ? null : "cash");
    setAmountText(null);
    setError(null);
    setBusy(false);
    setBuyer({ name: "", address: "", vatNumber: "" });
    completing.current = false;
  }, [open, online]);

  const add = (t: QueuedTender) => {
    setTenders((ts) => [...ts, { ...t, key: ++keySeq.current }]);
    setAmountText(null);
    setPanel(null);
    setError(null);
  };

  const complete = async () => {
    if (completing.current) return;
    completing.current = true;
    setBusy(true);
    setError(null);
    try {
      await onComplete({ tenders: tenders.map(({ key: _k, ...t }) => t), points: pts, buyer: needsBuyer ? { name: buyer.name.trim(), address: buyer.address.trim(), vatNumber: buyer.vatNumber?.trim() || undefined } : null });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      completing.current = false;
    }
  };

  // Finish automatically once everything is tendered (and buyer details are in when needed).
  const doneRef = useRef(complete);
  doneRef.current = complete;
  useEffect(() => {
    if (open && dueCents > 0 && remaining === 0 && paid >= dueCents && buyerOk && !error && (tenders.length || pts)) void doneRef.current();
  }, [open, remaining, paid, dueCents, buyerOk, tenders.length, pts, error]);

  const maxPts = points ? maxRedeemable({ balance: points.balance, eligibleCents: points.eligibleCents - pts * 100, dueCents: remaining, minRedeem: points.minRedeem }) : 0;
  const cashOptions = useMemo(() => quickCash(charge), [charge]);
  const payshapText = `https://pay.herbalholland.co.za/payshap/${storeCode.toLowerCase()}?amount=${(charge / 100).toFixed(2)}&ref=${encodeURIComponent(reference)}`;

  const method = (key: Panel | "card", label: string, icon: React.ReactNode, disabled: boolean, sub?: string) => (
    <button
      type="button"
      disabled={disabled || remaining === 0}
      onClick={() => {
        setError(null);
        if (key === "card") setTapping(charge);
        else setPanel(panel === key ? null : key);
      }}
      aria-pressed={panel === key}
      className={cn(
        "flex min-h-[4.5rem] flex-col items-start justify-center gap-1 rounded-2xl px-4 py-3 text-left ring-1 transition active:scale-[0.99] disabled:opacity-35",
        panel === key ? "bg-oranje-500 text-ink-950 ring-oranje-500" : "bg-ink-850 text-white ring-ink-800 hover:ring-oranje-500/60",
      )}
      data-testid={`tender-${key}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {label}
      </span>
      {sub && <span className={cn("text-xs", panel === key ? "text-ink-900" : "text-ink-400")}>{sub}</span>}
    </button>
  );

  return (
    <>
      <Sheet open={open && tapping == null} onClose={busy ? () => undefined : onClose} dismissable={!busy && tenders.length === 0} title={title} subtitle={`Ref ${reference}`} size="xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Left: what's due and what's been tendered */}
          <div>
            <div className="rounded-3xl bg-ink-950 p-5 ring-1 ring-ink-800">
              <div className="text-sm text-ink-400">{remaining ? "Still to pay" : "Paid in full"}</div>
              <div className={cn("mt-1 font-display text-5xl font-semibold tracking-tight tnum", remaining ? "text-white" : "text-[#7fd49a]")} data-testid="remaining">
                {zar(remaining)}
              </div>
              <div className="mt-2 text-sm text-ink-400">
                Total {zar(dueCents)}
                {paid > 0 && ` · paid ${zar(paid)}`}
              </div>
              {(savingsCents > 0 || discountCents > 0) && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-800 pt-3 text-sm">
                  {savingsCents > 0 && <span className="font-semibold text-oranje-300">Rewards savings {zar(savingsCents)}</span>}
                  {discountCents > 0 && <span className="font-semibold text-[#7fd49a]">Deals {zar(discountCents)}</span>}
                </div>
              )}
            </div>

            {(tenders.length > 0 || pts > 0) && (
              <ul className="mt-4 space-y-2" aria-label="Tenders">
                {pts > 0 && (
                  <TenderRow icon={<Sparkles className="h-4 w-4" />} label={`Points · ${fmtPoints(pts)}`} amount={pts * 100} onRemove={busy ? undefined : () => setPts(0)} />
                )}
                {tenders.map((t) => (
                  <TenderRow
                    key={t.key}
                    icon={t.method === "CASH" ? <Banknote className="h-4 w-4" /> : t.method === "PAYSHAP" ? <QrCode className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    label={
                      t.method === "CASH"
                        ? `Cash${t.tenderedCents ? ` · tendered ${zar(t.tenderedCents)}` : ""}${t.changeCents ? ` · change ${zar(t.changeCents)}` : ""}`
                        : t.method === "PAYSHAP"
                          ? `PayShap · ref ${t.reference}`
                          : t.provider === "EXTERNAL"
                            ? `Bank terminal · auth ${t.reference}`
                            : `${t.cardBrand ?? "Card"} •••• ${t.cardLast4 ?? ""} · auth ${t.reference}`
                    }
                    amount={t.amountCents}
                    onRemove={busy ? undefined : () => setTenders((ts) => ts.filter((x) => x.key !== t.key))}
                  />
                ))}
              </ul>
            )}

            {needsBuyer && (
              <div className="mt-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800">
                <div className="font-semibold text-white">Full tax invoice (over R5,000)</div>
                <p className="mb-3 mt-0.5 text-xs text-ink-400">SARS requires the buyer&apos;s name and address on invoices above R5,000.</p>
                <div className="grid gap-3">
                  <Field label="Buyer name" htmlFor="buyer-name">
                    <TextInput id="buyer-name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="Name or company" />
                  </Field>
                  <Field label="Address" htmlFor="buyer-addr">
                    <TextInput id="buyer-addr" value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} placeholder="Street, suburb, city" />
                  </Field>
                  <Field label="VAT number (if registered)" htmlFor="buyer-vat">
                    <TextInput id="buyer-vat" inputMode="numeric" value={buyer.vatNumber} onChange={(e) => setBuyer({ ...buyer, vatNumber: e.target.value })} />
                  </Field>
                </div>
              </div>
            )}

            {error && (
              <Alert className="mt-4">
                <div className="font-semibold">The sale didn&apos;t go through</div>
                <div>{error}</div>
                <div className="mt-3 flex gap-2">
                  <PosButton variant="danger" size="sm" onClick={() => void complete()} disabled={remaining > 0 || !buyerOk}>
                    Try again
                  </PosButton>
                </div>
              </Alert>
            )}
            {busy && <p className="mt-4 text-center text-sm text-ink-300">Completing the sale…</p>}
            {remaining === 0 && !busy && !error && !buyerOk && <Alert tone="warn" className="mt-4">Add the buyer&apos;s name and address to finish.</Alert>}
          </div>

          {/* Right: how they're paying */}
          <div>
            <Field label="Amount for this payment" htmlFor="pay-amount" hint={amount < remaining && remaining ? `Split payment — ${zar(remaining - charge)} will still be due` : undefined}>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl text-ink-400">R</span>
                <TextInput id="pay-amount" inputMode="decimal" value={amountText ?? (remaining ? (remaining / 100).toFixed(2) : "")} onChange={(e) => setAmountText(e.target.value)} onFocus={(e) => e.currentTarget.select()} className="h-16 pl-10 font-display text-3xl font-semibold tnum" disabled={remaining === 0} />
              </div>
            </Field>

            {!online && <Alert tone="warn" className="mt-3">Offline — cash only. Card, PayShap and points need a connection.</Alert>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {method("card", "Card · tap", <Nfc className="h-5 w-5" />, !online || tapProvider === "EXTERNAL", "Card, phone or watch")}
              {method("external", "Bank terminal", <Landmark className="h-5 w-5" />, !online, "Enter the approval code")}
              {method("cash", "Cash", <Banknote className="h-5 w-5" />, false, "Change calculated")}
              {method("payshap", "PayShap", <QrCode className="h-5 w-5" />, !online, "Instant EFT by QR")}
              {points && method("points", "Points", <Sparkles className="h-5 w-5" />, !online || maxPts === 0, points.balance < points.minRedeem ? `Min ${points.minRedeem} pts to redeem` : `${fmtPoints(points.balance)} available`)}
            </div>

            {panel === "cash" && (
              <div className="mt-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800" data-testid="cash-panel">
                <div className="text-sm font-semibold text-white">Cash tendered for {zar(charge)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {cashOptions.map((c) => (
                    <PosButton key={c} variant={c === charge ? "primary" : "secondary"} size="lg" className="px-2 tnum" onClick={() => add({ method: "CASH", amountCents: charge, tenderedCents: c, changeCents: c - charge })}>
                      {c === charge ? "Exact" : zar(c).replace(".00", "")}
                    </PosButton>
                  ))}
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = parseRands(cashText);
                    if (c == null || c < charge) return setError(`Enter at least ${zar(charge)}`);
                    add({ method: "CASH", amountCents: charge, tenderedCents: c, changeCents: c - charge });
                    setCashText("");
                  }}
                >
                  <TextInput inputMode="decimal" value={cashText} onChange={(e) => setCashText(e.target.value)} placeholder="Other amount" aria-label="Cash tendered" />
                  <PosButton type="submit" variant="secondary">
                    Add
                  </PosButton>
                </form>
              </div>
            )}

            {panel === "external" && (
              <form
                className="mt-4 space-y-3 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!/^[A-Za-z0-9-]{4,20}$/.test(extRef.trim())) return setError("Enter the approval code printed on the terminal slip");
                  add({ method: "CARD", amountCents: charge, provider: "EXTERNAL", reference: extRef.trim().toUpperCase(), cardLast4: /^\d{4}$/.test(extLast4) ? extLast4 : undefined });
                  setExtRef("");
                  setExtLast4("");
                }}
              >
                <p className="text-sm text-ink-300">
                  Charge <b className="text-white">{zar(charge)}</b> on the bank&apos;s card machine, then key in its approval code.
                </p>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <Field label="Approval / auth code" htmlFor="ext-ref">
                    <TextInput id="ext-ref" autoComplete="off" value={extRef} onChange={(e) => setExtRef(e.target.value)} className="font-mono uppercase" />
                  </Field>
                  <Field label="Card last 4" htmlFor="ext-4">
                    <TextInput id="ext-4" inputMode="numeric" maxLength={4} value={extLast4} onChange={(e) => setExtLast4(e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </div>
                <PosButton type="submit" variant="primary" className="w-full">
                  Add card payment
                </PosButton>
              </form>
            )}

            {panel === "payshap" && (
              <div className="mt-4 grid gap-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800 sm:grid-cols-[10rem_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/pos/qr?text=${encodeURIComponent(payshapText)}`} alt="PayShap payment request QR code" className="aspect-square w-40 rounded-xl bg-white p-1.5" />
                <div className="flex flex-col">
                  <p className="text-sm text-ink-300">
                    Customer scans with their banking app and pays <b className="text-white">{zar(charge)}</b>
                  </p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-ink-400">ShapID</dt>
                      <dd className="font-mono text-white">{storeCode.toLowerCase()}@herbalholland</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-ink-400">Reference</dt>
                      <dd className="font-mono text-white">{reference}</dd>
                    </div>
                  </dl>
                  <Field label="Bank reference (from the payment notification)" htmlFor="ps-ref" className="mt-3">
                    <TextInput id="ps-ref" autoComplete="off" value={payshapRef} onChange={(e) => setPayshapRef(e.target.value)} placeholder={reference} className="font-mono" />
                  </Field>
                  <PosButton
                    variant="primary"
                    className="mt-3"
                    onClick={() => {
                      add({ method: "PAYSHAP", amountCents: charge, provider: "PAYSHAP", reference: payshapRef.trim() || reference });
                      setPayshapRef("");
                    }}
                  >
                    I&apos;ve received {zar(charge)}
                  </PosButton>
                </div>
              </div>
            )}

            {panel === "points" && points && (
              <div className="mt-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800">
                <p className="text-sm text-ink-300">
                  {fmtPoints(points.balance)} available · 1 point = R1. Points can&apos;t be used on licensed medicines.
                </p>
                <PosButton
                  variant="primary"
                  className="mt-3 w-full"
                  disabled={maxPts === 0}
                  onClick={() => {
                    setPts((p) => p + maxPts);
                    setPanel(null);
                  }}
                >
                  Use {fmtPoints(maxPts)} ({zar(maxPts * 100)})
                </PosButton>
              </div>
            )}
          </div>
        </div>
        {change > 0 && remaining === 0 && <div className="sr-only">Change due {zar(change)}</div>}
      </Sheet>

      {tapping != null && (
        <TapOverlay
          amountCents={tapping}
          reference={reference}
          provider={tapProvider}
          onClose={() => setTapping(null)}
          onApproved={(r) => {
            setTapping(null);
            add({ method: "CARD", amountCents: tapping, provider: r.provider, reference: r.reference, cardBrand: r.cardBrand, cardLast4: r.cardLast4 });
          }}
        />
      )}
    </>
  );
}

function TenderRow({ icon, label, amount, onRemove }: { icon: React.ReactNode; label: string; amount: number; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-ink-850 px-4 py-2.5 ring-1 ring-ink-800">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-leaf-500/15 text-[#7fd49a]">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-200">{label}</span>
      <span className="font-semibold text-white tnum">{zar(amount)}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid h-12 w-12 place-items-center rounded-full text-ink-400 hover:bg-rose-500/10 hover:text-rose-400">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

