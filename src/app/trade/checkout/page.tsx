// Trade checkout (server): the cart quoted at the DC, both sets of totals (courier with its fee or free threshold;
// click & collect with handling), the credit decision for each, the account's addresses and the first page of
// click & collect stores — handed to the client form.
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { getSettings } from "@/server/settings";
import { collectStoresFor } from "@/server/trade/orders";
import { openOnAccountCents, tradeBalance } from "@/server/trade/ledger";
import { Container } from "@/components/shop/ui";
import { TradeCheckoutForm, type CheckoutLine } from "@/components/trade/checkout-form";
import { addressLineOf, creditDecision, tradeDelivery, tradeHandling, tradeLine, tradeTotals, validateTradeBasket } from "@/lib/trade";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { cartQuote, orderingProblem, requireBuyer } from "../_lib/context";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function TradeCheckoutPage() {
  const buyer = await requireBuyer("/trade/checkout");
  const account = buyer.account;
  const [settings, cart] = await Promise.all([getSettings(), cartQuote(account)]);
  const q = cart.quote;
  const store = cart.store;
  if (!q?.lines.length || !store) redirect("/trade/cart");
  const t = settings.trade;
  const lines: CheckoutLine[] = q.lines.map((l) => ({ variantId: l.variantId, name: l.name, sku: l.sku, qty: l.qty, caseQty: l.caseQty, unitCents: l.exCents / l.qty, exCents: l.exCents, vatCents: l.vatCents }));
  // The cart page explains case and minimum-order problems; checkout only opens on a basket that can be placed.
  if (validateTradeBasket(lines.map((l) => ({ name: l.name, qty: l.qty, unitCents: l.unitCents, caseQty: l.caseQty })), { minOrderCents: t.minOrderCents }).length) redirect("/trade/cart");

  const lineTotals = lines.map((l) => tradeLine({ unitCents: l.unitCents, qty: l.qty }));
  const totals = {
    COURIER: tradeTotals(lineTotals, { deliveryCents: tradeDelivery(q.exCents ?? 0, t) }),
    COLLECT: tradeTotals(lineTotals, { handlingCents: tradeHandling(t) }),
  };
  const [balanceCents, openOrdersCents, stores] = await Promise.all([
    tradeBalance(account.id),
    openOnAccountCents(account.id),
    collectStoresFor(q.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, regClass: l.regClass })), account, { page: 1, pageSize: 8 }),
  ]);
  const decide = (orderInclCents: number) => creditDecision({ terms: account.terms, status: account.status, creditLimitCents: account.creditLimitCents, balanceCents, openOrdersCents, orderInclCents });
  const credit = { COURIER: decide(totals.COURIER.totalCents), COLLECT: decide(totals.COLLECT.totalCents) };
  const provinceName = (p: string | null | undefined) => (p && p in PROVINCES ? PROVINCES[p as ProvinceCode] : p ?? "");
  const billing = `${addressLineOf(account)}, ${provinceName(account.province)}`;
  const delivery = account.deliveryLine ? `${addressLineOf({ addressLine: account.deliveryLine, suburb: account.deliverySuburb, city: account.deliveryCity, postalCode: account.deliveryPostalCode })}, ${provinceName(account.deliveryProvince)}` : null;

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="mb-8">
        <Link href="/trade/cart" className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back to the cart
        </Link>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Checkout</h1>
        <p className="mt-2 text-ink-400">
          {account.name} · prices ex VAT, VAT per line · {lines.length} {lines.length === 1 ? "line" : "lines"}
        </p>
      </div>
      <TradeCheckoutForm
        lines={lines}
        totals={totals}
        credit={credit}
        account={{ terms: account.terms, creditLimitCents: account.creditLimitCents, paymentDays: account.paymentDays, province: account.province, billing, delivery, balanceCents }}
        stores={stores}
        provinces={Object.entries(PROVINCES)}
        ordering={await orderingProblem(account)}
        fees={{ deliveryCents: t.deliveryCents, freeDeliveryOverCents: t.freeDeliveryOverCents, handlingCents: t.collectHandlingCents, eftHoldDays: t.eftHoldDays, minOrderCents: t.minOrderCents }}
        dcName={store.name}
      />
    </Container>
  );
}
