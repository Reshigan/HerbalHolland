import Link from "next/link";
import { ArrowLeftRight, Store as StoreIcon, TriangleAlert } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db, Prisma } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import { stockRows } from "@/server/store/inventory";
import { stockOrderList } from "@/server/store/purchasing";
import { hrefWith, sp1 } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDate, timeAgo } from "@/lib/format";
import { buyListing, closeListing, createListing } from "./actions";
import { sellerAct } from "../purchasing/actions";
import { ListingForm } from "./listing-form";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ReadOnlyNote, SearchForm } from "@/components/store/ui";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";

export const metadata = { title: "Network trading" };
const PAGE_SIZE = 20;
type SP = Record<string, string | string[] | undefined>;

export default async function NetworkPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/network`;
  const tab = ["mine", "orders"].includes(sp1(sp.tab)) ? sp1(sp.tab) : "market";
  const page = pageParam(sp.page);
  const q = sp1(sp.q).trim();

  const [marketCount, myActive, toAction] = await Promise.all([
    db.listing.count({ where: { active: true, qty: { gt: 0 }, storeId: { not: store.id }, store: { status: "ACTIVE", kind: "RETAIL" } } }),
    db.listing.count({ where: { storeId: store.id, active: true } }),
    db.stockOrder.count({ where: { sellerId: store.id, kind: "NETWORK", status: { in: ["SUBMITTED", "APPROVED"] } } }),
  ]);
  const tabHref = (t: string) => hrefWith(path, {}, { tab: t === "market" ? null : t });

  return (
    <>
      <PageHeader
        overline={`Buying · ${store.name}`}
        title="Network trading"
        description="Buy surplus stock from other Herbal Holland stores, and list your own overstock. Prices are per unit ex VAT; HQ clears every trade on the monthly franchise statement. Batches travel with the stock, so traceability is kept."
      />
      <Card>
        <TabLinks
          className="px-4"
          current={tabHref(tab)}
          tabs={[
            { href: tabHref("market"), label: "Marketplace", count: marketCount },
            { href: tabHref("mine"), label: "My listings", count: myActive },
            { href: tabHref("orders"), label: "Orders to fulfil", count: toAction },
          ]}
        />
        {tab === "market" && <Marketplace store={store} canManage={canManage} q={q} page={page} sp={sp} path={path} />}
        {tab === "mine" && <MyListings store={store} canManage={canManage} />}
        {tab === "orders" && <Fulfil store={store} canManage={canManage} page={page} sp={sp} path={path} />}
      </Card>
    </>
  );
}

type StoreCtx = Awaited<ReturnType<typeof storeForUser>>;

async function Marketplace({ store, canManage, q, page, sp, path }: { store: StoreCtx; canManage: boolean; q: string; page: number; sp: SP; path: string }) {
  const like = `%${q}%`;
  const filter = q ? Prisma.sql`AND (p.name LIKE ${like} OR v.sku LIKE ${like} OR v.name LIKE ${like} OR s.name LIKE ${like})` : Prisma.empty;
  const [ids, [{ n }]] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM "Listing" l
      JOIN "Store" s ON s.id = l."storeId" JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
      WHERE l.active AND l.qty > 0 AND l."storeId" <> ${store.id} AND s.status = 'ACTIVE' AND s.kind = 'RETAIL' ${filter}
      ORDER BY (s."regionId" = ${store.regionId}) DESC, l."createdAt" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    db.$queryRaw<{ n: number }[]>`
      SELECT cast(COUNT(*) AS real) AS n FROM "Listing" l
      JOIN "Store" s ON s.id = l."storeId" JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId"
      WHERE l.active AND l.qty > 0 AND l."storeId" <> ${store.id} AND s.status = 'ACTIVE' AND s.kind = 'RETAIL' ${filter}`,
  ]);
  const listings = await db.listing.findMany({
    where: { id: { in: ids.map((x) => x.id) } },
    include: {
      store: { select: { name: true, city: true, regionId: true, region: { select: { name: true } } } },
      variant: { select: { id: true, sku: true, name: true, wholesaleCents: true, product: { select: { name: true } }, storeVariants: { where: { storeId: store.id }, select: { reorderPoint: true } } } },
    },
  });
  const order = new Map(ids.map((x, i) => [x.id, i]));
  listings.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const mine = await availability([store.id], listings.map((l) => l.variantId));

  return (
    <>
      <div className="border-b border-ink-100 p-4 sm:px-5">
        <SearchForm path={path} q={q} placeholder="Search product, SKU or store" />
      </div>
      {listings.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="h-5 w-5" />} title={q ? "No listings match" : "Nothing listed right now"}>
          When stores list surplus stock it appears here, stores in {store.region.name} first.
        </EmptyState>
      ) : (
        <Table stickyFirst>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>From</Th>
              <Th align="right">Units</Th>
              <Th align="right">Asking ex VAT</Th>
              <Th align="right">vs wholesale</Th>
              <Th align="right">You have</Th>
              {canManage && <Th><span className="sr-only">Buy</span></Th>}
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => {
              const saving = l.variant.wholesaleCents ? 1 - l.unitCostCents / l.variant.wholesaleCents : 0;
              const have = mine.get(availKey(store.id, l.variantId))?.available ?? 0;
              const rp = l.variant.storeVariants[0]?.reorderPoint;
              return (
                <Tr key={l.id}>
                  <Td className="min-w-48">
                    <div className="font-medium text-ink-900">
                      {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                    </div>
                    <div className="font-mono text-xs text-ink-500">{l.variant.sku}</div>
                    {l.note && <div className="mt-0.5 text-xs text-ink-500">“{l.note}”</div>}
                  </Td>
                  <Td className="min-w-40">
                    <div className="flex items-center gap-1.5 font-medium text-ink-850">
                      <StoreIcon className="h-3.5 w-3.5 text-ink-400" aria-hidden /> {l.store.name}
                    </div>
                    <div className="text-xs text-ink-500">
                      {l.store.city} · listed {timeAgo(l.createdAt)}
                    </div>
                    {l.store.regionId === store.regionId && <Badge tone="orange">Your region</Badge>}
                  </Td>
                  <Td align="right" className="font-semibold text-ink-900">{l.qty}</Td>
                  <Td align="right" className="font-semibold text-ink-900">{zar(l.unitCostCents)}</Td>
                  <Td align="right">
                    {saving > 0.001 ? <span className="font-semibold text-leaf-700">{(saving * 100).toFixed(0)}% below</span> : saving < -0.001 ? <span className="text-amber-700">{(-saving * 100).toFixed(0)}% above</span> : <span className="text-ink-500">at wholesale</span>}
                    <div className="text-xs text-ink-500">{zar(l.variant.wholesaleCents)}</div>
                  </Td>
                  <Td align="right" className={rp != null && have <= rp ? "font-semibold text-amber-700" : "text-ink-700"}>
                    {have}
                    {rp == null ? <div className="text-xs font-normal text-ink-500">not ranged</div> : have <= rp && <div className="text-xs font-normal">below reorder</div>}
                  </Td>
                  {canManage && (
                    <Td className="min-w-44">
                      <ActionForm action={buyListing.bind(null, store.code, l.id)} notices="bottom" className="relative flex flex-col items-end">
                        <div className="flex items-center gap-2">
                          <label className="sr-only" htmlFor={`buy-${l.id}`}>Units to buy</label>
                          <input
                            id={`buy-${l.id}`}
                            name="qty"
                            type="number"
                            min={1}
                            max={l.qty}
                            defaultValue={l.qty}
                            className="tnum h-9 w-16 rounded-xl border border-ink-200 bg-white text-center text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
                          />
                          <SubmitButton size="sm" pendingLabel="…">Buy</SubmitButton>
                        </div>
                        <FieldError name="qty" />
                      </ActionForm>
                    </Td>
                  )}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <div className="border-t border-ink-100">
        <Pagination page={page} pageSize={PAGE_SIZE} total={n} href={(p) => hrefWith(path, sp, { page: p })} />
      </div>
    </>
  );
}

async function MyListings({ store, canManage }: { store: StoreCtx; canManage: boolean }) {
  const [listings, rows] = await Promise.all([
    db.listing.findMany({
      where: { storeId: store.id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { variant: { select: { sku: true, name: true, wholesaleCents: true, product: { select: { name: true } } } } },
    }),
    stockRows(store.id),
  ]);
  const by = new Map(rows.map((r) => [r.variantId, r]));
  const listable = rows
    .filter((r) => r.available > 0 && r.ranged)
    .sort((a, b) => b.overUnits - a.overUnits || a.name.localeCompare(b.name))
    .map((r) => ({ id: r.variantId, name: r.name, sku: r.sku, available: r.available, overUnits: r.overUnits, wholesaleCents: r.wholesaleCents, unitCostCents: r.onHand > 0 ? Math.round(r.valueCents / r.onHand) : r.wholesaleCents }));

  return (
    <div className="grid gap-0 xl:grid-cols-3">
      <div className="min-w-0 xl:col-span-2 xl:border-r xl:border-ink-100">
        {listings.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight className="h-5 w-5" />} title="You haven't listed anything">
            List overstock so other stores can buy it. It turns slow stock into cash and helps the network avoid out-of-stocks.
          </EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">Listed</Th>
                <Th align="right">Available now</Th>
                <Th align="right">Asking ex VAT</Th>
                <Th>Status</Th>
                {canManage && <Th><span className="sr-only">Close</span></Th>}
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const have = by.get(l.variantId)?.available ?? 0;
                const short = l.active && have < l.qty;
                return (
                  <Tr key={l.id} className={!l.active ? "text-ink-500" : undefined}>
                    <Td className="min-w-48">
                      <div className="font-medium text-ink-900">
                        {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                      </div>
                      <div className="text-xs text-ink-500">
                        <span className="font-mono">{l.variant.sku}</span> · listed {fmtDate(l.createdAt)}
                      </div>
                    </Td>
                    <Td align="right" className="font-semibold">{l.qty}</Td>
                    <Td align="right" className={short ? "font-semibold text-amber-700" : undefined}>
                      {have}
                      {short && (
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap text-xs font-medium">
                          <TriangleAlert className="h-3 w-3" aria-hidden /> over-listed
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      {zar(l.unitCostCents)}
                      <div className="text-xs text-ink-500">wholesale {zar(l.variant.wholesaleCents)}</div>
                    </Td>
                    <Td>{l.active ? <Badge tone="green" dot>Live</Badge> : <Badge>{l.qty === 0 ? "Sold out" : "Closed"}</Badge>}</Td>
                    {canManage && (
                      <Td className="text-right">
                        {l.active && (
                          <ConfirmAction action={closeListing.bind(null, store.code, l.id)} label="Close" title="Close this listing?" confirmLabel="Close listing" variant="dark">
                            Other stores won&apos;t see it any more. Orders already placed aren&apos;t affected.
                          </ConfirmAction>
                        )}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
      <div className="border-t border-ink-100 xl:border-t-0">
        <CardHeader title="List stock" description="Items over target are at the top. Re-listing an item updates its live listing." />
        <CardBody>{canManage ? <ListingForm items={listable} action={createListing.bind(null, store.code)} /> : <ReadOnlyNote />}</CardBody>
      </div>
    </div>
  );
}

async function Fulfil({ store, canManage, page, sp, path }: { store: StoreCtx; canManage: boolean; page: number; sp: SP; path: string }) {
  const { total, rows } = await stockOrderList({ sellerId: store.id, kind: "NETWORK" }, page, PAGE_SIZE);
  if (!rows.length)
    return (
      <EmptyState icon={<ArrowLeftRight className="h-5 w-5" />} title="No orders from other stores yet" action={<ButtonLink href={hrefWith(path, {}, { tab: "mine" })} size="sm" variant="outline">List some stock</ButtonLink>}>
        When a store buys from one of your listings, the order lands here for you to accept and ship.
      </EmptyState>
    );
  return (
    <>
      <Table stickyFirst>
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Buyer</Th>
            <Th align="right">Units</Th>
            <Th align="right">Value ex VAT</Th>
            <Th>Status</Th>
            <Th><span className="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <Tr key={o.id}>
              <Td>
                <Link href={`/store/${store.code}/purchasing/${o.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{o.number}</Link>
                <div className="text-xs text-ink-500">{timeAgo(o.createdAt)}</div>
              </Td>
              <Td className="font-medium text-ink-850">{o.buyer.name}</Td>
              <Td align="right">{o.lines.reduce((s, l) => s + l.qty, 0)}</Td>
              <Td align="right">{zar(o.subtotalCents)}</Td>
              <Td><StatusBadge status={o.status} /></Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  {canManage && o.status === "SUBMITTED" && <ActionButton action={sellerAct.bind(null, store.code, o.id, "approve")} variant="primary">Accept</ActionButton>}
                  {o.status === "APPROVED" && canManage ? (
                    <ButtonLink href={`/store/${store.code}/purchasing/${o.id}`} size="sm">Ship →</ButtonLink>
                  ) : (
                    <ButtonLink href={`/store/${store.code}/purchasing/${o.id}`} size="sm" variant="ghost">Open</ButtonLink>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <div className="border-t border-ink-100">
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
      </div>
    </>
  );
}
