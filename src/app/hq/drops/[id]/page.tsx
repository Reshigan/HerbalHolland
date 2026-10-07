import { notFound } from "next/navigation";
import { BellRing, ExternalLink, Trash2 } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { tierInfo, type TierKey } from "@/lib/loyalty-rules";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { zarWhole } from "@/lib/money";
import { fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ConfirmAction } from "@/components/ui/action-form";
import { Flash } from "@/components/hq/flash";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { deleteDrop, saveDrop } from "../actions";
import { DropForm } from "../drop-form";
import { PHASE, dropPhase, dropStats, dropValues, earlyLabel, firstOpen, variantOptions } from "../load";

export const metadata = { title: "Drop" };

export default async function DropPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const d = await db.drop.findUnique({ where: { id } });
  if (!d) notFound();
  const now = new Date();
  const [stats, options, variants] = await Promise.all([
    dropStats([d], ids, now).then((m) => m.get(d.id)!),
    variantOptions(d.variantIds),
    db.variant.findMany({ where: { id: { in: d.variantIds } }, select: { id: true, name: true, sku: true, priceCents: true, product: { select: { name: true } } } }),
  ]);
  const edit = can(user, "network");
  const phase = dropPhase(d, now);
  const open = firstOpen(d);
  const early = earlyLabel(d.earlyTier, d.earlyMinutes);

  // "Notify me" alerts: an early pass for the early-access tier, then everyone, only inside CPA contact windows.
  const passes = [
    ...(d.earlyTier && d.earlyMinutes ? [{ label: `${tierInfo(d.earlyTier as TierKey).name} and above`, due: open, sent: d.notifiedEarlyAt }] : []),
    { label: d.earlyTier ? "Everyone else" : "All watchers", due: d.startsAt, sent: d.notifiedAt },
  ];
  const held = passes.find((p) => !p.sent && p.due > now && !marketingWindow(p.due).allowed);

  return (
    <>
      <BackLink href="/hq/drops">Drops</BackLink>
      <PageHeader
        overline={`Drop · /drops/${d.slug}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {d.name}
            <Badge tone={PHASE[phase][1]} dot>
              {PHASE[phase][0]}
            </Badge>
          </span>
        }
        description={d.blurb}
        actions={
          <ButtonLink href={`/drops/${d.slug}`} target="_blank" rel="noopener" variant="outline">
            Drop page <ExternalLink className="h-4 w-4" aria-hidden />
          </ButtonLink>
        }
      />
      <Flash message={sp.m} />
      {held && (
        <Notice tone="warn" className="mb-6" title="Alerts wait for a legal send time">
          {marketingWindow(held.due).reason}: the “notify me” alert ({held.label}) goes out at {fmtDateTime(nextMarketingSlot(held.due))} instead of {fmtDateTime(held.due)} (CPA Regulation 4). The drop still opens on time.
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Watchers" value={num(stats.watchers)} sub="tapped “notify me”" />
        <Stat label="Units sold" value={phase === "upcoming" ? "—" : num(stats.sold)} sub={phase === "upcoming" ? `opens ${fmtDateTime(open)}` : `since ${fmtDateTime(open)}${d.endsAt && d.endsAt < now ? " to the end" : ""}`} />
        <Stat label="Stock in stores" value={num(stats.inStores)} sub={scope.kind === "HQ" ? "available, network-wide" : "available in your region"} />
        <Stat label="At distribution centres" value={num(stats.atDcs)} sub="not yet allocated to stores" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales and stock by product" description={`Limit ${d.perMemberLimit} per member${d.membersOnly ? " · Rewards members only" : ""}${early ? ` · ${early}` : ""}`} />
          <Table stickyFirst className="relative mt-4">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="hidden sm:table-cell">SKU</Th>
                <Th align="right" className="hidden md:table-cell">Price</Th>
                <Th align="right">Sold</Th>
                <Th align="right">In stores</Th>
                <Th align="right" className="hidden sm:table-cell">At DCs</Th>
              </tr>
            </thead>
            <tbody>
              {stats.variants.map((s) => {
                const v = variants.find((x) => x.id === s.variantId);
                return (
                  <Tr key={s.variantId}>
                    <Td>
                      <span className="font-medium text-ink-900">{v?.product.name ?? "Removed product"}</span>
                      <span className="block text-xs text-ink-500">{v?.name}</span>
                    </Td>
                    <Td className="hidden font-mono text-xs text-ink-600 sm:table-cell">{v?.sku ?? "—"}</Td>
                    <Td align="right" className="hidden md:table-cell">{v ? zarWhole(v.priceCents) : "—"}</Td>
                    <Td align="right" className="font-medium text-ink-900">{phase === "upcoming" ? <span className="font-normal text-ink-500">—</span> : num(s.sold)}</Td>
                    <Td align="right" className={s.inStores ? undefined : "text-rose-600"}>{num(s.inStores)}</Td>
                    <Td align="right" className="hidden sm:table-cell">{num(s.atDcs)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="“Notify me” alerts" description="App push where the member has the app, else SMS (inside legal send times)" />
          <CardBody>
            <ul className="space-y-3 text-sm">
              {passes.map((p) => (
                <li key={p.label} className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${p.sent ? "bg-leaf-50 text-leaf-700" : "bg-ink-100 text-ink-500"}`} aria-hidden>
                    <BellRing className="h-4 w-4" strokeWidth={1.9} />
                  </span>
                  <div>
                    <div className="font-semibold text-ink-900">{p.label}</div>
                    <div className="text-xs text-ink-500">
                      {p.sent
                        ? `Sent ${fmtDateTime(p.sent)}`
                        : p.due <= now
                          ? "Going out on the next scheduler run"
                          : `Due ${fmtDateTime(marketingWindow(p.due).allowed ? p.due : nextMarketingSlot(p.due))}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {!edit && <ViewOnly className="mb-6">View only: drops are managed by the HQ team.</ViewOnly>}
      <DropForm action={saveDrop.bind(null, d.id)} values={dropValues(d)} options={options} readOnly={!edit} />

      {edit && (
        <Card className="mt-6 border-rose-500/20">
          <CardHeader title="Delete this drop" description="For drops made by mistake. Sales stay recorded; its limits stop applying and watchers aren't alerted." />
          <CardBody>
            <ConfirmAction
              action={deleteDrop.bind(null, d.id)}
              label="Delete drop"
              icon={<Trash2 className="h-4 w-4" aria-hidden />}
              title={`Delete “${d.name}”?`}
              confirmLabel="Delete drop"
            >
              <p>
                {num(stats.watchers)} watcher{stats.watchers === 1 ? "" : "s"} will no longer be alerted{phase === "live" || phase === "early" ? ", and the per-member limit stops applying immediately" : ""}. This can&apos;t be undone.
              </p>
            </ConfirmAction>
          </CardBody>
        </Card>
      )}
    </>
  );
}
