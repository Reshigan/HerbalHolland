import Link from "next/link";
import { Calculator, Plus, Tags } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { explainPrice } from "@/server/hq/price-explain";
import { parseLocal, toLocalInput } from "@/server/hq/form";
import { incentiveExcluded } from "@/lib/compliance";
import { resolveTradePrice, tradeBreaks, listLive, type PriceListRule } from "@/lib/pricing-rules";
import { vatHalfUp } from "@/lib/trade";
import { TIERS } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { FilterForm, FilterSelect } from "@/components/hq/filter-form";
import { EmptyRow, ViewOnly } from "@/components/hq/ui";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { Field, Input } from "@/components/ui/form";
import { savePricingRules } from "./actions";
import { Flash } from "@/components/hq/flash";
import { listStatus } from "@/components/hq/tones";

export const metadata = { title: "Pricing" };

type SP = { store?: string; channel?: string; tier?: string; variant?: string; qty?: string; at?: string; m?: string; account?: string };

const KIND: Record<string, [string, Tone]> = { ZONE: ["Zone", "blue"], CHANNEL: ["Channel", "violet"], MEMBER: ["Rewards deal", "orange"], TRADE: ["Trade · ex VAT", "green"] };
const tierName = (k: string) => TIERS.find((t) => t.key === k)?.name ?? k;

export default async function PricingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const [lists, stores, regions, variants, settings] = await Promise.all([
    db.priceList.findMany({ include: { items: { select: { variantId: true, priceCents: true, minQty: true } } }, orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "desc" }] }),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, regionId: true }, orderBy: { name: "asc" } }),
    db.region.findMany({ select: { id: true, name: true } }),
    db.variant.findMany({ where: { active: true, product: { status: { not: "ARCHIVED" } } }, include: { product: { select: { name: true, regClass: true } } }, orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }] }),
    getSettings(),
  ]);
  const now = new Date();
  const regionName = new Map(regions.map((r) => [r.id, r.name]));
  const scopeText = (l: (typeof lists)[number]) => {
    if (l.kind === "TRADE") return "Trade accounts · wholesale channel";
    const where = l.storeIds.length ? `${l.storeIds.length} store${l.storeIds.length === 1 ? "" : "s"}` : l.regionIds.length ? l.regionIds.map((r) => regionName.get(r) ?? "Region").join(", ") : "Whole network";
    const who = l.kind === "MEMBER" ? (l.tiers.length ? l.tiers.map(tierName).join(", ") : "All members") : l.channel ? (l.channel === "ONLINE" ? "Online" : "In store") : "All channels";
    return `${where} · ${who}`;
  };

  // Simulator
  const variant = variants.find((v) => v.id === sp.variant) ?? variants[0];
  const channel = sp.channel === "ONLINE" ? "ONLINE" : sp.channel === "WHOLESALE" ? "WHOLESALE" : "POS";
  const store = channel === "POS" ? (stores.find((s) => s.code === sp.store) ?? stores[0]) : undefined;
  // Trade: the account's own list, then the live trade lists by priority, else the wholesale price — all ex VAT.
  const accounts = channel === "WHOLESALE" ? await db.tradeAccount.findMany({ where: { status: { in: ["APPROVED", "ON_HOLD"] } }, select: { id: true, number: true, name: true, priceListId: true }, orderBy: { name: "asc" }, take: 200 }) : [];
  const account = channel === "WHOLESALE" ? accounts.find((a) => a.id === sp.account) : undefined;
  const tier = TIERS.find((t) => t.key === sp.tier)?.key ?? null;
  const qty = Math.max(1, Math.min(999, Number(sp.qty) || 1));
  const simAt = parseLocal(sp.at ?? "") ?? now;
  const shelf = store && variant ? await db.storeVariant.findUnique({ where: { storeId_variantId: { storeId: store.id, variantId: variant.id } }, select: { priceCents: true } }) : null;
  const excluded = variant ? incentiveExcluded(settings.compliance).includes(variant.product.regClass) : false;
  const sim = variant && channel !== "WHOLESALE"
    ? explainPrice(
        { variantId: variant.id, rrpCents: variant.priceCents, storeShelfCents: shelf?.priceCents ?? null, qty, incentives: !excluded },
        lists as PriceListRule[],
        { storeId: store?.id ?? null, regionId: store?.regionId ?? null, channel, member: !!tier, tier, tierPct: tier ? settings.loyalty.tierSavingsPct[tier] : 0, at: simAt },
      )
    : null;
  const tradeSim = variant && channel === "WHOLESALE" ? (() => {
    const rules = lists as PriceListRule[];
    const ctx = { accountListId: account?.priceListId ?? null, at: simAt };
    const thc = variant.product.regClass === "THC";
    const price = thc ? null : resolveTradePrice({ variantId: variant.id, wholesaleCents: variant.wholesaleCents, qty }, rules, ctx);
    const breaks = thc ? [] : tradeBreaks({ variantId: variant.id, wholesaleCents: variant.wholesaleCents }, rules, ctx);
    const exCents = (price?.unitCents ?? 0) * qty;
    const tradeLists = rules.filter((l) => l.kind === "TRADE").sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime());
    const verdicts = tradeLists.map((l) => {
      const item = l.items.filter((i) => i.variantId === variant.id && i.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0];
      const priced = item ? item.priceCents : l.adjustPct != null ? Math.round((variant.wholesaleCents * (100 + l.adjustPct)) / 100) : null;
      const live = listLive(l, simAt);
      const reason = !live ? (l.active ? (l.startsAt && l.startsAt > simAt ? "Not started yet" : "Ended") : "Switched off") : priced == null ? "No price for this item" : l.id === price?.listId ? (account?.priceListId === l.id ? "The account's own list — wins" : "First live list that prices it — wins") : account?.priceListId && account.priceListId !== l.id && live ? "The account's own list comes first" : "A higher-priority list priced it first";
      return { id: l.id, name: l.name, priceCents: priced, minQty: item?.minQty ?? 1, won: l.id === price?.listId, applies: live && priced != null, reason };
    });
    return { thc, price, breaks, exCents, vatCents: vatHalfUp(exCents), verdicts };
  })() : null;

  return (
    <>
      <PageHeader
        overline="Product"
        title="Pricing"
        description="Price lists layer on the national RRP: regional zones and scheduled changes, channel prices, member prices and quantity breaks. A franchisee's own shelf price always wins in their store."
        actions={
          can(user, "network") && (
            <ButtonLink href="/hq/pricing/new">
              <Plus className="h-4 w-4" /> New price list
            </ButtonLink>
          )
        }
      />
      <Flash message={sp.m} />
      <Card>
        <Table stickyFirst className="relative">
          <thead>
            <tr>
              <Th>Price list</Th>
              <Th>Type</Th>
              <Th className="hidden md:table-cell">Applies to</Th>
              <Th className="hidden lg:table-cell">When</Th>
              <Th align="right">Items</Th>
              <Th align="right" className="hidden sm:table-cell">Priority</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {lists.length === 0 && (
              <EmptyRow cols={7}>
                <Tags className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No price lists yet — every store sells at RRP or its own shelf price.
              </EmptyRow>
            )}
            {lists.map((l) => {
              const [status, tone] = listStatus(l, now);
              return (
                <Tr key={l.id}>
                  <Td>
                    <Link href={`/hq/pricing/${l.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {l.name}
                    </Link>
                    {l.adjustPct != null && <span className="block text-xs text-ink-500">{l.adjustPct > 0 ? "+" : ""}{l.adjustPct}% on RRP for items without a set price</span>}
                  </Td>
                  <Td>
                    <Badge tone={KIND[l.kind][1]}>{KIND[l.kind][0]}</Badge>
                  </Td>
                  <Td className="hidden text-ink-600 md:table-cell">{scopeText(l)}</Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 lg:table-cell">
                    {l.startsAt || l.endsAt ? `${l.startsAt ? fmtDate(l.startsAt) : "Now"} → ${l.endsAt ? fmtDate(l.endsAt) : "open-ended"}` : "Always"}
                  </Td>
                  <Td align="right">
                    {l.items.length}
                    {l.items.some((i) => i.minQty > 1) && <span className="block whitespace-nowrap text-xs text-ink-500">qty breaks</span>}
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">{l.priority}</Td>
                  <Td>
                    <Badge tone={tone} dot>
                      {status}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Calculator className="h-4 w-4 text-brand-700" /> Pricing simulator
            </span>
          }
          description="What would this member pay, and which rule decided it? Promotions are applied on top at the till and in the basket."
        />
        <CardBody>
          <FilterForm action="/hq/pricing" className="items-end">
            <FilterSelect name="variant" label="Item" allLabel={null} defaultValue={variant?.id} options={variants.map((v) => ({ value: v.id, label: `${v.product.name} · ${v.name}` }))} />
            <FilterSelect name="channel" label="Channel" allLabel={null} defaultValue={channel} options={[{ value: "POS", label: "In store (POS)" }, { value: "ONLINE", label: "Online" }, { value: "WHOLESALE", label: "Trade (ex VAT)" }]} />
            {channel === "POS" && <FilterSelect name="store" label="Store" allLabel={null} defaultValue={store?.code} options={stores.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />}
            {channel === "WHOLESALE" ? (
              <FilterSelect name="account" label="Trade account" allLabel={null} defaultValue={account?.id ?? ""} options={[{ value: "", label: "Any trade account" }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.number})` }))]} />
            ) : (
              <FilterSelect name="tier" label="Customer" allLabel={null} defaultValue={tier ?? ""} options={[{ value: "", label: "Not a member" }, ...TIERS.map((t) => ({ value: t.key, label: `${t.name} member` }))]} />
            )}
            <label className="block">
              <span className="sr-only">Quantity</span>
              <input name="qty" type="number" min={1} max={999} defaultValue={qty} aria-label="Quantity" className="h-10 w-20 rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </label>
            <label className="block">
              <span className="sr-only">Date and time</span>
              <input name="at" type="datetime-local" defaultValue={toLocalInput(simAt)} aria-label="Date and time" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
            </label>
            <Button type="submit" variant="dark">Simulate</Button>
          </FilterForm>

          {tradeSim && variant && (
            <div className="mt-5 grid gap-5 lg:grid-cols-5">
              <div className="rounded-2xl bg-ink-950 p-5 text-white lg:col-span-2">
                <div className="text-xs text-ink-300">
                  {qty} × {variant.product.name} · {variant.name} · trade{account ? ` · ${account.name}` : ""}
                </div>
                {tradeSim.thc ? (
                  <p className="mt-3 text-sm text-ink-200">Licensed medicines are never traded — there is no trade price for this item.</p>
                ) : (
                  <>
                    <div className="mt-2 font-display text-4xl font-semibold">{zar(tradeSim.price!.unitCents)}</div>
                    <div className="text-sm text-ink-300">each, ex VAT · line {zar(tradeSim.exCents)} ex VAT + VAT {zar(tradeSim.vatCents)} = {zar(tradeSim.exCents + tradeSim.vatCents)}</div>
                    <ol className="mt-5 space-y-3 border-t border-ink-800 pt-4">
                      <li className="flex gap-3 text-sm">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-brand-400">1</span>
                        <span className="min-w-0 flex-1"><span className="flex justify-between gap-2 font-medium">Wholesale price <span className="tnum">{zar(variant.wholesaleCents)}</span></span><span className="text-xs text-ink-400">The catalogue's price to stores, ex VAT — the trade fallback</span></span>
                      </li>
                      <li className="flex gap-3 text-sm">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-brand-400">2</span>
                        <span className="min-w-0 flex-1"><span className="flex justify-between gap-2 font-medium">{tradeSim.price!.rule ? `“${tradeSim.price!.rule}”` : "No trade list prices it"} <span className="tnum">{zar(tradeSim.price!.unitCents)}</span></span><span className="text-xs text-ink-400">{tradeSim.price!.rule ? (tradeSim.price!.minQty > 1 ? `Quantity break reached at ${tradeSim.price!.minQty}+` : "The first live trade list that prices this item") : "The wholesale price applies"}</span></span>
                      </li>
                    </ol>
                    {tradeSim.breaks.length > 1 && <p className="mt-4 text-xs text-ink-400">Breaks: {tradeSim.breaks.map((b) => `${b.minQty}+ ${zar(b.unitCents)}`).join(" · ")}</p>}
                    <p className="mt-4 text-xs text-ink-400">Trade prices are ex VAT; VAT is 15% per line, rounded half up. Tiers, member and zone lists, markdowns and shelf prices never apply.</p>
                  </>
                )}
              </div>
              <div className="lg:col-span-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Every trade list, for this scenario</div>
                {tradeSim.verdicts.length === 0 ? (
                  <p className="rounded-2xl border border-ink-150 px-4 py-6 text-sm text-ink-500">No trade price lists yet — every account pays the wholesale price. Create one with the type “Trade”.</p>
                ) : (
                  <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-150">
                    {tradeSim.verdicts.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${v.won ? "bg-leaf-500" : v.applies ? "bg-amber-500" : "bg-ink-300"}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={`font-medium ${v.won ? "text-ink-950" : "text-ink-700"}`}>{v.name}</span>
                          <span className="block text-xs text-ink-500">{v.won ? "✓ " : ""}{v.reason}</span>
                        </span>
                        <span className="tnum shrink-0 text-right text-ink-700">
                          {v.priceCents != null ? zar(v.priceCents) : "—"}
                          {v.minQty > 1 && <span className="block text-xs text-ink-500">{v.minQty}+ units</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {sim && variant && (
            <div className="mt-5 grid gap-5 lg:grid-cols-5">
              <div className="rounded-2xl bg-ink-950 p-5 text-white lg:col-span-2">
                <div className="text-xs text-ink-300">
                  {qty} × {variant.product.name} · {variant.name}
                  {channel === "POS" && store ? ` at ${store.name}` : " online"}
                  {tier ? ` · ${tierName(tier)} member` : ""}
                </div>
                <div className="mt-2 font-display text-4xl font-semibold">{zar(sim.result.unitCents)}</div>
                <div className="text-sm text-ink-300">each · line total {zar(sim.lineCents)}</div>
                <ol className="mt-5 space-y-3 border-t border-ink-800 pt-4">
                  {sim.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-brand-400">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 font-medium">
                          {s.label} <span className="tnum">{zar(s.cents)}</span>
                        </span>
                        <span className="text-xs text-ink-400">{s.note}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                {channel === "ONLINE" && <p className="mt-4 text-xs text-ink-400">Online prices are national: store and region lists don&apos;t apply to web orders.</p>}
              </div>
              <div className="lg:col-span-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Every price list, for this scenario</div>
                <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-150">
                  {sim.verdicts.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${v.won ? "bg-leaf-500" : v.applies ? "bg-amber-500" : "bg-ink-300"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={`font-medium ${v.won ? "text-ink-950" : "text-ink-700"}`}>{v.name}</span>
                        <span className="block text-xs text-ink-500">
                          {v.won ? "✓ " : ""}
                          {v.reason}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-right text-ink-700">
                        {v.priceCents != null ? zar(v.priceCents) : "—"}
                        {v.minQty > 1 && <span className="block text-xs text-ink-500">{v.minQty}+ units</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Pricing rules" description="Network guardrails applied at every till" />
        <CardBody>
          {!can(user, "admin") && <ViewOnly className="mb-4">View only — set by the HQ administrator.</ViewOnly>}
          <ActionForm action={savePricingRules}>
            <fieldset disabled={!can(user, "admin")} className="min-w-0 grid gap-4 sm:grid-cols-3">
              <Field label="Near-expiry window (days)" htmlFor="markdownDays" hint="Stock expiring this soon is marked down at the till (FEFO)">
                <Input id="markdownDays" name="markdownDays" defaultValue={settings.pricing.markdownDays} inputMode="numeric" />
                <FieldError name="markdownDays" />
              </Field>
              <Field label="Near-expiry markdown %" htmlFor="markdownPct" hint="0 switches markdowns off. Never on licensed medicines.">
                <Input id="markdownPct" name="markdownPct" defaultValue={settings.pricing.markdownPct} inputMode="numeric" />
                <FieldError name="markdownPct" />
              </Field>
              <Field label="Store margin guide %" htmlFor="minMarginPct" hint="Warning only — franchisees set their own prices (Competition Act s5(2))">
                <Input id="minMarginPct" name="minMarginPct" defaultValue={settings.pricing.minMarginPct} inputMode="numeric" />
                <FieldError name="minMarginPct" />
              </Field>
            </fieldset>
            {can(user, "admin") && (
              <div className="mt-4 flex justify-end">
                <SubmitButton variant="outline" pendingLabel="Saving…">Save rules</SubmitButton>
              </div>
            )}
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
