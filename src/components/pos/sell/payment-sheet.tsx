"use client";
// Payment: amount due and split tenders. Card (tap on glass, or the store's Yoco card machine),
// a separate bank terminal, cash (quick amounts, change due), PayShap (to the store's own ShapID, when it has one), points and
// gift vouchers (the code typed or scanned, looked up on the server, redeemed when the sale posts, so
// online only). Over R5,000 the buyer's details are captured for a full tax invoice. Reused for order handovers.
// Trade-sale mode (`trade`): money as usual plus an EFT by bank reference and "On account" within the account's credit
// terms, never points or a gift voucher (consumer money); the buyer block comes from the account.
import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Building2, CreditCard, Gift, Landmark, Nfc, ScanLine, Sparkles, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { voucherCodeFrom } from "@/lib/vouchers";
import { usePos } from "../context";
import { api, errorText, TillError } from "../lib/api";
import { cardMachineTender, maxRedeemable, parseRands, quickCash, tradeTenders } from "../lib/rules";
import { Alert, Field, PosButton, Sheet, TextInput } from "../ui";
import { TapOverlay } from "./tap-overlay";
import { CameraScanner, cameraScanSupported } from "./scanner";
import type { QueuedTender } from "../lib/storage";
import type { TapProviderKind, TradeAccountDTO, VoucherLookupDTO } from "@/server/pos/types";

export type Buyer = { name: string; address: string; vatNumber?: string };
export type PaymentResult = { tenders: QueuedTender[]; points: number; buyer: Buyer | null };
/** A gift voucher code scanned or typed outside the sheet: opens the voucher tender with it looked up (`n` makes a repeat scan count). */
export type VoucherScan = { code: string; n: number };

type Panel = "cash" | "external" | "yoco" | "payshap" | "points" | "voucher" | "eft" | "account" | null;

export const FULL_INVOICE_OVER_CENTS = 500_000;

export function PaymentSheet({
  open,
  title,
  dueCents,
  savingsCents = 0,
  discountCents = 0,
  offerCents = 0,
  reference,
  online,
  tapProvider,
  points,
  needsBuyer,
  voucherScan,
  trade,
  onComplete,
  onProgress,
  onClose,
}: {
  open: boolean;
  title: string;
  dueCents: number;
  savingsCents?: number; // instant Rewards savings already in the prices
  discountCents?: number; // promotions, My Deals included
  offerCents?: number; // My Deals (member's personal offers)
  reference: string;
  online: boolean;
  tapProvider: TapProviderKind;
  points?: { balance: number; eligibleCents: number; minRedeem: number } | null;
  needsBuyer?: boolean;
  voucherScan?: VoucherScan | null;
  /** Trade-sale mode: the account buying (its terms decide whether "On account" is offered, and for how much). */
  trade?: TradeAccountDTO | null;
  onComplete: (r: PaymentResult) => Promise<void>;
  /** For the customer display: what is due, what has been tendered, and whether a card tap is in progress. */
  onProgress?: (p: { dueCents: number; paidCents: number; tapping: boolean; method: string | null } | null) => void;
  onClose: () => void;
}) {
  const [tenders, setTenders] = useState<(QueuedTender & { key: number })[]>([]);
  const [pts, setPts] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [amountText, setAmountText] = useState<string | null>(null); // null = "whatever is still due"
  const [tapping, setTapping] = useState<number | null>(null);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", address: "", vatNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [titled, setTitled] = useState<{ message: string; title: string } | null>(null); // heading for a TillError
  const [busy, setBusy] = useState(false);
  const [cashText, setCashText] = useState("");
  const [extRef, setExtRef] = useState("");
  const [extLast4, setExtLast4] = useState("");
  const [payshapRef, setPayshapRef] = useState("");
  const [eftRef, setEftRef] = useState("");
  const [voucherText, setVoucherText] = useState("");
  const [voucher, setVoucher] = useState<VoucherLookupDTO | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({}); // vouchers looked up in this sale, by code
  const [scanVoucher, setScanVoucher] = useState(false);
  const keySeq = useRef(0);
  const completing = useRef(false);
  // The ShapID the store's bank issued (store settings): no ShapID, no PayShap tender.
  const shapId = usePos().boot.store.payshapId?.trim() || null;

  const paid = tenders.reduce((s, t) => s + t.amountCents, 0) + pts * 100;
  const remaining = Math.max(0, dueCents - paid);
  const amount = (amountText != null ? parseRands(amountText) : null) ?? remaining;
  const charge = Math.min(Math.max(0, amount), remaining);
  const buyerOk = !needsBuyer || (buyer.name.trim().length > 1 && buyer.address.trim().length > 4);
  const change = tenders.reduce((s, t) => s + (t.changeCents ?? 0), 0);

  // The customer display follows the tender: due, paid so far, and "tap to pay" while a card is being read.
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  useEffect(() => {
    if (!open) return;
    progressRef.current?.({ dueCents, paidCents: paid, tapping: tapping != null, method: tapping != null ? "card" : panel });
  }, [open, dueCents, paid, tapping, panel]);

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
    setVoucher(null);
    setVoucherText("");
    setVoucherError(null);
    setBalances({});
    setEftRef("");
    completing.current = false;
  }, [open, online]);

  /** Looks a gift voucher up on the server: what's on it, or why it can't pay (in plain English). */
  const lookupVoucher = async (raw: string) => {
    const code = voucherCodeFrom(raw);
    setVoucherError(null);
    setVoucher(null);
    if (!code) return setVoucherError("That doesn't look like a gift voucher code (HH-XXXX-XXXX-XXXX)");
    setVoucherText(code);
    setVoucherBusy(true);
    try {
      const r = await api<{ voucher: VoucherLookupDTO }>("/api/pos/vouchers", { body: { code } });
      setVoucher(r.voucher);
      setBalances((b) => ({ ...b, [r.voucher.code]: r.voucher.balanceCents }));
    } catch (e) {
      setVoucherError(errorText(e));
    } finally {
      setVoucherBusy(false);
    }
  };
  const lookupRef = useRef(lookupVoucher);
  lookupRef.current = lookupVoucher;

  // A voucher scanned or typed outside the sheet (the search box, the camera, a keyboard-wedge scanner): open the
  // tender with it looked up. Runs after the reset above when both fire on opening.
  useEffect(() => {
    if (!open || !voucherScan) return;
    setPanel("voucher");
    void lookupRef.current(voucherScan.code);
  }, [open, voucherScan]);

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
      setTitled(e instanceof TillError ? { message: e.message, title: e.title } : null);
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
  /** What's left on a voucher looked up in this sale, less what's already tendered from it here. */
  const voucherLeft = (code: string) => Math.max(0, (balances[code] ?? 0) - tenders.filter((t) => t.method === "VOUCHER" && t.reference === code).reduce((s, t) => s + t.amountCents, 0));
  // The voucher pays up to its balance and up to what's due (or the smaller amount typed above): lowered, never raised.
  const voucherUse = voucher ? Math.min(charge, voucherLeft(voucher.code)) : 0;
  const voucherPending = !online && tenders.some((t) => t.method === "VOUCHER");
  // Trade-sale mode: what may go on account is the credit decision less what this sale has already put on it.
  const onAccountSoFar = tenders.filter((t) => t.method === "ACCOUNT").reduce((s, t) => s + t.amountCents, 0);
  const tradeRules = trade ? tradeTenders({ account: trade, online, amountCents: charge, onAccountSoFarCents: onAccountSoFar }) : null;
  const accountLeft = trade ? Math.max(0, trade.availableCents - onAccountSoFar) : 0;
  const cashOptions = useMemo(() => quickCash(charge), [charge]);

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
        panel === key ? "bg-brand-500 text-ink-950 ring-brand-500" : "bg-ink-850 text-white ring-ink-800 hover:ring-brand-500/60",
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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
              {trade && (
                <div className="mt-3 flex items-center gap-2 border-t border-ink-800 pt-3 text-sm text-[#8fbdf2]" data-testid="pay-trade">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    Trade sale · {trade.name} · {trade.number}
                  </span>
                </div>
              )}
              {(savingsCents > 0 || discountCents > 0) && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-800 pt-3 text-sm">
                  {savingsCents > 0 && <span className="font-semibold text-brand-300">Rewards savings {zar(savingsCents)}</span>}
                  {discountCents - offerCents > 0 && <span className="font-semibold text-[#7fd49a]">Deals −{zar(discountCents - offerCents)}</span>}
                  {offerCents > 0 && (
                    <span className="font-semibold text-brand-300" data-testid="pay-my-deals">
                      My Deals −{zar(offerCents)}
                    </span>
                  )}
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
                    icon={
                      t.method === "CASH" ? <Banknote className="h-4 w-4" /> : t.method === "PAYSHAP" ? <Zap className="h-4 w-4" /> : t.method === "VOUCHER" ? <Gift className="h-4 w-4" /> : t.method === "ACCOUNT" ? <Building2 className="h-4 w-4" /> : t.method === "EFT" ? <Landmark className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />
                    }
                    label={
                      t.method === "CASH"
                        ? `Cash${t.tenderedCents ? ` · tendered ${zar(t.tenderedCents)}` : ""}${t.changeCents ? ` · change ${zar(t.changeCents)}` : ""}`
                        : t.method === "VOUCHER"
                          ? `Gift voucher ${t.reference} · ${zar(voucherLeft(t.reference ?? ""))} left on the voucher`
                          : t.method === "ACCOUNT"
                            ? `On account · ${t.reference}${trade ? ` · due in ${trade.paymentDays} days` : ""}`
                            : t.method === "EFT"
                              ? `EFT · ref ${t.reference}`
                          : t.method === "PAYSHAP"
                          ? `PayShap · ref ${t.reference}`
                          : t.provider === "EXTERNAL"
                            ? `Bank terminal · auth ${t.reference}`
                            : t.provider === "YOCO"
                              ? `Yoco machine${t.cardLast4 ? ` •••• ${t.cardLast4}` : ""} · ref ${t.reference}`
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
                <div className="font-semibold">{titled?.message === error ? titled.title : "The sale didn't go through"}</div>
                <div>{error}</div>
                <div className="mt-3 flex gap-2">
                  <PosButton variant="danger" size="sm" onClick={() => void complete()} disabled={remaining > 0 || !buyerOk}>
                    Try again
                  </PosButton>
                </div>
              </Alert>
            )}
            {busy && <p className="mt-4 text-center text-sm text-ink-300">Completing the sale…</p>}
            {dueCents === 0 && !busy && !error && (
              <PosButton variant="primary" size="lg" className="mt-4 w-full" disabled={!buyerOk} onClick={() => void complete()}>
                Complete (nothing to pay)
              </PosButton>
            )}
            {remaining === 0 && !busy && !error && !buyerOk && <Alert tone="warn" className="mt-4">Add the buyer&apos;s name and address to finish.</Alert>}
          </div>

          {/* Right: how they're paying */}
          <div>
            <Field label="Amount for this payment" htmlFor="pay-amount" hint={amount < remaining && remaining ? `Split payment: ${zar(remaining - charge)} will still be due` : undefined}>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl text-ink-400">R</span>
                <TextInput id="pay-amount" inputMode="decimal" value={amountText ?? (remaining ? (remaining / 100).toFixed(2) : "")} onChange={(e) => setAmountText(e.target.value)} onFocus={(e) => e.currentTarget.select()} className="h-16 pl-10 font-display text-3xl font-semibold tnum" disabled={remaining === 0} />
              </div>
            </Field>

            {!online && (
              <Alert tone="warn" className="mt-3">
                {trade
                  ? "Offline: a trade sale is priced and invoiced on the server, so it can't be completed until the till is back online."
                  : tapProvider === "YOCO"
                    ? `Offline: cash, or card on the Yoco machine or a bank terminal. ${shapId ? "PayShap, points" : "Points"} and gift vouchers need a connection.`
                    : `Offline: cash, or card on a bank terminal (key in its approval code). Tap on glass, ${shapId ? "PayShap, " : ""}points and gift vouchers need a connection.`}
              </Alert>
            )}
            {voucherPending && (
              <Alert className="mt-3" data-testid="voucher-offline">
                The gift voucher can only be redeemed with a connection, and this sale won&apos;t be queued with it: remove the voucher payment and take another tender, or wait for the connection.
              </Alert>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {tapProvider === "YOCO"
                ? method("yoco", "Card · Yoco", <CreditCard className="h-5 w-5" />, false, "Charge it on the Yoco machine")
                : method("card", "Card · tap", <Nfc className="h-5 w-5" />, !online || tapProvider === "EXTERNAL", "Card, phone or watch")}
              {method("external", "Bank terminal", <Landmark className="h-5 w-5" />, false, "Enter the approval code")}
              {method("cash", "Cash", <Banknote className="h-5 w-5" />, false, "Change calculated")}
              {shapId && method("payshap", "PayShap", <Zap className="h-5 w-5" />, !online, online ? "To the store's ShapID" : "Needs a connection")}
              {tradeRules && method("eft", "EFT", <Landmark className="h-5 w-5" />, !tradeRules.eft, "Paid by EFT · bank reference")}
              {tradeRules &&
                trade &&
                method("account", "On account", <Building2 className="h-5 w-5" />, !tradeRules.account, tradeRules.account ? `${zar(accountLeft)} available on account` : (tradeRules.accountReason ?? "Needs a connection"))}
              {!trade && points && method("points", "Points", <Sparkles className="h-5 w-5" />, !online || maxPts === 0, !online ? "Needs a connection" : points.balance < points.minRedeem ? `Min ${points.minRedeem} pts to redeem` : `${fmtPoints(points.balance)} available`)}
              {!trade && method("voucher", "Gift voucher", <Gift className="h-5 w-5" />, !online, online ? "Type or scan the code" : "Needs a connection")}
            </div>

            {panel === "eft" && trade && (
              <form
                className="mt-4 space-y-3 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800"
                data-testid="eft-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const ref = eftRef.trim().slice(0, 60);
                  if (ref.length < 3) return setError("Enter the bank reference of the EFT (from the proof of payment)");
                  add({ method: "EFT", amountCents: charge, provider: "EFT", reference: ref });
                  setEftRef("");
                }}
              >
                <p className="text-sm text-ink-300">
                  {trade.name} pays <b className="text-white">{zar(charge)}</b> by EFT now: check the proof of payment, then key in its bank reference.
                </p>
                <Field label="Bank reference" htmlFor="eft-ref">
                  <TextInput id="eft-ref" autoFocus autoComplete="off" value={eftRef} onChange={(e) => setEftRef(e.target.value)} className="font-mono" placeholder="e.g. the payment reference on the proof" />
                </Field>
                <PosButton type="submit" variant="primary" className="w-full">
                  Add EFT payment
                </PosButton>
              </form>
            )}

            {panel === "account" && trade && (
              <div className="mt-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800" data-testid="account-panel">
                <p className="text-sm text-ink-300">
                  Put <b className="text-white">{zar(charge)}</b> on {trade.name}&apos;s account ({trade.number}): invoiced on the account&apos;s ledger, due in {trade.paymentDays} days. The tax invoice goes to its billing email. {zar(accountLeft)} is available on account right now.
                </p>
                <PosButton
                  variant="primary"
                  className="mt-3 w-full"
                  disabled={!tradeRules?.account}
                  data-testid="account-apply"
                  onClick={() => add({ method: "ACCOUNT", amountCents: charge, reference: trade.number })}
                >
                  <Building2 className="h-4 w-4" /> Put {zar(charge)} on account
                </PosButton>
              </div>
            )}

            {panel === "voucher" && (
              <form
                className="mt-4 space-y-3 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800"
                data-testid="voucher-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookupVoucher(voucherText);
                }}
              >
                <p className="text-sm text-ink-300">Type the code from the voucher email or card, or scan it. The voucher pays up to what&apos;s on it and what&apos;s due.</p>
                <div className="flex items-end gap-2">
                  <Field label="Voucher code" htmlFor="voucher-code" className="min-w-0 flex-1">
                    <TextInput
                      id="voucher-code"
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="HH-XXXX-XXXX-XXXX"
                      value={voucherText}
                      onChange={(e) => (setVoucherText(e.target.value), setVoucher(null), setVoucherError(null))}
                      className="font-mono uppercase placeholder:normal-case"
                    />
                  </Field>
                  {cameraScanSupported() && (
                    <PosButton type="button" variant="secondary" onClick={() => setScanVoucher(true)} aria-label="Scan the voucher code with the camera">
                      <ScanLine className="h-5 w-5" />
                    </PosButton>
                  )}
                  <PosButton type="submit" variant="secondary" busy={voucherBusy} data-testid="voucher-lookup">
                    Look up
                  </PosButton>
                </div>
                {voucherError && <Alert data-testid="voucher-error">{voucherError}</Alert>}
                {voucher && (
                  <div className="rounded-xl bg-ink-900 p-3 ring-1 ring-ink-800" data-testid="voucher-found">
                    <div className="text-sm text-white">
                      <b className="font-mono">{voucher.code}</b> · <span className="tnum">{zar(voucherLeft(voucher.code))}</span> on the voucher · valid until {fmtDate(voucher.expiresAt)}
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      {voucherUse <= 0
                        ? "Nothing left on it to use here."
                        : voucherUse < charge
                          ? `It covers ${zar(voucherUse)} of the ${zar(charge)}, so ${zar(charge - voucherUse)} will still be due. `
                          : `${zar(voucherLeft(voucher.code) - voucherUse)} stays on the voucher. `}
                      {voucherUse > 0 && "To use less of it, type a smaller amount above."}
                    </p>
                    <PosButton
                      type="button"
                      variant="primary"
                      className="mt-3 w-full"
                      disabled={voucherUse <= 0}
                      data-testid="voucher-apply"
                      onClick={() => {
                        add({ method: "VOUCHER", amountCents: voucherUse, reference: voucher.code });
                        setVoucher(null);
                        setVoucherText("");
                      }}
                    >
                      Use {zar(voucherUse)} from the voucher
                    </PosButton>
                  </div>
                )}
              </form>
            )}

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

            {(panel === "external" || panel === "yoco") && (
              <form
                className="mt-4 space-y-3 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800"
                data-testid={`${panel}-panel`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = cardMachineTender(panel === "yoco" ? "YOCO" : "EXTERNAL", charge, extRef, extLast4);
                  if ("error" in r) return setError(r.error);
                  add(r.tender);
                  setExtRef("");
                  setExtLast4("");
                }}
              >
                <p className="text-sm text-ink-300">
                  {panel === "yoco" ? (
                    <>
                      Charge <b className="text-white">{zar(charge)}</b> on the Yoco card machine. Once it&apos;s approved, key in the reference the machine shows.
                    </>
                  ) : (
                    <>
                      Charge <b className="text-white">{zar(charge)}</b> on the bank&apos;s card machine, then key in its approval code.
                    </>
                  )}
                </p>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <Field label={panel === "yoco" ? "Yoco reference" : "Approval / auth code"} htmlFor="ext-ref">
                    <TextInput id="ext-ref" autoComplete="off" value={extRef} onChange={(e) => setExtRef(e.target.value)} className={cn("font-mono", panel === "external" && "uppercase")} />
                  </Field>
                  <Field label={panel === "yoco" ? "Last 4 (optional)" : "Card last 4"} htmlFor="ext-4">
                    <TextInput id="ext-4" inputMode="numeric" maxLength={4} value={extLast4} onChange={(e) => setExtLast4(e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </div>
                <PosButton type="submit" variant="primary" className="w-full">
                  Add card payment
                </PosButton>
              </form>
            )}

            {panel === "payshap" && shapId && (
              <div className="mt-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800" data-testid="payshap-panel">
                <p className="text-sm text-ink-300">
                  Ask the customer to pay <b className="text-white">{zar(charge)}</b> by PayShap from their banking app, to this ShapID and with this reference.
                </p>
                <dl className="mt-3 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <dt className="text-sm text-ink-400">ShapID</dt>
                    <dd className="break-all font-mono text-2xl font-semibold text-white">{shapId}</dd>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <dt className="text-sm text-ink-400">Reference</dt>
                    <dd className="font-mono text-white">{reference}</dd>
                  </div>
                </dl>
                <Field label="Bank reference (from the payment notification)" htmlFor="ps-ref" hint="Confirm it from the store's bank notification, not the customer's screen." className="mt-3">
                  <TextInput id="ps-ref" autoComplete="off" value={payshapRef} onChange={(e) => setPayshapRef(e.target.value)} placeholder={reference} className="font-mono" />
                </Field>
                <PosButton
                  variant="primary"
                  className="mt-3 w-full"
                  onClick={() => {
                    add({ method: "PAYSHAP", amountCents: charge, provider: "PAYSHAP", reference: payshapRef.trim() || reference });
                    setPayshapRef("");
                  }}
                >
                  I&apos;ve received {zar(charge)}
                </PosButton>
              </div>
            )}

            {panel === "points" && points && (
              <div className="mt-4 rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800">
                <p className="text-sm text-ink-300">
                  {fmtPoints(points.balance)} available · 1 point = R1. Points can&apos;t be used on medicines (licensed or CBD supplements).
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

      <CameraScanner
        open={scanVoucher}
        title="Scan the gift voucher"
        onClose={() => setScanVoucher(false)}
        onResult={(text) => {
          setScanVoucher(false);
          void lookupVoucher(text);
        }}
      />

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

