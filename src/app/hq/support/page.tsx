import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { assignableStaff, listTickets, ticketCounts, ticketView, ticketWhere, type SupportScope } from "@/server/support";
import { PageHeader } from "@/components/ui/page";
import { pageParam } from "@/components/ui/pagination";
import { TicketQueue, type QueueParams } from "@/components/support/queue";

export const metadata = { title: "Support" };

const PAGE_SIZE = 25;

export default async function SupportPage({ searchParams }: { searchParams: Promise<QueueParams> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const supportScope: SupportScope = scope.kind === "HQ" ? { kind: "HQ" } : { kind: "STORES", storeIds: ids };
  const now = new Date();
  const page = pageParam(sp.page);
  const [{ rows, total }, counts, staff] = await Promise.all([
    listTickets(ticketWhere(supportScope, sp, { userId: user.id, now }), page, PAGE_SIZE),
    ticketCounts(supportScope, user.id, now),
    assignableStaff(supportScope),
  ]);
  return (
    <>
      <PageHeader
        overline="Members"
        title="Support"
        description="Requests from members and visitors, from /support and the Rewards app. First reply within one business day, resolved within five (SAST). Store managers see the tickets about their own orders."
      />
      <TicketQueue base="/hq/support" rows={rows} total={total} page={page} pageSize={PAGE_SIZE} counts={counts} view={ticketView(sp.view)} sp={sp} staff={staff} now={now} orderHref={(t) => (t.orderCode && t.storeId && ids.includes(t.storeId) ? `/hq/orders/${t.orderCode}` : null)} />
    </>
  );
}
