// The account's orders, newest first, by status, a page at a time.
import Link from "next/link";
import type { Metadata } from "next";
import { Package } from "lucide-react";
import { listTradeOrders } from "@/server/trade/orders";
import { Chip, Container } from "@/components/shop/ui";
import { TradePager } from "@/components/trade/pager";
import { ButtonLink } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { OrderStatusTag } from "@/components/trade/status";
import { FULFILMENT_LABEL, PAY_LABEL } from "@/components/trade/format";
import { fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import type { TradeOrderStatus } from "@/generated/prisma/client";
import { requireBuyer } from "../_lib/context";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };

const PAGE = 20;
const FILTERS: [string, string][] = [["ALL", "All"], ["OPEN", "Open"], ["PENDING_PAYMENT", "Awaiting EFT"], ["PLACED", "Confirmed"], ["READY", "Ready to collect"], ["SHIPPED", "Shipped"], ["COLLECTED", "Collected"], ["CANCELLED", "Cancelled"]];

export default async function TradeOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const [sp, buyer] = await Promise.all([searchParams, requireBuyer("/trade/orders")]);
  const status = FILTERS.some(([k]) => k === sp.status) ? (sp.status as TradeOrderStatus | "OPEN" | "ALL") : "ALL";
  const page = pageParam(sp.page);
  const { rows, total, pageSize } = await listTradeOrders({ accountId: buyer.tradeAccountId, status, page, pageSize: PAGE });
  const href = (o: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = o.status ?? status;
    if (s && s !== "ALL") p.set("status", s);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const qs = p.toString();
    return qs ? `/trade/orders?${qs}` : "/trade/orders";
  };

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow text-brand-500">{buyer.account.name}</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Orders</h1>
          <p className="mt-2 text-ink-400">Every trade order placed for the account, with its pro forma, tracking, collection code and invoice.</p>
        </div>
        <ButtonLink href="/trade/range" variant="outline-dark" size="md">
          New order
        </ButtonLink>
      </div>
      <nav className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Order status">
        {FILTERS.map(([k, label]) => (
          <Chip key={k} href={href({ status: k, page: 1 })} active={status === k}>
            {label}
          </Chip>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <Package className="mx-auto h-9 w-9 text-brand-500" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 font-display text-xl font-semibold text-white">No orders {status === "ALL" ? "yet" : "here"}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">{status === "ALL" ? "Your first order starts in the range: add whole cases, then choose courier or collection." : "Nothing with this status right now."}</p>
          {status === "ALL" && (
            <ButtonLink href="/trade/range" size="md" className="mt-6">
              Browse the range
            </ButtonLink>
          )}
        </div>
      ) : (
        <ul className="mt-6 space-y-3" data-testid="orders">
          {rows.map((o) => (
            <li key={o.id} className="rounded-2xl border border-ink-800 bg-ink-900/60 transition hover:border-ink-600">
              <Link href={`/trade/orders/${o.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tnum font-display text-lg font-semibold text-white">{o.number}</span>
                    <OrderStatusTag status={o.status} />
                  </div>
                  <p className="mt-1 text-sm text-ink-300">
                    {FULFILMENT_LABEL[o.fulfilment] ?? o.fulfilment}
                    {o.fulfilment === "COLLECT" ? ` at ${o.store.name}` : ` (${o.store.name})`} · {PAY_LABEL[o.payMethod] ?? o.payMethod} · {o._count.lines} {o._count.lines === 1 ? "line" : "lines"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-450">
                    Placed {fmtDateTime(o.createdAt)}
                    {o.reference ? ` · your ref ${o.reference}` : ""}
                    {o.invoiceNumber ? ` · invoice ${o.invoiceNumber}` : ""}
                  </p>
                </div>
                <div className="tnum shrink-0 sm:text-right">
                  <div className="font-display text-lg font-semibold text-white">{zar(o.totalCents)}</div>
                  <div className="text-xs text-ink-400">incl. VAT</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <TradePager page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} noun="orders" />
    </Container>
  );
}
