import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { listReturns, returnCounts, returnView, returnWhere, type ReturnScope } from "@/server/returns";
import { PageHeader } from "@/components/ui/page";
import { pageParam } from "@/components/ui/pagination";
import { ReturnQueue, type ReturnQueueParams } from "@/components/returns/queue";

export const metadata = { title: "Returns" };

const PAGE_SIZE = 25;

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<ReturnQueueParams> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const returnScope: ReturnScope = scope.kind === "HQ" ? { kind: "HQ" } : { kind: "STORES", storeIds: await scopedStoreIds(scope) };
  const page = pageParam(sp.page);
  const [{ rows, total }, counts] = await Promise.all([listReturns(returnWhere(returnScope, sp), page, PAGE_SIZE), returnCounts(returnScope)]);
  return (
    <>
      <PageHeader
        overline="Members"
        title="Returns"
        description="Members' return requests on delivered online orders: faulty, damaged or wrong within 6 months (CPA s56), a change of mind within 7 days (ECTA s44). Approve, book the collection, mark it received, refund. The fulfilling store sees its own."
      />
      <ReturnQueue base="/hq/returns" rows={rows} total={total} page={page} pageSize={PAGE_SIZE} counts={counts} view={returnView(sp.view)} sp={sp} orderHref={(o) => `/hq/orders/${o.code}`} now={new Date()} />
    </>
  );
}
