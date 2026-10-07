import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { assignableStaff, ticketThread, type SupportScope } from "@/server/support";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/store/ui";
import { TicketStatusBadge } from "@/components/support/badges";
import { TicketPanel } from "@/components/support/ticket-panel";
import { fmtDateTime } from "@/lib/format";
import { assignTicketAction, replyTicket, resolveTicketAction, setPriorityAction } from "../actions";

export const metadata = { title: "Support request" };

export default async function StoreTicketPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const scope: SupportScope = { kind: "STORES", storeIds: [store.id] };
  const [d, staff] = await Promise.all([ticketThread(id, scope), assignableStaff(scope)]);
  if (!d) notFound();
  const t = d.ticket;
  const base = `/store/${store.code}`;
  return (
    <>
      <BackLink href={`${base}/support`}>Support</BackLink>
      <PageHeader
        overline={`${t.number} · opened ${fmtDateTime(t.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {t.subject} <TicketStatusBadge status={t.status} />
          </span>
        }
        description={`${t.name}${t.orderCode ? ` · order ${t.orderCode}` : ""}`}
      />
      <TicketPanel
        d={d}
        staff={staff}
        canWork={canManageStore(user)}
        actions={{ reply: replyTicket.bind(null, store.code, t.id), assign: assignTicketAction.bind(null, store.code, t.id), priority: setPriorityAction.bind(null, store.code, t.id), resolve: resolveTicketAction.bind(null, store.code, t.id) }}
        links={{ order: d.order ? `${base}/orders/${d.order.id}` : null, member: null }}
        agentName={user.name}
        now={new Date()}
      />
    </>
  );
}
