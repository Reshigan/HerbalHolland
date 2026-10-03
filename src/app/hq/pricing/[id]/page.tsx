import { notFound, redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { toLocalInput } from "@/server/hq/form";
import { TIERS } from "@/lib/loyalty-rules";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ConfirmAction } from "@/components/hq/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { listStatus } from "@/components/hq/tones";
import { deletePriceList, savePriceList } from "../actions";
import { PriceListForm, type PriceListValues } from "../price-list-form";

export const metadata = { title: "Price list" };

export default async function PriceListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  await scopedStoreIds(scope);
  const isNew = id === "new";
  const [list, variants, stores, regions] = await Promise.all([
    isNew ? null : db.priceList.findUnique({ where: { id }, include: { items: { orderBy: [{ minQty: "asc" }] } } }),
    db.variant.findMany({ where: { active: true }, include: { product: { select: { name: true, category: { select: { name: true, sortOrder: true } } } } }, orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { name: "asc" } }, { sortOrder: "asc" }] }),
    db.store.findMany({ where: { kind: "RETAIL", status: { not: "CLOSED" } }, select: { id: true, code: true, name: true, region: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!isNew && !list) notFound();
  const edit = can(user, "network");
  if (isNew && !edit) redirect("/hq/pricing");
  const values: PriceListValues = list
    ? {
        name: list.name, kind: list.kind, channel: list.channel ?? "", tiers: list.tiers, storeIds: list.storeIds, regionIds: list.regionIds,
        adjustPct: list.adjustPct?.toString() ?? "", startsAt: toLocalInput(list.startsAt), endsAt: toLocalInput(list.endsAt), priority: String(list.priority), active: list.active,
        items: list.items.map((i) => ({ variantId: i.variantId, price: (i.priceCents / 100).toFixed(2), minQty: String(i.minQty) })),
      }
    : { name: "", kind: "ZONE", channel: "", tiers: [], storeIds: [], regionIds: [], adjustPct: "", startsAt: "", endsAt: "", priority: "0", active: true, items: [] };
  const [status, tone] = list ? listStatus(list) : ["New", "neutral" as const];

  return (
    <>
      <BackLink href="/hq/pricing">Pricing</BackLink>
      <PageHeader
        overline="Price list"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {list?.name ?? "New price list"}
            {list && (
              <Badge tone={tone} dot>
                {status}
              </Badge>
            )}
          </span>
        }
        description={list ? `Created ${fmtDateTime(list.createdAt)} · ${list.items.length} item price${list.items.length === 1 ? "" : "s"}` : "Prices here layer on the national RRP. Franchisees' own shelf prices still win in their stores."}
        actions={
          list &&
          edit && (
            <ConfirmAction action={deletePriceList.bind(null, list.id)} label="Delete" title="Delete this price list?" confirmLabel="Delete price list" typeToConfirm="DELETE">
              <p>Prices fall back to the next matching list or RRP immediately. To pause it instead, untick Active.</p>
            </ConfirmAction>
          )
        }
      />
      {sp.saved && <Notice tone="success" className="mb-6">Price list created.</Notice>}
      {!edit && <ViewOnly className="mb-6">View only — network pricing is managed by the HQ team.</ViewOnly>}
      <PriceListForm
        action={savePriceList.bind(null, list?.id ?? null)}
        values={values}
        readOnly={!edit}
        tiers={TIERS.map((t) => ({ key: t.key, name: t.name }))}
        regions={regions}
        stores={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})`, hint: s.region.name }))}
        variants={variants.map((v) => ({ id: v.id, label: `${v.product.name} · ${v.name}`, rrpCents: v.priceCents, wholesaleCents: v.wholesaleCents, group: v.product.category.name }))}
      />
    </>
  );
}
