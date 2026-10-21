import Link from "next/link";
import { Banknote, PiggyBank } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { shiftCash } from "@/server/finance";
import { getSettings } from "@/server/settings";
import { cashTone, hrefWith, sp1 } from "@/server/store/rules";
import { cashToBank, isOverdue } from "@/lib/banking";
import { zar } from "@/lib/money";
import { fmtDate, fmtTime, timeAgo } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips } from "@/components/store/ui";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Cash-ups" };
const PAGE_SIZE = 25;

export default async function CashUpsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const path = `/store/${store.code}/cash-ups`;
  const view = ["open", "variance"].includes(sp1(sp.view)) ? sp1(sp.view) : "all";
  const page = pageParam(sp.page);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const views: Record<string, Prisma.ShiftWhereInput> = {
    all: {},
    open: { closedAt: null },
    variance: { closedAt: { not: null }, NOT: { countedCashCents: null } },
  };
  // "Variance" = closed shifts whose count differs from expected; filtered in SQL-friendly two steps.
  // The ids are paged here (newest first), so the list Prisma binds is one page long (D1 allows 100 parameters).
  const varianceIds =
    view === "variance"
      ? (await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Shift" WHERE "storeId" = ${store.id} AND "closedAt" IS NOT NULL AND "countedCashCents" IS NOT "expectedCashCents" ORDER BY "openedAt" DESC`).map((x) => x.id)
      : null;
  const where: Prisma.ShiftWhereInput = { storeId: store.id, ...views[view] };
  const pageWhere: Prisma.ShiftWhereInput = varianceIds ? { ...where, id: { in: varianceIds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) } } : where;

  const [total, shifts, recent, counts] = await Promise.all([
    varianceIds ? varianceIds.length : db.shift.count({ where }),
    db.shift.findMany({ where: pageWhere, orderBy: { openedAt: "desc" }, ...(varianceIds ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }), include: { _count: { select: { sales: true } }, deposit: { select: { number: true } } } }),
    db.shift.findMany({ where: { storeId: store.id, closedAt: { gte: since } }, select: { expectedCashCents: true, countedCashCents: true } }),
    Promise.all([
      db.shift.count({ where: { storeId: store.id } }),
      db.shift.count({ where: { storeId: store.id, closedAt: null } }),
      db.$queryRaw<{ n: number }[]>`SELECT cast(COUNT(*) AS real) AS n FROM "Shift" WHERE "storeId" = ${store.id} AND "closedAt" IS NOT NULL AND "countedCashCents" IS NOT "expectedCashCents"`,
    ]),
  ]);
  const [users, devices, live, { banking }] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(shifts.flatMap((s) => [s.openedById, s.closedById]).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    db.device.findMany({ where: { storeId: store.id }, select: { id: true, name: true } }),
    Promise.all(shifts.filter((s) => !s.closedAt).map((s) => shiftCash(s.id))),
    getSettings(),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const device = new Map(devices.map((d) => [d.id, d.name]));
  const liveBy = new Map(live.map((l) => [l.shift.id, l]));
  const variances = recent.filter((s) => s.countedCashCents != null && s.expectedCashCents != null).map((s) => s.countedCashCents! - s.expectedCashCents!);
  const net = variances.reduce((a, v) => a + v, 0);
  const off = variances.filter((v) => v !== 0).length;

  return (
    <>
      <PageHeader
        overline={`Money · ${store.name}`}
        title="Cash-ups"
        description="Every till shift: opening float, cash taken, what was counted at close and the difference. Variances over R50 are flagged red."
        actions={
          <ButtonLink href={`/store/${store.code}/banking`} variant="outline" size="sm">
            <PiggyBank className="h-4 w-4" strokeWidth={1.9} aria-hidden /> Banking
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shifts closed, 30 days" value={recent.length.toLocaleString()} sub={`${counts[1]} open now`} />
        <Stat label="Net cash variance, 30 days" value={<span className={net < 0 ? "text-rose-600" : net > 0 ? "text-amber-700" : "text-leaf-700"}>{zar(net)}</span>} sub={net === 0 ? "balanced" : net < 0 ? "short overall" : "over overall"} />
        <Stat label="Shifts with a variance" value={off.toLocaleString()} sub={recent.length ? `${Math.round((off / recent.length) * 100)}% of closed shifts` : "—"} />
        <Stat label="Largest short" value={zar(Math.min(0, ...variances))} sub="single shift, 30 days" />
      </div>

      <Card className="mt-6">
        <div className="border-b border-ink-100 p-4 sm:px-5">
          <Chips
            label="Shifts"
            current={view}
            items={[
              { key: "all", label: "All shifts", count: counts[0], href: hrefWith(path, {}, {}) },
              { key: "open", label: "Open", count: counts[1], tone: "orange", href: hrefWith(path, {}, { view: "open" }) },
              { key: "variance", label: "With a variance", count: counts[2][0]?.n ?? 0, tone: "red", href: hrefWith(path, {}, { view: "variance" }) },
            ]}
          />
        </div>
        {shifts.length === 0 ? (
          <EmptyState icon={<Banknote className="h-5 w-5" />} title="No shifts here">
            Shifts are opened and closed at the POS.
          </EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Shift</Th>
                <Th>Till</Th>
                <Th>Opened by</Th>
                <Th>Closed by</Th>
                <Th align="right">Sales</Th>
                <Th align="right">Float</Th>
                <Th align="right">Expected cash</Th>
                <Th align="right">Counted</Th>
                <Th align="right">Variance</Th>
                <Th>Banked</Th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const l = liveBy.get(s.id);
                const expected = s.expectedCashCents ?? l?.expectedCents ?? null;
                const variance = s.countedCashCents != null && expected != null ? s.countedCashCents - expected : null;
                const tone = cashTone(variance);
                return (
                  <Tr key={s.id}>
                    <Td className="whitespace-nowrap">
                      <Link href={`${path}/${s.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                        {fmtDate(s.openedAt)}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {fmtTime(s.openedAt)} – {s.closedAt ? fmtTime(s.closedAt) : <span className="font-semibold text-brand-700">open · {timeAgo(s.openedAt)}</span>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{(s.deviceId && device.get(s.deviceId)) ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-700">{name.get(s.openedById) ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-700">{s.closedById ? name.get(s.closedById) ?? "—" : <span className="text-ink-500">—</span>}</Td>
                    <Td align="right">{s._count.sales.toLocaleString()}</Td>
                    <Td align="right" className="text-ink-600">{zar(s.openingFloatCents)}</Td>
                    <Td align="right">{expected != null ? zar(expected) : "—"}</Td>
                    <Td align="right">{s.countedCashCents != null ? zar(s.countedCashCents) : <span className="text-ink-500">—</span>}</Td>
                    <Td align="right">
                      {variance == null ? (
                        <span className="text-ink-500">—</span>
                      ) : (
                        <Badge tone={tone}>{variance === 0 ? "Balanced" : `${variance > 0 ? "+" : "−"}${zar(Math.abs(variance))}`}</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {s.deposit ? (
                        <Link href={`/store/${store.code}/banking?dep=${s.deposit.number}#${s.deposit.number}`} className="font-medium text-ink-800 hover:text-brand-700">
                          {s.deposit.number}
                        </Link>
                      ) : s.closedAt && s.countedCashCents != null && cashToBank(s) > 0 ? (
                        isOverdue(s.closedAt, banking.dueBusinessDays) ? (
                          <Badge tone="red" dot>Overdue</Badge>
                        ) : (
                          <Badge tone="blue" dot>Waiting</Badge>
                        )
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
