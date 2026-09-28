import Link from "next/link";
import { BadgePercent, Plus } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { qs, clock } from "@/server/hq/form";
import { welcomeLine } from "@/server/hq/launch-rules";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { incentiveExcluded, REG_CLASS_LABEL } from "@/lib/compliance";
import { zarCompact } from "@/lib/money";
import { fmtDate, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { EmptyRow } from "@/components/hq/ui";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Promotions" };

type SP = { tab?: string; owner?: string; q?: string; page?: string };
const KIND: Record<string, [string, Tone]> = {
  PERCENT: ["% off", "orange"],
  FIXED: ["Rand off", "orange"],
  MULTIPLIER: ["Points ×", "violet"],
  BUY_X_GET_Y: ["Bonus buy", "green"],
  MULTIBUY: ["Multi-buy", "blue"],
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const now = new Date();
  const tab = sp.tab === "scheduled" || sp.tab === "ended" ? sp.tab : "live";
  const page = pageParam(sp.page);
  const pageSize = 20;
  const q = sp.q?.trim();
  const visible: Prisma.PromotionWhereInput =
    scope.kind === "HQ" ? {} : { OR: [{ ownerStoreId: null }, { ownerStoreId: { in: ids } }] };
  const byTab: Record<string, Prisma.PromotionWhereInput> = {
    live: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    scheduled: { active: true, startsAt: { gt: now } },
    ended: { OR: [{ endsAt: { lt: now } }, { active: false }] },
  };
  const where: Prisma.PromotionWhereInput = {
    AND: [
      visible,
      byTab[tab],
      sp.owner === "network" ? { ownerStoreId: null } : sp.owner === "store" ? { ownerStoreId: { not: null } } : {},
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {},
    ],
  };
  const [total, promos, counts, settings] = await Promise.all([
    db.promotion.count({ where }),
    db.promotion.findMany({ where, orderBy: tab === "ended" ? { endsAt: "desc" } : tab === "scheduled" ? { startsAt: "asc" } : { endsAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    Promise.all(["live", "scheduled", "ended"].map((t) => db.promotion.count({ where: { AND: [visible, byTab[t]] } }))),
    getSettings(),
  ]);
  const since = promos.length ? new Date(Math.min(...promos.map((p) => p.startsAt.getTime()))) : now;
  const [usage, owners] = await Promise.all([
    promos.length
      ? db.sale.groupBy({
          by: ["promotionId"],
          where: { promotionId: { in: promos.map((p) => p.id) }, kind: "SALE", createdAt: { gte: since }, ...(scope.kind === "HQ" ? {} : { storeId: { in: ids } }) },
          _count: true,
          _sum: { totalCents: true, discountCents: true },
        })
      : [],
    db.store.findMany({ where: { id: { in: [...new Set(promos.flatMap((p) => (p.ownerStoreId ? [p.ownerStoreId] : [])))] } }, select: { id: true, name: true, code: true } }),
  ]);
  const used = new Map(usage.map((u) => [u.promotionId, u]));
  const ownerName = new Map(owners.map((o) => [o.id, `${o.name} (${o.code})`]));
  const href = (p: Record<string, string | number | undefined>) => `/hq/promotions${qs({ ...sp, ...p })}`;
  const when = (p: (typeof promos)[number]) => {
    const days = p.days.length && p.days.length < 7 ? p.days.map((d) => DAYS[d]).join(", ") : null;
    const hours = p.startMinute != null || p.endMinute != null ? `${clock(p.startMinute ?? 0)}–${clock(p.endMinute ?? 1440)}` : null;
    return [days, hours].filter(Boolean).join(" · ");
  };

  return (
    <>
      <PageHeader
        overline="Product"
        title="Promotions"
        description="Network deals and store-run offers: % and rand off, bonus buys and gifts with purchase, multi-buys and points multipliers — with happy hours and promo codes."
        actions={
          can(user, "network") && (
            <ButtonLink href="/hq/promotions/new">
              <Plus className="h-4 w-4" /> New promotion
            </ButtonLink>
          )
        }
      />
      {incentiveExcluded(settings.compliance).length > 0 && (
        <Notice tone="info" className="mb-6">
          Medicines are excluded from every promotion, member price and points earn (Medicines Act s18A):{" "}
          {incentiveExcluded(settings.compliance).map((c) => REG_CLASS_LABEL[c]).join(" and ")}. The till and web shop apply this automatically; the list is on the Compliance page.
        </Notice>
      )}
      <TabLinks
        className="mb-4"
        current={`/hq/promotions${qs({ tab, owner: sp.owner })}`}
        tabs={[
          { key: "live", label: "Live now", count: counts[0] },
          { key: "scheduled", label: "Scheduled", count: counts[1] },
          { key: "ended", label: "Ended & paused", count: counts[2] },
        ].map((t) => ({ label: t.label, count: t.count, href: `/hq/promotions${qs({ tab: t.key, owner: sp.owner })}` }))}
      />
      <Card>
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/promotions" keep={{ tab }}>
            <SearchField defaultValue={sp.q} placeholder="Search name or code" />
            <FilterSelect name="owner" label="Run by" defaultValue={sp.owner} allLabel="Everyone" options={[{ value: "network", label: "HQ (network)" }, { value: "store", label: "Stores (local)" }]} />
          </FilterForm>
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Promotion</Th>
              <Th>Type</Th>
              <Th className="hidden lg:table-cell">Where</Th>
              <Th className="hidden md:table-cell">When</Th>
              <Th align="right">Uses</Th>
              <Th align="right" className="hidden sm:table-cell">Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 && (
              <EmptyRow cols={6}>
                <BadgePercent className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                {tab === "live" ? "No promotions are running right now." : tab === "scheduled" ? "Nothing scheduled." : "No ended or paused promotions."}
              </EmptyRow>
            )}
            {promos.map((p) => {
              const u = used.get(p.id);
              return (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/hq/promotions/${p.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {p.firstPurchaseOnly && (
                        <Badge tone="violet" className="mr-1.5">
                          Welcome gift
                        </Badge>
                      )}
                      {welcomeLine(p) ?? describePromo(p as PromoInput)}
                      {p.code && (
                        <>
                          {" "}· code <span className="font-mono font-semibold text-ink-700">{p.code}</span>
                        </>
                      )}
                      {!p.active && " · paused"}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={KIND[p.kind][1]}>{KIND[p.kind][0]}</Badge>
                  </Td>
                  <Td className="hidden text-ink-600 lg:table-cell">
                    {p.ownerStoreId ? <span>{ownerName.get(p.ownerStoreId) ?? "Store"} <Badge className="ml-1">Local</Badge></span> : p.storeIds.length ? `${p.storeIds.length} stores` : "Whole network"}
                    <span className="block text-xs text-ink-500">{p.channels.map((c) => (c === "POS" ? "In store" : "Online")).join(" + ")}</span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">
                    {fmtDate(p.startsAt)} → {fmtDate(p.endsAt)}
                    {when(p) && <span className="block text-xs text-ink-500">{when(p)}</span>}
                  </Td>
                  <Td align="right">
                    {num(u?._count ?? 0)}
                    {p.maxUses != null && <span className="text-ink-400"> / {num(p.maxUses)}</span>}
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {u?._sum.totalCents ? zarCompact(u._sum.totalCents) : "—"}
                    {u?._sum.discountCents ? <span className="block whitespace-nowrap text-xs text-ink-500">{zarCompact(u._sum.discountCents)} given</span> : null}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
