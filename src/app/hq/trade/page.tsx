import Link from "next/link";
import { ArrowRight, Briefcase, ChartColumn, Settings } from "lucide-react";
import { db } from "@/server/db";
import { tradeQueue } from "@/server/dashboard";
import { getSettings } from "@/server/settings";
import { ageTradeLedger, sumAgedBalances } from "@/lib/trade-ageing";
import { zar, zarCompact } from "@/lib/money";
import { fmtDateTime, num, timeAgo } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ViewOnly } from "@/components/hq/ui";
import { TradeAccountBadge, TradeOrderBadge, kindLabel, termsLabel } from "@/components/admin/trade-ui";
import { accountWhere, orderWhere, tradeScope } from "./scope";
import { licencesToCheck } from "@/server/trade/licences";
import { TRADE_LICENCES } from "@/lib/trade-licences";

export const metadata = { title: "Trade" };

export default async function TradeOverviewPage() {
  const s = await tradeScope();
  const aw = accountWhere(s);
  const ow = orderWhere(s);
  const [queue, accounts, toPick, pending, eft, picking, held, entries, settings, toCheck] = await Promise.all([
    tradeQueue(s.ids, s.networkWide),
    db.tradeAccount.groupBy({ by: ["status"], where: aw, _count: true }),
    db.tradeOrder.count({ where: { ...ow, fulfilment: "COURIER", status: { in: ["PLACED", "PICKING"] } } }),
    db.tradeAccount.findMany({ where: { ...aw, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 6, select: { id: true, number: true, name: true, kind: true, city: true, createdAt: true } }),
    db.tradeOrder.findMany({ where: { ...ow, status: "PENDING_PAYMENT" }, orderBy: { createdAt: "asc" }, take: 6, select: { id: true, number: true, totalCents: true, createdAt: true, account: { select: { name: true } } } }),
    db.tradeOrder.findMany({
      where: { ...ow, fulfilment: "COURIER", status: { in: ["PLACED", "PICKING"] } },
      orderBy: { createdAt: "asc" }, take: 6,
      select: { id: true, number: true, status: true, totalCents: true, createdAt: true, account: { select: { name: true } }, store: { select: { name: true, code: true } } },
    }),
    db.tradeAccount.findMany({ where: { ...aw, status: "ON_HOLD" }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, number: true, name: true, holdReason: true, terms: true, paymentDays: true } }),
    // The ledger is small next to retail (the aged balances report reads it the same way); aged FIFO as of now.
    db.tradeLedgerEntry.findMany({ where: s.networkWide ? {} : { account: aw }, select: { tradeAccountId: true, kind: true, cents: true, dueAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    getSettings(),
    s.networkWide ? licencesToCheck({ take: 6 }) : db.tradeAccount.findMany({ where: aw, select: { id: true } }).then((rows) => licencesToCheck({ accountIds: rows.map((r) => r.id), take: 6 })),
  ]);
  const n = (status: string) => accounts.find((a) => a.status === status)?._count ?? 0;
  const aged = sumAgedBalances(ageTradeLedger(entries).values());
  const overdueAccounts = [...ageTradeLedger(entries).values()].filter((b) => b.overdue > 0).length;
  const t = settings.trade;

  return (
    <>
      <PageHeader
        overline="Trade"
        title="Trade overview"
        description="Businesses buying at ex-VAT trade prices: applications to approve, EFTs to confirm, orders to pick at the DC or hand over at a store, and what the accounts owe."
        actions={
          <>
            <ButtonLink href="/hq/trade/accounts?status=PENDING" variant="outline">Applications</ButtonLink>
            <ButtonLink href="/hq/trade/orders?view=open">Open orders</ButtonLink>
          </>
        }
      />
      {!s.canEdit && <ViewOnly className="mb-6">Your region&apos;s trade orders and the accounts that buy from it — view only. The HQ team approves accounts and works the orders.</ViewOnly>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applications waiting" value={num(n("PENDING"))} sub={<Link href="/hq/trade/accounts?status=PENDING" className="font-semibold text-brand-700 hover:underline">review →</Link>} />
        <Stat label="Open orders" value={num(queue.open)} sub={<Link href="/hq/trade/orders?view=open" className="font-semibold text-brand-700 hover:underline">{num(toPick)} to pick at the DC · {num(queue.ready)} ready to collect →</Link>} />
        <Stat label="Awaiting EFT" value={num(queue.pendingEft)} sub={<Link href="/hq/trade/orders?view=eft" className="font-semibold text-brand-700 hover:underline">confirm payments → </Link>} />
        <Stat label="Accounts on hold" value={num(queue.onHold)} sub={<Link href="/hq/trade/accounts?status=ON_HOLD" className="font-semibold text-brand-700 hover:underline">{num(n("APPROVED"))} approved · {num(n("CLOSED"))} closed →</Link>} />
        <Stat label="Balance outstanding" value={zarCompact(aged.total)} sub={`${num(aged.openItems)} open invoice${aged.openItems === 1 ? "" : "s"}`} />
        <Stat label="Overdue" value={zarCompact(aged.overdue)} sub={overdueAccounts ? `${num(overdueAccounts)} account${overdueAccounts === 1 ? "" : "s"} past due` : "nothing past due"} />
        <Stat label="90+ days" value={zarCompact(aged.d90plus)} sub="more than 60 days past due" />
        <Stat label="Minimum order" value={zar(t.minOrderCents)} sub={`ex VAT · courier ${zar(t.deliveryCents)}, free over ${zar(t.freeDeliveryOverCents)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Applications waiting" description="New trade accounts from the portal, oldest first" action={<Link href="/hq/trade/accounts?status=PENDING" className="text-sm font-semibold text-brand-700 hover:underline">All pending</Link>} />
          {pending.length === 0 ? (
            <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title="No applications waiting" className="py-8">Applications from the trade portal appear here for approval.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {pending.map((a) => (
                <li key={a.id}>
                  <Link href={`/hq/trade/accounts/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{a.name}</span>
                      <span className="block text-xs text-ink-500">{a.number} · {kindLabel(a.kind)} · {a.city} · applied {timeAgo(a.createdAt)}</span>
                    </span>
                    <TradeAccountBadge status="PENDING" />
                    <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Licences to check" description={`Documents from applications and renewals, oldest first${toCheck.total ? ` · ${num(toCheck.total)} waiting` : ""}. Check each with its issuer, then verify it on the account.`} />
          {toCheck.rows.length === 0 ? (
            <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title="Nothing to check" className="py-8">Licences uploaded with applications and renewals appear here.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100" data-testid="licences-to-check">
              {toCheck.rows.map((l) => (
                <li key={l.id}>
                  <Link href={`/hq/trade/accounts/${l.account.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{l.account.name}</span>
                      <span className="block text-xs text-ink-500">{l.account.number} · {TRADE_LICENCES[l.kind].name} · uploaded {timeAgo(l.createdAt)}</span>
                    </span>
                    <Badge tone="blue" dot>To check</Badge>
                    <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="EFTs to confirm" description={`Pro formas waiting for the money to show on the bank statement (orders lapse after ${t.eftHoldDays} days)`} action={<Link href="/hq/trade/orders?view=eft" className="text-sm font-semibold text-brand-700 hover:underline">All awaiting EFT</Link>} />
          {eft.length === 0 ? (
            <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title="Nothing awaiting payment" className="py-8">EFT orders wait here until HQ confirms the payment against its reference.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {eft.map((o) => (
                <li key={o.id}>
                  <Link href={`/hq/trade/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-900"><span className="font-mono">{o.number}</span> · {o.account.name}</span>
                      <span className="block text-xs text-ink-500">reference HH-{o.number} · placed {fmtDateTime(o.createdAt)}</span>
                    </span>
                    <span className="tnum text-sm font-semibold text-ink-900">{zar(o.totalCents)}</span>
                    <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="To pick at the DC" description="Confirmed courier orders, oldest first" action={<Link href="/hq/trade/orders?view=pick" className="text-sm font-semibold text-brand-700 hover:underline">All to pick</Link>} />
          {picking.length === 0 ? (
            <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title="Nothing to pick" className="py-8">Confirmed courier orders queue here for the distribution centre.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {picking.map((o) => (
                <li key={o.id}>
                  <Link href={`/hq/trade/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-900"><span className="font-mono">{o.number}</span> · {o.account.name}</span>
                      <span className="block text-xs text-ink-500">{o.store.name} · {zar(o.totalCents)} · waiting {timeAgo(o.createdAt)}</span>
                    </span>
                    <TradeOrderBadge status={o.status} />
                    <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Accounts on hold" description="No new on-account orders until the hold is lifted (EFT still works)" action={<Link href="/hq/trade/accounts?status=ON_HOLD" className="text-sm font-semibold text-brand-700 hover:underline">All on hold</Link>} />
          {held.length === 0 ? (
            <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title="No accounts on hold" className="py-8">Overdue accounts go on hold by themselves and come off when they settle.</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {held.map((a) => (
                <li key={a.id}>
                  <Link href={`/hq/trade/accounts/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{a.name}</span>
                      <span className="block text-xs text-ink-500">{a.number} · {termsLabel(a)} · {a.holdReason === "overdue" ? "overdue invoices" : a.holdReason === "licence" ? "a required licence lapsed" : a.holdReason ?? "held by HQ"}</span>
                    </span>
                    <Badge tone="red" dot>On hold</Badge>
                    <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Reports and settings" description="Trade sales by account, product and month; what the accounts owe by age; the channel's terms" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Link href="/hq/reports/trade-sales" className="flex items-start gap-3 rounded-xl border border-ink-150 p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
            <ChartColumn className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            <span><span className="block text-sm font-semibold text-ink-900">Trade sales</span><span className="block text-xs text-ink-500">Which accounts buy, what they take and what it&apos;s worth</span></span>
          </Link>
          <Link href="/hq/reports/trade-aged-balances" className="flex items-start gap-3 rounded-xl border border-ink-150 p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
            <ChartColumn className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            <span><span className="block text-sm font-semibold text-ink-900">Trade aged balances</span><span className="block text-xs text-ink-500">Current, 30, 60 and 90+ days per account, as of today</span></span>
          </Link>
          <Link href="/hq/settings#trade" className="flex items-start gap-3 rounded-xl border border-ink-150 p-4 transition hover:border-brand-300 hover:bg-brand-50/40">
            <Settings className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            <span><span className="block text-sm font-semibold text-ink-900">Trade settings</span><span className="block text-xs text-ink-500">Minimum order, courier and handling fees, EFT hold, overdue grace, statement day, bank details{t.bank.accountNumber ? "" : " — bank details not set yet"}</span></span>
          </Link>
        </CardBody>
      </Card>
    </>
  );
}
