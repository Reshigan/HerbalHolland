import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { tradeAccountSummary } from "@/server/trade/accounts";
import { defaultDc } from "@/server/trade/orders";
import { tradeRange } from "@/server/pricing";
import { getSettings } from "@/server/settings";
import { addressLineOf } from "@/lib/trade";
import { zar } from "@/lib/money";
import { PageHeader, Notice } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { TradeAccountBadge, termsLabel } from "@/components/admin/trade-ui";
import { tradeScope } from "../../../scope";
import { placeOrderForAccount, searchCollectStores, searchRange } from "../../actions";
import { OrderBuilder } from "./order-builder";

export const metadata = { title: "Place a trade order" };

export default async function PlaceTradeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await tradeScope();
  if (!s.canEdit) redirect(`/hq/trade/accounts/${id}`);
  const summary = await tradeAccountSummary(id);
  if (!summary) notFound();
  const { account: a, availableCents } = summary;
  const settings = await getSettings();
  const dc = (a.dcId ? await db.store.findFirst({ where: { id: a.dcId, kind: "WAREHOUSE", status: { not: "CLOSED" } } }) : null) ?? (await defaultDc().catch(() => null));
  const initial = dc && a.status === "APPROVED" ? await tradeRange(dc.id, a, { pageSize: 24 }) : null;
  const t = settings.trade;

  return (
    <>
      <BackLink href={`/hq/trade/accounts/${a.id}`}>{a.name}</BackLink>
      <PageHeader
        overline={`Trade order · ${a.number}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Place an order for {a.name}
            <TradeAccountBadge status={a.status} />
          </span>
        }
        description={`${termsLabel(a)} · minimum order ${zar(t.minOrderCents)} ex VAT · a phone or email order captured on the account's behalf; the account gets the same emails as a portal order.`}
      />
      {a.status !== "APPROVED" ? (
        <Notice tone="warn" title="This account can't order right now">Only an approved account can place orders{a.status === "ON_HOLD" ? " — lift the hold first" : a.status === "PENDING" ? " — approve it first" : ""}.</Notice>
      ) : !dc ? (
        <Notice tone="danger" title="No distribution centre">Set up an active warehouse before placing trade orders.</Notice>
      ) : (
        <OrderBuilder
          accountId={a.id}
          account={{ name: a.name, terms: a.terms, availableCents, billingAddress: addressLineOf(a), deliveryAddress: a.deliveryLine ? addressLineOf({ addressLine: a.deliveryLine, suburb: a.deliverySuburb, city: a.deliveryCity, postalCode: a.deliveryPostalCode }) : null }}
          terms={{ minOrderCents: t.minOrderCents, deliveryCents: t.deliveryCents, freeDeliveryOverCents: t.freeDeliveryOverCents, collectHandlingCents: t.collectHandlingCents, eftHoldDays: t.eftHoldDays }}
          dcName={dc.name}
          initial={(initial?.rows ?? []).map((x) => ({ variantId: x.variantId, name: `${x.productName} · ${x.variantName}`, sku: x.sku, regClass: x.regClass, caseQty: x.caseQty, unitCents: x.unitCents, breaks: x.breaks, available: x.available, rrpCents: x.rrpCents }))}
          placeAction={placeOrderForAccount.bind(null, a.id)}
          searchAction={searchRange}
          storesAction={searchCollectStores}
        />
      )}
    </>
  );
}
