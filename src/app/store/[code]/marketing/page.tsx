import { BadgePercent, Megaphone, Pencil, Plus } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { segmentLabel } from "@/server/marketing";
import { storeCampaigns, storePromotions, type PromoState } from "@/server/store/marketing";
import { hrefWith, scheduleLabel, sp1, toLocalInput } from "@/server/store/rules";
import { welcomeLine } from "@/server/hq/launch-rules";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { INTERESTS, SEGMENTS, type InterestKey, type SegmentKey } from "@/lib/rfm";
import { zar } from "@/lib/money";
import { addDays, fmtDate, fmtDateTime, dayKey } from "@/lib/format";
import { campaignReach, cancelCampaign, createCampaign, endPromotion, savePromotion, sendDraft } from "./actions";
import { PromoForm, type PromoDraft } from "./promo-form";
import { CampaignForm } from "./campaign-form";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ReadOnlyNote } from "@/components/store/ui";
import { Drawer } from "@/components/store/drawer";
import { ActionButton, ConfirmAction } from "@/components/store/action-form";
import type { Promotion } from "@/generated/prisma/client";

export const metadata = { title: "Local marketing" };
type SP = Record<string, string | string[] | undefined>;
const STATE: Record<PromoState, [string, Tone]> = { live: ["Live now", "green"], idle: ["Outside its hours", "amber"], scheduled: ["Scheduled", "blue"], ended: ["Ended", "neutral"], paused: ["Stopped", "neutral"] };

const draftOf = (p: Promotion | null): PromoDraft => {
  const now = new Date();
  const clockOf = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return {
    name: p?.name ?? "",
    description: p?.description ?? "",
    kind: (p?.kind === "MULTIPLIER" ? "PERCENT" : p?.kind) ?? "PERCENT",
    percent: p?.kind === "PERCENT" ? String(p.value) : "10",
    amount: p?.kind === "FIXED" ? (p.value / 100).toFixed(2) : "",
    bundleQty: p?.kind === "MULTIBUY" ? String(p.buyQty ?? 2) : "2",
    bundlePrice: p?.kind === "MULTIBUY" ? (p.value / 100).toFixed(2) : "",
    buyQty: p?.kind === "BUY_X_GET_Y" && p.buyQty ? String(p.buyQty) : "2",
    getQty: p?.getQty ? String(p.getQty) : "1",
    rewardPercent: p?.rewardPercent ? String(p.rewardPercent) : "100",
    minSpend: p?.minSpendCents ? (p.minSpendCents / 100).toFixed(2) : "",
    categoryIds: p?.categoryIds ?? [],
    productIds: p?.productIds ?? [],
    rewardCategoryIds: p?.rewardCategoryIds ?? [],
    rewardProductIds: p?.rewardProductIds ?? [],
    code: p?.code ?? "",
    startsAt: toLocalInput(p?.startsAt ?? now),
    endsAt: toLocalInput(p?.endsAt ?? addDays(new Date(`${dayKey(now)}T23:59:00+02:00`), 14)),
    days: p?.days ?? [],
    from: clockOf(p?.startMinute ?? null),
    to: clockOf(p?.endMinute ?? null),
    maxUses: p?.maxUses ? String(p.maxUses) : "",
    firstPurchaseOnly: p?.firstPurchaseOnly ?? false,
  };
};

export default async function MarketingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/marketing`;
  const tab = sp1(sp.tab) === "campaigns" || sp1(sp.segment) ? "campaigns" : "promotions";
  const tabHref = (t: string) => hrefWith(path, {}, { tab: t === "promotions" ? null : t });

  return (
    <>
      <PageHeader
        overline={`Members · ${store.name}`}
        title="Local marketing"
        description={`Run your own till deals at ${store.name} and message your members. HQ network deals run alongside yours; every message respects consent, do-not-contact lists and legal send times.`}
      />
      <Card>
        <TabLinks className="px-4" current={tabHref(tab)} tabs={[{ href: tabHref("promotions"), label: "Promotions" }, { href: tabHref("campaigns"), label: "Campaigns" }]} />
        {tab === "promotions" ? <Promotions store={store} canManage={canManage} sp={sp} /> : <Campaigns store={store} canManage={canManage} sp={sp} path={path} />}
      </Card>
    </>
  );
}

type StoreCtx = Awaited<ReturnType<typeof storeForUser>>;

async function Promotions({ store, canManage, sp }: { store: StoreCtx; canManage: boolean; sp: SP }) {
  const [{ own, network }, categories, products] = await Promise.all([
    storePromotions(store),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({
      where: { status: "ACTIVE", variants: { some: { storeVariants: { some: { storeId: store.id } } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const prodName = new Map(products.map((p) => [p.id, p.name]));
  const productOptions = products.map((p) => ({ id: p.id, name: p.name, group: p.category.name }));
  const editId = sp1(sp.edit);
  const editing = own.find((p) => p.id === editId && p.state !== "ended") ?? null;
  const targets = (p: Promotion) => {
    const names = [...p.categoryIds.map((id) => catName.get(id)), ...p.productIds.map((id) => prodName.get(id) ?? "a product")].filter(Boolean) as string[];
    return names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "") : "Everything";
  };
  const row = (p: (typeof own)[number], mine: boolean) => (
    <Tr key={p.id}>
      <Td className="min-w-56">
        <div className="font-medium text-ink-900">{p.name}</div>
        <div className="text-xs text-ink-500">
          {p.firstPurchaseOnly && (
            <Badge tone="violet" className="mr-1.5">
              Welcome gift
            </Badge>
          )}
          {welcomeLine(p) ?? describePromo(p as PromoInput)}
          {p.code && <span className="ml-1.5 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-700">{p.code}</span>}
        </div>
      </Td>
      <Td className="max-w-52 text-ink-600">{targets(p)}</Td>
      <Td className="whitespace-nowrap text-ink-600">
        {fmtDate(p.startsAt)} – {fmtDate(p.endsAt)}
        <div className="text-xs text-ink-400">{scheduleLabel(p.days, p.startMinute, p.endMinute)}</div>
      </Td>
      <Td>
        <Badge tone={STATE[p.state][1]} dot>{STATE[p.state][0]}</Badge>
      </Td>
      <Td align="right">
        {p.use.sales.toLocaleString()}
        {p.use.discountCents > 0 && <div className="text-xs text-ink-400">{zar(p.use.discountCents)} given</div>}
      </Td>
      {canManage && (
        <Td className="text-right">
          {mine && p.state !== "ended" && p.state !== "paused" && (
            <div className="flex justify-end gap-2">
              <a href={`?edit=${p.id}`} className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink-700 hover:bg-ink-100">
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </a>
              <ConfirmAction action={endPromotion.bind(null, store.code, p.id)} label="End" title={`End “${p.name}” now?`} confirmLabel="End promotion" className="min-w-60">
                It stops at your tills immediately.
              </ConfirmAction>
            </div>
          )}
        </Td>
      )}
    </Tr>
  );
  const head = (
    <thead>
      <tr>
        <Th>Promotion</Th>
        <Th>Applies to</Th>
        <Th>Runs</Th>
        <Th>Status</Th>
        <Th align="right">Used here</Th>
        {canManage && <Th><span className="sr-only">Actions</span></Th>}
      </tr>
    </thead>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4 sm:px-5">
        <p className="text-sm text-ink-500">Your deals run at your tills only. The best deal per item wins, and deals never stack on the same unit.</p>
        {canManage ? (
          <Drawer
            key={editing?.id ?? "new"}
            label={editing ? "Edit promotion" : "New promotion"}
            icon={<Plus className="h-4 w-4" aria-hidden />}
            title={editing ? `Edit “${editing.name}”` : "New store promotion"}
            description="Build the deal and check the shelf-talker preview before you save."
            defaultOpen={!!editing || sp1(sp.new) === "promo"}
          >
            <PromoForm
              action={savePromotion.bind(null, store.code, editing?.id ?? null)}
              initial={draftOf(editing)}
              categories={categories}
              products={productOptions}
              storeName={store.name}
              submitLabel={editing ? "Save changes" : "Create promotion"}
            />
          </Drawer>
        ) : (
          <ReadOnlyNote />
        )}
      </div>
      <CardHeader title={`${store.name} promotions`} description="Created by your store" />
      {own.length === 0 ? (
        <EmptyState icon={<BadgePercent className="h-5 w-5" />} title="No store promotions yet">
          Try a happy hour on slow afternoons, or a multi-buy on a category you&apos;re overstocked in.
        </EmptyState>
      ) : (
        <Table className="mt-3">
          {head}
          <tbody>{own.map((p) => row(p, true))}</tbody>
        </Table>
      )}
      <div className="border-t border-ink-100">
        <CardHeader title="HQ deals running in your store" description="Network promotions from HQ — read-only" />
        {network.length === 0 ? (
          <CardBody className="text-sm text-ink-500">No network deals are running at your tills right now.</CardBody>
        ) : (
          <Table className="mt-3">
            {head}
            <tbody>{network.map((p) => row(p, false))}</tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

async function Campaigns({ store, canManage, sp, path }: { store: StoreCtx; canManage: boolean; sp: SP; path: string }) {
  const page = pageParam(sp.page);
  const [{ total, rows }, promos] = await Promise.all([
    storeCampaigns(store.id, page, 20),
    db.promotion.findMany({ where: { ownerStoreId: store.id, active: true, endsAt: { gte: new Date() } }, select: { id: true, name: true, code: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const segParam = sp1(sp.segment);
  const segments = [
    { value: "ALL", label: "All members" },
    ...(Object.keys(SEGMENTS) as SegmentKey[]).map((k) => ({ value: k, label: SEGMENTS[k].name, hint: SEGMENTS[k].blurb })),
    ...["SEED", "SPROUT", "BLOOM", "HARVEST"].map((t) => ({ value: `tier:${t}`, label: `${t.charAt(0) + t.slice(1).toLowerCase()} tier` })),
    ...(Object.keys(INTERESTS) as InterestKey[]).map((k) => ({ value: `interest:${k}`, label: `Into ${INTERESTS[k]}`, hint: "What they told us they're into when they joined" })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4 sm:px-5">
        <p className="text-sm text-ink-500">Messages go only to members of {store.name} who opted in to the channel. Sales from a linked promo code are attributed to the campaign.</p>
        {canManage ? (
          <Drawer label="New campaign" icon={<Megaphone className="h-4 w-4" aria-hidden />} title="New campaign" description={`To ${store.name} members`} defaultOpen={!!segParam}>
            <CampaignForm action={createCampaign.bind(null, store.code)} reach={campaignReach.bind(null, store.code)} segments={segments} promos={promos} initialSegment={segments.some((s) => s.value === segParam) ? segParam : undefined} />
          </Drawer>
        ) : (
          <ReadOnlyNote />
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No campaigns yet">
          Message a segment — say, members at risk of lapsing — with a reason to come back.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Audience</Th>
              <Th>Status</Th>
              <Th align="right">Sent</Th>
              <Th align="right">Skipped</Th>
              <Th align="right">Attributed sales</Th>
              {canManage && <Th><span className="sr-only">Actions</span></Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Tr key={c.id}>
                <Td className="min-w-56">
                  <div className="font-medium text-ink-900">{c.name}</div>
                  <div className="line-clamp-1 max-w-80 text-xs text-ink-500" title={c.message}>{c.message}</div>
                </Td>
                <Td>
                  <div className="text-ink-800">{segmentLabel(c.segment)}</div>
                  <div className="text-xs text-ink-400">{c.channel === "EMAIL" ? "Email" : c.channel === "SMS" ? "SMS" : c.channel}</div>
                </Td>
                <Td className="whitespace-nowrap">
                  <StatusBadge status={c.status} />
                  <div className="text-xs text-ink-400">{c.sentAt ? fmtDateTime(c.sentAt) : c.scheduledAt ? `for ${fmtDateTime(c.scheduledAt)}` : `created ${fmtDate(c.createdAt)}`}</div>
                </Td>
                <Td align="right">{c.sentCount.toLocaleString()}</Td>
                <Td align="right" className="text-ink-500">{c.suppressedCount.toLocaleString()}</Td>
                <Td align="right">
                  {c.result.orders ? (
                    <>
                      <span className="font-medium text-ink-900">{zar(c.result.revenueCents)}</span>
                      <div className="text-xs text-ink-400">{c.result.orders} sales</div>
                    </>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </Td>
                {canManage && (
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {c.status === "DRAFT" && <ActionButton action={sendDraft.bind(null, store.code, c.id)} variant="primary">Send</ActionButton>}
                      {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
                        <ConfirmAction action={cancelCampaign.bind(null, store.code, c.id)} label="Cancel" title={`Cancel “${c.name}”?`} confirmLabel="Cancel campaign" className="min-w-56">
                          Nothing more will be sent.
                        </ConfirmAction>
                      )}
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="border-t border-ink-100">
        <Pagination page={page} pageSize={20} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
      </div>
    </div>
  );
}
