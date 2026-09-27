import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, IdCard, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { quote } from "@/server/pricing";
import { evaluateBasket } from "@/server/compliance";
import { deliveryFee, routingCandidates } from "@/server/orders";
import { CONSENT_WORDING } from "@/server/customers";
import { getCart, getPreferredStore, getPromoCode, getRetailStores } from "@/server/shop/context";
import { openState, parseHours } from "@/server/shop/hours";
import { redeemablePoints } from "@/server/shop/cart-codec";
import { tierMeta } from "@/server/shop/club";
import { CheckoutForm, type CollectStore, type FulfilOption } from "@/components/shop/checkout-form";
import { PhoneAuth } from "@/components/shop/phone-auth";
import { VerifyAge } from "@/components/shop/verify-age";
import { Callout, Container, Panel } from "@/components/shop/ui";
import { distanceKm } from "@/lib/routing";
import { PROVINCES } from "@/lib/sa";
import { zar } from "@/lib/money";
import { fmtPoints } from "@/lib/loyalty-rules";
import type { SellChannel } from "@/lib/compliance";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

const AGE_BLOCK = /^Age verification required/;

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const [items, code, customer, settings, store, stores] = await Promise.all([getCart(), getPromoCode(), getCustomer(), getSettings(), getPreferredStore(), getRetailStores()]);
  if (!items.length) redirect("/cart");
  const q = await quote({ channel: "ONLINE", items, code, customerId: customer?.id });
  if (!q.lines.length) redirect("/cart");
  const trading = stores.filter((s) => s.status === "ACTIVE");

  const header = (
    <div className="mb-8">
      <Link href="/cart" className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-white">
        <ChevronLeft className="h-4 w-4" /> Back to bag
      </Link>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Checkout</h1>
    </div>
  );

  if (!customer)
    return (
      <Container className="pt-10 sm:pt-14">
        {header}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
          <Panel className="p-6 sm:p-8">
            <PhoneAuth
              next="/checkout"
              stores={trading.map((s) => ({ id: s.id, name: s.name, city: s.city }))}
              defaultStoreId={store?.id}
              consentWording={CONSENT_WORDING}
              title="First, your mobile number"
              intro="Members check out in seconds. New to Herbal Holland? You'll join Rewards in one short step — and earn points on this order."
            />
          </Panel>
          <Summary lines={q.lines} total={q.totalCents} joinSavings={q.joinSavingsCents} />
        </div>
      </Container>
    );

  const compItems = q.lines.map((l) => ({ name: l.name, regClass: l.regClass, grams: l.grams, qty: l.qty, tobaccoRelated: l.tobaccoRelated }));
  const keys: SellChannel[] = ["COLLECT", "SAME_DAY", "COURIER"];
  const [comps, fees, cands, lastAddress] = await Promise.all([
    Promise.all(keys.map((channel) => evaluateBasket({ items: compItems, channel, customerId: customer.id, storeLicences: settings.compliance.licensedOnly }))),
    Promise.all(keys.map((f) => deliveryFee(f as "COLLECT", q.totalCents, customer.tier))),
    routingCandidates(q.lines.map((l) => l.variantId)),
    db.order.findFirst({ where: { customerId: customer.id, fulfilment: { not: "COLLECT" }, addressLine: { not: null } }, orderBy: { createdAt: "desc" }, select: { addressLine: true, suburb: true, city: true, province: true, postalCode: true } }),
  ]);
  const needsAge = comps.some((c) => c.blocks.some((b) => AGE_BLOCK.test(b)));
  const eligibleBase = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
  const options: FulfilOption[] = keys.map((k, i) => {
    const blocks = comps[i].blocks.filter((b) => !AGE_BLOCK.test(b));
    return {
      key: k as FulfilOption["key"],
      ok: blocks.length === 0,
      reason: /can't be sold via/.test(blocks[0] ?? "")
        ? k !== "COLLECT" && q.lines.some((l) => settings.compliance.licensedOnly.includes(l.regClass))
          ? "Medicines are collect-only"
          : k === "COLLECT" ? "Not available for collection" : "Not available for delivery"
        : blocks[0],
      feeCents: fees[i],
      maxPoints: redeemablePoints({ balance: customer.points, eligibleCents: eligibleBase + fees[i], maxPct: settings.loyalty.maxRedeemPct, min: settings.loyalty.minRedeem }),
    };
  });
  // A licensed-product problem (e.g. quantity headroom) applies to every channel — show it once, clearly.
  const shared = options.every((o) => !o.ok) ? comps[0].blocks.find((b) => !AGE_BLOCK.test(b)) ?? null : null;

  const required = settings.compliance.licensedOnly.filter((c) => q.lines.some((l) => l.regClass === c));
  const origin = store?.lat != null && store?.lng != null ? { lat: store.lat, lng: store.lng } : null;
  const byId = new Map(trading.map((s) => [s.id, s]));
  const collect: CollectStore[] = cands
    .filter((c) => c.kind === "RETAIL" && c.clickCollect && required.every((r) => c.licences?.includes(r)) && byId.has(c.id))
    .map((c) => {
      const s = byId.get(c.id)!;
      const missing = q.lines.filter((l) => (c.available[l.variantId] ?? 0) < l.qty).length;
      const o = openState(parseHours(s.hours));
      return { id: c.id, name: s.name, suburb: s.suburb, city: s.city, hasAll: missing === 0, missing, km: origin && c.lat != null && c.lng != null ? distanceKm(origin, { lat: c.lat, lng: c.lng }) : null, openLabel: o.label, open: o.open };
    })
    // The shopper's own store first (even if it's short, so they see why), then stores that have everything, nearest first.
    .sort((a, b) => Number(b.id === store?.id) - Number(a.id === store?.id) || Number(b.hasAll) - Number(a.hasAll) || (a.km ?? 1e9) - (b.km ?? 1e9) || a.city.localeCompare(b.city));
  const defaultStore = collect.find((s) => s.id === store?.id && s.hasAll) ?? collect.find((s) => s.id === customer.homeStoreId && s.hasAll) ?? collect.find((s) => s.hasAll) ?? null;
  const sameDayCities = [...new Set(trading.filter((s) => s.sameDay).map((s) => s.city))];

  return (
    <Container className="pt-10 sm:pt-14">
      {header}
      <p className="-mt-4 mb-8 text-sm text-ink-400">
        Signed in as <strong className="text-ink-100">{customer.firstName}</strong> · {customer.memberNo}
      </p>
      {welcome && (
        <Callout tone="success" icon={<Sparkles className="h-5 w-5" />} title={`Welcome to Herbal Holland Rewards, ${customer.firstName}!`} className="mb-8">
          Your {tierMeta(customer.tier).name} member prices are already applied below, and {fmtPoints(settings.loyalty.signupBonus)} are waiting in your account.
        </Callout>
      )}
      {needsAge && (
        <Callout tone="warn" icon={<IdCard className="h-5 w-5" />} title="Confirm your age to order online" className="mb-8">
          <p>Your bag has age-restricted items. Add your SA ID number and we&apos;ll verify you instantly — or show your ID or passport at any store and our team will verify you there.</p>
          <VerifyAge className="mt-4 max-w-md" />
        </Callout>
      )}
      {shared && !needsAge && (
        <Callout tone="warn" icon={<ShieldCheck className="h-5 w-5" />} title="We can't take this order yet" className="mb-8">
          {shared}. Update your bag, or speak to our pharmacist in store.
        </Callout>
      )}
      <CheckoutForm
        options={options}
        stores={collect}
        defaultStoreId={defaultStore?.id ?? null}
        lines={q.lines.map((l) => ({ variantId: l.variantId, name: l.productName, variant: l.variantName, qty: l.qty, totalCents: l.totalCents }))}
        subtotalCents={q.subtotalCents}
        discounts={q.applied.filter((a) => a.discountCents > 0).map((a) => ({ name: a.name, cents: a.discountCents }))}
        totalCents={q.totalCents}
        vatCents={q.vatCents}
        memberSavingsCents={q.memberSavingsCents}
        tierName={tierMeta(customer.tier).name}
        balance={customer.points}
        minRedeem={settings.loyalty.minRedeem}
        address={lastAddress ? { addressLine: lastAddress.addressLine ?? "", suburb: lastAddress.suburb ?? "", city: lastAddress.city ?? "", province: lastAddress.province ?? "", postalCode: lastAddress.postalCode ?? "" } : null}
        provinces={Object.entries(PROVINCES)}
        sameDayNote={`order by ${settings.ecommerce.sameDayCutoffHour}:00 in ${sameDayCities.join(", ")}. Free for Bloom and Harvest members.`}
        courierNote={`2–4 working days nationwide, free over ${zar(settings.ecommerce.freeDeliveryOverCents)}.`}
        blocked={needsAge ? "Verify your age above to place this order." : shared}
      />
    </Container>
  );
}

function Summary({ lines, total, joinSavings }: { lines: { variantId: string; productName: string; variantName: string; qty: number; totalCents: number }[]; total: number; joinSavings: number }) {
  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <Panel className="p-5">
        <h2 className="font-display text-lg font-semibold text-white">Your bag</h2>
        <ul className="mt-4 space-y-2.5 text-sm">
          {lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-3">
              <span className="min-w-0 text-ink-300">
                <span className="tnum text-ink-500">{l.qty}×</span> {l.productName} <span className="text-ink-500">· {l.variantName}</span>
              </span>
              <span className="tnum shrink-0 text-ink-100">{zar(l.totalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-ink-800 pt-3">
          <span className="font-semibold text-white">Total</span>
          <span className="tnum font-display text-2xl font-semibold text-white">{zar(total)}</span>
        </div>
        <p className="mt-1 text-xs text-ink-500">Before delivery and points · prices include VAT</p>
        {joinSavings > 0 && (
          <p className="mt-4 rounded-xl border border-oranje-500/35 bg-oranje-500/10 px-3 py-2.5 text-sm text-oranje-100">
            Join free in the next step and save <strong className="text-white">{zar(joinSavings)}</strong> on this order with your instant Rewards price.
          </p>
        )}
      </Panel>
    </aside>
  );
}
