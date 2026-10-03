"use client";
// Placing an order for a trade account from HQ (a phone order): search the trade range at the account's DC, add lines
// in whole cases, choose courier (to the account's address) or click & collect at a store, EFT or on account, then
// place it through placeTradeOrder. Totals shown here are an estimate from the range's prices; the order's own
// figures come from the quote when it's placed.
import { useEffect, useState, useTransition } from "react";
import { Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { zar } from "@/lib/money";
import { tradeDelivery, tradeHandling, tradeLine, tradeTotals, validateTradeBasket } from "@/lib/trade";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";
import type { CollectHit, RangeHit } from "../../actions";

type Line = RangeHit & { cases: number };
type Terms = { minOrderCents: number; deliveryCents: number; freeDeliveryOverCents: number; collectHandlingCents: number; eftHoldDays: number };

const unitAt = (l: Line, qty: number) => l.breaks.filter((b) => b.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0]?.unitCents ?? l.unitCents;

export function OrderBuilder({
  accountId, account, terms, dcName, initial, placeAction, searchAction, storesAction,
}: {
  accountId: string;
  account: { name: string; terms: "PREPAID" | "ACCOUNT"; availableCents: number; billingAddress: string; deliveryAddress: string | null };
  terms: Terms;
  dcName: string;
  initial: RangeHit[];
  placeAction: (state: ActionState, fd: FormData) => Promise<ActionState>;
  searchAction: (accountId: string, q: string) => Promise<{ rows: RangeHit[]; total: number; dc: string } | { error: string }>;
  storesAction: (accountId: string, lines: { variantId: string; qty: number }[], q: string) => Promise<{ rows: CollectHit[]; total: number } | { error: string }>;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RangeHit[]>(initial);
  const [hitError, setHitError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);
  const [fulfilment, setFulfilment] = useState<"COURIER" | "COLLECT">("COURIER");
  const [payMethod, setPayMethod] = useState<"EFT" | "ACCOUNT">(account.terms === "ACCOUNT" ? "ACCOUNT" : "EFT");
  const [storeQ, setStoreQ] = useState("");
  const [stores, setStores] = useState<CollectHit[] | null>(null);
  const [storeId, setStoreId] = useState("");
  const [loadingStores, startStores] = useTransition();

  const search = (term: string) =>
    startSearch(async () => {
      const r = await searchAction(accountId, term);
      if ("error" in r) setHitError(r.error);
      else (setHits(r.rows), setHitError(null));
    });

  const add = (h: RangeHit) => setLines((ls) => (ls.some((l) => l.variantId === h.variantId) ? ls.map((l) => (l.variantId === h.variantId ? { ...l, cases: l.cases + 1 } : l)) : [...ls, { ...h, cases: 1 }]));
  const setCases = (variantId: string, cases: number) => setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, cases: Math.max(0, Math.floor(cases)) } : l)).filter((l) => l.cases > 0));

  const basket = lines.map((l) => ({ variantId: l.variantId, qty: l.cases * l.caseQty }));
  const lineTotals = lines.map((l) => tradeLine({ unitCents: unitAt(l, l.cases * l.caseQty), qty: l.cases * l.caseQty }));
  const subtotal = lineTotals.reduce((s, l) => s + l.exCents, 0);
  const totals = tradeTotals(lineTotals, { deliveryCents: fulfilment === "COURIER" ? tradeDelivery(subtotal, terms) : 0, handlingCents: fulfilment === "COLLECT" ? tradeHandling(terms) : 0 });
  const problems = lines.length ? validateTradeBasket(lines.map((l) => ({ name: l.name, qty: l.cases * l.caseQty, unitCents: unitAt(l, l.cases * l.caseQty), caseQty: l.caseQty })), { minOrderCents: terms.minOrderCents }) : [];
  const overCredit = payMethod === "ACCOUNT" && totals.totalCents > account.availableCents;

  // Collect: the stores that can hand this basket over, looked up when the basket or the search changes.
  const basketKey = basket.map((b) => `${b.variantId}:${b.qty}`).join(",");
  useEffect(() => {
    if (fulfilment !== "COLLECT" || !basket.length) return;
    startStores(async () => {
      const r = await storesAction(accountId, basket, storeQ);
      if (!("error" in r)) setStores(r.rows);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfilment, basketKey, storeQ, accountId]);

  return (
    <ActionForm action={placeAction} className="grid gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <div className="min-w-0 space-y-6 xl:col-span-2">
        <section className="rounded-2xl border border-ink-150 bg-white shadow-card">
          <div className="px-5 pt-5">
            <h2 className="font-display text-[0.95rem] font-semibold text-ink-900">Trade range at {dcName}</h2>
            <p className="mt-0.5 text-[0.8rem] text-ink-500">What the account may buy, priced ex VAT, with what&apos;s available at the DC right now. Orders are in whole cases.</p>
          </div>
          <div className="flex gap-2 p-5 pb-3">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search the range</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    search(q);
                  }
                }}
                placeholder="Product, SKU or barcode"
                className="pl-9"
              />
            </label>
            <Button type="button" variant="outline" onClick={() => search(q)} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Search
            </Button>
          </div>
          {hitError && <p role="alert" className="px-5 pb-3 text-sm font-medium text-rose-600">{hitError}</p>}
          <ul className="max-h-[26rem] divide-y divide-ink-100 overflow-y-auto border-t border-ink-100" aria-busy={searching}>
            {hits.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-500">{searching ? "Searching…" : "Nothing in the range matches — the account may not be approved for that range, or the item has no trade price."}</li>}
            {hits.map((h) => {
              const inBasket = lines.find((l) => l.variantId === h.variantId);
              return (
                <li key={h.variantId} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{h.name}</span>
                    <span className="block text-xs text-ink-500">
                      <span className="font-mono">{h.sku}</span> · {h.regClass} · case of {h.caseQty} · {h.available > 0 ? `${h.available.toLocaleString()} available` : <span className="text-rose-600">none available</span>}
                      {h.breaks.length > 1 && ` · breaks: ${h.breaks.map((b) => `${b.minQty}+ ${zar(b.unitCents)}`).join(", ")}`}
                    </span>
                  </span>
                  <span className="tnum text-right text-sm">
                    <span className="block font-semibold text-ink-900">{zar(h.unitCents)}</span>
                    <span className="block text-xs text-ink-500">ex VAT · RRP {zar(h.rrpCents)}</span>
                  </span>
                  <Button type="button" size="sm" variant={inBasket ? "outline" : "dark"} onClick={() => add(h)} aria-label={`Add a case of ${h.name}`}>
                    <Plus className="h-4 w-4" aria-hidden /> {inBasket ? `${inBasket.cases} in order` : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border border-ink-150 bg-white shadow-card">
          <div className="px-5 pt-5">
            <h2 className="font-display text-[0.95rem] font-semibold text-ink-900">The order</h2>
            <p className="mt-0.5 text-[0.8rem] text-ink-500">{lines.length ? `${lines.length} line${lines.length === 1 ? "" : "s"} · quantities in cases` : "Add items from the range above."}</p>
          </div>
          {lines.length > 0 && (
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <th scope="col" className="border-b border-ink-150 px-5 py-2">Item</th>
                  <th scope="col" className="border-b border-ink-150 px-4 py-2 text-right">Cases</th>
                  <th scope="col" className="border-b border-ink-150 px-4 py-2 text-right">Units</th>
                  <th scope="col" className="border-b border-ink-150 px-4 py-2 text-right">Unit ex VAT</th>
                  <th scope="col" className="border-b border-ink-150 px-5 py-2 text-right">Line ex VAT</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const qty = l.cases * l.caseQty;
                  const unit = unitAt(l, qty);
                  return (
                    <tr key={l.variantId}>
                      <td className="border-b border-ink-100 px-5 py-2">
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <input type="hidden" name="qty" value={qty} />
                        <span className="block font-medium text-ink-900">{l.name}</span>
                        <span className="block text-xs text-ink-500"><span className="font-mono">{l.sku}</span> · case of {l.caseQty}{qty > l.available && <span className="ml-1 font-semibold text-rose-600">· only {l.available} available</span>}</span>
                      </td>
                      <td className="border-b border-ink-100 px-4 py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => setCases(l.variantId, l.cases - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-ink-200 text-ink-700 hover:bg-ink-50" aria-label={`One case fewer of ${l.name}`}><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                          <label className="sr-only" htmlFor={`cases-${i}`}>Cases of {l.name}</label>
                          <input id={`cases-${i}`} type="number" min={0} max={999} value={l.cases} onChange={(e) => setCases(l.variantId, Number(e.target.value))} className="tnum h-8 w-14 rounded-lg border border-ink-200 px-2 text-center text-sm" />
                          <button type="button" onClick={() => setCases(l.variantId, l.cases + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-ink-200 text-ink-700 hover:bg-ink-50" aria-label={`One case more of ${l.name}`}><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                        </span>
                      </td>
                      <td className="tnum border-b border-ink-100 px-4 py-2 text-right text-ink-700">{qty.toLocaleString()}</td>
                      <td className="tnum border-b border-ink-100 px-4 py-2 text-right text-ink-700">{zar(unit)}</td>
                      <td className="tnum border-b border-ink-100 px-5 py-2 text-right font-medium text-ink-900">
                        {zar(unit * qty)}
                        <button type="button" onClick={() => setCases(l.variantId, 0)} className="ml-2 inline-grid h-7 w-7 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-rose-600" aria-label={`Remove ${l.name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="p-5">
            <FieldError name="lines" />
            {problems.length > 0 && (
              <ul className="space-y-1 text-sm text-amber-700" role="status">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="min-w-0 space-y-6">
        <section className="rounded-2xl border border-ink-150 bg-white shadow-card p-5">
          <h2 className="font-display text-[0.95rem] font-semibold text-ink-900">Fulfilment</h2>
          <div className="mt-3 space-y-2" role="radiogroup" aria-label="Fulfilment">
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", fulfilment === "COURIER" ? "border-brand-500 bg-brand-50/40" : "border-ink-200")}>
              <input type="radio" name="fulfilment" value="COURIER" checked={fulfilment === "COURIER"} onChange={() => setFulfilment("COURIER")} className="mt-1 accent-brand-500" />
              <span><span className="font-medium text-ink-900">Courier from {dcName}</span><span className="block text-xs text-ink-500">{zar(terms.deliveryCents)} ex VAT · free from {zar(terms.freeDeliveryOverCents)} ex VAT</span></span>
            </label>
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", fulfilment === "COLLECT" ? "border-brand-500 bg-brand-50/40" : "border-ink-200")}>
              <input type="radio" name="fulfilment" value="COLLECT" checked={fulfilment === "COLLECT"} onChange={() => setFulfilment("COLLECT")} className="mt-1 accent-brand-500" />
              <span><span className="font-medium text-ink-900">Click &amp; collect at a store</span><span className="block text-xs text-ink-500">handling {zar(terms.collectHandlingCents)} ex VAT · the store picks and hands over with an ID check</span></span>
            </label>
          </div>
          {fulfilment === "COURIER" ? (
            <Field label="Deliver to" htmlFor="deliver" className="mt-4">
              <Select id="deliver" name="deliver" defaultValue={account.deliveryAddress ? "DELIVERY" : "BILLING"}>
                {account.deliveryAddress && <option value="DELIVERY">Delivery address · {account.deliveryAddress}</option>}
                <option value="BILLING">Billing address · {account.billingAddress}</option>
              </Select>
            </Field>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="relative block">
                <span className="sr-only">Find a store</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <Input type="search" value={storeQ} onChange={(e) => setStoreQ(e.target.value)} placeholder="Find a store (name, suburb or city)" className="pl-9" />
              </label>
              <Field label="Collect from" htmlFor="storeId" hint={lines.length ? (loadingStores ? "Checking stock at the stores…" : "Stores in the account's province first; ✓ has the whole order on hand") : "Add items first to see which stores can hand them over"}>
                <Select id="storeId" name="storeId" value={storeId} onChange={(e) => setStoreId(e.target.value)} disabled={!lines.length}>
                  <option value="">Choose a store…</option>
                  {(stores ?? []).map((st) => (
                    <option key={st.id} value={st.id}>{st.allInStock ? "✓ " : `${st.short} short · `}{st.name} · {st.suburb}, {st.city}</option>
                  ))}
                </Select>
                <FieldError name="storeId" />
              </Field>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-ink-150 bg-white shadow-card p-5">
          <h2 className="font-display text-[0.95rem] font-semibold text-ink-900">Payment</h2>
          <div className="mt-3 space-y-2" role="radiogroup" aria-label="Payment">
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", payMethod === "EFT" ? "border-brand-500 bg-brand-50/40" : "border-ink-200")}>
              <input type="radio" name="payMethod" value="EFT" checked={payMethod === "EFT"} onChange={() => setPayMethod("EFT")} className="mt-1 accent-brand-500" />
              <span><span className="font-medium text-ink-900">EFT (pro forma)</span><span className="block text-xs text-ink-500">Nothing is reserved until HQ confirms the payment; lapses after {terms.eftHoldDays} days</span></span>
            </label>
            <label className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", account.terms !== "ACCOUNT" ? "cursor-not-allowed opacity-50" : "cursor-pointer", payMethod === "ACCOUNT" ? "border-brand-500 bg-brand-50/40" : "border-ink-200")}>
              <input type="radio" name="payMethod" value="ACCOUNT" checked={payMethod === "ACCOUNT"} onChange={() => setPayMethod("ACCOUNT")} disabled={account.terms !== "ACCOUNT"} className="mt-1 accent-brand-500" />
              <span><span className="font-medium text-ink-900">On account</span><span className="block text-xs text-ink-500">{account.terms === "ACCOUNT" ? `Stock reserved now; invoiced when it ships or is collected · ${zar(account.availableCents)} available` : "This account buys prepaid"}</span></span>
            </label>
          </div>
          <Field label="Buyer's reference (optional)" htmlFor="reference" hint="Their PO number — printed on the invoice" className="mt-4">
            <Input id="reference" name="reference" maxLength={60} />
          </Field>
          <Field label="Notes (optional)" htmlFor="notes" className="mt-3">
            <Textarea id="notes" name="notes" className="min-h-16" maxLength={1000} />
          </Field>
        </section>

        <section className="rounded-2xl bg-ink-950 p-5 text-white shadow-card">
          <h2 className="font-display text-[0.95rem] font-semibold">Estimate</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-300">Items ex VAT</dt><dd className="tnum">{zar(totals.subtotalCents)}</dd></div>
            {fulfilment === "COURIER" && <div className="flex justify-between"><dt className="text-ink-300">Courier ex VAT</dt><dd className="tnum">{totals.deliveryCents ? zar(totals.deliveryCents) : "Free"}</dd></div>}
            {fulfilment === "COLLECT" && <div className="flex justify-between"><dt className="text-ink-300">Handling ex VAT</dt><dd className="tnum">{zar(totals.handlingCents)}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-300">VAT @ 15%</dt><dd className="tnum">{zar(totals.vatCents)}</dd></div>
            <div className="flex justify-between border-t border-ink-800 pt-2 font-display text-lg font-semibold"><dt>Total incl. VAT</dt><dd className="tnum">{zar(totals.totalCents)}</dd></div>
          </dl>
          {overCredit && <p className="mt-3 text-xs text-amber-400" role="status">Over the available credit of {zar(account.availableCents)} — the account can pay by EFT instead.</p>}
          <p className="mt-3 text-xs text-ink-400">Prices from the range at the DC; the order is priced again when it&apos;s placed (promotions for the trade channel apply then).</p>
          <SubmitButton size="lg" className="mt-4 w-full" disabled={!lines.length || problems.length > 0 || (fulfilment === "COLLECT" && !storeId)} pendingLabel="Placing…">
            {lines.length ? `Place order for ${account.name}` : "Add items to place an order"}
          </SubmitButton>
        </section>
      </div>
    </ActionForm>
  );
}
