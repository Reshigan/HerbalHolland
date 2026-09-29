import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { listReturns, returnCounts, returnView, returnWhere, type ReturnScope } from "@/server/returns";
import { PageHeader } from "@/components/ui/page";
import { pageParam } from "@/components/ui/pagination";
import { ReturnQueue, type ReturnQueueParams } from "@/components/returns/queue";

export const metadata = { title: "Returns" };

const PAGE_SIZE = 25;

export default async function StoreReturnsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<ReturnQueueParams> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const scope: ReturnScope = { kind: "STORES", storeIds: [store.id] };
  const page = pageParam(sp.page);
  const [{ rows, total }, counts] = await Promise.all([listReturns(returnWhere(scope, sp), page, PAGE_SIZE), returnCounts(scope)]);
  const base = `/store/${store.code}`;
  return (
    <>
      <PageHeader overline="Members" title="Returns" description={`Members sending back items from orders ${store.name} fulfilled. Decide within one business day, book the courier by hand, mark the parcel received, then refund — the credit note posts here.`} />
      <ReturnQueue base={`${base}/returns`} rows={rows} total={total} page={page} pageSize={PAGE_SIZE} counts={counts} view={returnView(sp.view)} sp={sp} orderHref={(o) => `${base}/orders/${o.id}`} now={new Date()} />
    </>
  );
}
