import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { shiftCash } from "@/server/finance";
import { cashTone, hrefWith } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ButtonLink } from "@/components/ui/button";
import { Donut } from "@/components/charts/donut";
import { BackLink } from "@/components/store/ui";

export const metadata = { title: "Cash-up" };
const PAGE_SIZE = 25;
const METHOD: Record<string, string> = { CARD: "Card (tap)", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Points", ONLINE: "Paid online", VOUCHER: "Gift voucher", ACCOUNT: "On account (invoiced)" };

export default async function ShiftPage({ params, searchParams }: { params: Promise<{ code: string; shiftId: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ code, shiftId }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const shift = await db.shift.findFirst({ where: { id: shiftId, storeId: store.id } });
  if (!shift) notFound();
  const page = pageParam(sp.page);
  const [cash, tenders, totals, sales, count, people, device] = await Promise.all([
    shiftCash(shift.id),
    db.payment.groupBy({ by: ["method"], where: { sale: { shiftId: shift.id } }, _sum: { amountCents: true }, _count: true }),
    db.sale.groupBy({ by: ["kind"], where: { shiftId: shift.id }, _sum: { totalCents: true }, _count: true }),
    db.sale.findMany({
      where: { shiftId: shift.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { staff: { select: { name: true } }, customer: { select: { firstName: true, lastName: true } }, payments: { select: { method: true, amountCents: true } }, lines: { select: { qty: true } } },
    }),
    db.sale.count({ where: { shiftId: shift.id } }),
    db.user.findMany({ where: { id: { in: [shift.openedById, shift.closedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    shift.deviceId ? db.device.findUnique({ where: { id: shift.deviceId }, select: { name: true } }) : null,
  ]);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const expected = shift.expectedCashCents ?? cash.expectedCents;
  const variance = shift.countedCashCents != null ? shift.countedCashCents - expected : null;
  const saleTotal = totals.find((t) => t.kind === "SALE");
  const refundTotal = totals.find((t) => t.kind === "REFUND");
  // Trade sales on account are invoiced to a business account on HQ's ledger: not in the drawer, not a card settlement.
  // They sit outside the tender reconciliation.
  const money = tenders.filter((t) => t.method !== "ACCOUNT");
  const onAccount = tenders.find((t) => t.method === "ACCOUNT");
  const moneyTotal = money.reduce((a, t) => a + (t._sum.amountCents ?? 0), 0);
  const path = `/store/${store.code}/cash-ups/${shift.id}`;

  return (
    <>
      <BackLink href={`/store/${store.code}/cash-ups`}>Cash-ups</BackLink>
      <PageHeader
        overline={`Shift · ${device?.name ?? "Till"}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {fmtDateTime(shift.openedAt)}
            {shift.closedAt ? <Badge tone={cashTone(variance)} dot>{variance == null ? "Closed" : variance === 0 ? "Balanced" : variance < 0 ? "Short" : "Over"}</Badge> : <Badge tone="orange" dot>Open</Badge>}
          </span>
        }
        description={`Opened by ${who.get(shift.openedById) ?? "—"}${shift.closedAt ? ` · closed ${fmtTime(shift.closedAt)} by ${shift.closedById ? who.get(shift.closedById) ?? "—" : "—"}` : " · still trading"}`}
        actions={
          <ButtonLink href={`${path}/z-report`} variant="outline" size="sm">
            {shift.closedAt ? "Z-report" : "X-report"} · print
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Opening float" value={zar(shift.openingFloatCents)} />
        <Stat label="Cash taken (net)" value={zar(cash.cashSalesCents)} sub="sales less cash refunds" />
        <Stat label="Expected in drawer" value={zar(expected)} sub="float + cash taken" />
        <Stat label="Counted at close" value={shift.countedCashCents != null ? zar(shift.countedCashCents) : "—"} sub={shift.closedAt ? "blind count at the till" : "not closed yet"} />
        <Stat
          label="Variance"
          value={<span className={variance == null ? undefined : variance === 0 ? "text-leaf-700" : Math.abs(variance) <= 5_000 ? "text-amber-700" : "text-rose-600"}>{variance == null ? "—" : `${variance > 0 ? "+" : variance < 0 ? "−" : ""}${zar(Math.abs(variance))}`}</span>}
          sub={variance == null ? "after close" : variance === 0 ? "drawer balanced" : variance < 0 ? "drawer short" : "drawer over"}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader title="Takings by tender" description="Money taken in this shift, incl. VAT — sales less refunds" />
          <CardBody className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              {money.length ? <Donut layout="row" data={money.map((t) => ({ label: METHOD[t.method] ?? t.method, value: Math.max(0, t._sum.amountCents ?? 0) }))} centerLabel={zar(moneyTotal)} /> : <p className="text-sm text-ink-500">No takings yet.</p>}
            </div>
            <div className="space-y-1 text-sm md:border-l md:border-ink-100 md:pl-6">
              <div className="flex justify-between"><span className="text-ink-500">Sales</span><span className="tnum">{saleTotal?._count ?? 0} · {zar(saleTotal?._sum.totalCents ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Refunds</span><span className="tnum">{refundTotal?._count ?? 0} · {zar(refundTotal?._sum.totalCents ?? 0)}</span></div>
              {onAccount && (
                <>
                  <div className="flex justify-between border-t border-ink-100 pt-1"><span className="text-ink-500">On account (invoiced)</span><span className="tnum">{onAccount._count} · {zar(onAccount._sum.amountCents ?? 0)}</span></div>
                  <p className="text-xs text-ink-500">Trade sales invoiced to a business account on HQ&apos;s ledger — not in the drawer and not a card settlement.</p>
                </>
              )}
              {shift.notes && <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">“{shift.notes}”</p>}
            </div>
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Transactions" description={`${count} in this shift`} />
          {sales.length === 0 ? (
            <EmptyState title="No transactions in this shift" />
          ) : (
            <Table stickyFirst className="mt-3">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Sale</Th>
                  <Th>Staff</Th>
                  <Th>Member</Th>
                  <Th align="right">Items</Th>
                  <Th>Paid by</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <Tr key={s.id} className={s.kind === "REFUND" ? "bg-amber-50/60" : undefined}>
                    <Td className="whitespace-nowrap text-ink-600">{fmtTime(s.createdAt)}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="font-mono text-xs">{s.number}</span>
                      {s.kind === "REFUND" && <Badge tone="amber" className="ml-1.5">Refund</Badge>}
                      {s.offline && <Badge className="ml-1.5">Offline</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-700">{s.staff?.name ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-600">{s.customer ? `${s.customer.firstName} ${s.customer.lastName ?? ""}` : <span className="text-ink-500">Walk-in</span>}</Td>
                    <Td align="right">{s.lines.reduce((a, l) => a + l.qty, 0)}</Td>
                    <Td className="text-xs text-ink-600">{[...new Set(s.payments.map((p) => METHOD[p.method] ?? p.method))].join(", ")}</Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(s.totalCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="border-t border-ink-100">
            <Pagination page={page} pageSize={PAGE_SIZE} total={count} href={(p) => hrefWith(path, {}, { page: p })} />
          </div>
        </Card>
      </div>
    </>
  );
}
