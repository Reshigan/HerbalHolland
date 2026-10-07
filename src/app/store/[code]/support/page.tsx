import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { assignableStaff, listTickets, ticketCounts, ticketView, ticketWhere, type SupportScope } from "@/server/support";
import { PageHeader } from "@/components/ui/page";
import { pageParam } from "@/components/ui/pagination";
import { TicketQueue, type QueueParams } from "@/components/support/queue";

export const metadata = { title: "Support" };

const PAGE_SIZE = 25;

export default async function StoreSupportPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<QueueParams> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const scope: SupportScope = { kind: "STORES", storeIds: [store.id] };
  const now = new Date();
  const page = pageParam(sp.page);
  const [{ rows, total }, counts, staff] = await Promise.all([listTickets(ticketWhere(scope, sp, { userId: user.id, now }), page, PAGE_SIZE), ticketCounts(scope, user.id, now), assignableStaff(scope)]);
  const base = `/store/${store.code}/support`;
  return (
    <>
      <PageHeader overline={`Members · ${store.name}`} title="Support" description={`Requests from members about orders ${store.name} fulfilled. Reply within one business day; HQ sees these too and handles everything else.`} />
      <TicketQueue base={base} rows={rows} total={total} page={page} pageSize={PAGE_SIZE} counts={counts} view={ticketView(sp.view)} sp={sp} staff={staff} now={now} orderHref={(t) => (t.orderCode ? `/store/${store.code}/orders?q=${t.orderCode}` : null)} />
    </>
  );
}
