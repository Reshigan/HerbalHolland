"use client";
// The basket: customer card, lines (qty steppers, price-rule labels, promotion discounts),
// "complete the deal" suggestions, promo code, totals and the Pay button.
import { useState } from "react";
import { BadgeCheck, Gift, IdCard, Pill, ScanLine, ShieldAlert, Sparkles, Stethoscope, Tag, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { zar } from "@/lib/money";
import { fmtPoints } from "@/lib/loyalty-rules";
import { Chip, PosButton, TIER_CHIP, tierName, Stepper, TextInput } from "../ui";
import type { BootProduct, BootVariant, QuoteDTO, CustomerDetail } from "@/server/pos/types";
import type { Cart } from "../lib/storage";

export type VariantIndex = Map<string, { product: BootProduct; variant: BootVariant }>;

function ruleTone(rule: string): "amber" | "blue" | "violet" {
  if (rule.startsWith("Near-expiry")) return "amber";
  if (/\(\d+\+\)$/.test(rule)) return "blue";
  return "violet";
}

export function CustomerCard({ customer, ageCheck, joinSavingsCents = 0, onFind, onNew, onDetach, onScan }: { customer: CustomerDetail | null; ageCheck: Cart["ageCheck"]; joinSavingsCents?: number; onFind: () => void; onNew: () => void; onDetach: () => void; onScan?: () => void }) {
  if (!customer)
    return (
      <div className="rounded-2xl bg-ink-900 p-3 ring-1 ring-ink-800">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-300">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-white">Walk-in customer</div>
            <div className="text-xs text-ink-400">{ageCheck ? `Age checked at the counter (${ageCheck === "ID_NUMBER" ? "SA ID number" : "ID sighted"})` : "Members save instantly and earn points"}</div>
          </div>
        </div>
        {joinSavingsCents > 0 && (
          <button type="button" onClick={onFind} className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-oranje-500/15 px-3 py-2 text-left ring-1 ring-oranje-500/40 transition hover:bg-oranje-500/20" data-testid="join-prompt">
            <Sparkles className="h-5 w-5 shrink-0 text-oranje-400" />
            <span className="text-[0.85rem] leading-snug text-oranje-100">
              <b className="text-oranje-300">Members save {zar(joinSavingsCents)}</b> on this basket — add or sign up (free)
            </span>
          </button>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PosButton variant="secondary" onClick={onFind} className="px-3">
            <UserRound className="h-4 w-4" /> Find member
            <kbd className="hidden rounded border border-ink-600 px-1 text-[0.6rem] text-ink-400 xl:inline">F4</kbd>
          </PosButton>
          <PosButton variant="secondary" onClick={onNew} className="px-3">
            <UserPlus className="h-4 w-4" /> New member
          </PosButton>
        </div>
        {onScan && (
          <button type="button" onClick={onScan} className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.8rem] font-semibold text-ink-300 hover:bg-ink-850">
            <ScanLine className="h-4 w-4" /> Scan member QR
          </button>
        )}
      </div>
    );
  const p = customer.patient;
  return (
    <div className="rounded-2xl bg-ink-900 p-3 ring-1 ring-oranje-500/30" data-testid="customer-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-oranje-500 font-display text-sm font-bold text-ink-950">
          {(customer.firstName[0] ?? "") + (customer.lastName?.[0] ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-white">
              {customer.firstName} {customer.lastName}
            </span>
            <Chip tone={TIER_CHIP[customer.tier] ?? "neutral"}>{tierName(customer.tier)}</Chip>
          </div>
          <div className="mt-0.5 text-xs text-ink-400">
            {customer.memberNo} · {customer.phone}
          </div>
        </div>
        <button type="button" onClick={onDetach} aria-label="Remove customer from sale" className="-mr-2 -mt-2 grid h-12 w-12 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip tone="orange" icon={<Sparkles className="h-3 w-3" />}>
          {fmtPoints(customer.points)}
        </Chip>
        {customer.ageVerified ? (
          <Chip tone="green" icon={<BadgeCheck className="h-3 w-3" />}>
            18+ verified{customer.age ? ` · ${customer.age}` : ""}
          </Chip>
        ) : (
          <Chip tone="amber" icon={<IdCard className="h-3 w-3" />}>
            Age not verified
          </Chip>
        )}
        {p ? (
          <Chip tone="blue" icon={<Stethoscope className="h-3 w-3" />}>
            Patient · {Math.round(p.remainingGrams * 10) / 10}g left this month
          </Chip>
        ) : null}
      </div>
      {p && (
        <div className="mt-2 rounded-xl bg-ink-850 px-3 py-2 text-xs leading-relaxed text-ink-300">
          <span className="font-semibold text-ink-100">Authorisation {p.authNumber}</span> · {p.prescriber} ({p.prescriberRegNo}) · limit {p.monthlyLimitGrams}g / 30 days
        </div>
      )}
    </div>
  );
}

export function CartPanel({
  cart,
  index,
  quote,
  priced,
  licensedClasses,
  onQty,
  onRemove,
  onClear,
  onCode,
  onSuggestion,
  onPay,
  payDisabledReason,
  checking,
  customerCard,
}: {
  cart: Cart;
  index: VariantIndex;
  quote: QuoteDTO;
  priced: "server" | "local";
  licensedClasses: string[];
  onQty: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onClear: () => void;
  onCode: (code: string | null) => void;
  onSuggestion: (s: QuoteDTO["suggestions"][number]) => void;
  onPay: () => void;
  payDisabledReason: string | null;
  checking: boolean;
  customerCard: React.ReactNode;
}) {
  const [codeOpen, setCodeOpen] = useState(!!cart.code);
  const [code, setCode] = useState(cart.code ?? "");
  const byVariant = new Map(quote.lines.map((l) => [l.variantId, l]));
  const promoName = new Map(quote.applied.map((a) => [a.id, a.name]));
  const units = cart.lines.reduce((s, l) => s + l.qty, 0);
  const hasLicensed = cart.lines.some((l) => licensedClasses.includes(index.get(l.variantId)?.product.regClass ?? ""));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-3 pb-2">{customerCard}</div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
        {cart.lines.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-800 px-6 text-center text-ink-400">
            <ScanLine className="mb-2 h-7 w-7 text-ink-600" />
            <p className="font-semibold text-ink-200">Basket is empty</p>
            <p className="mt-1 text-sm">Tap a product or scan a barcode to start a sale.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-850" aria-label="Basket">
            {cart.lines.map((l) => {
              const e = index.get(l.variantId);
              if (!e) return null;
              const q = byVariant.get(l.variantId);
              const licensed = licensedClasses.includes(e.product.regClass);
              return (
                <li key={l.variantId} className="py-3" data-testid="cart-line">
                  <div className="flex gap-3">
                    <ProductArt slug={e.product.slug} strain={e.product.strain} regClass={e.product.regClass} className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" label="" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[0.92rem] font-semibold text-white">{e.product.name}</div>
                          <div className="text-xs text-ink-400">
                            {e.variant.name} · {zar(q?.unitPriceCents ?? e.variant.shelfCents ?? e.variant.rrpCents)} each
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-base font-semibold text-white tnum">{zar(q?.totalCents ?? 0)}</div>
                          {!!q?.discountCents && <div className="text-[0.7rem] text-ink-500 line-through tnum">{zar(q.grossCents)}</div>}
                        </div>
                      </div>
                      <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                        {q?.priceRule && <Chip tone={ruleTone(q.priceRule)}>{q.priceRule}</Chip>}
                        {licensed && (
                          <Chip tone="orange" icon={<Pill className="h-3 w-3" />}>
                            Medicine · no incentives
                          </Chip>
                        )}
                        {!!q?.discountCents && (
                          <Chip tone="green" wrap icon={<Tag className="h-3 w-3 shrink-0" />}>
                            −{zar(q.discountCents)} {q.promoId && promoName.get(q.promoId) ? `· ${promoName.get(q.promoId)}` : ""}
                          </Chip>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <Stepper value={l.qty} min={1} onChange={(v) => onQty(l.variantId, v)} label={`quantity of ${e.product.name}`} />
                        <button type="button" onClick={() => onRemove(l.variantId)} aria-label={`Remove ${e.product.name}`} className="grid h-12 w-12 place-items-center rounded-full text-ink-400 hover:bg-rose-500/10 hover:text-rose-400">
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {quote.suggestions.length > 0 && cart.lines.length > 0 && (
          <div className="mb-3 mt-1 space-y-2">
            <div className="eyebrow text-[0.62rem] text-oranje-400">Complete the deal</div>
            {quote.suggestions.slice(0, 3).map((s) => (
              <button
                key={s.promoId + s.message}
                type="button"
                onClick={() => onSuggestion(s)}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-oranje-500/10 px-3 py-2 text-left ring-1 ring-oranje-500/30 transition hover:bg-oranje-500/15"
              >
                <Gift className="h-5 w-5 shrink-0 text-oranje-400" />
                <span className="text-[0.85rem] leading-snug text-oranje-100">{s.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-ink-850 p-3">
        {codeOpen ? (
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onCode(code.trim() ? code.trim().toUpperCase() : null);
            }}
          >
            <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Promo code" aria-label="Promo code" className="h-12 font-mono uppercase" aria-invalid={!!quote.codeError && !!cart.code} />
            <PosButton type="submit" variant="secondary">
              Apply
            </PosButton>
            {cart.code && (
              <PosButton variant="ghost" onClick={() => (setCode(""), onCode(null))} aria-label="Remove promo code">
                <X className="h-4 w-4" />
              </PosButton>
            )}
          </form>
        ) : (
          <button type="button" onClick={() => setCodeOpen(true)} className="mb-1 inline-flex h-12 items-center gap-2 rounded-full px-2 text-[0.8rem] font-semibold text-ink-300 hover:text-white">
            <Tag className="h-4 w-4" /> Add promo code
          </button>
        )}
        {cart.code && quote.codeError && <p className="-mt-1 mb-2 text-[0.8rem] font-medium text-rose-400">{quote.codeError}</p>}

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-ink-300">
            <dt>
              Subtotal · {units} item{units === 1 ? "" : "s"}
            </dt>
            <dd className="tnum">{zar(quote.subtotalCents)}</dd>
          </div>
          {quote.memberSavingsCents > 0 && (
            <div className="flex justify-between text-oranje-300" data-testid="rewards-savings">
              <dt>Rewards savings (in prices)</dt>
              <dd className="tnum">{zar(quote.memberSavingsCents)}</dd>
            </div>
          )}
          {quote.discountCents > 0 && (
            <div className="flex justify-between text-[#7fd49a]">
              <dt>Discounts</dt>
              <dd className="tnum">−{zar(quote.discountCents)}</dd>
            </div>
          )}
          <div className="flex items-end justify-between pt-1">
            <dt className="font-display text-lg font-semibold text-white">Total</dt>
            <dd className="font-display text-3xl font-semibold tracking-tight text-white tnum" data-testid="cart-total">
              {zar(quote.totalCents)}
            </dd>
          </div>
          {cart.lines.length > 0 && (
            <div className="flex justify-between text-xs text-ink-400">
              <dt>{quote.vatCents ? "Includes VAT (15%)" : "No VAT charged — store not VAT-registered"}</dt>
              <dd className="tnum">{quote.vatCents ? zar(quote.vatCents) : ""}</dd>
            </div>
          )}
          {cart.customer && quote.pointsEstimate > 0 && (
            <div className="flex justify-between text-xs text-oranje-300">
              <dt>Earns{quote.pointsMultiplier > 1 ? ` (${quote.pointsMultiplier}× points)` : ""}</dt>
              <dd className="tnum">{fmtPoints(quote.pointsEstimate)}</dd>
            </div>
          )}
          {hasLicensed && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-ink-400">
              <ShieldAlert className="h-3.5 w-3.5 text-oranje-400" /> Licensed medicine: patient authorisation + dispenser at payment
            </div>
          )}
        </dl>

        <div className="mt-3 flex gap-2">
          {cart.lines.length > 0 && (
            <PosButton variant="outline" size="xl" className="px-5" onClick={onClear} aria-label="Clear the basket">
              <Trash2 className="h-5 w-5" />
            </PosButton>
          )}
          <PosButton variant="primary" size="xl" className="flex-1" onClick={onPay} disabled={!!payDisabledReason || checking} busy={checking} data-testid="pay">
            {payDisabledReason ?? (
              <>
                Charge {zar(quote.totalCents)}
                <kbd className="hidden rounded-md border border-ink-950/30 px-1.5 text-[0.65rem] font-bold lg:inline">F9</kbd>
              </>
            )}
          </PosButton>
        </div>
        {priced === "local" && cart.lines.length > 0 && <p className="mt-2 text-center text-[0.7rem] text-ink-500">Prices from this till&apos;s offline price book</p>}
      </div>
    </div>
  );
}

