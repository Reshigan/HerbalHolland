import { notFound } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { returnDetail, type ReturnScope } from "@/server/returns";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { ReturnStatusBadge } from "@/components/returns/badges";
import { ReturnPanel } from "@/components/returns/detail";
import { fmtDateTime } from "@/lib/format";
import { approveReturn, bookReturnCollection, declineReturn, receiveReturnAction, refundReturnAction } from "../actions";

export const metadata = { title: "Return" };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const returnScope: ReturnScope = scope.kind === "HQ" ? { kind: "HQ" } : { kind: "STORES", storeIds: await scopedStoreIds(scope) };
  const d = await returnDetail(id, returnScope);
  if (!d) notFound();
  return (
    <>
      <BackLink href="/hq/returns">Returns</BackLink>
      <PageHeader
        overline={`Return · requested ${fmtDateTime(d.r.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{d.r.number}</span> <ReturnStatusBadge status={d.r.status} />
          </span>
        }
        description={`Order ${d.order.code} · ${d.order.customer.firstName} ${d.order.customer.lastName ?? ""} · fulfilled by ${d.order.store.name}`}
      />
      <ReturnPanel
        d={d}
        canWork
        actions={{ approve: approveReturn.bind(null, id), decline: declineReturn.bind(null, id), book: bookReturnCollection.bind(null, id), receive: receiveReturnAction.bind(null, id), refund: refundReturnAction.bind(null, id) }}
        links={{ order: `/hq/orders/${d.order.code}`, member: `/hq/customers/${d.order.customer.id}` }}
      />
    </>
  );
}
