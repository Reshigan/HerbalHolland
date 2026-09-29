// One ticket for staff: the conversation, the member and the order it's about, the SLA clocks and the tools to work it.
// Shared by HQ and the store back office; each passes its own actions and links.
import Link from "next/link";
import { Camera, Mail, Phone, UserRound } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Detail } from "@/components/ui/misc";
import { Notice } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { ViewOnly } from "@/components/hq/ui";
import { CategoryBadge, PriorityBadge, SlaBadge, TicketStatusBadge } from "./badges";
import { AssignForm, PriorityForm, ReplyForm, ResolveForm, type StaffAction } from "./staff-forms";
import type { ticketThread } from "@/server/support";
import { CANNED_REPLIES, SUPPORT_CATEGORY, fillCanned, firstNameOf, slaLabel } from "@/lib/support";
import { displayPhone } from "@/lib/sa";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export type Thread = NonNullable<Awaited<ReturnType<typeof ticketThread>>>;

const ACTION_LABEL: Record<string, string> = {
  "support.create": "Opened",
  "support.reply": "Replied",
  "support.member_reply": "Member replied",
  "support.assign": "Assigned",
  "support.priority": "Priority changed",
  "support.resolve": "Resolved",
};

export function TicketPanel({ d, staff, canWork, actions, links, agentName, now }: {
  d: Thread;
  staff: { id: string; name: string }[];
  /** Read-only viewers (budtenders) see the thread but can't reply. */
  canWork: boolean;
  actions: { reply: StaffAction; assign: StaffAction; priority: StaffAction; resolve: StaffAction };
  links: { order: string | null; member: string | null };
  agentName: string;
  now: Date;
}) {
  const { ticket: t, customer, order, sla } = d;
  const canned = CANNED_REPLIES.map((c) => ({ key: c.key, label: c.label, body: fillCanned(c.body, { name: firstNameOf(t.name), orderCode: t.orderCode, agent: firstNameOf(agentName) }) }));
  const channel = t.email ? `Sent by email to ${t.email}` : t.phone || customer ? "Sent by SMS (no email address)" : "No way to reach the member";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader
            title="Conversation"
            description={
              <span className="flex flex-wrap items-center gap-1.5">
                <CategoryBadge category={t.category} /> <PriorityBadge priority={t.priority} /> <span>{SUPPORT_CATEGORY[t.category].hint}</span>
              </span>
            }
          />
          <CardBody>
            <ol className="space-y-4">
              {d.ticket.messages.map((m) => {
                const mine = m.authorType === "STAFF";
                const system = m.authorType === "SYSTEM";
                return (
                  <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", system ? "w-full bg-ink-50 text-center text-ink-500" : mine ? "bg-ink-900 text-ink-50" : "bg-brand-50 text-ink-850")}>
                      {!system && (
                        <div className={cn("mb-1 flex items-center gap-2 text-xs", mine ? "text-ink-300" : "text-ink-500")}>
                          <span className="font-semibold">{mine ? `${m.authorName ?? "Staff"} · Herbal Holland` : m.authorName ?? t.name}</span>
                          <span>{fmtDateTime(m.createdAt)}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      {system && <span className="mt-1 block text-xs">{fmtDateTime(m.createdAt)}</span>}
                      {m.attachmentUploadId && (
                        <a href={`/media/${m.attachmentUploadId}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline">
                          <Camera className="h-3.5 w-3.5" aria-hidden /> Photo attached
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.status === "RESOLVED" ? "Reply (reopens the request)" : "Reply"} description={t.status === "WAITING_MEMBER" ? "Our reply is out; you can add to it." : undefined} />
          <CardBody>{canWork ? <ReplyForm action={actions.reply} canned={canned} memberName={firstNameOf(t.name)} channel={channel} /> : <ViewOnly>View only — managers and owners reply to members.</ViewOnly>}</CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Service level" />
          <CardBody className="space-y-3">
            <SlaBadge t={t} sla={sla} now={now} />
            <dl className="divide-y divide-ink-100 border-t border-ink-100 text-sm">
              <Detail label="Opened">{fmtDateTime(t.createdAt)}</Detail>
              <Detail label="First reply">{t.firstRespondedAt ? `${fmtDateTime(t.firstRespondedAt)}${t.firstRespondedAt <= t.firstResponseDueAt ? " · in time" : " · late"}` : slaLabel(t.firstResponseDueAt, now)}</Detail>
              <Detail label="Resolve">{t.resolvedAt ? `${fmtDateTime(t.resolvedAt)}${t.resolvedAt <= t.resolveDueAt ? " · in time" : " · late"}` : sla.resolve === "paused" ? "clock paused" : slaLabel(t.resolveDueAt, now)}</Detail>
              <Detail label="Status">
                <TicketStatusBadge status={t.status} />
              </Detail>
            </dl>
            {sla.overdue && <Notice tone="danger">Overdue against the SLA: first reply within 1 business day, resolved within 5.</Notice>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Work it" />
          <CardBody className="space-y-4">
            <AssignForm action={actions.assign} staff={staff} current={t.assignedToId} disabled={!canWork} />
            <PriorityForm action={actions.priority} current={t.priority} disabled={!canWork} />
            {canWork && t.status !== "RESOLVED" && <ResolveForm action={actions.resolve} number={t.number} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={customer ? "Member" : "From"} />
          <CardBody className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-ink-400" aria-hidden />
              {customer && links.member ? (
                <Link href={links.member} className="font-semibold text-ink-900 hover:text-brand-700">
                  {t.name}
                </Link>
              ) : (
                <span className="font-semibold text-ink-900">{t.name}</span>
              )}
              {customer && <TierBadge tier={customer.tier} />}
              {!customer && <Badge tone="neutral">Not a member</Badge>}
            </div>
            {customer && <p className="font-mono text-xs text-ink-500">{customer.memberNo}</p>}
            {t.email && (
              <p className="flex items-center gap-2 text-ink-700 [overflow-wrap:anywhere]">
                <Mail className="h-4 w-4 shrink-0 text-ink-400" aria-hidden /> {t.email}
              </p>
            )}
            {(t.phone ?? customer?.phone) && (
              <p className="flex items-center gap-2 text-ink-700">
                <Phone className="h-4 w-4 shrink-0 text-ink-400" aria-hidden /> {displayPhone((t.phone ?? customer?.phone)!)}
              </p>
            )}
          </CardBody>
        </Card>

        {t.orderCode && (
          <Card>
            <CardHeader title="Order" />
            <CardBody className="text-sm">
              {order ? (
                <dl className="divide-y divide-ink-100">
                  <Detail label="Code">{links.order ? <Link href={links.order} className="font-mono hover:text-brand-700">{order.code}</Link> : <span className="font-mono">{order.code}</span>}</Detail>
                  <Detail label="Status">
                    <StatusBadge status={order.status} />
                  </Detail>
                  <Detail label="Fulfilled by">{order.store.name}</Detail>
                  <Detail label="Total">{zar(order.totalCents)}</Detail>
                  <Detail label="Placed">{fmtDateTime(order.createdAt)}</Detail>
                </dl>
              ) : (
                <p className="text-ink-600">
                  Quoted order <span className="font-mono">{t.orderCode}</span>
                  {t.customerId ? " isn't one of this member's orders" : " couldn't be tied to the person asking"} — check it before sharing anything about it.
                </p>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="History" />
          <CardBody>
            <ol className="space-y-2 text-xs text-ink-600">
              {d.history.map((h) => (
                <li key={h.id} className="flex justify-between gap-3">
                  <span>
                    <b className="font-semibold text-ink-800">{ACTION_LABEL[h.action] ?? h.action}</b> · {h.actorName ?? "System"}
                  </span>
                  <span className="whitespace-nowrap text-ink-400">{timeAgo(h.at, now)}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
