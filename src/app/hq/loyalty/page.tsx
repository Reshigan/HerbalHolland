import { resolveRange } from "@/lib/ranges";
import Link from "next/link";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { TIERS, POINT_VALUE_CENTS, fmtPoints, tierBenefits } from "@/lib/loyalty-rules";
import { pct, zar, zarCompact } from "@/lib/money";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "@/components/ui/status";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Donut } from "@/components/charts/donut";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { EmptyRow, MiniStat, ViewOnly } from "@/components/hq/ui";
import { generateDealsNow, saveLoyalty, saveOffers, saveTierSavings } from "./actions";
import type { LoyaltyKind } from "@/generated/prisma/client";

export const metadata = { title: "Rewards" };

const KIND_LABEL: Record<LoyaltyKind, string> = {
  EARN: "Earned on purchases", REDEEM: "Redeemed", SIGNUP: "Sign-up bonuses", REFERRAL: "Referral bonuses", BIRTHDAY: "Birthday bonuses",
  BONUS: "Goodwill bonuses", REVERSAL: "Reversals (refunds, cancellations)", EXPIRE: "Expired / forfeited", ADJUST: "Manual adjustments",
};

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const members = scope.kind === "HQ" ? {} : { homeStoreId: { in: ids } };
  const r30 = resolveRange({ range: "30d" }); // same 30-day window as the reports centre
  const since = r30.start;
  const page = pageParam(sp.page);
  const pageSize = 20;
  const offerWhere = { createdAt: { gte: since }, ...(scope.kind === "HQ" ? {} : { customer: members }) };
  const [settings, liability, tiers, movement, byStore, top, stores, cost, loaded, usedDeals, liveDeals, optedOut] = await Promise.all([
    getSettings(),
    db.customer.aggregate({ where: { ...members, points: { gt: 0 } }, _sum: { points: true }, _count: true }),
    db.customer.groupBy({ by: ["tier"], where: members, _count: true }),
    db.loyaltyEntry.groupBy({ by: ["kind"], where: { createdAt: { gte: since }, ...(scope.kind === "HQ" ? {} : { storeId: { in: ids } }) }, _sum: { points: true }, _count: true }),
    db.loyaltyEntry.groupBy({ by: ["storeId", "kind"], where: { createdAt: { gte: since }, storeId: { in: ids }, kind: { in: ["EARN", "REDEEM", "REFERRAL", "BONUS", "BIRTHDAY", "REVERSAL"] } }, _sum: { points: true } }),
    db.customer.findMany({ where: members, orderBy: { lifetimeCents: "desc" }, take: 8, select: { id: true, firstName: true, lastName: true, memberNo: true, tier: true, points: true, lifetimeCents: true, homeStore: { select: { name: true } } } }),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } }),
    db.$queryRaw<{ saved: number; offers: number }[]>`SELECT COALESCE(SUM("memberSavingsCents"), 0) AS saved, COALESCE(SUM("offerCents"), 0) AS offers FROM "DailyStoreStat" WHERE "storeId" IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND "date" >= ${r30.fromDate}`,
    // My Deals, last 30 days: loaded onto cards, and how many of those were used.
    db.memberOffer.count({ where: offerWhere }),
    db.memberOffer.count({ where: { ...offerWhere, redeemedAt: { not: null } } }),
    db.memberOffer.count({ where: { redeemedAt: null, startsAt: { lte: new Date() }, endsAt: { gte: new Date() }, ...(scope.kind === "HQ" ? {} : { customer: members }) } }),
    db.customer.count({ where: { ...members, personalisedOffers: false } }),
  ]);
  const o = settings.offers;
  const l = settings.loyalty;
  const admin = can(user, "admin");
  const kindSum = (k: LoyaltyKind) => movement.find((m) => m.kind === k)?._sum.points ?? 0;
  const issued = (["EARN", "SIGNUP", "REFERRAL", "BIRTHDAY", "BONUS"] as LoyaltyKind[]).reduce((s, k) => s + kindSum(k), 0);
  const redeemed = -kindSum("REDEEM");

  const settle = stores
    .map((s) => {
      const rows = byStore.filter((r) => r.storeId === s.id);
      const sum = (k: LoyaltyKind[]) => rows.filter((r) => k.includes(r.kind)).reduce((a, r) => a + (r._sum.points ?? 0), 0);
      const iss = sum(["EARN", "REFERRAL", "BONUS", "BIRTHDAY", "REVERSAL"]);
      const red = -sum(["REDEEM"]);
      return { ...s, issued: iss, redeemed: red, net: (red - iss) * POINT_VALUE_CENTS };
    })
    .filter((s) => s.issued || s.redeemed)
    .sort((a, b) => a.net - b.net);
  const slice = settle.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageHeader
        overline="Herbal Holland Rewards"
        title="Rewards"
        description="One programme across every store and the web shop. Points are a network liability: the store that issues them funds the pool, the store where they're redeemed is reimbursed (settled on the monthly franchise statement)."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding liability" value={zarCompact((liability._sum.points ?? 0) * POINT_VALUE_CENTS)} sub={`${fmtPoints(liability._sum.points ?? 0)} held by ${num(liability._count)} members`} />
        <Stat label="Members saved · 30 days" value={zarCompact(cost[0]?.saved ?? 0)} sub="instant tier & Rewards-deal savings, incl. VAT" />
        <Stat label="Issued · 30 days" value={fmtPoints(issued)} sub={zar(issued * POINT_VALUE_CENTS)} />
        <Stat label="Redeemed · 30 days" value={fmtPoints(redeemed)} sub={issued ? `${((redeemed / issued) * 100).toFixed(0)}% of issued` : undefined} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Tiers" description="Rolling 12-month spend sets the tier; each tier gets an instant saving at the till and online (never on medicines)" />
          <Table stickyFirst className="relative mt-4">
            <thead>
              <tr>
                <Th>Tier</Th>
                <Th align="right">12-month spend</Th>
                <Th align="right">Instant saving</Th>
                <Th className="hidden md:table-cell">Benefits</Th>
                <Th align="right">Members</Th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <Tr key={t.key}>
                  <Td>
                    <TierBadge tier={t.key} />
                  </Td>
                  <Td align="right" className="whitespace-nowrap">{t.minCents ? `${zarCompact(t.minCents)}+` : "On joining"}</Td>
                  <Td align="right" className="font-semibold text-ink-900">{l.tierSavingsPct[t.key] ? `${l.tierSavingsPct[t.key]}% off` : "—"}</Td>
                  <Td className="hidden text-xs text-ink-600 md:table-cell">{tierBenefits(t.key, l.tierSavingsPct, l.earnPer100).slice(1).join(" · ")}</Td>
                  <Td align="right" className="font-medium">{num(tiers.find((x) => x.tier === t.key)?._count ?? 0)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Tier mix" />
          <CardBody>
            <Donut format="number" data={TIERS.map((t) => ({ label: t.name, value: tiers.find((x) => x.tier === t.key)?._count ?? 0 }))} centerLabel={num(tiers.reduce((s, t) => s + t._count, 0))} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="My Deals"
          description="A weekly personal deal on each opted-in member's favourite product: applied automatically at the till and online, single use, funded from the marketing fund and credited to the selling store. Never on licensed medicines."
          action={
            <Badge tone={o.enabled ? "green" : "neutral"} dot>
              {o.enabled ? `On · ${o.percent}% off for ${o.validDays} days` : "Off"}
            </Badge>
          }
        />
        <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Loaded · 30 days" value={num(loaded)} sub="deals on members' cards" />
              <MiniStat label="Redeemed" value={num(usedDeals)} sub="of those deals" />
              <MiniStat label="Redemption rate" value={loaded ? pct(usedDeals / loaded) : "—"} sub="redeemed ÷ loaded" />
              <MiniStat label="Cost · 30 days" value={zarCompact(cost[0]?.offers ?? 0)} sub="discount given, incl. VAT" />
            </div>
            <p className="text-xs text-ink-500">
              {num(liveDeals)} deal{liveDeals === 1 ? " is" : "s are"} live on cards right now. {num(optedOut)} member{optedOut === 1 ? " has" : "s have"} turned off personalised offers in the Rewards app (POPIA) and never get one. New deals load every Monday at 02:00.
            </p>
            {admin && (
              <ConfirmAction
                action={generateDealsNow}
                variant="primary"
                label="Generate this week's deals now"
                title="Load this week's deals now?"
                confirmLabel="Load deals"
                className="max-w-xl"
              >
                <p>
                  Each opted-in member who bought in the last 90 days and has no live deal gets {o.percent}% off their favourite eligible product for {o.validDays} days. Members who already have a deal are skipped, and the cost comes from the marketing fund.
                </p>
              </ConfirmAction>
            )}
          </div>
          <div className="min-w-0">
            {!admin && <ViewOnly className="mb-4">View only: set by the HQ administrator.</ViewOnly>}
            <ActionForm action={saveOffers}>
              <fieldset disabled={!admin} className="min-w-0 space-y-3">
                <Checkbox name="offersEnabled" defaultChecked={o.enabled} label="Load My Deals every week" description="Off: no new deals load; existing ones run out" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Deal size" htmlFor="offerPercent" hint="5–30% off">
                    <div className="relative">
                      <Input id="offerPercent" name="offerPercent" defaultValue={o.percent} inputMode="numeric" className="tnum pr-7" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">%</span>
                    </div>
                    <FieldError name="offerPercent" />
                  </Field>
                  <Field label="Valid for" htmlFor="offerDays" hint="3–14 days">
                    <div className="relative">
                      <Input id="offerDays" name="offerDays" defaultValue={o.validDays} inputMode="numeric" className="tnum pr-12" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">days</span>
                    </div>
                    <FieldError name="offerDays" />
                  </Field>
                </div>
              </fieldset>
              {admin && (
                <div className="mt-4 flex justify-end">
                  <SubmitButton variant="outline" pendingLabel="Saving…">
                    Save My Deals
                  </SubmitButton>
                </div>
              )}
            </ActionForm>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Settlement preview · last 30 days" description="Issued vs redeemed per store, from the points ledger. Positive = the pool reimburses the store." />
          <Table stickyFirst className="relative mt-4">
            <thead>
              <tr>
                <Th>Store</Th>
                <Th align="right">Issued</Th>
                <Th align="right">Redeemed</Th>
                <Th align="right">Net position</Th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 && <EmptyRow cols={4}>No points activity in the last 30 days.</EmptyRow>}
              {slice.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/hq/stores/${s.code}`} className="font-medium text-ink-850 hover:text-brand-700">
                      {s.name}
                    </Link>
                  </Td>
                  <Td align="right">{num(s.issued)}</Td>
                  <Td align="right">{num(s.redeemed)}</Td>
                  <Td align="right" className={s.net >= 0 ? "font-semibold text-leaf-700" : "font-semibold text-ink-900"}>
                    {s.net >= 0 ? "+" : "−"}
                    {zar(Math.abs(s.net))}
                    <span className="block text-xs font-normal text-ink-500">{s.net >= 0 ? "reimbursed" : "funds the pool"}</span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={settle.length} href={(p) => `/hq/loyalty${qs({ page: p })}`} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Instant savings by tier" description="Members pay less the moment they're identified, at the till and online" />
            <CardBody>
              <p className="mb-4 text-xs text-ink-600">
                The tier&apos;s percentage comes off the shelf price for every identified member. A Rewards deal price list wins when it&apos;s lower (best-of, never stacked). Never applied to licensed medicines in medical mode (Medicines Act s18A).
              </p>
              <ActionForm action={saveTierSavings}>
                <fieldset disabled={!admin} className="min-w-0 grid grid-cols-2 gap-3">
                  {TIERS.map((t) => (
                    <Field key={t.key} label={t.name} htmlFor={`save_${t.key}`}>
                      <div className="relative">
                        <Input id={`save_${t.key}`} name={`save_${t.key}`} defaultValue={l.tierSavingsPct[t.key]} inputMode="decimal" className="tnum pr-7" />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">%</span>
                      </div>
                      <FieldError name={`save_${t.key}`} />
                    </Field>
                  ))}
                </fieldset>
                {admin && (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" pendingLabel="Saving…">Save savings</SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Programme rules" description="Apply network-wide from the next transaction" />
            <CardBody>
              {!admin && <ViewOnly className="mb-4">View only: set by the HQ administrator.</ViewOnly>}
              <ActionForm action={saveLoyalty}>
                <fieldset disabled={!admin} className="min-w-0 grid grid-cols-2 gap-3">
                  {(
                    [
                      ["earnPer100", "Points per R100", l.earnPer100, "On what members pay"],
                      ["maxRedeemPct", "Max % of a basket", l.maxRedeemPct, "Payable with points"],
                      ["minRedeem", "Minimum to redeem", l.minRedeem, "Points"],
                      ["signupBonus", "Sign-up bonus", l.signupBonus, "Points"],
                      ["referralBonus", "Referral bonus", l.referralBonus, "Each side, first purchase"],
                      ["birthdayBonus", "Birthday bonus", l.birthdayBonus, "Points"],
                    ] as const
                  ).map(([name, label, value, hint]) => (
                    <Field key={name} label={label} htmlFor={name} hint={hint}>
                      <Input id={name} name={name} defaultValue={value} inputMode="numeric" className="tnum" />
                      <FieldError name={name} />
                    </Field>
                  ))}
                </fieldset>
                <p className="mt-3 text-xs text-ink-500">Licensed medicines never earn points while THC is in medical mode (Medicines Act s18A).</p>
                {admin && (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" pendingLabel="Saving…">Save rules</SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Points movement · 30 days" />
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                {(Object.keys(KIND_LABEL) as LoyaltyKind[])
                  .filter((k) => kindSum(k))
                  .map((k) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-ink-600">{KIND_LABEL[k]}</dt>
                      <dd className={`tnum font-medium ${kindSum(k) >= 0 ? "text-ink-900" : "text-ink-600"}`}>
                        {kindSum(k) >= 0 ? "+" : "−"}
                        {num(Math.abs(kindSum(k)))}
                      </dd>
                    </div>
                  ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Top members" description="By lifetime spend" />
        <Table stickyFirst className="relative mt-4">
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Tier</Th>
              <Th className="hidden sm:table-cell">Home store</Th>
              <Th align="right">Lifetime</Th>
              <Th align="right">Points</Th>
            </tr>
          </thead>
          <tbody>
            {top.map((m) => (
              <Tr key={m.id}>
                <Td>
                  <Link href={`/hq/customers/${m.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {m.firstName} {m.lastName ?? ""}
                  </Link>
                  <span className="block font-mono text-xs text-ink-500">{m.memberNo}</span>
                </Td>
                <Td>
                  <TierBadge tier={m.tier} />
                </Td>
                <Td className="hidden text-ink-600 sm:table-cell">{m.homeStore?.name ?? "—"}</Td>
                <Td align="right">{zarCompact(m.lifetimeCents)}</Td>
                <Td align="right">{num(m.points)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
