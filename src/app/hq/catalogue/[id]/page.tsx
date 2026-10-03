import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { rangingSummary } from "@/server/hq/catalogue";
import { titleCase } from "@/server/hq/stores";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ProductArt } from "@/components/product/art";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { CLASS_TONE } from "@/components/hq/tones";
import { incentiveExcluded } from "@/lib/compliance";
import { saveProduct } from "../actions";
import { ProductForm, type ProductInput } from "../product-form";
import { VariantEditor } from "../variant-editor";
import { RangingTool } from "../ranging-tool";

export const metadata = { title: "Product" };

const FORMATS = ["FLAGSHIP", "STANDARD", "EXPRESS"] as const;

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const product = await db.product.findUnique({
    where: { id },
    include: { category: true, variants: { orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] } },
  });
  if (!product) notFound();
  const variantIds = product.variants.map((v) => v.id);
  const [categories, claimRows, settings, regions, batches, stock, ranging] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.$queryRaw<{ claim: string }[]>`SELECT DISTINCT unnest(claims) AS claim FROM "Product" ORDER BY 1 LIMIT 200`,
    getSettings(),
    db.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.batch.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds } }, _count: true }),
    db.stockLevel.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds } }, _sum: { onHand: true } }),
    rangingSummary(variantIds, ids),
  ]);
  const edit = can(user, "network");
  const input: ProductInput = {
    ...product,
    terpenes: Array.isArray(product.terpenes) ? (product.terpenes as { name: string; pct: number }[]) : [],
  };

  return (
    <>
      <BackLink href="/hq/catalogue">Catalogue</BackLink>
      <PageHeader
        overline={`${product.category.name} · ${product.line ? titleCase(product.line) : product.brand}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <ProductArt slug={product.slug} strain={product.strain} regClass={product.regClass} className="h-11 w-11 overflow-hidden rounded-xl" label="" />
            {product.name}
            <StatusBadge status={product.status} />
            <Badge tone={CLASS_TONE[product.regClass]}>{product.regClass}</Badge>
          </span>
        }
        description={product.tagline ?? undefined}
        actions={
          product.status === "ACTIVE" && (
            <ButtonLink href={`/p/${product.slug}`} variant="outline" target="_blank">
              View in shop <ExternalLink className="h-4 w-4" />
            </ButtonLink>
          )
        }
      />
      {sp.created && <Notice tone="success" className="mb-6" title="Product created">Add its variants below, then range them at stores. It stays out of the shop while in draft.</Notice>}
      {!edit && <ViewOnly className="mb-6">View only — the catalogue is managed by the HQ merchandising team.</ViewOnly>}

      <ProductForm action={saveProduct.bind(null, product.id)} product={input} categories={categories} claimLibrary={claimRows.map((c) => c.claim)} noIncentiveClasses={incentiveExcluded(settings.compliance)} readOnly={!edit} />

      <Card className="mt-6">
        <CardHeader
          title="Variants"
          description={`Sizes and SKUs. RRP is a recommendation — franchisees set their own shelf prices. Store margin guide: ${settings.pricing.minMarginPct}%.`}
        />
        <div className="mt-4 border-t border-ink-100">
          <VariantEditor
            productId={product.id}
            minMarginPct={settings.pricing.minMarginPct}
            readOnly={!edit}
            variants={product.variants.map((v) => ({
              id: v.id, sku: v.sku, barcode: v.barcode, name: v.name, grams: v.grams, priceCents: v.priceCents, wholesaleCents: v.wholesaleCents,
              costCents: v.costCents, podSku: v.podSku, active: v.active, caseQty: v.caseQty,
              batches: batches.find((b) => b.variantId === v.id)?._count ?? 0,
              onHand: stock.find((s) => s.variantId === v.id)?._sum.onHand ?? 0,
            }))}
          />
        </div>
      </Card>

      {product.variants.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Ranging" description="Which stores carry each variant. Ranging drives replenishment and what the web shop can route to a store." />
          <Table stickyFirst className="relative mt-4">
            <thead>
              <tr>
                <Th>Variant</Th>
                {FORMATS.map((f) => (
                  <Th key={f} align="right">{titleCase(f)}</Th>
                ))}
                <Th align="right">All stores</Th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => {
                const r = ranging.byVariant.get(v.id) ?? {};
                const total = FORMATS.reduce((s, f) => s + (r[f] ?? 0), 0);
                const all = FORMATS.reduce((s, f) => s + (ranging.totals[f] ?? 0), 0);
                return (
                  <Tr key={v.id}>
                    <Td>
                      <span className="font-medium text-ink-900">{v.name}</span> <span className="font-mono text-xs text-ink-500">{v.sku}</span>
                      {!v.active && <Badge className="ml-2">Inactive</Badge>}
                    </Td>
                    {FORMATS.map((f) => (
                      <Td key={f} align="right" className={(r[f] ?? 0) < (ranging.totals[f] ?? 0) ? "text-ink-600" : "text-ink-900"}>
                        {r[f] ?? 0}
                        <span className="text-ink-500"> / {ranging.totals[f] ?? 0}</span>
                      </Td>
                    ))}
                    <Td align="right" className="font-semibold text-ink-900">
                      {total}
                      <span className="font-normal text-ink-500"> / {all}</span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {edit && (
            <CardBody className="border-t border-ink-100">
              <RangingTool productId={product.id} variants={product.variants.map((v) => ({ id: v.id, label: `${v.name} · ${v.sku}` }))} regions={regions} />
            </CardBody>
          )}
          {!edit && (
            <CardBody className="border-t border-ink-100 text-sm text-ink-500">
              Counts cover the stores in your region. <Link href="/hq/stores" className="font-medium text-brand-700 hover:underline">Store list →</Link>
            </CardBody>
          )}
        </Card>
      )}
    </>
  );
}
