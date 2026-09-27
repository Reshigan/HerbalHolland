"use client";
// The basket: customer card (tier, Founding Member, My Deals, welcome gift), lines (qty
// steppers, price-rule labels, promotion and My Deals discounts, drop limits), "complete
// the deal" suggestions, promo code, totals and the Pay button.
import { useEffect, useRef, useState } from "react";
import { Award, BadgeCheck, Gem, Gift, IdCard, Pill, Plus, ScanLine, ShieldAlert, ShieldCheck, Sparkles, Stethoscope, Tag, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { fmtDate, fmtDay } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { Chip, PosButton, TIER_CHIP, tierName, Stepper, TextInput } from "../ui";
import type { BootDrop, BootProduct, BootVariant, QuoteDTO, CustomerDetail } from "@/server/pos/types";
import type { Cart } from "../lib/storage";

export type VariantIndex = Map<string, { product: BootProduct; variant: BootVariant }>;

/** A first-time member's welcome gift, ready to add in one tap. */
export type WelcomeGift = { promoId: string; label: string; variantId: string };

function ruleTone(rule: string): "amber" | "blue" | "violet" {
  if (rule.startsWith("Near-expiry")) return "amber";
  if (/\(\d+\+\)$/.test(rule)) return "blue";
  return "violet";
}

export const foundingLabel = (n: number) => `Founding #${String(n).padStart(4, "0")}`;

/** "12 Sep" for the last ten months or so, "12 Sep 2025" before that (never ambiguous). */
export const visitDate = (iso: string) => (Date.now() - new Date(iso).getTime() < 300 * 86_400_000 ? fmtDay(iso) : fmtDate(iso));

/** "Drop · limit 2" — plus when it opens, for a drop that hasn't started yet. */
export function DropChip({ drop, detail, className }: { drop: BootDrop; detail?: boolean; className?: string }) {
  const upcoming = new Date(drop.startsAt) > new Date();
  return (
    <Chip tone="violet" className={className} icon={<Gem className="h-3 w-3" />}>
      Drop · limit {drop.perMemberLimit}
      {detail && upcoming && ` · opens ${fmtDay(drop.startsAt)}`}
    </Chip>
  );
}

export function WelcomeGiftButton({ gift, onAdd, className }: { gift: WelcomeGift; onAdd: (g: WelcomeGift) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(gift)}
      className={cn("flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-brand-500/15 px-3 py-2 text-left ring-1 ring-brand-500/50 transition hover:bg-brand-500/25", className)}
      data-testid="welcome-gift"
    >
      <Gift className="h-5 w-5 shrink-0 text-brand-400" />
      <span className="min-w-0 flex-1 text-[0.85rem] font-semibold leading-snug text-brand-100">{gift.label}</span>
      <Plus className="h-4 w-4 shrink-0 text-brand-300" aria-hidden />
    </button>
  );
}

export function CustomerCard({
  customer,
  ageCheck,
  joinSavingsCents = 0,
  online = true,
  usedOffers = [],
  welcome,
  onAddGift,
  onFind,
  onNew,
  onDetach,
  onScan,
}: {
  customer: CustomerDetail | null;
  ageCheck: Cart["ageCheck"];
  joinSavingsCents?: number;
  online?: boolean;
  usedOffers?: string[]; // My Deals applied to the current basket (by name)
  welcome?: WelcomeGift | null;
  onAddGift?: (g: WelcomeGift) => void;
  onFind: () => void;
  onNew: () => void;
  onDetach: () => void;
  onScan?: () => void;
}) {
  if (!customer)
    return (
      <div className="rounded-2xl bg-ink-900 p-3 ring-1 ring-ink-800">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-300">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-white">Walk-in</div>
            <div className="text-xs text-ink-400">{ageCheck ? `Age checked at the counter (${ageCheck === "ID_NUMBER" ? "SA ID number" : "ID sighted"})` : "Members save instantly and earn points"}</div>
          </div>
        </div>
        {joinSavingsCents > 0 && (
          <button type="button" onClick={onFind} className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-brand-500/15 px-3 py-2 text-left ring-1 ring-brand-500/40 transition hover:bg-brand-500/20" data-testid="join-prompt">
            <Sparkles className="h-5 w-5 shrink-0 text-brand-400" />
            <span className="text-[0.85rem] leading-snug text-brand-100">
              <b className="text-brand-300">Members save {zar(joinSavingsCents)}</b> on this basket — add or sign up (free)
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
            <ScanLine className="h-4 w-4" /> Scan member card or event ticket
          </button>
        )}
      </div>
    );
  const p = customer.patient;
  const offers = customer.offers ?? []; // carts cached before My Deals have none
  return (
    <div className="rounded-2xl bg-ink-900 p-3 ring-1 ring-brand-500/30" data-testid="customer-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500 font-display text-sm font-bold text-ink-950">
          {(customer.firstName[0] ?? "") + (customer.lastName?.[0] ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-white">
              {customer.firstName} {customer.lastName}
            </span>
            <Chip tone={TIER_CHIP[customer.tier] ?? "neutral"}>{tierName(customer.tier)}</Chip>
            {customer.foundingNo != null && (
              <Chip tone="orange" icon={<Award className="h-3 w-3" />}>
                <span data-testid="founding-badge">{foundingLabel(customer.foundingNo)}</span>
              </Chip>
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-400">
            {customer.memberNo} · {customer.phone}
          </div>
          {customer.visitsHere != null && (
            <div className="text-xs text-ink-400" data-testid="visits-here">
              Visits here {customer.visitsHere}
              {customer.lastVisitHere && ` · Last visit here ${visitDate(customer.lastVisitHere)}`}
            </div>
          )}
        </div>
        <button type="button" onClick={onDetach} aria-label="Remove member from sale" className="-mr-2 -mt-2 grid h-12 w-12 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white">
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
        {customer.tierFloor && (
          <Chip tone="neutral" icon={<ShieldCheck className="h-3 w-3" />}>
            <span data-testid="tier-floor">
              {tierName(customer.tierFloor.tier)} or higher until {fmtDate(customer.tierFloor.until)}
            </span>
          </Chip>
        )}
      </div>
      {p && (
        <div className="mt-2 rounded-xl bg-ink-850 px-3 py-2 text-xs leading-relaxed text-ink-300">
          <span className="font-semibold text-ink-100">Authorisation {p.authNumber}</span> · {p.prescriber} ({p.prescriberRegNo}) · limit {p.monthlyLimitGrams}g / 30 days
        </div>
      )}
      {offers.length > 0 && (
        <div className="mt-2 rounded-xl bg-ink-850 px-3 py-2" data-testid="card-deals">
          <div className="eyebrow text-[0.62rem] text-brand-400">Deals on this card</div>
          <ul className="mt-1 space-y-1">
            {offers.map((o) => (
              <li key={o.id} className="flex items-start gap-2 text-[0.82rem] leading-snug">
                <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                <span className="min-w-0 flex-1 text-ink-100">
                  {o.title}
                  <span className={usedOffers.includes(o.title) ? "font-semibold text-[#7fd49a]" : "text-ink-400"}>
                    {" · "}
                    {usedOffers.includes(o.title) ? "applied" : online ? "auto-applies" : "online only"}
                  </span>
                </span>
                <span className="shrink-0 text-[0.7rem] text-ink-500">ends {fmtDay(o.endsAt)}</span>
              </li>
            ))}
          </ul>
          {!online && <p className="mt-1 text-[0.7rem] leading-snug text-ink-400">My Deals need a connection — they aren&apos;t applied to offline sales.</p>}
        </div>
      )}
      {welcome && onAddGift && <WelcomeGiftButton gift={welcome} onAdd={onAddGift} className="mt-2" />}
    </div>
  );
}

export function CartPanel({
  cart,
  index,
  quote,
  priced,
  licensedClasses,
  vatRegistered,
  drops,
  hideSuggestions = [],
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
  vatRegistered: boolean;
  drops: Map<string, BootDrop>;
  hideSuggestions?: string[]; // promo ids shown elsewhere (the welcome gift)
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
  const offerCents = quote.offerCents ?? 0;
  const suggestions = quote.suggestions.filter((s) => !hideSuggestions.includes(s.promoId));

  // A new line scrolls into view (the member card above can be tall) — again once its price lands and it grows.
  const scroller = useRef<HTMLDivElement>(null);
  const count = cart.lines.length;
  const seen = useRef(count);
  const addedAt = useRef(0);
  useEffect(() => {
    if (count > seen.current) addedAt.current = Date.now();
    seen.current = count;
    if (Date.now() - addedAt.current < 3000) scroller.current?.querySelector("[data-testid=cart-line]:last-child")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [count, quote]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The member card scrolls with the lines, so a member's deals never squeeze the basket; totals stay put. */}
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3">
        <div className="shrink-0 pb-2 pt-3">{customerCard}</div>
        {cart.lines.length === 0 ? (
          <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-800 px-6 text-center text-ink-400">
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
              const drop = drops.get(l.variantId);
              const offer = q?.offerCents ?? 0;
              const deal = (q?.discountCents ?? 0) - offer;
              const dealName = q?.promoId ? promoName.get(q.promoId) : undefined;
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
                        {drop && <DropChip drop={drop} detail />}
                        {licensed && (
                          <Chip tone="orange" icon={<Pill className="h-3 w-3" />}>
                            Medicine · no incentives
                          </Chip>
                        )}
                        {offer > 0 && (
                          <Chip tone="orange" wrap icon={<Tag className="h-3 w-3 shrink-0" />}>
                            My Deals −{zar(offer)}
                            {q?.offerName && q.offerName !== "My Deals" ? ` · ${q.offerName}` : ""}
                          </Chip>
                        )}
                        {deal > 0 && (
                          <Chip tone="green" wrap icon={<Tag className="h-3 w-3 shrink-0" />}>
                            −{zar(deal)} {dealName && dealName !== q?.offerName ? `· ${dealName}` : ""}
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

        {suggestions.length > 0 && cart.lines.length > 0 && (
          <div className="mb-3 mt-1 space-y-2">
            <div className="eyebrow text-[0.62rem] text-brand-400">Complete the deal</div>
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s.promoId + s.message}
                type="button"
                onClick={() => onSuggestion(s)}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-brand-500/10 px-3 py-2 text-left ring-1 ring-brand-500/30 transition hover:bg-brand-500/15"
              >
                <Gift className="h-5 w-5 shrink-0 text-brand-400" />
                <span className="text-[0.85rem] leading-snug text-brand-100">{s.message}</span>
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
            <div className="flex justify-between text-brand-300" data-testid="rewards-savings">
              <dt>Rewards savings (in prices)</dt>
              <dd className="tnum">{zar(quote.memberSavingsCents)}</dd>
            </div>
          )}
          {quote.discountCents - offerCents > 0 && (
            <div className="flex justify-between text-[#7fd49a]">
              <dt>Discounts</dt>
              <dd className="tnum">−{zar(quote.discountCents - offerCents)}</dd>
            </div>
          )}
          {offerCents > 0 && (
            <div className="flex justify-between text-brand-300" data-testid="my-deals-total">
              <dt>My Deals</dt>
              <dd className="tnum">−{zar(offerCents)}</dd>
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
              <dt>{vatRegistered ? "Includes VAT (15%)" : "No VAT charged — store not VAT-registered"}</dt>
              <dd className="tnum">{vatRegistered ? zar(quote.vatCents) : ""}</dd>
            </div>
          )}
          {cart.customer && quote.pointsEstimate > 0 && (
            <div className="flex justify-between text-xs text-brand-300">
              <dt>Earns{quote.pointsMultiplier > 1 ? ` (${quote.pointsMultiplier}× points)` : ""}</dt>
              <dd className="tnum">{fmtPoints(quote.pointsEstimate)}</dd>
            </div>
          )}
          {hasLicensed && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-ink-400">
              <ShieldAlert className="h-3.5 w-3.5 text-brand-400" /> Licensed medicine: patient authorisation + dispenser at payment
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
