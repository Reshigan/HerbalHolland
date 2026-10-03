"use client";
// Trade checkout: courier from the DC (to the account's delivery or billing address) or click & collect at a store
// (province, search, each store's availability for this cart), EFT or on account within the credit decision, the
// buyer's reference and notes, and the totals for the choice made. Errors from placeTradeOrder show inline.
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CreditCard, Landmark, Lock, MapPin, Search, Store, Truck } from "lucide-react";
import { collectStoresAction, placeOrderAction, type CheckoutState, type StoreList } from "@/app/trade/checkout/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, Tag, TextInput, inputClass } from "@/components/shop/ui";
import { fmtCases } from "./format";
import type { TradeTotals, CreditDecision } from "@/lib/trade";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export type CheckoutLine = { variantId: string; name: string; sku: string; qty: number; caseQty: number; unitCents: number; exCents: number; vatCents: number };
type Fulfil = "COURIER" | "COLLECT";
type Pay = "EFT" | "ACCOUNT";

export function TradeCheckoutForm(props: {
  lines: CheckoutLine[];
  totals: Record<Fulfil, TradeTotals>;
  credit: Record<Fulfil, CreditDecision>;
  account: { terms: "PREPAID" | "ACCOUNT"; creditLimitCents: number; paymentDays: number; province: string; billing: string; delivery: string | null; balanceCents: number };
  stores: StoreList;
  provinces: [string, string][];
  ordering: string | null;
  fees: { deliveryCents: number; freeDeliveryOverCents: number; handlingCents: number; eftHoldDays: number; minOrderCents: number };
  dcName: string;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrderAction, {});
  const typed = state.values ?? {};
  const [fulfilment, setFulfilment] = useState<Fulfil>(typed.fulfilment === "COLLECT" ? "COLLECT" : "COURIER");
  const [storeId, setStoreId] = useState(typed.storeId ?? "");
  const credit = props.credit[fulfilment];
  const onAccountOk = props.account.terms === "ACCOUNT" && credit.ok;
  const [pay, setPay] = useState<Pay>(typed.payMethod === "ACCOUNT" && onAccountOk ? "ACCOUNT" : "EFT");
  const [deliver, setDeliver] = useState(typed.deliver === "BILLING" || !props.account.delivery ? "BILLING" : "DELIVERY");
  const t = props.totals[fulfilment];
  const chosen = props.stores.rows.find((s) => s.id === storeId);

  // Store picker: province chips and a search, each a fresh page from the server; never the whole network.
  const [list, setList] = useState<StoreList>(props.stores);
  const [province, setProvince] = useState<string>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const load = (next: { province?: string; q?: string; page?: number }) => {
    const p = next.province ?? province;
    const s = next.q ?? q;
    start(async () => {
      const r = await collectStoresAction({ province: p || null, q: s || null, page: next.page ?? 1 });
      if ("error" in r) setListError(r.error);
      else {
        setListError(null);
        setList(r);
      }
    });
  };
  const nameOf = (variantId: string) => props.lines.find((l) => l.variantId === variantId)?.name ?? "a line";
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <form action={action} className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12" noValidate>
      <div className="space-y-8">
        {state.error && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-50" role="alert">
            <p className="font-semibold text-white">We couldn&apos;t place the order</p>
            <p className="mt-1">{state.error}</p>
          </div>
        )}
        {props.ordering && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm text-amber-50" role="status">
            <p className="font-semibold text-white">Ordering is paused</p>
            <p className="mt-1">{props.ordering}.</p>
          </div>
        )}

        {/* ── Fulfilment ─────────────────────────────────────────────── */}
        <fieldset>
          <legend className="font-display text-xl font-semibold text-white">How you&apos;ll get it</legend>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["COURIER", "Courier from our DC", <Truck key="t" className="h-5 w-5" aria-hidden />, props.totals.COURIER.deliveryCents === 0 ? `Free courier — order over ${zar(props.fees.freeDeliveryOverCents)} ex VAT` : `${zar(props.fees.deliveryCents)} ex VAT${props.fees.freeDeliveryOverCents > 0 ? ` · free from ${zar(props.fees.freeDeliveryOverCents)}` : ""}`],
                ["COLLECT", "Click & collect at a store", <Store key="s" className="h-5 w-5" aria-hidden />, `${zar(props.fees.handlingCents)} ex VAT handling · your driver collects with a code`],
              ] as [Fulfil, string, React.ReactNode, string][]
            ).map(([key, label, icon, sub]) => (
              <label key={key} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition", fulfilment === key ? "border-brand-500 bg-brand-500/[0.06]" : "border-ink-800 bg-ink-900/60 hover:border-ink-600")}>
                <input type="radio" name="fulfilment" value={key} checked={fulfilment === key} onChange={() => setFulfilment(key)} className="mt-1 h-4 w-4 accent-brand-500" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-white">
                    {icon} {label}
                  </span>
                  <span className="mt-1 block text-xs text-ink-400">{sub}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {fulfilment === "COURIER" ? (
          <fieldset>
            <legend className="font-display text-lg font-semibold text-white">Deliver to</legend>
            <p className="mt-1 text-sm text-ink-400">
              Shipped from {props.dcName}. Addresses are changed on the{" "}
              <Link href="/trade/account" className="underline hover:text-white">
                account page
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery address">
              {([
                ...(props.account.delivery ? [["DELIVERY", "Delivery address", props.account.delivery]] : []),
                ["BILLING", "Billing address", props.account.billing],
              ] as [string, string, string][]).map(([key, label, text]) => (
                <label key={key} className={cn("flex max-w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition", deliver === key ? "border-brand-500 bg-brand-500/[0.06]" : "border-ink-800 hover:border-ink-600")}>
                  <input type="radio" name="deliver" value={key} checked={deliver === key} onChange={() => setDeliver(key)} className="mt-1 h-4 w-4 accent-brand-500" />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-white">
                      <MapPin className="h-4 w-4 text-brand-500" aria-hidden /> {label}
                    </span>
                    <span className="mt-0.5 block text-ink-300">{text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset aria-describedby={state.fields?.storeId ? "store-error" : undefined}>
            <legend className="font-display text-lg font-semibold text-white">Collect from</legend>
            <p className="mt-1 text-sm text-ink-400">Stores in your province come first. Each one shows what it has on the shelf for this cart right now.</p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Province">
              <ChipButton active={!province} onClick={() => (setProvince(""), load({ province: "" }))}>
                All provinces
              </ChipButton>
              {props.provinces.map(([code, name]) => (
                <ChipButton key={code} active={province === code} onClick={() => (setProvince(code), load({ province: code }))}>
                  {name}
                </ChipButton>
              ))}
            </div>
            <div className="relative mt-3">
              <label htmlFor="store-search" className="sr-only">
                Search stores
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                id="store-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setQ(search);
                    load({ q: search });
                  }
                }}
                placeholder="Store, suburb or city"
                className={cn(inputClass, "h-11 pl-11 pr-24")}
              />
              <button type="button" onClick={() => (setQ(search), load({ q: search }))} className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-full bg-ink-800 px-3 text-xs font-semibold text-ink-100 hover:bg-ink-700">
                Search
              </button>
            </div>
            {state.fields?.storeId && (
              <p id="store-error" className="mt-2 text-xs font-medium text-rose-100" role="alert">
                {state.fields.storeId}
              </p>
            )}
            {listError && (
              <p className="mt-2 text-xs font-medium text-rose-100" role="alert">
                {listError}
              </p>
            )}
            <ul className={cn("mt-3 divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/40", loading && "opacity-60")} aria-busy={loading} data-testid="collect-stores">
              {list.rows.length === 0 && <li className="px-4 py-6 text-sm text-ink-400">No stores match{q ? ` “${q}”` : ""} — try another province or search.</li>}
              {list.rows.map((s) => (
                <li key={s.id}>
                  <label className={cn("flex cursor-pointer items-start gap-3 p-4 transition", storeId === s.id ? "bg-brand-500/[0.06]" : "hover:bg-ink-900")}>
                    <input type="radio" name="storeId" value={s.id} checked={storeId === s.id} onChange={() => setStoreId(s.id)} className="mt-1 h-4 w-4 accent-brand-500" aria-describedby={`stock-${s.id}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">Herbal Holland {s.name}</span>
                        <Tag tone={s.allInStock ? "green" : "amber"}>{s.allInStock ? "All lines in stock" : `${s.short.length} ${s.short.length === 1 ? "line" : "lines"} short`}</Tag>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-400">
                        {s.suburb}, {s.city}
                      </span>
                      <span id={`stock-${s.id}`} className="mt-1 block text-xs text-ink-300">
                        {s.allInStock ? "Everything in this cart is on the shelf there now." : s.short.map((x) => `${nameOf(x.variantId)}: ${x.available} of ${x.qty}`).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
                <button type="button" disabled={list.page <= 1 || loading} onClick={() => load({ page: list.page - 1 })} className="rounded-full border border-ink-700 px-3 py-1.5 font-semibold text-ink-100 disabled:opacity-40">
                  ← Previous
                </button>
                <span className="tnum">
                  Page {list.page} of {pages} · {list.total} stores
                </span>
                <button type="button" disabled={list.page >= pages || loading} onClick={() => load({ page: list.page + 1 })} className="rounded-full border border-ink-700 px-3 py-1.5 font-semibold text-ink-100 disabled:opacity-40">
                  Next →
                </button>
              </div>
            )}
            {chosen && !chosen.allInStock && (
              <p className="mt-3 flex gap-2 text-xs text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {chosen.name} is short on {chosen.short.length === 1 ? "one line" : `${chosen.short.length} lines`}; the store hands over what it has and the invoice is for what you collect.
              </p>
            )}
          </fieldset>
        )}

        {/* ── Payment ────────────────────────────────────────────────── */}
        <fieldset aria-describedby={state.fields?.payMethod ? "pay-error" : undefined}>
          <legend className="font-display text-xl font-semibold text-white">How you&apos;ll pay</legend>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition", pay === "EFT" ? "border-brand-500 bg-brand-500/[0.06]" : "border-ink-800 bg-ink-900/60 hover:border-ink-600")}>
              <input type="radio" name="payMethod" value="EFT" checked={pay === "EFT"} onChange={() => setPay("EFT")} className="mt-1 h-4 w-4 accent-brand-500" />
              <span>
                <span className="flex items-center gap-2 font-semibold text-white">
                  <Landmark className="h-5 w-5" aria-hidden /> EFT (pro forma)
                </span>
                <span className="mt-1 block text-xs text-ink-400">We email a pro forma with the bank details and reference. Stock is reserved once the payment is confirmed; unpaid orders lapse after {props.fees.eftHoldDays} days.</span>
              </span>
            </label>
            <label className={cn("flex items-start gap-3 rounded-2xl border p-4 transition", onAccountOk ? "cursor-pointer" : "cursor-not-allowed opacity-70", pay === "ACCOUNT" ? "border-brand-500 bg-brand-500/[0.06]" : "border-ink-800 bg-ink-900/60", onAccountOk && pay !== "ACCOUNT" && "hover:border-ink-600")}>
              <input type="radio" name="payMethod" value="ACCOUNT" checked={pay === "ACCOUNT"} onChange={() => setPay("ACCOUNT")} disabled={!onAccountOk} className="mt-1 h-4 w-4 accent-brand-500" aria-describedby="account-why" />
              <span>
                <span className="flex items-center gap-2 font-semibold text-white">
                  <CreditCard className="h-5 w-5" aria-hidden /> On account
                </span>
                <span id="account-why" className="mt-1 block text-xs text-ink-400">
                  {onAccountOk
                    ? `Invoiced when it ${fulfilment === "COLLECT" ? "is collected" : "ships"}, due ${props.account.paymentDays} days later. ${zar(credit.availableCents)} available of your ${zar(props.account.creditLimitCents)} limit.`
                    : props.account.terms !== "ACCOUNT"
                      ? "Your account buys prepaid (EFT). Account terms follow once we know each other — ask the trade team."
                      : credit.reason ?? "Not available for this order."}
                </span>
              </span>
            </label>
          </div>
          {state.fields?.payMethod && (
            <p id="pay-error" className="mt-2 text-xs font-medium text-rose-100" role="alert">
              {state.fields.payMethod}
            </p>
          )}
        </fieldset>

        {/* ── Reference and notes ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Your reference (optional)" htmlFor="co-ref" hint="A PO number, printed on the pro forma and the tax invoice.">
            <TextInput id="co-ref" name="reference" maxLength={60} defaultValue={typed.reference} placeholder="PO-2026-001" />
          </FieldRow>
          <FieldRow label="Notes for us (optional)" htmlFor="co-notes" hint="Delivery hours, who to call, anything the picker should know." className="sm:col-span-2">
            <textarea id="co-notes" name="notes" maxLength={1000} defaultValue={typed.notes} className={cn(inputClass, "min-h-20 py-3")} />
          </FieldRow>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────────────────── */}
      <aside className="h-fit rounded-2xl border border-ink-800 bg-ink-900/70 p-6 lg:sticky lg:top-24" aria-labelledby="summary">
        <h2 id="summary" className="font-display text-lg font-semibold text-white">
          Your order
        </h2>
        <ul className="mt-4 divide-y divide-ink-800 text-sm">
          {props.lines.map((l) => (
            <li key={l.variantId} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-ink-100">{l.name}</span>
                <span className="tnum block text-xs text-ink-400">
                  {fmtCases(l.qty, l.caseQty)} × {zar(l.unitCents)}
                </span>
              </span>
              <span className="tnum shrink-0 text-ink-100">{zar(l.exCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="tnum mt-4 space-y-2 border-t border-ink-800 pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-300">Subtotal ex VAT</dt>
            <dd className="text-white">{zar(t.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-300">{fulfilment === "COLLECT" ? "Handling ex VAT" : "Courier ex VAT"}</dt>
            <dd className="text-white" data-testid="fee">{fulfilment === "COLLECT" ? zar(t.handlingCents) : t.deliveryCents ? zar(t.deliveryCents) : "Free"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-300">VAT @ 15%</dt>
            <dd className="text-white">{zar(t.vatCents)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-ink-800 pt-3 text-base">
            <dt className="font-semibold text-white">Total incl. VAT</dt>
            <dd className="font-display text-xl font-semibold text-white" data-testid="checkout-total">{zar(t.totalCents)}</dd>
          </div>
        </dl>
        <button disabled={pending || !!props.ordering} className={buttonClass("primary", "xl", "mt-6 w-full")}>
          {pending ? "Placing…" : pay === "ACCOUNT" ? `Place order on account · ${zar(t.totalCents)}` : `Place order · pay ${zar(t.totalCents)} by EFT`}
        </button>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-400">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          By placing the order you accept the{" "}
          <Link href="/trade/terms" className="underline hover:text-ink-200">
            trade terms
          </Link>
          . Everyone who collects is 18 or older and brings ID.
        </p>
        {pay === "ACCOUNT" && (
          <p className="mt-2 flex items-start gap-2 text-xs text-leaf-100">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Within your credit limit: {zar(Math.max(0, credit.availableCents - t.totalCents))} will remain available.
          </p>
        )}
      </aside>
    </form>
  );
}

function ChipButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition",
        active ? "border-brand-500 bg-brand-500 text-ink-950" : "border-ink-700 text-ink-200 hover:border-ink-500 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
