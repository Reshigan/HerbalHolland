import Link from "next/link";
import { Scale } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { adjustableItems, adjustmentHistory, adjustmentTotals } from "@/server/store/adjustments";
import { ADJUST_REASONS, REASON_ORDER, hrefWith, sp1 } from "@/server/store/rules";
import { resolveRange } from "@/lib/ranges";
import { zar, zarCompact } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { postAdjustment } from "./actions";
import { AdjustForm } from "./adjust-form";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BarList } from "@/components/charts/bar-list";
import { Chips, Qty, ReadOnlyNote, SearchForm } from "@/components/store/ui";
import { AutoSelect } from "@/components/store/auto-submit";
import type { AdjustReason, MovementType } from "@/generated/prisma/client";
import { plural } from "@/lib/plural";

export const metadata = { title: "Adjustments" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;

export default async function AdjustmentsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/adjustments`;

  const r = resolveRange({ range: sp1(sp.range), from: sp1(sp.from), to: sp1(sp.to) }, "30d");
  const kind = sp1(sp.kind) === "count" ? "count" : "adjust";
  const types: MovementType[] = kind === "count" ? ["COUNT"] : ["ADJUST"];
  const reason = (REASON_ORDER as string[]).includes(sp1(sp.reason)) ? (sp1(sp.reason) as AdjustReason) : null;
  const q = sp1(sp.q).trim();
  const page = pageParam(sp.page);
  const preset = sp1(sp.preset) as AdjustReason;

  const [items, history, totals] = await Promise.all([
    canManage ? adjustableItems(store.id) : Promise.resolve([]),
    adjustmentHistory(store.id, { types, reason, q, range: r }, page, PAGE_SIZE),
    adjustmentTotals(store.id, { types, range: r }),
  ]);
  const outUnits = -totals.filter((t) => t.units < 0).reduce((s, t) => s + t.units, 0);
  const outValue = -totals.filter((t) => t.value < 0).reduce((s, t) => s + t.value, 0);
  const inUnits = totals.filter((t) => t.units > 0).reduce((s, t) => s + t.units, 0);
  const inValue = totals.filter((t) => t.value > 0).reduce((s, t) => s + t.value, 0);
  const byReason = totals.filter((t) => t.reason && t.value < 0).sort((a, b) => a.value - b.value);
  const keep = { kind: kind === "count" ? "count" : undefined, range: sp1(sp.range) || undefined, reason: reason ?? undefined };

  return (
    <>
      <PageHeader
        overline={`Inventory · ${store.name}`}
        title="Adjustments"
        description="Write stock off or on against a specific batch, with a reason. Every adjustment lands on the ledger at FIFO cost and in the audit log."
        actions={<RangeTabs path={path} current={r.preset} params={{ kind: keep.kind, reason: keep.reason, q: q || undefined }} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={kind === "count" ? "Stock-take losses" : "Written off"} value={zarCompact(Math.round(outValue))} sub={`${plural(outUnits, "unit")} at cost`} />
        <Stat label={kind === "count" ? "Stock-take finds" : "Booked in"} value={zarCompact(Math.round(inValue))} sub={`${plural(inUnits, "unit")} at cost`} />
        <Stat label="Net impact" value={<span className={outValue > inValue ? "text-rose-600" : undefined}>{zar(Math.round(inValue - outValue))}</span>} sub={`${r.from} to ${r.to}`} />
        <Stat label="Movements" value={totals.reduce((s, t) => s + t.n, 0).toLocaleString()} sub={kind === "count" ? "from approved stock takes" : "manual adjustments"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="New adjustment" description="Scan or search the item, pick the batch, choose why." />
          <CardBody>
            {canManage ? (
              <AdjustForm
                action={postAdjustment.bind(null, store.code)}
                items={items}
                initialVariant={sp1(sp.variant) || undefined}
                initialBatch={sp1(sp.batch) || undefined}
                initialReason={(REASON_ORDER as string[]).includes(preset) ? preset : undefined}
              />
            ) : (
              <ReadOnlyNote>Only managers and owners can adjust stock.</ReadOnlyNote>
            )}
          </CardBody>
        </Card>
        <Card className="h-fit xl:col-span-2">
          <CardHeader title="Where stock is going" description={`Value written off by reason · ${r.from} to ${r.to}`} />
          <CardBody>
            {byReason.length ? (
              <BarList
                color="var(--color-series-8)"
                rows={byReason.map((t) => ({
                  label: ADJUST_REASONS[t.reason!].label,
                  value: Math.round(-t.value),
                  sub: plural(-t.units, "unit"),
                  tip: `${ADJUST_REASONS[t.reason!].label}\n${plural(-t.units, "unit")} · ${plural(t.n, "movement")}`,
                }))}
              />
            ) : (
              <EmptyState className="py-8" title="Nothing written off in this period" />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="History" description="Newest first" />
        <div className="space-y-3 border-b border-ink-100 px-5 pb-4 pt-3">
          <Chips
            label="Movement type"
            current={kind}
            items={[
              { key: "adjust", label: "Manual adjustments", href: hrefWith(path, sp, { kind: null, reason: null, page: null }) },
              { key: "count", label: "Stock-take variances", href: hrefWith(path, sp, { kind: "count", reason: null, page: null }) },
            ]}
          />
          <SearchForm path={path} q={q} keep={keep} placeholder="Item, SKU or batch">
            {kind === "adjust" && (
              <>
                <label className="sr-only" htmlFor="adj-reason">Reason</label>
                <AutoSelect id="adj-reason" name="reason" defaultValue={reason ?? ""} wrapperClassName="w-48">
                  <option value="">All reasons</option>
                  {REASON_ORDER.map((k) => (
                    <option key={k} value={k}>{ADJUST_REASONS[k].label}</option>
                  ))}
                </AutoSelect>
              </>
            )}
          </SearchForm>
        </div>
        {history.rows.length === 0 ? (
          <EmptyState icon={<Scale className="h-5 w-5" />} title="No adjustments match">
            Change the date range or filters to see more.
          </EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Item</Th>
                <Th>Batch</Th>
                <Th>Reason</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Value at cost</Th>
                <Th>By</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-ink-600">{fmtDateTime(m.createdAt)}</Td>
                  <Td className="min-w-48">
                    <Link href={`/store/${store.code}/inventory/${m.variantId}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {m.variant.product.name} <span className="text-ink-500">· {m.variant.name}</span>
                    </Link>
                    <div className="font-mono text-xs text-ink-500">{m.variant.sku}</div>
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink-600">{m.batch.code}</Td>
                  <Td>{m.reason ? <Badge tone={m.reason === "DESTROYED" || m.reason === "THEFT" || m.reason === "RECALL" ? "red" : m.qty < 0 ? "amber" : "green"}>{ADJUST_REASONS[m.reason].label}</Badge> : "—"}</Td>
                  <Td align="right"><Qty n={m.qty} /></Td>
                  <Td align="right" className={m.qty < 0 ? "text-rose-600" : "text-leaf-700"}>{zar(m.qty * m.unitCostCents)}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{m.user ?? "—"}</Td>
                  <Td className="max-w-64 text-xs text-ink-600">
                    {m.stockTakeId ? (
                      <Link href={`/store/${store.code}/stock-takes/${m.stockTakeId}`} className="font-medium text-brand-700 hover:underline">{m.note ?? "Stock take"}</Link>
                    ) : (
                      <span className="line-clamp-2" title={m.note ?? undefined}>{m.note ?? <span className="text-ink-500">—</span>}</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={history.total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
