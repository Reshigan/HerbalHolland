import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { returnDetail, type ReturnScope } from "@/server/returns";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/store/ui";
import { ReturnStatusBadge } from "@/components/returns/badges";
import { ReturnPanel } from "@/components/returns/detail";
import { fmtDateTime } from "@/lib/format";
import { approveReturn, bookReturnCollection, declineReturn, receiveReturnAction, refundReturnAction } from "../actions";

export const metadata = { title: "Return" };

export default async function StoreReturnPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const scope: ReturnScope = { kind: "STORES", storeIds: [store.id] };
  const d = await returnDetail(id, scope);
  if (!d) notFound();
  const base = `/store/${store.code}`;
  return (
    <>
      <BackLink href={`${base}/returns`}>Returns</BackLink>
      <PageHeader
        overline={`Return · requested ${fmtDateTime(d.r.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{d.r.number}</span> <ReturnStatusBadge status={d.r.status} />
          </span>
        }
        description={`Order ${d.order.code} · ${d.order.customer.firstName} ${d.order.customer.lastName ?? ""}`}
      />
      <ReturnPanel
        d={d}
        canWork={canManageStore(user)}
        actions={{ approve: approveReturn.bind(null, store.code, id), decline: declineReturn.bind(null, store.code, id), book: bookReturnCollection.bind(null, store.code, id), receive: receiveReturnAction.bind(null, store.code, id), refund: refundReturnAction.bind(null, store.code, id) }}
        links={{ order: `${base}/orders/${d.order.id}`, member: null }}
      />
    </>
  );
}
