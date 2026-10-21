import Link from "next/link";
import { CircleCheck, ExternalLink, FlaskConical, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { expiryState, hrefWith, sp1 } from "@/server/store/rules";
import { zar, zarCompact } from "@/lib/money";
import { addDays, fmtDate } from "@/lib/format";
import { writeOffLot } from "./actions";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Field, Input } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, SearchForm } from "@/components/store/ui";
import { ConfirmAction, FieldError } from "@/components/ui/action-form";
import type { Prisma } from "@/generated/prisma/client";
import { plural } from "@/lib/plural";

export const metadata = { title: "Batches & recalls" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;

export default async function BatchesPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/batches`;
  const now = new Date();
  const soon = addDays(now, 30);
  const view = ["blocked", "expiring", "expired"].includes(sp1(sp.view)) ? sp1(sp.view) : "all";
  const q = sp1(sp.q).trim();
  const page = pageParam(sp.page);

  const base: Prisma.StockLevelWhereInput = { storeId: store.id, onHand: { not: 0 } };
  const views: Record<string, Prisma.StockLevelWhereInput> = {
    all: {},
    blocked: { batch: { status: { in: ["RECALLED", "QUARANTINE"] } } },
    expiring: { batch: { status: "RELEASED", expiresAt: { gt: now, lte: soon } } },
    expired: { batch: { expiresAt: { lte: now } } },
  };
  const search: Prisma.StockLevelWhereInput = q
    ? { OR: [{ batch: { code: { contains: q } } }, { variant: { sku: { contains: q } } }, { variant: { product: { name: { contains: q } } } }] }
    : {};
  const where = { AND: [base, views[view], search] };

  const [counts, total, lots, all, recalls] = await Promise.all([
    Promise.all(Object.entries(views).map(async ([k, w]) => [k, await db.stockLevel.count({ where: { AND: [base, w, search] } })] as const)),
    db.stockLevel.count({ where }),
    db.stockLevel.findMany({
      where,
      include: { batch: true, variant: { select: { sku: true, name: true, product: { select: { name: true } } } } },
      orderBy: [{ batch: { status: "desc" } }, { batch: { expiresAt: { sort: "asc", nulls: "last" } } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.stockLevel.findMany({ where: base, select: { onHand: true, unitCostCents: true, batch: { select: { status: true, expiresAt: true } } } }),
    db.batch.findMany({
      where: { status: { in: ["RECALLED", "QUARANTINE"] } },
      include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } }, stock: { where: { storeId: store.id }, select: { onHand: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const count = Object.fromEntries(counts);
  const sum = (f: (l: (typeof all)[number]) => boolean) =>
    all.filter(f).reduce((a, l) => ({ lots: a.lots + 1, units: a.units + l.onHand, value: a.value + l.onHand * l.unitCostCents }), { lots: 0, units: 0, value: 0 });
  const lotsLabel = (x: { lots: number; value: number }) => `${x.lots} lot${x.lots === 1 ? "" : "s"} · ${zar(x.value)} at cost`;
  const blocked = sum((l) => l.batch.status !== "RELEASED" && l.onHand > 0);
  const expiring = sum((l) => l.batch.status === "RELEASED" && !!l.batch.expiresAt && l.batch.expiresAt > now && l.batch.expiresAt <= soon && l.onHand > 0);
  const expired = sum((l) => !!l.batch.expiresAt && l.batch.expiresAt <= now && l.onHand > 0);
  const onHand = sum((l) => l.onHand > 0);
  const keep = { view: view === "all" ? undefined : view };

  return (
    <>
      <PageHeader
        overline={`Inventory · ${store.name}`}
        title="Batches & recalls"
        description="Every lot on hand, traceable to its certificate of analysis. Recalled and quarantined batches are blocked at the till. Send them back or destroy them here."
      />

      {blocked.units > 0 && (
        <Notice tone="danger" className="mb-6" title={`${plural(blocked.units, "unit")} in blocked batches`}>
          They can&apos;t be sold. Return recalled stock to {store.dc?.name ?? "your distribution centre"} or destroy it with a witness. Both are recorded on the ledger and in the destruction register.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Units on hand" value={onHand.units.toLocaleString()} sub={`${plural(onHand.lots, "lot")} · ${zarCompact(onHand.value)} at cost`} />
        <Stat label="Blocked units (recall / hold)" value={blocked.units.toLocaleString()} sub={blocked.units ? lotsLabel(blocked) : "nothing blocked"} />
        <Stat label="Units expiring within 30 days" value={expiring.units.toLocaleString()} sub={expiring.units ? `${lotsLabel(expiring)} · sold first` : "nothing close to expiry"} />
        <Stat label="Expired units on hand" value={expired.units.toLocaleString()} sub={expired.units ? `${lotsLabel(expired)} · write off` : "none"} />
      </div>

      {recalls.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Network recalls & holds" description="Batches HQ has blocked, and what you hold of each" />
          <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recalls.map((b) => {
              const held = b.stock.reduce((s, x) => s + Math.max(0, x.onHand), 0);
              return (
                <div key={b.id} className="rounded-xl border border-ink-150 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-900">{b.variant.product.name} · {b.variant.name}</div>
                      <Link href={`/batch/${b.code}`} target="_blank" className="font-mono text-xs text-brand-700 hover:underline">{b.code}</Link>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  {b.statusReason && <p className="mt-1.5 text-xs text-ink-600">{b.statusReason}</p>}
                  <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${held ? "text-rose-600" : "text-leaf-700"}`}>
                    {held ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> : <CircleCheck className="h-3.5 w-3.5" aria-hidden />}
                    {held ? (
                      <Link href={hrefWith(path, {}, { view: "blocked", q: b.code })} className="hover:underline">You hold {plural(held, "unit")} · resolve →</Link>
                    ) : (
                      "None on hand here"
                    )}
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      <div className="mt-6">
        <Card className="min-w-0">
          <div className="space-y-3 border-b border-ink-100 p-4 sm:p-5">
            <SearchForm path={path} q={q} keep={keep} placeholder="Batch code, product or SKU" />
            <Chips
              label="Lots"
              current={view}
              items={[
                { key: "all", label: "All lots", count: count.all, href: hrefWith(path, sp, { view: null, page: null }) },
                { key: "blocked", label: "Recalled / quarantine", count: count.blocked, tone: "red", href: hrefWith(path, sp, { view: "blocked", page: null }) },
                { key: "expiring", label: "Expiring ≤ 30 days", count: count.expiring, tone: "amber", href: hrefWith(path, sp, { view: "expiring", page: null }) },
                { key: "expired", label: "Expired", count: count.expired, tone: "red", href: hrefWith(path, sp, { view: "expired", page: null }) },
              ]}
            />
          </div>
          {lots.length === 0 ? (
            <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No lots match">
              {view === "blocked" ? "Nothing recalled or quarantined is on hand here." : "Try another filter or search."}
            </EmptyState>
          ) : (
            <Table stickyFirst>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Item</Th>
                  <Th>Status</Th>
                  <Th>Expiry</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Value</Th>
                  {canManage && <Th><span className="sr-only">Action</span></Th>}
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => {
                  const exp = expiryState(l.batch.expiresAt, now);
                  const isBlocked = l.batch.status !== "RELEASED";
                  const isExpired = exp.days != null && exp.days < 0;
                  return (
                    <Tr key={l.id} className={isBlocked ? "bg-rose-50/60 hover:bg-rose-50" : undefined}>
                      <Td className="whitespace-nowrap">
                        <Link href={`/batch/${l.batch.code}`} target="_blank" className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-ink-900 hover:text-brand-700">
                          {l.batch.code} <ExternalLink className="h-3 w-3" aria-label="Certificate of analysis (opens in a new tab)" />
                        </Link>
                        <div className="text-xs text-ink-500">Packed {fmtDate(l.batch.packedAt)}</div>
                      </Td>
                      <Td className="min-w-44">
                        <Link href={`/store/${store.code}/inventory/${l.variantId}`} className="font-medium text-ink-900 hover:text-brand-700">
                          {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                        </Link>
                        <div className="font-mono text-xs text-ink-500">{l.variant.sku}</div>
                      </Td>
                      <Td>
                        <StatusBadge status={l.batch.status} />
                        {l.batch.statusReason && <div className="mt-1 max-w-52 text-xs text-ink-600">{l.batch.statusReason}</div>}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="text-ink-700">{l.batch.expiresAt ? fmtDate(l.batch.expiresAt) : "—"}</div>
                        {exp.days != null && <Badge tone={exp.tone}>{exp.label}</Badge>}
                      </Td>
                      <Td align="right" className={l.onHand < 0 ? "font-semibold text-rose-600" : "font-semibold text-ink-900"}>{l.onHand}</Td>
                      <Td align="right">{zar(l.onHand * l.unitCostCents)}</Td>
                      {canManage && (
                        <Td className="min-w-32 text-right">
                          {(isBlocked || isExpired) && l.onHand > 0 && (
                            <ConfirmAction
                              action={writeOffLot.bind(null, store.code, l.id)}
                              label="Write off"
                              title={`Write off all ${plural(l.onHand, "unit")} of ${l.batch.code}?`}
                              confirmLabel="Write off lot"
                              className="min-w-72"
                            >
                              <fieldset className="space-y-1.5">
                                <legend className="sr-only">How is it leaving the store?</legend>
                                {isBlocked && (
                                  <label className="flex items-center gap-2">
                                    <input type="radio" name="reason" value="RECALL" defaultChecked className="accent-brand-500" /> Return to {store.dc?.name ?? "the DC"}
                                  </label>
                                )}
                                {isExpired && (
                                  <label className="flex items-center gap-2">
                                    <input type="radio" name="reason" value="EXPIRED" defaultChecked={!isBlocked} className="accent-brand-500" /> Expired (write off)
                                  </label>
                                )}
                                <label className="flex items-center gap-2">
                                  <input type="radio" name="reason" value="DESTROYED" className="accent-brand-500" /> Destroyed on site (witnessed)
                                </label>
                                <FieldError name="reason" />
                              </fieldset>
                              <Field label="Witness (required to destroy)" htmlFor={`w-${l.id}`}>
                                <Input id={`w-${l.id}`} name="witness" maxLength={120} placeholder="Full name" />
                                <FieldError name="witness" />
                              </Field>
                              <Field label="Note" htmlFor={`n-${l.id}`}>
                                <Input id={`n-${l.id}`} name="note" maxLength={300} placeholder="Courier waybill, destruction method…" />
                              </Field>
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
          <div className="border-t border-ink-100">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
          </div>
        </Card>

      </div>
    </>
  );
}
