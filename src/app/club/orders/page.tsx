import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { memberOrders } from "@/server/shop/club";
import { ProductArt } from "@/components/product/art";
import { ReorderButton } from "@/components/shop/reorder-button";
import { Container, Pager, Tag, type TagTone } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { fmtDate } from "@/lib/format";
import { zar } from "@/lib/money";

export const metadata = { title: "Orders" };

const TONE: Record<string, [string, TagTone]> = {
  PENDING_PAYMENT: ["Awaiting payment", "amber"], PLACED: ["Placed", "orange"], PICKING: ["Being packed", "violet"], READY: ["Ready to collect", "green"],
  OUT_FOR_DELIVERY: ["Out for delivery", "violet"], COMPLETED: ["Completed", "neutral"], CANCELLED: ["Cancelled", "red"],
};
const PAGE = 10;

export default async function ClubOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/orders");
  const page = pageParam((await searchParams).page);
  const { rows, total } = await memberOrders(customer.id, page, PAGE);

  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Your orders</h1>
      <p className="mt-1 text-sm text-ink-400">Online orders for collection and delivery. In-store purchases appear under Invoices.</p>
      {rows.length ? (
        <>
          <ul className="mt-6 space-y-3">
            {rows.map((o) => {
              const [label, tone] = TONE[o.status];
              return (
                <li key={o.id} className="rounded-2xl border border-ink-800 bg-ink-900/60 transition hover:border-ink-600">
                  <Link href={`/orders/${o.code}`} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="flex -space-x-3">
                      {o.lines.map((l) => (
                        <ProductArt key={l.id} slug={l.variant.product.slug} strain={l.variant.product.strain} regClass={l.variant.product.regClass} label={l.variant.product.name} className="h-14 w-14 rounded-xl ring-2 ring-ink-950" />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">Order {o.code}</span>
                        <Tag tone={tone}>{label}</Tag>
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-400">
                        {o.lines.map((l) => l.variant.product.name).join(", ")}
                        {o._count.lines > o.lines.length ? ` +${o._count.lines - o.lines.length} more` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-450">
                        {fmtDate(o.createdAt)} · {o.fulfilment === "COLLECT" ? `Collect at ${o.store.name}` : o.fulfilment === "SAME_DAY" ? "Same-day delivery" : "Courier delivery"}
                      </p>
                    </div>
                    <div className="tnum shrink-0 font-display text-lg font-semibold text-white sm:text-right">{zar(o.totalCents - o.pointsRedeemed * 100)}</div>
                  </Link>
                  {o.status === "COMPLETED" && (
                    <div className="border-t border-ink-800 px-4 py-3">
                      <ReorderButton orderId={o.id} size="sm" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={PAGE} total={total} href={(p) => `/club/orders?page=${p}`} noun="orders" />
        </>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <Package className="mx-auto h-9 w-9 text-ink-600" />
          <h2 className="mt-4 font-display text-xl font-semibold text-white">No online orders yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">Order online and collect in store, or have it delivered — your orders will show up here.</p>
          <ButtonLink href="/shop" className="mt-6">
            Shop the range
          </ButtonLink>
        </div>
      )}
    </Container>
  );
}
