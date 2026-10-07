import { notFound } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { assignableStaff, ticketThread, type SupportScope } from "@/server/support";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { TicketStatusBadge } from "@/components/support/badges";
import { TicketPanel } from "@/components/support/ticket-panel";
import { fmtDateTime } from "@/lib/format";
import { assignTicketAction, replyTicket, resolveTicketAction, setPriorityAction } from "../actions";

export const metadata = { title: "Support request" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const supportScope: SupportScope = scope.kind === "HQ" ? { kind: "HQ" } : { kind: "STORES", storeIds: await scopedStoreIds(scope) };
  const [d, staff] = await Promise.all([ticketThread(id, supportScope), assignableStaff(supportScope)]);
  if (!d) notFound();
  const t = d.ticket;
  return (
    <>
      <BackLink href="/hq/support">Support</BackLink>
      <PageHeader
        overline={`${t.number} · opened ${fmtDateTime(t.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {t.subject} <TicketStatusBadge status={t.status} />
          </span>
        }
        description={`${t.name}${t.customerId ? "" : " (not a member)"}${t.orderCode ? ` · order ${t.orderCode}` : ""}`}
      />
      <TicketPanel
        d={d}
        staff={staff}
        canWork
        actions={{ reply: replyTicket.bind(null, t.id), assign: assignTicketAction.bind(null, t.id), priority: setPriorityAction.bind(null, t.id), resolve: resolveTicketAction.bind(null, t.id) }}
        links={{ order: d.order ? `/hq/orders/${d.order.code}` : null, member: d.customer ? `/hq/customers/${d.customer.id}` : null }}
        agentName={user.name}
        now={new Date()}
      />
    </>
  );
}
