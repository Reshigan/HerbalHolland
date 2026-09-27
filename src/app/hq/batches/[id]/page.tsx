import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { traceSales, traceSummary } from "@/server/hq/batches";
import { qs } from "@/server/hq/form";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { Detail } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Select } from "@/components/hq/select";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/hq/action-form";
import { BackLink, EmptyRow, MiniStat, ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { saveLabResults, setBatchStatus } from "../actions";

export const metadata = { title: "Batch" };

const PANEL = [
  ["microbials", "Microbials"],
  ["mycotoxins", "Mycotoxins"],
  ["pesticides", "Pesticides"],
  ["heavyMetals", "Heavy metals"],
  ["residualSolvents", "Residual solvents"],
] as const;

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const batch = await db.batch.findUnique({ where: { id }, include: { variant: { include: { product: { select: { id: true, name: true, regClass: true } } } } } });
  if (!batch) notFound();
  const page = pageParam(sp.page);
  const pageSize = 20;
  const limit = scope.kind === "HQ" ? null : ids;
  const [levels, summary, sales, recall] = await Promise.all([
    db.stockLevel.findMany({
      where: { batchId: id, onHand: { not: 0 }, storeId: { in: ids } },
      include: { store: { select: { code: true, name: true, kind: true, region: { select: { name: true } } } } },
      orderBy: { onHand: "desc" },
    }),
    traceSummary(batch, limit),
    traceSales(batch, limit, page, pageSize),
    batch.status === "RECALLED" ? db.announcement.findFirst({ where: { kind: "RECALL", title: { contains: batch.code } }, include: { _count: { select: { acks: true } } } }) : null,
  ]);
  const lab = (batch.labResults ?? {}) as Record<string, unknown> & { terpenes?: { name: string; pct: number }[]; moisturePct?: number };
  const terps = [...(lab.terpenes ?? []), { name: "", pct: "" }, { name: "", pct: "" }];
  const edit = can(user, "network");
  const unitsHeld = levels.reduce((s, l) => s + l.onHand, 0);
  const now = Date.now();
  const expired = batch.expiresAt && batch.expiresAt.getTime() < now;
  const failed = PANEL.filter(([k]) => lab[k] === "FAIL").map(([, l]) => l);

  return (
    <>
      <BackLink href="/hq/batches">Batches & recalls</BackLink>
      <PageHeader
        overline={`${batch.variant.product.name} · ${batch.variant.name}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{batch.code}</span>
            <StatusBadge status={batch.status} />
            {expired && <Badge tone="red">Expired</Badge>}
          </span>
        }
        description={`${batch.supplier} · packed ${fmtDate(batch.packedAt)}${batch.expiresAt ? ` · best before ${fmtDate(batch.expiresAt)}` : ""}`}
      />

      <Flash message={sp.m} />
      {batch.status !== "RELEASED" && (
        <Notice tone={batch.status === "RECALLED" ? "danger" : "warn"} className="mb-6" title={batch.status === "RECALLED" ? "Recalled — blocked everywhere" : "Quarantined — blocked from sale and shipping"}>
          {batch.statusReason}
          {recall && (
            <>
              {" "}· Recall notice acknowledged by {recall._count.acks} stores.{" "}
              <Link href={`/hq/announcements?a=${recall.id}`} className="font-semibold underline">
                See who hasn&apos;t
              </Link>
            </>
          )}
        </Notice>
      )}
      {failed.length > 0 && batch.status === "RELEASED" && (
        <Notice tone="danger" className="mb-6" title="Failed lab tests on a released batch">
          {failed.join(", ")} failed. Quarantine the batch until it has been re-tested.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Traceability" description={limit ? "Customers of your region's stores who bought from this batch" : "Everyone who bought from this batch, from the till and online"} />
            <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Units sold (net)" value={num(summary.units)} />
              <MiniStat label="Sales" value={num(summary.sales)} sub={`${num(summary.anonymous)} without a member`} />
              <MiniStat label="Members reached" value={num(summary.customers)} sub="contactable for a recall" />
              <MiniStat label="Stores" value={num(summary.stores)} />
            </CardBody>
            <Table className="relative">
              <thead>
                <tr>
                  <Th>Sale</Th>
                  <Th>Customer</Th>
                  <Th className="hidden sm:table-cell">Store</Th>
                  <Th align="right">Units</Th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && <EmptyRow cols={4}>Nothing from this batch has been sold yet.</EmptyRow>}
                {sales.map((s) => (
                  <Tr key={`${s.saleId}`}>
                    <Td>
                      <span className="font-mono text-xs text-ink-800">{s.number}</span>
                      {s.kind === "REFUND" && <Badge tone="amber" className="ml-2">Refund</Badge>}
                      <span className="block text-xs text-ink-500">{fmtDateTime(s.createdAt)}</span>
                    </Td>
                    <Td>
                      {s.customerId ? (
                        <Link href={`/hq/customers/${s.customerId}`} className="font-medium text-ink-850 hover:text-brand-700">
                          {s.firstName} {s.lastName ?? ""}
                          <span className="block font-mono text-xs font-normal text-ink-500">{s.memberNo}</span>
                        </Link>
                      ) : (
                        <span className="text-ink-400">Walk-in (no member)</span>
                      )}
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">
                      {s.storeName} <span className="font-mono text-xs text-ink-400">{s.storeCode}</span>
                    </Td>
                    <Td align="right">{s.kind === "REFUND" ? `−${s.qty}` : s.qty}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={summary.sales} href={(p) => `/hq/batches/${id}${qs({ page: p })}`} />
          </Card>

          <Card>
            <CardHeader title="Lab results" description="Certificate of analysis for this lot — shown to customers on the batch page" />
            <CardBody>
              {!edit && <ViewOnly className="mb-4">View only — lab results are recorded by HQ quality.</ViewOnly>}
              <ActionForm action={saveLabResults.bind(null, batch.id)}>
                <fieldset disabled={!edit} className="min-w-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-4">
                    <Field label="THC %" htmlFor="thc">
                      <Input id="thc" name="thc" defaultValue={batch.thc ?? ""} inputMode="decimal" />
                      <FieldError name="thc" />
                    </Field>
                    <Field label="CBD %" htmlFor="cbd">
                      <Input id="cbd" name="cbd" defaultValue={batch.cbd ?? ""} inputMode="decimal" />
                      <FieldError name="cbd" />
                    </Field>
                    <Field label="Moisture %" htmlFor="moisturePct">
                      <Input id="moisturePct" name="moisturePct" defaultValue={lab.moisturePct ?? ""} inputMode="decimal" />
                    </Field>
                    <Field label="COA reference" htmlFor="coaRef">
                      <Input id="coaRef" name="coaRef" defaultValue={batch.coaRef ?? ""} className="font-mono text-[0.8rem]" />
                    </Field>
                  </div>
                  <Field label="Laboratory" htmlFor="labName">
                    <Input id="labName" name="labName" defaultValue={batch.labName ?? ""} placeholder="SANAS-accredited lab" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {PANEL.map(([k, label]) => (
                      <Field key={k} label={label} htmlFor={k}>
                        <Select id={k} name={k} defaultValue={String(lab[k] ?? "PENDING")} className={lab[k] === "FAIL" ? "border-rose-500 text-rose-600" : undefined}>
                          <option value="PASS">Pass</option>
                          <option value="FAIL">Fail</option>
                          <option value="PENDING">Pending</option>
                          <option value="N/A">N/A</option>
                        </Select>
                      </Field>
                    ))}
                  </div>
                  <div>
                    <div className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Terpene profile</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {terps.map((t, i) => (
                        <div key={i} className="flex gap-2">
                          <Input name="terpName" aria-label={`Terpene ${i + 1}`} defaultValue={t.name} placeholder="Terpene" />
                          <div className="w-24 shrink-0">
                            <Input name="terpPct" aria-label={`Terpene ${i + 1} %`} defaultValue={t.pct} placeholder="%" inputMode="decimal" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </fieldset>
                {edit && (
                  <div className="mt-5 flex justify-end">
                    <SubmitButton variant="outline" pendingLabel="Saving…">Save lab results</SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Batch control" description="Blocks or releases this lot at every till, DC and the web shop" />
            <CardBody className="space-y-3">
              <dl className="divide-y divide-ink-100">
                <Detail label="Product">
                  <Link href={`/hq/catalogue/${batch.variant.product.id}`} className="hover:text-brand-700">
                    {batch.variant.product.name}
                  </Link>
                </Detail>
                <Detail label="Variant">
                  {batch.variant.name} · <span className="font-mono text-xs">{batch.variant.sku}</span>
                </Detail>
                <Detail label="Units still held">{num(unitsHeld)}</Detail>
                <Detail label="Status">
                  <StatusBadge status={batch.status} />
                </Detail>
              </dl>
              {!edit && <ViewOnly>Quarantines and recalls are run by HQ quality.</ViewOnly>}
              {edit && batch.status === "RELEASED" && (
                <ConfirmAction
                  action={setBatchStatus.bind(null, batch.id, "QUARANTINE")}
                  label="Quarantine batch"
                  icon={<ShieldAlert className="h-4 w-4" />}
                  title="Quarantine this batch"
                  confirmLabel="Quarantine now"
                  variant="dark"
                  className="w-full"
                >
                  <p>Stock stays where it is but can&apos;t be sold, reserved or shipped until it&apos;s released.</p>
                  <Field label="Reason" htmlFor="q-reason">
                    <Textarea id="q-reason" name="reason" className="min-h-16" placeholder="e.g. Awaiting microbial re-test" />
                    <FieldError name="reason" />
                  </Field>
                </ConfirmAction>
              )}
              {edit && batch.status === "QUARANTINE" && (
                <ConfirmAction
                  action={setBatchStatus.bind(null, batch.id, "RELEASED")}
                  label="Release batch"
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="Release for sale"
                  confirmLabel="Release"
                  variant="primary"
                  className="w-full"
                >
                  <p>Only release once the lab results above are complete and passing.</p>
                  <Field label="Note" htmlFor="r-reason">
                    <Input id="r-reason" name="reason" placeholder="e.g. Re-test passed, COA updated" />
                  </Field>
                </ConfirmAction>
              )}
              {edit && batch.status !== "RECALLED" && (
                <ConfirmAction
                  action={setBatchStatus.bind(null, batch.id, "RECALLED")}
                  label="Recall batch"
                  icon={<ShieldOff className="h-4 w-4" />}
                  title="Recall this batch"
                  confirmLabel="Recall and notify"
                  typeToConfirm={batch.code}
                  triggerVariant="danger"
                  className="w-full"
                >
                  <div className="flex gap-2 rounded-xl bg-white/70 p-3 text-xs text-ink-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                    <span>
                      This can&apos;t be undone. The batch is blocked everywhere, every store gets a recall notice to acknowledge, and the {num(summary.customers)} members who bought it get an SMS asking them to return it.
                    </span>
                  </div>
                  <Field label="Reason (shown to stores and customers)" htmlFor="rc-reason">
                    <Textarea id="rc-reason" name="reason" className="min-h-16" placeholder="e.g. Potency label misprint" />
                    <FieldError name="reason" />
                  </Field>
                </ConfirmAction>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Where the stock is now" description={`${num(unitsHeld)} units across ${levels.length} location${levels.length === 1 ? "" : "s"}`} />
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {levels.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-500">No stock of this batch on hand.</li>}
              {levels.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <Link href={l.store.kind === "WAREHOUSE" ? `/hq/distribution?dc=${l.store.code}&view=stock` : `/hq/stores/${l.store.code}`} className="font-medium text-ink-850 hover:text-brand-700">
                      {l.store.name}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {l.store.kind === "WAREHOUSE" ? "Distribution centre" : l.store.region.name} · <span className="font-mono">{l.store.code}</span>
                    </span>
                  </span>
                  <span className={`tnum font-semibold ${l.onHand < 0 ? "text-rose-600" : "text-ink-900"}`}>{num(l.onHand)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
