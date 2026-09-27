import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Scale, Truck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { getSettings } from "@/server/settings";
import { ledger, reservingOrders, stockRows, variantHeader, variantLots, velocity } from "@/server/store/inventory";
import { MOVEMENT_LABEL, ADJUST_REASONS, STOCK_STATUS, TARGET_DAYS, coverLabel, expiryState, hrefWith, targetStock } from "@/server/store/rules";
import { REG_CLASS_LABEL } from "@/lib/compliance";
import { marginPct } from "@/lib/pricing-rules";
import { pct, zar, zarCompact } from "@/lib/money";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { saveLevels } from "../actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ColumnChart } from "@/components/charts/bar-chart";
import { ProductArt } from "@/components/product/art";
import { BackLink, Line, Qty, ReadOnlyNote } from "@/components/store/ui";
import { ActionForm, FieldError, SubmitButton } from "@/components/store/action-form";

export const metadata = { title: "Stock item" };

const LEDGER_PAGE = 25;

export default async function VariantStockPage({ params, searchParams }: { params: Promise<{ code: string; variantId: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ code, variantId }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const v = await variantHeader(store.id, variantId);
  if (!v) notFound();
  const page = pageParam(sp.page);
  const [rows, lots, led, vel, reserving, settings] = await Promise.all([
    stockRows(store.id),
    variantLots(store.id, variantId),
    ledger(store.id, variantId, page, LEDGER_PAGE),
    velocity(store.id, variantId, 28),
    reservingOrders(store.id, variantId),
    getSettings(),
  ]);
  const row = rows.find((r) => r.variantId === variantId);
  const sv = v.storeVariants[0];
  const base = `/store/${store.code}`;
  const path = `${base}/inventory/${variantId}`;
  const status = row ? STOCK_STATUS[row.status] : null;
  const shelf = sv?.priceCents ?? v.priceCents;
  const margin = marginPct(shelf, v.wholesaleCents);
  const avgDaily = row?.avgDaily ?? 0;
  const target = targetStock(sv?.parLevel ?? 0, avgDaily);

  return (
    <>
      <BackLink href={`${base}/inventory`}>Stock on hand</BackLink>
      <PageHeader
        overline={`${v.product.category.name} · ${REG_CLASS_LABEL[v.product.regClass]}`}
        title={
          <span className="flex items-center gap-3">
            <ProductArt slug={v.product.slug} strain={v.product.strain} regClass={v.product.regClass} className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl" label="" />
            <span>
              {v.product.name} <span className="text-ink-400">· {v.name}</span>
            </span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{v.sku}</span>
            {v.barcode && <span className="font-mono text-xs text-ink-400">{v.barcode}</span>}
            {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
            {!sv && <Badge>Not ranged here</Badge>}
            {!v.active && <Badge tone="amber">Discontinued</Badge>}
          </span>
        }
        actions={
          canManage && (
            <>
              <ButtonLink href={`${base}/adjustments?variant=${variantId}`} variant="outline" size="sm">
                <Scale className="h-4 w-4" aria-hidden /> Adjust
              </ButtonLink>
              <ButtonLink href={`${base}/purchasing/new`} size="sm">
                <Truck className="h-4 w-4" aria-hidden /> Reorder
              </ButtonLink>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="On hand" value={(row?.onHand ?? 0).toLocaleString()} sub={row?.blocked ? <span className="font-semibold text-rose-600">{row.blocked} in blocked batches</span> : "all batches"} />
        <Stat label="Reserved" value={(row?.reserved ?? 0).toLocaleString()} sub="open online orders" />
        <Stat label="Available to sell" value={(row?.available ?? 0).toLocaleString()} sub={sv ? `reorder at ${sv.reorderPoint}` : "not ranged"} />
        <Stat label="Days of cover" value={coverLabel(row?.cover ?? Infinity)} sub={`${avgDaily.toFixed(1)} sold / day`} />
        <Stat label="Value at cost" value={zarCompact(row?.valueCents ?? 0)} sub="FIFO by batch" />
        <Stat label="Sold, 28 days" value={(row?.sold28 ?? 0).toLocaleString()} sub="units, all channels" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Sales velocity" description={`Units sold per day · last 28 days · avg ${avgDaily.toFixed(1)}/day`} />
            <CardBody>
              <ColumnChart data={vel.map((d) => ({ label: d.label, value: d.units, tip: `${d.label}\n${d.units} units · ${zar(d.netCents)} net` }))} format="number" height={200} labelEvery={7} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Batches at ${store.name}`} description="In the order the till sells them (first expiry, first out)" />
            {lots.length === 0 ? (
              <EmptyState title="No batches on record here">Stock arrives with a delivery or a network transfer.</EmptyState>
            ) : (
              <Table className="mt-3">
                <thead>
                  <tr>
                    <Th>Batch</Th>
                    <Th>Status</Th>
                    <Th>Expiry</Th>
                    <Th align="right">On hand</Th>
                    <Th align="right">Unit cost</Th>
                    <Th align="right">Value</Th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => {
                    const exp = expiryState(l.batch.expiresAt);
                    return (
                      <Tr key={l.id} className={l.onHand === 0 ? "text-ink-400" : undefined}>
                        <Td>
                          <Link href={`/batch/${l.batch.code}`} target="_blank" className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-semibold text-ink-900 hover:text-oranje-700">
                            {l.batch.code} <ExternalLink className="h-3 w-3" aria-label="Certificate of analysis (opens in a new tab)" />
                          </Link>
                          <div className="whitespace-nowrap text-xs text-ink-400" title={l.batch.supplier}>Packed {fmtDate(l.batch.packedAt)}</div>
                        </Td>
                        <Td>
                          <StatusBadge status={l.batch.status} />
                          {l.batch.statusReason && <div className="mt-1 max-w-48 text-xs text-ink-500">{l.batch.statusReason}</div>}
                        </Td>
                        <Td className="whitespace-nowrap">
                          {l.batch.expiresAt ? fmtDate(l.batch.expiresAt) : "—"}
                          {l.onHand > 0 && exp.days != null && <div><Badge tone={exp.tone}>{exp.label}</Badge></div>}
                        </Td>
                        <Td align="right" className={l.onHand < 0 ? "font-semibold text-rose-600" : "font-semibold text-ink-900"}>{l.onHand}</Td>
                        <Td align="right">{zar(l.unitCostCents)}</Td>
                        <Td align="right">{zar(l.onHand * l.unitCostCents)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Stock levels" description={`Replenishment orders up to the higher of par and ${TARGET_DAYS} days of sales (${target} units now).`} />
            <CardBody>
              {canManage ? (
                <ActionForm action={saveLevels.bind(null, store.code, variantId)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Reorder point" htmlFor="reorderPoint" hint="Reorder at or below">
                      <Input id="reorderPoint" name="reorderPoint" type="number" min={0} max={9999} inputMode="numeric" defaultValue={sv?.reorderPoint ?? 4} required />
                      <FieldError name="reorderPoint" />
                    </Field>
                    <Field label="Par level" htmlFor="parLevel" hint="Order up to">
                      <Input id="parLevel" name="parLevel" type="number" min={0} max={9999} inputMode="numeric" defaultValue={sv?.parLevel ?? 12} required />
                      <FieldError name="parLevel" />
                    </Field>
                  </div>
                  <SubmitButton variant="dark" size="sm" pendingLabel="Saving…">{sv ? "Save levels" : "Range at this store"}</SubmitButton>
                </ActionForm>
              ) : (
                <div className="space-y-1">
                  <Line label="Reorder point" value={sv?.reorderPoint ?? "—"} />
                  <Line label="Par level" value={sv?.parLevel ?? "—"} />
                  <ReadOnlyNote className="mt-3" />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Price & margin" action={<ButtonLink href={`${base}/pricing?q=${encodeURIComponent(v.sku)}`} variant="ghost" size="sm">Pricing</ButtonLink>} />
            <CardBody className="pt-3">
              <Line label="Recommended retail (RRP)" value={zar(v.priceCents)} muted />
              <Line label="Your shelf price" value={sv?.priceCents != null ? zar(sv.priceCents) : "RRP"} />
              <Line label="Wholesale cost (ex VAT)" value={zar(v.wholesaleCents)} />
              <Line label="Margin at shelf price" value={<span className={margin < settings.pricing.minMarginPct / 100 ? "text-amber-700" : "text-leaf-700"}>{pct(margin)}</span>} strong />
            </CardBody>
          </Card>

          {reserving.length > 0 && (
            <Card>
              <CardHeader title="Held for online orders" description="Reserved until handover, dispatch or cancellation" />
              <CardBody className="space-y-2 pt-3">
                {reserving.map((r) => (
                  <Link key={r.order.id} href={`${base}/orders/${r.order.id}`} className="flex items-center justify-between rounded-xl border border-ink-150 px-3 py-2 text-sm hover:border-oranje-300 hover:bg-oranje-50">
                    <span>
                      <span className="font-semibold text-ink-900">{r.order.code}</span> <span className="text-xs text-ink-500">· {timeAgo(r.order.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={r.order.status} />
                      <span className="tnum font-semibold">×{r.qty}</span>
                    </span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Movement ledger" description="Every unit in and out, newest first. Balance is the on-hand total after each movement." />
        {led.rows.length === 0 ? (
          <EmptyState title="No movements yet" />
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Movement</Th>
                <Th>Batch</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Balance</Th>
                <Th align="right">Value</Th>
                <Th>By</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {led.rows.map((m) => {
                const ref = m.orderCode ? (
                  <Link href={`${base}/orders/${m.orderId}`} className="font-medium text-oranje-700 hover:underline">Order {m.orderCode}</Link>
                ) : m.poNumber ? (
                  <Link href={`${base}/purchasing/${m.stockOrderId}`} className="font-medium text-oranje-700 hover:underline">{m.poNumber}</Link>
                ) : m.stNumber ? (
                  <Link href={`${base}/stock-takes/${m.stockTakeId}`} className="font-medium text-oranje-700 hover:underline">{m.stNumber}</Link>
                ) : m.saleNumber ? (
                  <span className="font-mono text-xs">{m.saleNumber}</span>
                ) : null;
                const refText = m.orderCode ?? m.poNumber ?? m.stNumber ?? m.saleNumber ?? "";
                const note = m.note && !m.note.includes(refText || "\u0000") ? m.note : null;
                return (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap text-ink-600" title={fmtDateTime(m.createdAt)}>{fmtDateTime(m.createdAt)}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="font-medium text-ink-850">{MOVEMENT_LABEL[m.type]}</span>
                      {m.reason && <span className="ml-1.5"><Badge tone={m.qty < 0 ? "amber" : "green"}>{ADJUST_REASONS[m.reason].label}</Badge></span>}
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs text-ink-600">{m.batch.code}</Td>
                    <Td align="right"><Qty n={m.qty} /></Td>
                    <Td align="right" className={m.balance < 0 ? "font-semibold text-rose-600" : "text-ink-900"}>{m.balance}</Td>
                    <Td align="right" className="text-ink-600">{zar(m.qty * m.unitCostCents)}</Td>
                    <Td className="whitespace-nowrap text-ink-600">{m.user ?? <span className="text-ink-400">System</span>}</Td>
                    <Td className="max-w-56 text-xs text-ink-600">
                      {ref}
                      {note && <div className="truncate text-ink-500" title={note}>{note}</div>}
                      {!ref && !note && <span className="text-ink-300">—</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={LEDGER_PAGE} total={led.total} href={(p) => hrefWith(path, {}, { page: p })} />
        </div>
      </Card>
    </>
  );
}
