"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Clock, CreditCard, Gift, IdCard, Lock, MapPin, Store, Truck, Zap } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/app/(shop)/checkout/actions";
import { buttonClass } from "@/components/ui/button";
import { VoucherCode } from "./voucher-code";
import { FieldRow, SelectInput, TextInput, inputClass } from "./ui";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export type Fulfil = "COLLECT" | "SAME_DAY" | "COURIER";
export type FulfilOption = { key: Fulfil; ok: boolean; reason?: string; feeCents: number; maxPoints: number };
export type CollectStore = { id: string; name: string; suburb: string; city: string; hasAll: boolean; missing: number; km: number | null; openLabel: string; open: boolean };
export type SummaryLine = { variantId: string; name: string; variant: string; qty: number; totalCents: number };
export type AddressFields = { addressLine: string; suburb: string; city: string; province: string; postalCode: string; notes?: string };
export type SavedAddress = AddressFields & { id: string; label: string; isDefault: boolean };

const META: Record<Fulfil, { label: string; icon: React.ReactNode }> = {
  COLLECT: { label: "Click & collect", icon: <Store className="h-5 w-5" /> },
  SAME_DAY: { label: "Same-day delivery", icon: <Zap className="h-5 w-5" /> },
  COURIER: { label: "Courier delivery", icon: <Truck className="h-5 w-5" /> },
};
const COLS = ["", "sm:grid-cols-2", "sm:grid-cols-2", "sm:grid-cols-3"]; // a lone option keeps a card's width
const EMPTY: AddressFields = { addressLine: "", suburb: "", city: "", province: "", postalCode: "", notes: "" };

export function CheckoutForm(props: {
  options: FulfilOption[]; // only what some store can serve (never an empty list: courier is always there)
  deliveryOnly: boolean; // no store trading yet
  payInStoreOnly?: boolean; // licensed medicines in the bag: no online payment provider accepts them
  onlineNote: string; // how "Pay online now" pays
  stores: CollectStore[];
  defaultStoreId: string | null;
  lines: SummaryLine[];
  subtotalCents: number;
  discounts: { name: string; cents: number }[];
  totalCents: number;
  vatCents: number;
  memberSavingsCents: number;
  tierName: string;
  balance: number;
  minRedeem: number;
  address: AddressFields | null; // the last order's address, when the member has none saved
  addresses: SavedAddress[]; // the member's saved addresses (default first)
  estimates: { collect: string; sameDay: string; courier: Record<string, string> }; // when it arrives, by province code ("" = anywhere)
  voucher: { code: string; balanceCents: number } | null; // a valid gift voucher in the bag
  voucherError: string | null;
  voucherCode: string | null;
  provinces: [string, string][];
  sameDayNote: string;
  courierNote: string;
  blocked: string | null;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrderAction, {});
  const typed = state.values; // the address as typed, after an error (the form resets once the action returns)
  const first = props.options.find((o) => o.ok)?.key ?? props.options[0].key;
  const canCollect = props.options.some((o) => o.key === "COLLECT");
  const [fulfilment, setFulfilment] = useState<Fulfil>(first);
  const [storeId, setStoreId] = useState(props.defaultStoreId ?? props.stores.find((s) => s.hasAll)?.id ?? "");
  const [pay, setPay] = useState<"ONLINE" | "IN_STORE">(props.payInStoreOnly ? "IN_STORE" : "ONLINE");
  const [usePts, setUsePts] = useState(false);
  const opt = props.options.find((o) => o.key === fulfilment)!;
  const [points, setPoints] = useState(opt.maxPoints);
  const pts = usePts ? Math.min(points, opt.maxPoints) : 0;
  const total = props.totalCents + opt.feeCents;
  const payIn = fulfilment === "COLLECT" ? pay : "ONLINE";
  const afterPoints = total - pts * 100;
  // A gift voucher pays after points, online only (the till doesn't take vouchers).
  const voucherCents = props.voucher && payIn === "ONLINE" ? Math.min(props.voucher.balanceCents, afterPoints) : 0;
  const due = afterPoints - voucherCents;
  const storesSorted = useMemo(() => props.stores, [props.stores]);
  const chosen = props.stores.find((s) => s.id === storeId);
  // The delivery address: the default saved address, else the last order's; a chip fills the fields, which stay editable.
  const initial = useMemo<AddressFields>(() => {
    if (typed) return { addressLine: typed.addressLine, suburb: typed.suburb, city: typed.city, province: typed.province, postalCode: typed.postalCode, notes: typed.notes };
    const d = props.addresses.find((a) => a.isDefault) ?? props.addresses[0];
    return d ? { addressLine: d.addressLine, suburb: d.suburb, city: d.city, province: d.province, postalCode: d.postalCode, notes: d.notes ?? "" } : props.address ? { ...props.address, notes: "" } : EMPTY;
  }, [typed, props.addresses, props.address]);
  const [addr, setAddr] = useState<AddressFields>(initial);
  const [label, setLabel] = useState(typed?.addressLabel ?? props.addresses.find((a) => a.isDefault)?.label ?? "Home");
  const usingId = props.addresses.find((a) => a.addressLine === addr.addressLine && a.postalCode === addr.postalCode)?.id ?? null;
  const set = (k: keyof AddressFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setAddr((a) => ({ ...a, [k]: e.target.value }));
  const arrives = fulfilment === "COLLECT" ? props.estimates.collect : fulfilment === "SAME_DAY" ? props.estimates.sameDay : (props.estimates.courier[addr.province] ?? props.estimates.courier[""]);

  // The voucher and promo forms live in the summary, outside the checkout form (a form can't hold another form);
  // the submit button targets the checkout form by id.
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
      <form id="checkout-form" action={action} className="space-y-10">
        <input type="hidden" name="fulfilment" value={fulfilment} />
        <input type="hidden" name="payMethod" value={payIn} />
        <input type="hidden" name="points" value={pts} />
        {/* 1. Fulfilment */}
        <section aria-labelledby="co-how">
          <h2 id="co-how" className="font-display text-xl font-semibold text-white">
            <span className="tnum mr-2 text-brand-500">1</span>How would you like it?
          </h2>
          {props.deliveryOnly && <p className="mt-1 text-sm text-ink-400">Delivery only for now. Our stores open soon.</p>}
          <div className={cn("mt-4 grid grid-cols-1 gap-3", COLS[props.options.length])} role="radiogroup" aria-labelledby="co-how">
            {props.options.map((o) => {
              const on = o.key === fulfilment;
              const when = o.key === "COLLECT" ? props.estimates.collect : o.key === "SAME_DAY" ? props.estimates.sameDay : (props.estimates.courier[addr.province] ?? props.estimates.courier[""]);
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={o.key}
                  disabled={!o.ok}
                  onClick={() => {
                    setFulfilment(o.key);
                    setPoints(o.maxPoints);
                  }}
                  className={cn(
                    "relative flex flex-col items-start rounded-2xl border p-4 text-left transition",
                    on ? "border-brand-500 bg-brand-500/10" : "border-ink-800 bg-ink-900/60 hover:border-ink-600",
                    !o.ok && "cursor-not-allowed opacity-50 hover:border-ink-800",
                  )}
                >
                  <span className={cn("grid h-9 w-9 place-items-center rounded-full", on ? "bg-brand-500 text-ink-950" : "bg-ink-850 text-brand-400")}>{META[o.key].icon}</span>
                  <span className="mt-3 font-semibold text-white">{META[o.key].label}</span>
                  <span className="mt-0.5 text-xs text-ink-400">{!o.ok ? o.reason : o.feeCents ? zar(o.feeCents) : "Free"}</span>
                  {o.ok && (
                    <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-ink-200">
                      <Clock className="h-3.5 w-3.5 text-brand-500" /> {o.key === "COLLECT" ? `Ready ${when.toLowerCase()}` : `Arrives ${when}`}
                    </span>
                  )}
                  {on && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-400" strokeWidth={2.6} />}
                </button>
              );
            })}
          </div>
          {fulfilment !== "COLLECT" && (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
              <IdCard className="h-4 w-4 shrink-0 text-brand-500" /> ID (18+) checked on delivery — {fulfilment === "SAME_DAY" ? props.sameDayNote : props.courierNote}
            </p>
          )}
        </section>

        {/* 2. Where */}
        {fulfilment === "COLLECT" ? (
          <section aria-labelledby="co-where">
            <h2 id="co-where" className="font-display text-xl font-semibold text-white">
              <span className="tnum mr-2 text-brand-500">2</span>Collect from
            </h2>
            <p className="mt-1 text-sm text-ink-400">Stores with everything in your bag are listed first. Bring your ID (18+) and your collection code.</p>
            <input type="hidden" name="storeId" value={storeId} />
            <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-labelledby="co-where">
              {storesSorted.map((s) => {
                const on = s.id === storeId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setStoreId(s.id)}
                      className={cn("flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition", on ? "border-brand-500 bg-brand-500/10" : "border-ink-800 hover:border-ink-600")}
                    >
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-brand-500 bg-brand-500" : "border-ink-600")}>{on && <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">{s.name}</span>
                        <span className="block text-xs text-ink-400 sm:truncate">
                          {s.suburb}, {s.city}
                          {s.km != null && (s.km < 0.05 ? " · Your store" : ` · ${s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km away`)} · <span className={s.open ? "text-leaf-100" : undefined}>{s.openLabel}</span>
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", s.hasAll ? "bg-leaf-500/15 text-leaf-100" : "bg-amber-500/15 text-amber-100")}>
                        {s.hasAll ? "Everything in stock" : `${s.missing} item${s.missing === 1 ? "" : "s"} short`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.fields?.storeId && <p className="mt-2 text-sm text-rose-100">{state.fields.storeId}</p>}
          </section>
        ) : (
          <section aria-labelledby="co-where">
            <h2 id="co-where" className="font-display text-xl font-semibold text-white">
              <span className="tnum mr-2 text-brand-500">2</span>Deliver to
            </h2>
            {props.addresses.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-450">Your addresses</p>
                <ul className="mt-2 flex flex-wrap gap-2" aria-label="Saved addresses">
                  {props.addresses.map((a) => {
                    const on = a.id === usingId;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setAddr({ addressLine: a.addressLine, suburb: a.suburb, city: a.city, province: a.province, postalCode: a.postalCode, notes: a.notes ?? "" });
                            setLabel(a.label);
                          }}
                          className={cn("inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 py-2 text-left text-sm transition", on ? "border-brand-500 bg-brand-500/10 text-white" : "border-ink-700 text-ink-100 hover:border-ink-500")}
                        >
                          <MapPin className={cn("h-4 w-4 shrink-0", on ? "text-brand-400" : "text-ink-400")} />
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{a.label}</span> · {a.addressLine}, {a.suburb}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setAddr(EMPTY);
                        setLabel("Other");
                      }}
                      className="inline-flex min-h-11 items-center rounded-full border border-dashed border-ink-700 px-4 py-2 text-sm text-ink-300 hover:border-ink-500 hover:text-white"
                    >
                      New address
                    </button>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-ink-450">{usingId ? "Using this address — edit anything below." : "Fill in the address below; we'll save it for next time."}</p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldRow label="Street address" htmlFor="co-line" error={state.fields?.addressLine} className="sm:col-span-2">
                <TextInput id="co-line" name="addressLine" autoComplete="address-line1" value={addr.addressLine} onChange={set("addressLine")} required aria-invalid={!!state.fields?.addressLine} />
              </FieldRow>
              <FieldRow label="Suburb" htmlFor="co-suburb" error={state.fields?.suburb}>
                <TextInput id="co-suburb" name="suburb" autoComplete="address-level3" value={addr.suburb} onChange={set("suburb")} required aria-invalid={!!state.fields?.suburb} />
              </FieldRow>
              <FieldRow label="Town or city" htmlFor="co-city" error={state.fields?.city}>
                <TextInput id="co-city" name="city" autoComplete="address-level2" value={addr.city} onChange={set("city")} required aria-invalid={!!state.fields?.city} />
              </FieldRow>
              <FieldRow label="Province" htmlFor="co-prov" error={state.fields?.province}>
                <SelectInput id="co-prov" name="province" value={addr.province} onChange={set("province")} required aria-invalid={!!state.fields?.province}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {props.provinces.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </SelectInput>
              </FieldRow>
              <FieldRow label="Postal code" htmlFor="co-post" error={state.fields?.postalCode}>
                <TextInput id="co-post" name="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={4} value={addr.postalCode} onChange={set("postalCode")} required aria-invalid={!!state.fields?.postalCode} />
              </FieldRow>
              <FieldRow label="Delivery notes (optional)" htmlFor="co-notes" className="sm:col-span-2" hint="Gate code, complex name, where to leave the driver's details…">
                <textarea id="co-notes" name="notes" rows={2} maxLength={200} value={addr.notes ?? ""} onChange={set("notes")} className={cn(inputClass, "py-3")} />
              </FieldRow>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-ink-200">
                  <input type="checkbox" name="saveAddress" value="yes" defaultChecked className="h-5 w-5 accent-brand-500" /> Save this address
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-200">
                  as
                  <select name="addressLabel" value={label} onChange={(e) => setLabel(e.target.value)} className={cn(inputClass, "h-9 w-28 cursor-pointer text-sm")} aria-label="Address label">
                    {["Home", "Work", "Other"].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <input type="hidden" name="saveAddress" value="no" />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
              <Clock className="h-4 w-4 shrink-0 text-brand-500" /> Arrives <strong className="text-white">{arrives}</strong>
              {fulfilment === "COURIER" && !addr.province ? " — choose your province for a closer estimate" : ""}
            </p>
          </section>
        )}

        {/* 3. Payment */}
        <section aria-labelledby="co-pay">
          <h2 id="co-pay" className="font-display text-xl font-semibold text-white">
            <span className="tnum mr-2 text-brand-500">3</span>Payment
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="co-pay">
            {(
              [
                ["ONLINE", "Pay online now", props.onlineNote, <CreditCard key="c" className="h-5 w-5" />],
                ["IN_STORE", "Pay when you collect", "Card or cash at the counter", <Store key="s" className="h-5 w-5" />],
              ] as const
            ).filter(([k]) => k === "ONLINE" || canCollect).map(([k, l, sub, icon]) => {
              const disabled = (k === "IN_STORE" && fulfilment !== "COLLECT") || (k === "ONLINE" && !!props.payInStoreOnly);
              const on = payIn === k;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={k}
                  disabled={disabled}
                  onClick={() => setPay(k)}
                  className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition", on ? "border-brand-500 bg-brand-500/10" : "border-ink-800 hover:border-ink-600", disabled && "cursor-not-allowed opacity-45")}
                >
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", on ? "bg-brand-500 text-ink-950" : "bg-ink-850 text-brand-400")}>{icon}</span>
                  <span>
                    <span className="block font-semibold text-white">{l}</span>
                    <span className="block text-xs text-ink-400">{disabled ? (k === "ONLINE" ? "Licensed medicines are paid for at the counter" : "Only for click & collect") : sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {props.balance > 0 && (
            <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block font-semibold text-white">Use my points</span>
                  <span className="block text-xs text-ink-400">
                    You have {fmtPoints(props.balance)} · 1 point = R1
                    {opt.maxPoints ? ` · up to ${fmtPoints(opt.maxPoints)} on this order` : props.balance < props.minRedeem ? ` · redeem from ${props.minRedeem}` : " · not available on this order"}
                  </span>
                </span>
                <input type="checkbox" checked={usePts} disabled={!opt.maxPoints} onChange={(e) => setUsePts(e.target.checked)} className="h-6 w-6 shrink-0 cursor-pointer accent-brand-500 disabled:cursor-not-allowed" />
              </label>
              {usePts && opt.maxPoints > 0 && (
                <div className="mt-4 flex items-center gap-4">
                  <input type="range" min={props.minRedeem} max={opt.maxPoints} value={Math.max(props.minRedeem, Math.min(points, opt.maxPoints))} onChange={(e) => setPoints(Number(e.target.value))} className="flex-1 accent-brand-500" aria-label="Points to redeem" />
                  <span className="tnum w-24 text-right font-semibold text-white">−{zar(pts * 100)}</span>
                </div>
              )}
            </div>
          )}

        </section>
      </form>

      {/* Summary */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
          <h2 className="font-display text-lg font-semibold text-white">Order summary</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {props.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3">
                <span className="min-w-0 text-ink-300">
                  <span className="tnum text-ink-450">{l.qty}×</span> {l.name} <span className="text-ink-450">· {l.variant}</span>
                </span>
                <span className="tnum shrink-0 text-ink-100">{zar(l.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-ink-800 pt-4 text-sm">
            {props.discounts.map((d) => (
              <div key={d.name} className="flex justify-between gap-3 text-leaf-100">
                <dt>{d.name}</dt>
                <dd className="tnum shrink-0">−{zar(d.cents)}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-ink-300">{fulfilment === "COLLECT" ? "Collection" : "Delivery"}</dt>
              <dd className="tnum text-ink-100">{opt.feeCents ? zar(opt.feeCents) : "Free"}</dd>
            </div>
            {pts > 0 && (
              <div className="flex justify-between text-leaf-100">
                <dt>Points ({fmtPoints(pts)})</dt>
                <dd className="tnum">−{zar(pts * 100)}</dd>
              </div>
            )}
            {voucherCents > 0 && (
              <div className="flex justify-between gap-3 text-leaf-100">
                <dt className="truncate">Gift voucher {props.voucher!.code}</dt>
                <dd className="tnum shrink-0">−{zar(voucherCents)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-ink-800 pt-3">
              <dt className="font-semibold text-white">{payIn === "IN_STORE" ? "To pay in store" : "To pay"}</dt>
              <dd className="tnum font-display text-2xl font-semibold text-white">{zar(due)}</dd>
            </div>
          </dl>
          {props.vatCents > 0 && <p className="mt-2 text-right text-xs text-ink-450">Prices include VAT</p>}
          {props.memberSavingsCents > 0 && (
            <p className="mt-4 rounded-xl border border-brand-500/35 bg-brand-500/10 px-3 py-2.5 text-xs font-semibold text-brand-100">
              Includes {zar(props.memberSavingsCents)} off with your {props.tierName} price.
            </p>
          )}

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Gift className="h-4 w-4 text-brand-500" /> Gift voucher
            </p>
            <VoucherCode code={props.voucherCode} applied={props.voucher ? { balanceCents: props.voucher.balanceCents, appliedCents: voucherCents } : null} error={props.voucherError} />
            {props.voucher && payIn === "IN_STORE" && <p className="mt-2 text-xs text-amber-100">Gift vouchers are redeemed with online payment — choose Pay online now to use it on this order.</p>}
          </div>

          {props.blocked && (
            <p className="mt-4 flex gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {props.blocked}
            </p>
          )}
          {state.error && (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100" role="alert">
              <p className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
              </p>
              {!!state.alternatives?.length && (
                <div className="mt-2.5">
                  <p className="text-xs text-ink-300">These stores have everything:</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {state.alternatives.map((a) => (
                      <button key={a.id} type="button" onClick={() => setStoreId(a.id)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", a.id === storeId ? "border-brand-500 bg-brand-500 text-ink-950" : "border-ink-600 text-white hover:border-brand-500")}>
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button form="checkout-form" disabled={pending || !!props.blocked || !opt.ok || (fulfilment === "COLLECT" && !storeId)} className={buttonClass("primary", "xl", "mt-5 w-full")}>
            {pending ? "Placing your order…" : payIn === "ONLINE" && due > 0 ? `Continue to payment · ${zar(due)}` : `Place order · ${zar(due)}`}
            {!pending && <ArrowRight className="h-5 w-5" />}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-450">
            <Lock className="h-3.5 w-3.5" /> {fulfilment === "COLLECT" && chosen ? `Collect at ${chosen.name} · ID (18+) required` : "Secure checkout · ID (18+) checked on delivery"}
          </p>
          <p className="mt-1 text-center text-xs text-ink-400">
            <Link href="/legal/returns" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-1 underline underline-offset-2 hover:text-white">
              Returns &amp; refunds
            </Link>
            {" · "}
            <Link href="/legal/delivery" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-1 underline underline-offset-2 hover:text-white">
              Delivery policy
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}
