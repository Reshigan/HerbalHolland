"use client";
// Sales at this store: search by receipt number, member (number, mobile, name) or trade account, view/print a receipt, email the invoice,
// refund selected lines (restock toggle, reason, tender) via sales.refundSale — what a gift
// voucher paid goes back onto the voucher first, and on a trade sale what was on account comes
// back as a credit note on the account's ledger; only the rest is paid out, back to how they paid
// (split over the sale's card, cash, PayShap and EFT) unless the approving manager picks one tender.
import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronRight, CloudOff, History, Mail, Printer, RotateCcw, Search, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtTime, fmtDay } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { allocateRefund, allocateRefundAcross } from "@/lib/vouchers";
import { backHowTheyPaid, cashLeft, describeRefund, isTillManager, lineShare, moneyPartsOf, pointsBack, REFUND_METHODS, type RefundMethod, type RefundPart, type RefundTo } from "@/lib/pos-refund";
import { api, errorText } from "./lib/api";
import { TENDER_LABEL, tenderLine, uuid } from "./lib/rules";
import { servedBy, tradeTenderLabel } from "./lib/receipt";
import { usePos } from "./context";
import { TrainingSales } from "./training";
import { Alert, CheckRow, Chip, Confirm, EmptyPanel, Field, PosButton, SelectInput, Sheet, Spinner, Stepper, TextInput } from "./ui";
import type { ReceiptDTO, RefundPayment, SaleRow } from "@/server/pos/types";

const REASONS = ["Changed mind (unopened)", "Faulty product", "Wrong item sold", "Damaged packaging", "Pricing error", "Other"];

/** The money lines of a refund (card, cash, PayShap, EFT; refund rows are negative) as refund parts. */
const moneyOut = (payments: { method: string; amountCents: number; cardLast4: string | null }[]): RefundPart[] =>
  payments.flatMap((p) => ((REFUND_METHODS as readonly string[]).includes(p.method) && p.amountCents < 0 ? [{ method: p.method as RefundMethod, cents: -p.amountCents, cardLast4: p.cardLast4 }] : []));

/** Where a refund's value went: "R100.00 cash · R290.00 to the card ending 0005 · 12 pts back". */
const refundedTo = (payments: RefundPayment[]) =>
  [
    describeRefund(moneyOut(payments)),
    ...payments.map((p) =>
      p.method === "VOUCHER" ? `${zar(-p.amountCents)} onto gift voucher ${p.reference ?? ""}`.trim()
      : p.method === "ACCOUNT" ? `${zar(-p.amountCents)} credited to the account`
      : p.method === "ONLINE" ? `${zar(-p.amountCents)} through the online payment`
      : p.method === "LOYALTY" ? `${fmtPoints(Math.round(-p.amountCents / 100))} back`
      : "",
    ),
  ]
    .filter(Boolean)
    .join(" · ");

export function SalesHistory() {
  const pos = usePos();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(
    async (opts: { more?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams();
        if (q.trim()) sp.set("q", q.trim());
        if (opts.more && next) sp.set("before", next);
        const r = await api<{ sales: SaleRow[]; next: string | null; days: number }>(`/api/pos/sales?${sp}`);
        setRows((prev) => (opts.more && prev ? [...prev, ...r.sales] : r.sales));
        setNext(r.next);
        setDays(r.days);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [q, next],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pos.online]);

  if (!pos.online && !rows)
    return <EmptyPanel className="h-full" icon={<CloudOff className="h-6 w-6" />} title="Sales history needs a connection">Receipts and refunds load when the till is back online.</EmptyPanel>;

  return (
    <div className="flex h-full min-h-0">
      <section className={cn("flex min-h-0 w-full flex-col border-ink-850 md:w-[21rem] md:shrink-0 md:border-r lg:w-[26rem]", selected && "hidden md:flex")} aria-label="Recent sales">
        <div className="px-4 pb-3 pt-4">
          <h1 className="font-display text-xl font-semibold text-white">Sales</h1>
          <p className="text-sm text-ink-400">This store · last {days} days</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt, member, name or mobile" aria-label="Search by receipt number, member, name or mobile" className="rounded-full pl-12" />
          </div>
        </div>
        {error && <Alert className="mx-4 mb-3">{error}</Alert>}
        {pos.training && (
          <div className="mx-2 mb-3">
            <TrainingSales />
          </div>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
          {rows?.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                aria-current={selected === s.id}
                className={cn("flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition", selected === s.id ? "bg-ink-800" : "hover:bg-ink-900")}
              >
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", s.kind === "REFUND" ? "bg-rose-500/15 text-[#f29b9b]" : "bg-ink-850 text-ink-300")}>
                  {s.kind === "REFUND" ? <Undo2 className="h-4 w-4" /> : <History className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-semibold text-white">{s.number}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-400">
                    {s.channel === "ONLINE" && <Chip tone="blue">Online</Chip>}
                    {s.channel === "WHOLESALE" && <Chip tone="blue">Trade</Chip>}
                    {s.refunded && <Chip tone="red">Refunded</Chip>}
                    {s.offline && <Chip tone="amber">Offline</Chip>}
                    <span className="truncate">
                      {fmtDay(s.createdAt)} {fmtTime(s.createdAt)} · {s.customer ?? "Walk-in"} · {s.methods.map((m) => TENDER_LABEL[m] ?? m).join(", ")}
                      {s.soldBy && ` · ${servedBy(s)}`}
                    </span>
                  </span>
                </span>
                <span className={cn("font-semibold tnum", s.totalCents < 0 ? "text-[#f29b9b]" : "text-white")}>{zar(s.totalCents)}</span>
                <ChevronRight className="h-4 w-4 text-ink-600" />
              </button>
            </li>
          ))}
          {rows && rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-400">{q ? `No sales match “${q}”` : "No sales in this period yet"}</li>}
          {loading && (
            <li className="flex justify-center py-6">
              <Spinner />
            </li>
          )}
          {next && !loading && (
            <li className="px-2 pt-2">
              <PosButton variant="outline" className="w-full" onClick={() => void load({ more: true })}>
                Load older sales
              </PosButton>
            </li>
          )}
        </ul>
      </section>
      <section className={cn("min-h-0 min-w-0 flex-1", !selected && "hidden md:block")} aria-label="Receipt">
        {selected ? (
          <SaleDetail id={selected} onBack={() => setSelected(null)} onChanged={() => void load()} onOpen={setSelected} />
        ) : (
          <EmptyPanel className="h-full" icon={<History className="h-6 w-6" />} title="Choose a sale">
            View the receipt, re-print it, email the invoice or refund items.
          </EmptyPanel>
        )}
      </section>
    </div>
  );
}

function SaleDetail({ id, onBack, onChanged, onOpen }: { id: string; onBack: () => void; onChanged: () => void; onOpen: (id: string) => void }) {
  const pos = usePos();
  const [r, setR] = useState<ReceiptDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setR((await api<{ receipt: ReceiptDTO }>(`/api/pos/sales/${id}`)).receipt);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useEffect(() => {
    setR(null);
    void load();
  }, [load]);

  if (error) return <Alert className="m-4">{error}</Alert>;
  if (!r)
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  const refundable = r.kind === "SALE" && r.lines.some((l) => l.qty - l.refundedQty > 0);
  const saved = r.memberSavingsCents ?? 0;
  const offer = Math.max(0, r.offerCents ?? 0);
  const trade = r.channel === "WHOLESALE" ? (r.trade ?? null) : null;
  const actions = (
    <>
      <PosButton variant="outline" onClick={() => pos.print({ kind: "receipt", receipt: r })} aria-label="Print receipt">
        <Printer className="h-4 w-4" /> <span className="sm:hidden lg:inline">Print</span>
      </PosButton>
      <PosButton variant="outline" onClick={() => setEmailOpen(true)} aria-label="Email invoice">
        <Mail className="h-4 w-4" /> <span className="sm:hidden lg:inline">Email</span>
      </PosButton>
      {refundable && (
        <PosButton variant="primary" onClick={() => setRefunding(true)} data-testid="start-refund">
          <RotateCcw className="h-4 w-4" /> Refund
        </PosButton>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-850 px-4 py-3">
        <div className="flex items-center gap-2">
          <PosButton variant="ghost" className="-ml-2 px-3 md:hidden" onClick={onBack} aria-label="Back to sales">
            ←
          </PosButton>
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-lg font-bold text-white">{r.number}</div>
            <div className="truncate text-xs text-ink-400">
              {r.title} · {fmtDateTime(r.createdAt)} · {r.soldBy ? servedBy(r) : (r.staff ?? "—")}
            </div>
          </div>
          <div className="hidden gap-2 sm:flex">{actions}</div>
        </div>
        <div className="mt-3 grid grid-flow-col gap-2 sm:hidden">{actions}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl">
          {r.refundOf && (
            <button type="button" onClick={() => onOpen(r.refundOf!.id)} className="mb-3 text-sm font-semibold text-brand-400 hover:underline">
              Refund of {r.refundOf.number} →
            </button>
          )}
          {r.customer && (
            <div className="mb-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm ring-1 ring-ink-800">
              <span className="font-semibold text-white">{r.customer.name}</span> <span className="text-ink-400">· {r.customer.memberNo}</span>
              {r.pointsEarned !== 0 && <span className="text-brand-300"> · {fmtPoints(r.pointsEarned)} {r.pointsEarned > 0 ? "earned" : "reversed"}</span>}
            </div>
          )}
          {trade && (
            <div className="mb-3 flex items-start gap-3 rounded-2xl bg-sky-500/10 px-4 py-3 text-sm ring-1 ring-sky-500/40" data-testid="sale-trade">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8fbdf2]" />
              <div>
                <span className="font-semibold text-white">Trade sale · {trade.name}</span> <span className="text-ink-400">· {trade.number}</span>
                {trade.orderNumber && <span className="text-ink-400"> · order {trade.orderNumber}</span>}
                <div className="text-xs text-ink-400">
                  Prices ex VAT
                  {trade.onAccountCents > 0 && ` · ${zar(trade.onAccountCents)} on account${trade.dueAt ? `, due ${fmtDate(trade.dueAt)}` : ""}${trade.creditedCents ? ` · ${zar(trade.creditedCents)} credited back` : ""}`}
                  {trade.onAccountCents < 0 && ` · ${zar(-trade.onAccountCents)} credited to the account`}
                </div>
              </div>
            </div>
          )}
          <ul className="divide-y divide-ink-850 rounded-2xl bg-ink-900 px-4 ring-1 ring-ink-800">
            {r.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="text-white">
                    {l.name} · {l.variantName}
                  </span>
                  <span className="block text-xs text-ink-400">
                    {Math.abs(l.qty)} × {zar(l.unitPriceCents)}
                    {trade && ` ex VAT · VAT ${zar(l.vatCents)}`}
                    {l.discountCents > 0 && !trade && ` · saved ${zar(l.discountCents)}`}
                    {l.refundedQty > 0 && <span className="text-[#f29b9b]"> · {l.refundedQty} refunded</span>}
                  </span>
                </span>
                <span className="font-semibold text-white tnum">{zar(l.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 px-1 text-sm">
            {saved !== 0 && (
              <div className="flex justify-between text-brand-300">
                <dt>Rewards savings (in prices)</dt>
                <dd className="tnum">{zar(saved)}</dd>
              </div>
            )}
            {r.discountCents - offer > 0 && (
              <div className="flex justify-between text-[#7fd49a]">
                <dt>Discounts</dt>
                <dd className="tnum">−{zar(r.discountCents - offer)}</dd>
              </div>
            )}
            {offer > 0 && (
              <div className="flex justify-between text-brand-300">
                <dt>My Deals{r.offers?.length ? ` · ${r.offers.join(", ")}` : ""}</dt>
                <dd className="tnum">−{zar(offer)}</dd>
              </div>
            )}
            <div className="flex justify-between font-display text-2xl font-semibold text-white">
              <dt>Total</dt>
              <dd className="tnum">{zar(r.totalCents)}</dd>
            </div>
            <div className="flex justify-between text-xs text-ink-400">
              <dt>{r.vatCents ? (trade ? "VAT (15%) on ex-VAT prices" : "VAT included") : "No VAT charged"}</dt>
              <dd className="tnum">{r.vatCents ? zar(r.vatCents) : ""}</dd>
            </div>
            {r.payments.map((p, i) => (
              <div key={i} className="flex justify-between text-ink-300">
                <dt>
                  {p.method === "VOUCHER" ? tenderLine(p) : p.method === "ACCOUNT" ? tradeTenderLabel(p, trade, "••••").replace(" - due ", " · due ") : (TENDER_LABEL[p.method] ?? p.method)}
                  {p.cardLast4 ? ` •••• ${p.cardLast4}` : ""}
                  {p.reference && p.method !== "ACCOUNT" ? ` · ${p.reference}` : ""}
                  {p.changeCents ? ` · change ${zar(p.changeCents)}` : ""}
                </dt>
                <dd className="tnum">{zar(p.amountCents)}</dd>
              </div>
            ))}
            {r.pointsRedeemed !== 0 && (
              <div className="flex justify-between text-ink-300">
                <dt>Points</dt>
                <dd className="tnum">{fmtPoints(r.pointsRedeemed)}</dd>
              </div>
            )}
          </dl>
          {r.note && <p className="mt-3 text-sm text-ink-400">Reason: {r.note}</p>}
          {r.invoiceEmail && <p className="mt-3 text-sm text-ink-400">Invoice emailed to {r.invoiceEmail}</p>}
          {r.refunds.length > 0 && (
            <div className="mt-5">
              <div className="eyebrow mb-2 text-[0.62rem] text-ink-400">Refunds</div>
              <ul className="space-y-2">
                {r.refunds.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => onOpen(x.id)} className="w-full rounded-2xl bg-ink-900 px-4 py-2.5 text-left text-sm ring-1 ring-ink-800 hover:ring-brand-500/50">
                      <span className="flex min-h-7 items-center justify-between gap-3">
                        <span className="font-mono text-white">{x.number}</span>
                        <span className="text-ink-400">{fmtDateTime(x.createdAt)}</span>
                        <span className="font-semibold text-[#f29b9b] tnum">{zar(x.totalCents)}</span>
                      </span>
                      {x.payments?.length ? (
                        <span className="block text-xs text-ink-400" data-testid="refund-lines">
                          {refundedTo(x.payments)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {refunding && (
        <RefundSheet
          sale={r}
          onClose={() => setRefunding(false)}
          onDone={(credit) => {
            setRefunding(false);
            pos.toast(`Refund ${credit.number} done · ${describeRefund(moneyOut(credit.payments)) || zar(-credit.totalCents)}`);
            if (credit.payments.some((p) => p.method === "CASH")) pos.openDrawer("cash");
            onChanged();
            onOpen(credit.id);
          }}
        />
      )}
      <EmailSheet open={emailOpen} saleId={r.id} current={r.invoiceEmail} onClose={() => setEmailOpen(false)} onSent={() => (setEmailOpen(false), void load())} />
    </div>
  );
}

function RefundSheet({ sale, onClose, onDone }: { sale: ReceiptDTO; onClose: () => void; onDone: (credit: ReceiptDTO) => void }) {
  const pos = usePos();
  const manager = isTillManager(pos.me.role);
  const trade = sale.channel === "WHOLESALE" ? (sale.trade ?? null) : null;
  // The sale's money tenders and what each has left to give back (a practice receipt carries none: read its payments).
  const parts = sale.money ?? moneyPartsOf({ payments: sale.payments });
  const cash = cashLeft(parts);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>(() => Object.fromEntries(sale.lines.map((l) => [l.id, true])));
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState("");
  const [method, setMethod] = useState<RefundTo>("ORIGINAL");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server's split (sales.refundSale, lib/pos-refund): each line's share (its last units exactly what's left of it);
  // points back in proportion to what's been refunded so far; what a gift voucher paid back onto the voucher first, up
  // to what it paid less earlier refunds; then the account; only the rest is money.
  const amount = sale.lines.reduce((s, l) => s + ((qty[l.id] ?? 0) > 0 ? lineShare(l.totalCents, l.qty, qty[l.id], l.refundedQty, l.refundedCents ?? Math.round((l.totalCents * l.refundedQty) / l.qty)) : 0), 0);
  const units = Object.values(qty).reduce((a, b) => a + b, 0);
  const why = reason === "Other" ? other.trim() : reason;
  const loyaltyBack = pointsBack({
    loyaltyPaidCents: sale.pointsRedeemed * 100,
    loyaltyBackCents: sale.refunds.flatMap((r) => r.payments ?? []).filter((p) => p.method === "LOYALTY").reduce((s, p) => s - p.amountCents, 0),
    totalCents: sale.totalCents,
    refundedCents: sale.refunds.reduce((s, r) => s - r.totalCents, 0),
    amountCents: amount,
  });
  const split = allocateRefundAcross(amount - loyaltyBack, sale.vouchers ?? []);
  // Trade sales: what was on account comes back onto the account as a credit note (up to what's still open on it),
  // before any money moves — the same rule as a voucher, applied after the vouchers.
  const account = trade ? allocateRefund({ refundCents: split.toTender, voucherPaidCents: Math.max(0, trade.onAccountCents), voucherRefundedCents: trade.creditedCents }) : { toVoucher: 0, toTender: split.toTender };
  const toAccount = account.toVoucher;
  const toTender = account.toTender;
  const voucherOnly = (split.parts.length > 0 || toAccount > 0) && toTender === 0;
  // The money: back to how they paid (over the sale's tenders, never more on one than it has left), or the one tender
  // the approving manager picks — but never more cash than the sale was paid in cash.
  const original = method === "ORIGINAL" ? backHowTheyPaid(parts, toTender) : null;
  const money: RefundPart[] = method === "ORIGINAL" ? (original ?? []) : toTender > 0 ? [{ method, cents: toTender, cardLast4: parts.find((p) => p.method === method)?.cardLast4 ?? null }] : [];
  const moneyText = describeRefund(money);
  const problem =
    toTender > 0 && method === "ORIGINAL" && !original
      ? `Nothing on this sale was paid by card, cash, PayShap or EFT for ${zar(toTender)} to go back to. Choose the tender to refund it to`
      : toTender > 0 && method === "CASH" && toTender > cash
        ? cash > 0
          ? `Only ${zar(cash)} of the cash paid on this sale is left to give back. Refund it the way they paid`
          : "No cash was paid on this sale. Refund it the way they paid"
        : null;
  const moneyLine = method === "ORIGINAL" ? `the rest back how they paid: ${moneyText}` : `${zar(toTender)} refunded by ${TENDER_LABEL[method]}`;
  const cashPaid = parts.some((p) => p.method === "CASH");

  async function submit() {
    setBusy(true);
    setError(null);
    const { seq, number } = pos.nextNumber();
    try {
      const r = await api<{ receipt: ReceiptDTO }>("/api/pos/refunds", {
        body: {
          id: uuid(),
          number,
          seq,
          saleId: sale.id,
          lines: sale.lines.filter((l) => (qty[l.id] ?? 0) > 0).map((l) => ({ saleLineId: l.id, qty: qty[l.id], restock: restock[l.id] ?? true })),
          method,
          reason: why,
        },
      });
      pos.commitSeq(seq);
      onDone(r.receipt);
    } catch (e) {
      setError(errorText(e));
      setConfirm(false);
    } finally {
      setBusy(false);
      pos.handoffDone(); // a manager who stepped in to approve: offer the till back
    }
  }
  // A refund needs a manager: anyone else hands the till to a manager (PIN), who confirms it.
  const approve = () => (manager ? void submit() : pos.switchUser("manager", () => void submit(), { handBack: "later" }));

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={`Refund from ${sale.number}`}
        subtitle="Choose the items coming back"
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-ink-400">Refund total</div>
              <div className="font-display text-2xl font-semibold text-white tnum">{zar(amount)}</div>
            </div>
            <PosButton variant="danger" size="lg" disabled={!units || why.length < 3 || !!problem} onClick={() => setConfirm(true)} data-testid="refund-continue">
              <RotateCcw className="h-5 w-5" /> Refund {units} item{units === 1 ? "" : "s"}
            </PosButton>
          </div>
        }
      >
        {error && <Alert className="mb-4">{error}</Alert>}
        <ul className="space-y-2">
          {sale.lines.map((l) => {
            const left = l.qty - l.refundedQty;
            return (
              <li key={l.id} className={cn("rounded-2xl bg-ink-850 p-3 ring-1 ring-ink-800", left <= 0 && "opacity-50")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">
                      {l.name} · {l.variantName}
                    </div>
                    <div className="text-xs text-ink-400">
                      Bought {l.qty} · {zar(Math.round(l.totalCents / l.qty))} each after discounts{l.refundedQty ? ` · ${l.refundedQty} already refunded` : ""}
                    </div>
                  </div>
                  {left > 0 ? <Stepper value={qty[l.id] ?? 0} max={left} onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))} label={`refund quantity of ${l.name}`} /> : <Chip>Fully refunded</Chip>}
                </div>
                {(qty[l.id] ?? 0) > 0 && (
                  <CheckRow className="mt-1" checked={restock[l.id] ?? true} onChange={(v) => setRestock((r) => ({ ...r, [l.id]: v }))} label="Return to stock" description="Untick for damaged or opened items (written off)." />
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Reason" htmlFor="refund-reason">
            <SelectInput id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Refund to"
            htmlFor="refund-method"
            error={problem}
            hint={
              voucherOnly ? (
                toAccount > 0 ? "Nothing to pay out: it all goes back onto the account as a credit note" : "Nothing to pay out: it all goes back onto the gift voucher"
              ) : method === "ORIGINAL" && money.length ? (
                <span data-testid="refund-split">{moneyText}</span>
              ) : (
                `Original payment: ${sale.payments.map((p) => (p.method === "VOUCHER" ? tenderLine(p) : (TENDER_LABEL[p.method] ?? p.method))).join(", ")}`
              )
            }
          >
            <SelectInput id="refund-method" value={method} disabled={voucherOnly} onChange={(e) => setMethod(e.target.value as RefundTo)}>
              <option value="ORIGINAL">Back to how they paid</option>
              <option value="CARD">Card</option>
              <option value="CASH" disabled={cash <= 0}>
                {cash > 0 ? "Cash from the drawer" : cashPaid ? "Cash (already given back)" : "Cash (not paid in cash)"}
              </option>
              <option value="PAYSHAP">PayShap</option>
              <option value="EFT">EFT</option>
            </SelectInput>
          </Field>
          {reason === "Other" && (
            <Field label="Describe the reason" htmlFor="refund-other" className="sm:col-span-2">
              <TextInput id="refund-other" value={other} onChange={(e) => setOther(e.target.value)} />
            </Field>
          )}
        </div>
        {split.parts.length > 0 && (
          <Alert tone="info" className="mt-4">
            <span data-testid="refund-voucher">
              {split.parts.map((v) => `${zar(v.cents)} goes back onto gift voucher ${v.code}`).join("; ")}
              {toTender > 0 ? `; ${moneyLine}.` : ", so there's nothing to pay out in money."}
            </span>{" "}
            A voucher is never cashed out.
          </Alert>
        )}
        {trade && toAccount > 0 && (
          <Alert tone="info" className="mt-4">
            <span data-testid="refund-account">
              {zar(toAccount)} goes back onto the account as a credit note ({trade.number})
              {toTender > 0 ? `; ${moneyLine}.` : ", so there's nothing to pay out in money."}
            </span>{" "}
            The on-account part is never cashed out.
          </Alert>
        )}
        {sale.pointsRedeemed > 0 && <p className="mt-3 text-xs text-ink-400">Points paid on the original sale are returned in proportion; points earned are reversed.</p>}
      </Sheet>
      <Confirm
        open={confirm}
        title={`Refund ${zar(amount)}?`}
        body={
          <>
            {units} item{units === 1 ? "" : "s"} from {sale.number} refunded
            {split.parts.length > 0 || toAccount > 0 ? (
              <>
                : {[...split.parts.map((v) => `${zar(v.cents)} back onto gift voucher ${v.code}`), ...(toAccount > 0 ? [`${zar(toAccount)} credited to the account as a credit note`] : [])].join(", ")}
                {toTender > 0 && (
                  <>
                    {" "}
                    and <b>{method === "ORIGINAL" ? moneyText : `${zar(toTender)} by ${TENDER_LABEL[method]}`}</b>
                  </>
                )}
              </>
            ) : method === "ORIGINAL" ? (
              <>
                {" "}
                back to how they paid: <b>{moneyText}</b>
              </>
            ) : (
              <>
                {" "}
                by <b>{TENDER_LABEL[method]}</b>
              </>
            )}
            . A credit note is issued{sale.invoiceEmail ? ` and emailed to ${sale.invoiceEmail}` : ""}. This can&apos;t be undone.
            {!manager && " A manager confirms it with their PIN."}
          </>
        }
        confirmLabel="Confirm refund"
        danger
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={approve}
      />
    </>
  );
}

function EmailSheet({ open, saleId, current, onClose, onSent }: { open: boolean; saleId: string; current: string | null; onClose: () => void; onSent: () => void }) {
  const pos = usePos();
  const [email, setEmail] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setEmail(current ?? ""), [current, open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Email the invoice"
      size="sm"
      footer={
        <PosButton
          variant="primary"
          className="w-full"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/api/pos/sales/${saleId}/invoice`, { body: { email } });
              pos.toast(`Invoice emailed to ${email}`);
              onSent();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Mail className="h-4 w-4" /> Send invoice
        </PosButton>
      }
    >
      {error && <Alert className="mb-3">{error}</Alert>}
      <Field label="Email address" htmlFor="resend-email">
        <TextInput id="resend-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.co.za" />
      </Field>
    </Sheet>
  );
}
