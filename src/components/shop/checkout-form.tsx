"use client";
import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CreditCard, IdCard, Lock, MapPin, Store, Truck, Zap } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/app/(shop)/checkout/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, SelectInput, TextInput, inputClass } from "./ui";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export type Fulfil = "COLLECT" | "SAME_DAY" | "COURIER";
export type FulfilOption = { key: Fulfil; ok: boolean; reason?: string; feeCents: number; maxPoints: number };
export type CollectStore = { id: string; name: string; suburb: string; city: string; hasAll: boolean; missing: number; km: number | null; openLabel: string; open: boolean };
export type SummaryLine = { variantId: string; name: string; variant: string; qty: number; totalCents: number };

const META: Record<Fulfil, { label: string; icon: React.ReactNode }> = {
  COLLECT: { label: "Click & collect", icon: <Store className="h-5 w-5" /> },
  SAME_DAY: { label: "Same-day delivery", icon: <Zap className="h-5 w-5" /> },
  COURIER: { label: "Courier delivery", icon: <Truck className="h-5 w-5" /> },
};

export function CheckoutForm(props: {
  options: FulfilOption[];
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
  address: { addressLine: string; suburb: string; city: string; province: string; postalCode: string } | null;
  provinces: [string, string][];
  sameDayNote: string;
  courierNote: string;
  blocked: string | null;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrderAction, {});
  const first = props.options.find((o) => o.ok)?.key ?? "COLLECT";
  const [fulfilment, setFulfilment] = useState<Fulfil>(first);
  const [storeId, setStoreId] = useState(props.defaultStoreId ?? props.stores.find((s) => s.hasAll)?.id ?? "");
  const [pay, setPay] = useState<"ONLINE" | "IN_STORE">("ONLINE");
  const [usePts, setUsePts] = useState(false);
  const opt = props.options.find((o) => o.key === fulfilment)!;
  const [points, setPoints] = useState(opt.maxPoints);
  const pts = usePts ? Math.min(points, opt.maxPoints) : 0;
  const total = props.totalCents + opt.feeCents;
  const due = total - pts * 100;
  const payIn = fulfilment === "COLLECT" ? pay : "ONLINE";
  const storesSorted = useMemo(() => props.stores, [props.stores]);
  const chosen = props.stores.find((s) => s.id === storeId);

  return (
    <form action={action} className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
      <input type="hidden" name="fulfilment" value={fulfilment} />
      <input type="hidden" name="payMethod" value={payIn} />
      <input type="hidden" name="points" value={pts} />
      <div className="space-y-10">
        {/* 1. Fulfilment */}
        <section aria-labelledby="co-how">
          <h2 id="co-how" className="font-display text-xl font-semibold text-white">
            <span className="tnum mr-2 text-oranje-500">1</span>How would you like it?
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-labelledby="co-how">
            {props.options.map((o) => {
              const on = o.key === fulfilment;
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
                    on ? "border-oranje-500 bg-oranje-500/10" : "border-ink-800 bg-ink-900/60 hover:border-ink-600",
                    !o.ok && "cursor-not-allowed opacity-50 hover:border-ink-800",
                  )}
                >
                  <span className={cn("grid h-9 w-9 place-items-center rounded-full", on ? "bg-oranje-500 text-ink-950" : "bg-ink-850 text-oranje-400")}>{META[o.key].icon}</span>
                  <span className="mt-3 font-semibold text-white">{META[o.key].label}</span>
                  <span className="mt-0.5 text-xs text-ink-400">{!o.ok ? o.reason : o.feeCents ? zar(o.feeCents) : "Free"}</span>
                  {on && <Check className="absolute right-3 top-3 h-4 w-4 text-oranje-400" strokeWidth={2.6} />}
                </button>
              );
            })}
          </div>
          {fulfilment !== "COLLECT" && (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
              <IdCard className="h-4 w-4 shrink-0 text-oranje-500" /> ID (18+) checked on delivery — {fulfilment === "SAME_DAY" ? props.sameDayNote : props.courierNote}
            </p>
          )}
        </section>

        {/* 2. Where */}
        {fulfilment === "COLLECT" ? (
          <section aria-labelledby="co-where">
            <h2 id="co-where" className="font-display text-xl font-semibold text-white">
              <span className="tnum mr-2 text-oranje-500">2</span>Collect from
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
                      className={cn("flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition", on ? "border-oranje-500 bg-oranje-500/10" : "border-ink-800 hover:border-ink-600")}
                    >
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-oranje-500 bg-oranje-500" : "border-ink-600")}>{on && <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />}</span>
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
              <span className="tnum mr-2 text-oranje-500">2</span>Deliver to
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldRow label="Street address" htmlFor="co-line" error={state.fields?.addressLine} className="sm:col-span-2">
                <TextInput id="co-line" name="addressLine" autoComplete="address-line1" defaultValue={props.address?.addressLine} required aria-invalid={!!state.fields?.addressLine} />
              </FieldRow>
              <FieldRow label="Suburb" htmlFor="co-suburb" error={state.fields?.suburb}>
                <TextInput id="co-suburb" name="suburb" autoComplete="address-level3" defaultValue={props.address?.suburb} required aria-invalid={!!state.fields?.suburb} />
              </FieldRow>
              <FieldRow label="Town or city" htmlFor="co-city" error={state.fields?.city}>
                <TextInput id="co-city" name="city" autoComplete="address-level2" defaultValue={props.address?.city} required aria-invalid={!!state.fields?.city} />
              </FieldRow>
              <FieldRow label="Province" htmlFor="co-prov" error={state.fields?.province}>
                <SelectInput id="co-prov" name="province" defaultValue={props.address?.province ?? ""} required aria-invalid={!!state.fields?.province}>
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
                <TextInput id="co-post" name="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={4} defaultValue={props.address?.postalCode} required aria-invalid={!!state.fields?.postalCode} />
              </FieldRow>
              <FieldRow label="Delivery notes (optional)" htmlFor="co-notes" className="sm:col-span-2" hint="Gate code, complex name, where to leave the driver's details…">
                <textarea id="co-notes" name="notes" rows={2} maxLength={200} className={cn(inputClass, "py-3")} />
              </FieldRow>
            </div>
          </section>
        )}

        {/* 3. Payment */}
        <section aria-labelledby="co-pay">
          <h2 id="co-pay" className="font-display text-xl font-semibold text-white">
            <span className="tnum mr-2 text-oranje-500">3</span>Payment
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="co-pay">
            {(
              [
                ["ONLINE", "Pay online now", "Card, Instant EFT or PayShap", <CreditCard key="c" className="h-5 w-5" />],
                ["IN_STORE", "Pay when you collect", "Card or cash at the counter", <Store key="s" className="h-5 w-5" />],
              ] as const
            ).map(([k, l, sub, icon]) => {
              const disabled = k === "IN_STORE" && fulfilment !== "COLLECT";
              const on = payIn === k;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={k}
                  disabled={disabled}
                  onClick={() => setPay(k)}
                  className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition", on ? "border-oranje-500 bg-oranje-500/10" : "border-ink-800 hover:border-ink-600", disabled && "cursor-not-allowed opacity-45")}
                >
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", on ? "bg-oranje-500 text-ink-950" : "bg-ink-850 text-oranje-400")}>{icon}</span>
                  <span>
                    <span className="block font-semibold text-white">{l}</span>
                    <span className="block text-xs text-ink-400">{disabled ? "Only for click & collect" : sub}</span>
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
                <input type="checkbox" checked={usePts} disabled={!opt.maxPoints} onChange={(e) => setUsePts(e.target.checked)} className="h-6 w-6 shrink-0 cursor-pointer accent-oranje-500 disabled:cursor-not-allowed" />
              </label>
              {usePts && opt.maxPoints > 0 && (
                <div className="mt-4 flex items-center gap-4">
                  <input type="range" min={props.minRedeem} max={opt.maxPoints} value={Math.max(props.minRedeem, Math.min(points, opt.maxPoints))} onChange={(e) => setPoints(Number(e.target.value))} className="flex-1 accent-oranje-500" aria-label="Points to redeem" />
                  <span className="tnum w-24 text-right font-semibold text-white">−{zar(pts * 100)}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
          <h2 className="font-display text-lg font-semibold text-white">Order summary</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {props.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3">
                <span className="min-w-0 text-ink-300">
                  <span className="tnum text-ink-500">{l.qty}×</span> {l.name} <span className="text-ink-500">· {l.variant}</span>
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
            <div className="flex items-baseline justify-between border-t border-ink-800 pt-3">
              <dt className="font-semibold text-white">{payIn === "IN_STORE" ? "To pay in store" : "To pay"}</dt>
              <dd className="tnum font-display text-2xl font-semibold text-white">{zar(due)}</dd>
            </div>
            {props.vatCents > 0 && <p className="text-right text-xs text-ink-500">Prices include VAT</p>}
          </dl>
          {props.memberSavingsCents > 0 && (
            <p className="mt-4 rounded-xl border border-oranje-500/35 bg-oranje-500/10 px-3 py-2.5 text-xs font-semibold text-oranje-100">
              Includes {zar(props.memberSavingsCents)} off with your {props.tierName} price.
            </p>
          )}

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
                      <button key={a.id} type="button" onClick={() => setStoreId(a.id)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", a.id === storeId ? "border-oranje-500 bg-oranje-500 text-ink-950" : "border-ink-600 text-white hover:border-oranje-500")}>
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button disabled={pending || !!props.blocked || !opt.ok || (fulfilment === "COLLECT" && !storeId)} className={buttonClass("primary", "xl", "mt-5 w-full")}>
            {pending ? "Placing your order…" : payIn === "ONLINE" && due > 0 ? `Continue to payment · ${zar(due)}` : `Place order · ${zar(due)}`}
            {!pending && <ArrowRight className="h-5 w-5" />}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
            <Lock className="h-3.5 w-3.5" /> {fulfilment === "COLLECT" && chosen ? `Collect at ${chosen.name} · ID (18+) required` : "Secure checkout · ID (18+) checked on delivery"}
          </p>
        </div>
      </aside>
    </form>
  );
}
