import Link from "next/link";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { replenishmentPlan } from "@/server/replenishment";
import { fmtDate } from "@/lib/format";
import { placeWholesaleOrder } from "../actions";
import { OrderBuilder } from "./order-builder";
import { PageHeader, Notice } from "@/components/ui/page";
import { BackLink, ReadOnlyNote } from "@/components/store/ui";

export const metadata = { title: "New stock order" };

export default async function NewOrderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const [plan, open] = await Promise.all([
    replenishmentPlan(store.id),
    db.stockOrder.findMany({ where: { buyerId: store.id, kind: "WHOLESALE", status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "SHIPPED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, createdAt: true } }),
  ]);
  const dcName = store.dc?.name ?? "your distribution centre";

  return (
    <>
      <BackLink href={`/store/${store.code}/purchasing`}>Purchasing</BackLink>
      <PageHeader
        overline={`Buying · ${store.name}`}
        title="New order"
        description={`Suggested quantities top each item up to par or 17 days of sales, allowing for stock already on order. Wholesale prices are ex VAT; ${dcName} confirms and ships.`}
      />
      {!store.dcId && <Notice tone="warn" className="mb-4">Your store isn&apos;t linked to a distribution centre yet — ask HQ to set one up before ordering.</Notice>}
      {open.length > 0 && (
        <Notice tone="info" className="mb-4" title="Already on order">
          {open.map((o, i) => (
            <span key={o.id}>
              {i > 0 && " · "}
              <Link href={`/store/${store.code}/purchasing/${o.id}`} className="font-semibold underline">
                {o.number}
              </Link>{" "}
              ({o.status.toLowerCase()}, {fmtDate(o.createdAt)})
            </span>
          ))}{" "}
          — its quantities are already counted in the suggestions below.
        </Notice>
      )}
      {canManage ? (
        <OrderBuilder
          action={placeWholesaleOrder.bind(null, store.code)}
          dcName={dcName}
          rows={plan.map((r) => ({
            variantId: r.variantId,
            sku: r.sku,
            name: r.name,
            category: r.category,
            available: r.available,
            onOrder: r.onOrder,
            reorderPoint: r.reorderPoint,
            parLevel: r.parLevel,
            avgDaily: r.avgDaily,
            cover: Number.isFinite(r.cover) ? r.cover : null,
            wholesaleCents: r.wholesaleCents,
            suggested: r.suggested,
          }))}
        />
      ) : (
        <ReadOnlyNote>Only managers and owners can place orders.</ReadOnlyNote>
      )}
    </>
  );
}
