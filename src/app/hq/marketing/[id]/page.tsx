import Link from "next/link";
import { notFound } from "next/navigation";
import { Send, XCircle } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { audienceSize, campaignResults, segmentLabel } from "@/server/marketing";
import { can } from "@/server/hq/guard";
import { toLocalInput } from "@/server/hq/form";
import { zar, zarCompact } from "@/lib/money";
import { fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { ButtonLink } from "@/components/ui/button";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ConfirmAction } from "@/components/ui/action-form";
import { BackLink, EmptyRow } from "@/components/hq/ui";
import { CHANNEL_LABEL } from "@/components/hq/tones";
import { cancelCampaign, estimateReach, findCampaignStores, saveCampaign, sendNow } from "../actions";
import { Flash } from "@/components/hq/flash";
import { Composer } from "../composer";
import { composerOptions } from "../load";

export const metadata = { title: "Campaign" };

const mask = (v: string) => (v.includes("@") ? v.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : v.replace(/^(\+27\d{2})\d{3}(\d{4})$/, "$1 ••• $2"));

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const c = await db.campaign.findUnique({ where: { id }, include: { store: { select: { name: true } } } });
  if (!c || (scope.kind !== "HQ" && c.storeId && !ids.includes(c.storeId))) notFound();
  const network = can(user, "network");
  const pending = c.status === "DRAFT" || c.status === "SCHEDULED";
  const editable = pending && (network || (!!c.storeId && ids.includes(c.storeId)));
  // Sending reaches thousands at once: the confirm step restates how many and how.
  const reach = network && c.status === "SCHEDULED" ? await audienceSize(c.segment, c.channel, c.storeId) : null;

  const header = (
    <>
      <BackLink href="/hq/marketing">Campaigns</BackLink>
      <PageHeader
        overline={`${CHANNEL_LABEL[c.channel]} · ${segmentLabel(c.segment)}${c.store ? ` · ${c.store.name}` : ""}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {c.name}
            <StatusBadge status={c.status} />
          </span>
        }
        description={c.sentAt ? `Sent ${fmtDateTime(c.sentAt)}` : c.scheduledAt ? `Scheduled for ${fmtDateTime(c.scheduledAt)}` : `Created ${fmtDateTime(c.createdAt)}`}
        actions={
          network &&
          pending && (
            <div className="flex flex-wrap items-start gap-2">
              {c.status === "SCHEDULED" && (
                <ConfirmAction
                  action={sendNow.bind(null, c.id)}
                  label="Send now"
                  icon={<Send className="h-4 w-4" />}
                  triggerVariant="dark"
                  variant="primary"
                  title={`Send to ${num(reach?.reachable ?? 0)} members by ${CHANNEL_LABEL[c.channel]}?`}
                  confirmLabel="Yes, send now"
                  className="max-w-sm"
                >
                  <p>
                    {num(reach?.reachable ?? 0)} of {num(reach?.total ?? 0)} in the audience opted in to {CHANNEL_LABEL[c.channel]}; the do-not-contact list is checked as it goes. Outside the legal send window it waits for the next slot. It can&apos;t be recalled once sent.
                  </p>
                </ConfirmAction>
              )}
              <ConfirmAction action={cancelCampaign.bind(null, c.id)} label="Cancel campaign" icon={<XCircle className="h-4 w-4" />} title="Cancel this campaign?" confirmLabel="Cancel campaign">
                <p>Nothing will be sent. You can duplicate the copy into a new campaign later.</p>
              </ConfirmAction>
            </div>
          )
        }
      />
      <Flash message={sp.m} />
    </>
  );

  if (editable) {
    const opts = await composerOptions(ids, c.storeId);
    return (
      <>
        {header}
        {c.status === "SCHEDULED" && <Notice tone="info" className="mb-6">Scheduled for {fmtDateTime(c.scheduledAt!)}. Saving changes returns it to draft. Schedule or send it again afterwards.</Notice>}
        <Composer
          action={saveCampaign.bind(null, c.id)}
          estimate={estimateReach}
          findStores={findCampaignStores}
          values={{ name: c.name, channel: c.channel, segment: c.segment, storeId: c.storeId ?? "", message: c.message, promotionId: c.promotionId ?? "", cost: c.costCents ? (c.costCents / 100).toFixed(2) : "", scheduledAt: toLocalInput(c.scheduledAt) }}
          {...opts}
          canSend={network}
          requireStore={scope.kind !== "HQ"}
        />
      </>
    );
  }

  const [results, statuses, log, sales, promo] = await Promise.all([
    campaignResults([c.id]),
    db.messageLog.groupBy({ by: ["status"], where: { campaignId: c.id }, _count: true }),
    db.messageLog.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, to: true, status: true, reason: true, createdAt: true, customerId: true } }),
    db.sale.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "desc" }, take: 15, include: { store: { select: { name: true } }, customer: { select: { id: true, firstName: true, memberNo: true } } } }),
    c.promotionId ? db.promotion.findUnique({ where: { id: c.promotionId }, select: { id: true, name: true, code: true } }) : null,
  ]);
  const r = results.get(c.id);
  const failed = statuses.find((s) => s.status === "FAILED")?._count ?? 0;

  return (
    <>
      {header}
      {failed > 0 && <Notice tone="danger" className="mb-6" title={`${num(failed)} messages failed to send`}>Check the delivery log below for the provider&apos;s reason. Failed messages aren&apos;t retried automatically.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Delivered" value={num(c.sentCount)} sub={`of ${num(c.audienceCount)} in the audience`} />
        <Stat label="Suppressed" value={num(c.suppressedCount)} sub="no consent or do-not-contact" />
        <Stat label="Attributed revenue" value={zarCompact(r?.revenueCents ?? 0)} sub={`${num(r?.orders ?? 0)} sales · last touch`} />
        <Stat label="Return on spend" value={c.costCents ? `${((r?.revenueCents ?? 0) / c.costCents).toFixed(1)}×` : "—"} sub={c.costCents ? `cost ${zar(c.costCents)}` : "no cost recorded"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Attributed sales" description={promo ? `Sales using ${promo.code ? `code ${promo.code}` : promo.name} or the campaign link` : "Sales stamped with this campaign"} />
            <Table stickyFirst className="relative mt-4">
              <thead>
                <tr>
                  <Th>Sale</Th>
                  <Th>Member</Th>
                  <Th className="hidden sm:table-cell">Store</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && <EmptyRow cols={4}>No sales attributed yet.</EmptyRow>}
                {sales.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <span className="font-mono text-xs text-ink-800">{s.number}</span>
                      <span className="block text-xs text-ink-500">{fmtDateTime(s.createdAt)}</span>
                    </Td>
                    <Td>
                      {s.customer ? (
                        <Link href={`/hq/customers/${s.customer.id}`} className="hover:text-brand-700">
                          {s.customer.firstName} <span className="font-mono text-xs text-ink-500">{s.customer.memberNo}</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{s.store.name}</Td>
                    <Td align="right">{zar(s.totalCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader
              title="Delivery log"
              description={`Latest messages · ${statuses.map((s) => `${num(s._count)} ${s.status.toLowerCase()}`).join(" · ") || "none"}`}
              action={
                <ButtonLink href={`/hq/messages?campaign=${c.id}`} variant="ghost" size="sm">
                  All messages
                </ButtonLink>
              }
            />
            <Table stickyFirst className="relative mt-4">
              <thead>
                <tr>
                  <Th>To</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">When</Th>
                </tr>
              </thead>
              <tbody>
                {log.length === 0 && <EmptyRow cols={3}>No messages logged.</EmptyRow>}
                {log.map((m) => (
                  <Tr key={m.id}>
                    <Td className="font-mono text-xs">{mask(m.to)}</Td>
                    <Td>
                      <Badge tone={m.status === "SENT" ? "green" : m.status === "FAILED" ? "red" : "neutral"}>{m.status.toLowerCase()}</Badge>
                      {m.reason && <span className="ml-2 text-xs text-ink-500">{m.reason}</span>}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 sm:table-cell">{fmtDateTime(m.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Message" />
            <CardBody>
              <div className="rounded-2xl rounded-br-md bg-ink-950 px-4 py-3 text-sm leading-relaxed text-ink-100">
                <p className="whitespace-pre-wrap">{c.message}</p>
              </div>
              {promo && (
                <p className="mt-3 text-xs text-ink-600">
                  Linked promotion:{" "}
                  <Link href={`/hq/promotions/${promo.id}`} className="font-medium text-brand-700 hover:underline">
                    {promo.name}
                  </Link>
                  {promo.code && <span className="font-mono"> · {promo.code}</span>}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
