"use client";
// After payment: change due, points earned, "invoice emailed to …" (or email it now),
// print an 80 mm receipt, start the next sale.
import { useState } from "react";
import { Building2, CheckCircle2, CloudOff, Mail, Printer, Sparkles } from "lucide-react";
import { zar } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { api, errorText } from "../lib/api";
import { updateQueued } from "../lib/storage";
import { tenderLine } from "../lib/rules";
import { servedBy, tradeTenderLabel } from "../lib/receipt";
import { Alert, PosButton, Sheet, TextInput } from "../ui";
import type { ReceiptDTO } from "@/server/pos/types";
import { isEmail } from "@/lib/email";

export function ReceiptSheet({ receipt, invoiceTo, onPrint, onDone }: { receipt: ReceiptDTO | null; invoiceTo: string | null; onPrint: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!receipt) return null;
  const change = receipt.payments.reduce((s, p) => s + (p.changeCents ?? 0), 0);
  const to = sentTo ?? invoiceTo;
  const training = !!receipt.training;
  const offer = Math.max(0, receipt.offerCents ?? 0);
  const deals = receipt.discountCents - offer;
  const trade = receipt.channel === "WHOLESALE" ? (receipt.trade ?? null) : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!isEmail(v)) return setError("That email doesn't look right");
    setBusy(true);
    setError(null);
    try {
      if (receipt!.queued) updateQueued(receipt!.id, (i) => ({ ...i, payload: { ...i.payload, invoiceEmail: v } }));
      else await api(`/api/pos/sales/${receipt!.id}/invoice`, { body: { email: v } });
      setSentTo(v);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onDone}
      title={training ? "Practice sale: nothing is real" : receipt.queued ? "Sale saved offline" : "Sale complete"}
      subtitle={`${receipt.number}${trade ? ` · ${trade.name}` : receipt.customer ? ` · ${receipt.customer.name}` : ""}`}
      size="md"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <PosButton variant="outline" size="lg" onClick={onPrint}>
            <Printer className="h-5 w-5" /> Print receipt
          </PosButton>
          <PosButton variant="primary" size="lg" onClick={onDone} autoFocus data-testid="new-sale">
            New sale
          </PosButton>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center" data-testid="receipt">
        {receipt.queued ? <CloudOff className="h-14 w-14 text-[#f3c65a]" /> : <CheckCircle2 className="h-14 w-14 text-[#7fd49a]" />}
        {change > 0 ? (
          <>
            <div className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-ink-400">Change due</div>
            <div className="font-display text-6xl font-semibold tracking-tight text-white tnum" data-testid="change-due">
              {zar(change)}
            </div>
          </>
        ) : (
          <div className="mt-3 font-display text-5xl font-semibold tracking-tight text-white tnum">{zar(receipt.totalCents)}</div>
        )}
        {(receipt.memberSavingsCents > 0 || receipt.discountCents > 0) && (
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm font-semibold">
            {receipt.memberSavingsCents > 0 && <span className="text-brand-300">Rewards savings {zar(receipt.memberSavingsCents)}</span>}
            {deals > 0 && <span className="text-[#7fd49a]">Deals −{zar(deals)}</span>}
            {offer > 0 && (
              <span className="text-brand-300" data-testid="receipt-my-deals">
                My Deals −{zar(offer)}
              </span>
            )}
          </div>
        )}
        <div className="mt-2 text-sm text-ink-400" data-testid="receipt-tenders">
          {receipt.payments
            .map((p) =>
              p.method === "VOUCHER"
                ? `${tenderLine(p)} ${zar(p.amountCents)}${p.balanceCents != null ? ` (${zar(p.balanceCents)} left on the voucher)` : ""}`
                : p.method === "ACCOUNT"
                  ? `${tradeTenderLabel(p, trade, "••••").replace(" - due ", " · due ")} ${zar(p.amountCents)}`
                  : `${tenderLine({ method: p.method })} ${zar(p.amountCents)}`,
            )
            .join(" · ")}
          {receipt.pointsRedeemed > 0 && ` · Points ${fmtPoints(receipt.pointsRedeemed)}`}
        </div>
        {receipt.soldBy && (
          <div className="mt-1 text-sm text-ink-400" data-testid="receipt-sold-by">
            {servedBy(receipt)}
          </div>
        )}
      </div>

      {trade && (
        <div className="mt-5 rounded-2xl bg-sky-500/10 px-4 py-3 text-sm ring-1 ring-sky-500/40" data-testid="receipt-trade">
          <div className="flex items-center gap-2 font-display text-base font-semibold uppercase tracking-wide text-white">
            <Building2 className="h-4 w-4 text-[#8fbdf2]" /> {receipt.title}
          </div>
          <div className="mt-1 text-ink-200">
            Trade account {trade.number} · {trade.name}
            {trade.orderNumber ? ` · order ${trade.orderNumber}` : ""}
          </div>
          <div className="text-xs text-ink-400">
            Prices ex VAT · VAT {zar(receipt.vatCents)} · total {zar(receipt.totalCents)} incl VAT
            {trade.onAccountCents > 0 && ` · ${zar(trade.onAccountCents)} on account${trade.dueAt ? `, due ${fmtDate(trade.dueAt)}` : ""}`}
          </div>
        </div>
      )}

      {training && (
        <Alert tone="warn" className="mt-5">
          <span data-testid="training-receipt">Training mode: this sale was not posted, no stock moved and no points were awarded. Receipts print with a TRAINING watermark.</span>
        </Alert>
      )}
      {receipt.queued && (
        <Alert tone="warn" className="mt-5">
          No connection right now. This sale is stored on the till as <b>{receipt.number}</b> and syncs automatically when you&apos;re back online.
        </Alert>
      )}

      {receipt.customer && !trade && !receipt.queued && !training && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-brand-500/10 px-4 py-3 ring-1 ring-brand-500/30">
          <Sparkles className="h-5 w-5 shrink-0 text-brand-400" />
          <div className="text-sm text-brand-100">
            {receipt.pointsEarned > 0 ? (
              <>
                <b>{fmtPoints(receipt.pointsEarned)}</b> earned
              </>
            ) : (
              "No points on this sale"
            )}{" "}
            · new balance {fmtPoints(receipt.customer.points)}
          </div>
        </div>
      )}

      <div className="mt-5">
        {training ? null : to ? (
          <div className="flex items-center gap-3 rounded-2xl bg-ink-850 px-4 py-3 text-sm text-ink-200 ring-1 ring-ink-800" data-testid="invoice-emailed">
            <Mail className="h-5 w-5 shrink-0 text-[#7fd49a]" />
            <span>
              {receipt.queued ? "Invoice will be emailed to" : "Invoice emailed to"} <b className="text-white">{to}</b>
            </span>
          </div>
        ) : (
          <form onSubmit={send} className="rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-800">
            <label htmlFor="inv-email" className="text-sm font-semibold text-white">
              Email the tax invoice?
            </label>
            <p className="mb-3 mt-0.5 text-xs text-ink-400">Optional: a copy to another address.</p>
            <div className="flex gap-2">
              <TextInput id="inv-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.co.za" />
              <PosButton type="submit" variant="secondary" busy={busy}>
                <Mail className="h-4 w-4" /> Send
              </PosButton>
            </div>
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          </form>
        )}
      </div>
    </Sheet>
  );
}
