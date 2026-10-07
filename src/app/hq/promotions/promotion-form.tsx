"use client";
import { useMemo, useState } from "react";
import { BadgePercent, Coins, Gift, Layers, Percent, Sparkles, AlertTriangle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Checkbox, Label } from "@/components/ui/form";
import { MultiPick, type PickOption } from "@/components/hq/multi-pick";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { describePromo, type PromoKind } from "@/lib/promotions";
import { parseRand } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

export type PromoValues = {
  name: string; description: string; kind: PromoKind; percent: string; amount: string; multiplier: string; bundlePrice: string;
  buyQty: string; getQty: string; rewardPercent: string; minSpend: string; categoryIds: string[]; productIds: string[];
  rewardCategoryIds: string[]; rewardProductIds: string[]; channels: string[]; storeIds: string[]; days: number[];
  startTime: string; endTime: string; startsAt: string; endsAt: string; code: string; maxUses: string; active: boolean;
  firstPurchaseOnly: boolean;
};

const KINDS: { key: PromoKind; label: string; blurb: string; icon: React.ReactNode }[] = [
  { key: "PERCENT", label: "Percent off", blurb: "e.g. 15% off apparel", icon: <Percent className="h-4 w-4" /> },
  { key: "FIXED", label: "Rand off", blurb: "R off each item, or off the basket", icon: <Coins className="h-4 w-4" /> },
  { key: "BUY_X_GET_Y", label: "Bonus buy", blurb: "BOGO, gift with purchase, complementary deals", icon: <Gift className="h-4 w-4" /> },
  { key: "MULTIBUY", label: "Multi-buy", blurb: "Any N for a set price", icon: <Layers className="h-4 w-4" /> },
  { key: "MULTIPLIER", label: "Points multiplier", blurb: "e.g. double points Fridays", icon: <Sparkles className="h-4 w-4" /> },
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const cents = (s: string) => parseRand(s) ?? 0;
const int = (s: string) => (s.trim() && Number.isInteger(Number(s)) ? Number(s) : null);
const names = (ids: string[], opts: PickOption[]) => {
  const n = ids.map((id) => opts.find((o) => o.value === id)?.label ?? "").filter(Boolean);
  return n.length > 3 ? `${n.slice(0, 3).join(", ")} and ${n.length - 3} more` : n.join(", ");
};

export function PromotionForm({
  action,
  values,
  categories,
  products,
  stores,
  excluded,
  readOnly,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values: PromoValues;
  categories: PickOption[];
  products: PickOption[];
  stores: PickOption[];
  excluded: string[]; // labels of the classes that never get deals (Medicines Act s18A: incentiveExcluded)
  readOnly?: boolean;
}) {
  const [v, setV] = useState(values);
  const set = <K extends keyof PromoValues>(k: K, val: PromoValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const input = (k: keyof PromoValues) => ({ value: String(v[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never) });

  const preview = useMemo(() => {
    const value = { PERCENT: int(v.percent) ?? 0, FIXED: cents(v.amount), MULTIPLIER: Math.round((Number(v.multiplier) || 0) * 100), MULTIBUY: cents(v.bundlePrice), BUY_X_GET_Y: 0 }[v.kind];
    // Until the deal's key number is filled in, say so rather than preview "0% off".
    const incomplete = {
      PERCENT: !int(v.percent),
      FIXED: !cents(v.amount),
      MULTIPLIER: !(Number(v.multiplier) > 1),
      MULTIBUY: !cents(v.bundlePrice) || !int(v.buyQty),
      BUY_X_GET_Y: !int(v.buyQty) && !cents(v.minSpend),
    }[v.kind];
    const headline = incomplete ? null : describePromo({
      id: "preview", name: v.name, kind: v.kind, value, categoryIds: v.categoryIds, productIds: v.productIds, minSpendCents: cents(v.minSpend),
      buyQty: int(v.buyQty), getQty: int(v.getQty), rewardPercent: int(v.rewardPercent) ?? 100, rewardCategoryIds: v.rewardCategoryIds, rewardProductIds: v.rewardProductIds,
    });
    const on = names([...v.categoryIds], categories) || names(v.productIds, products) ? [names(v.categoryIds, categories), names(v.productIds, products)].filter(Boolean).join(" + ") : "everything in the basket";
    const reward = v.kind === "BUY_X_GET_Y" && (v.rewardCategoryIds.length || v.rewardProductIds.length) ? [names(v.rewardCategoryIds, categories), names(v.rewardProductIds, products)].filter(Boolean).join(" + ") : null;
    const days = v.days.length && v.days.length < 7 ? [...v.days].sort().map((d) => DAYS[d]).join(", ") : "every day";
    const hours = v.startTime || v.endTime ? `${v.startTime || "00:00"}–${v.endTime || "24:00"}` : "all day";
    const where = v.storeIds.length ? `${v.storeIds.length} store${v.storeIds.length === 1 ? "" : "s"}` : "every store";
    const ch = v.channels.length === 2 ? "in store and online" : v.channels[0] === "ONLINE" ? "online only" : v.channels[0] === "POS" ? "in store only" : "no channel";
    const start = v.startsAt ? new Date(`${v.startsAt}:00+02:00`) : null;
    const end = v.endsAt ? new Date(`${v.endsAt}:00+02:00`) : null;
    const months = start && end ? (end.getTime() - start.getTime()) / (30.44 * 86_400_000) : 0;
    return { headline, on, reward, days, hours, where, ch, longReduction: (v.kind === "PERCENT" || v.kind === "FIXED") && months > 3 };
  }, [v, categories, products]);

  const fmt = (s: string) => (s ? new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(`${s}:00+02:00`)) : "—");

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <fieldset disabled={readOnly} className="min-w-0 contents">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="The deal" />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name" hint="Shown on receipts, shelf talkers and in the web shop">
                  <Input id="name" name="name" {...input("name")} placeholder="e.g. Rolling essentials: tray + free papers" />
                  <FieldError name="name" />
                </Field>
                <Field label="Description" htmlFor="description" hint="Optional: terms for staff and the web shop">
                  <Input id="description" name="description" {...input("description")} />
                </Field>
              </div>
              <div>
                <Label>Type</Label>
                <input type="hidden" name="kind" value={v.kind} />
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label="Deal type">
                  {KINDS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      role="radio"
                      aria-checked={v.kind === k.key}
                      onClick={() => set("kind", k.key)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        v.kind === k.key ? "border-brand-500 bg-brand-50 ring-4 ring-brand-500/15" : "border-ink-200 bg-white hover:border-ink-300",
                      )}
                    >
                      <span className={cn("mb-1.5 grid h-7 w-7 place-items-center rounded-lg", v.kind === k.key ? "bg-brand-500 text-ink-950" : "bg-ink-100 text-ink-600")}>{k.icon}</span>
                      <span className="block text-sm font-semibold text-ink-900">{k.label}</span>
                      <span className="block text-xs text-ink-500">{k.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                {v.kind === "PERCENT" && (
                  <Field label="Percent off" htmlFor="percent">
                    <Input id="percent" name="percent" {...input("percent")} inputMode="numeric" placeholder="15" />
                    <FieldError name="percent" />
                  </Field>
                )}
                {v.kind === "FIXED" && (
                  <Field label="Rand off" htmlFor="amount" hint="Each item when items are picked; else off the basket">
                    <Input id="amount" name="amount" {...input("amount")} inputMode="decimal" placeholder="75.00" />
                    <FieldError name="amount" />
                  </Field>
                )}
                {v.kind === "MULTIPLIER" && (
                  <Field label="Points multiplier" htmlFor="multiplier">
                    <Input id="multiplier" name="multiplier" {...input("multiplier")} inputMode="decimal" placeholder="2" />
                    <FieldError name="multiplier" />
                  </Field>
                )}
                {v.kind === "MULTIBUY" && (
                  <>
                    <Field label="Any" htmlFor="buyQty">
                      <Input id="buyQty" name="buyQty" {...input("buyQty")} inputMode="numeric" placeholder="3" />
                      <FieldError name="buyQty" />
                    </Field>
                    <Field label="For (bundle price)" htmlFor="bundlePrice">
                      <Input id="bundlePrice" name="bundlePrice" {...input("bundlePrice")} inputMode="decimal" placeholder="500.00" />
                      <FieldError name="bundlePrice" />
                    </Field>
                  </>
                )}
                {v.kind === "BUY_X_GET_Y" && (
                  <>
                    <Field label="Buy" htmlFor="buyQty" hint="Blank = spend trigger">
                      <Input id="buyQty" name="buyQty" {...input("buyQty")} inputMode="numeric" placeholder="1" />
                      <FieldError name="buyQty" />
                    </Field>
                    <Field label="Get" htmlFor="getQty">
                      <Input id="getQty" name="getQty" {...input("getQty")} inputMode="numeric" placeholder="1" />
                      <FieldError name="getQty" />
                    </Field>
                    <Field label="Reward discount %" htmlFor="rewardPercent" hint="100 = free">
                      <Input id="rewardPercent" name="rewardPercent" {...input("rewardPercent")} inputMode="numeric" />
                      <FieldError name="rewardPercent" />
                    </Field>
                  </>
                )}
                <Field label="Minimum spend" htmlFor="minSpend" hint="Optional (R)">
                  <Input id="minSpend" name="minSpend" {...input("minSpend")} inputMode="decimal" placeholder="0" />
                  <FieldError name="minSpend" />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={v.kind === "BUY_X_GET_Y" ? "Qualifying and reward items" : "Qualifying items"} description="Pick categories and/or products. Nothing picked = everything in the basket." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label>{v.kind === "BUY_X_GET_Y" ? "Buy: categories" : "Categories"}</Label>
                <MultiPick name="categoryIds" options={categories} defaultValue={v.categoryIds} onChange={(x) => set("categoryIds", x)} emptyLabel="Any category" height="max-h-44" />
                <FieldError name="categoryIds" />
              </div>
              <div>
                <Label>{v.kind === "BUY_X_GET_Y" ? "Buy: products" : "Products"}</Label>
                <MultiPick name="productIds" options={products} defaultValue={v.productIds} onChange={(x) => set("productIds", x)} emptyLabel="Any product" placeholder="Search products…" height="max-h-44" />
                <FieldError name="productIds" />
              </div>
              {v.kind === "BUY_X_GET_Y" && (
                <>
                  <div>
                    <Label>Get: reward categories</Label>
                    <MultiPick name="rewardCategoryIds" options={categories} defaultValue={v.rewardCategoryIds} onChange={(x) => set("rewardCategoryIds", x)} emptyLabel="Same as qualifying items" height="max-h-44" />
                  </div>
                  <div>
                    <Label>Get: reward products</Label>
                    <MultiPick name="rewardProductIds" options={products} defaultValue={v.rewardProductIds} onChange={(x) => set("rewardProductIds", x)} emptyLabel="Same as qualifying items" placeholder="Search products…" height="max-h-44" />
                  </div>
                  <p className="text-xs text-ink-500 sm:col-span-2">Gift with purchase: leave “Buy” empty, set a minimum spend and pick the gift as the reward. Complementary deal: buy one product, get a different one discounted. The cheapest eligible item is always the reward.</p>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="When and where" />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label>Channels</Label>
                <div className="flex h-10 items-center gap-6">
                  {[
                    ["POS", "In store"],
                    ["ONLINE", "Online"],
                  ].map(([c, l]) => (
                    <Checkbox key={c} name="channels" value={c} checked={v.channels.includes(c)} onChange={(e) => set("channels", e.target.checked ? [...v.channels, c] : v.channels.filter((x) => x !== c))} label={l} />
                  ))}
                </div>
                <FieldError name="channels" />
              </div>
              <div>
                <Label>Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = v.days.includes(i);
                    return (
                      <label key={d} className={cn("cursor-pointer rounded-full border px-2.5 py-1.5 text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500", on ? "border-brand-500 bg-brand-500 text-ink-950" : "border-ink-200 text-ink-600 hover:border-ink-300")}>
                        <input type="checkbox" name="days" value={i} checked={on} onChange={() => set("days", on ? v.days.filter((x) => x !== i) : [...v.days, i])} className="sr-only" />
                        {d}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-ink-500">None picked = every day.</p>
              </div>
              <Field label="Starts" htmlFor="startsAt">
                <Input id="startsAt" name="startsAt" type="datetime-local" {...input("startsAt")} />
                <FieldError name="startsAt" />
              </Field>
              <Field label="Ends" htmlFor="endsAt">
                <Input id="endsAt" name="endsAt" type="datetime-local" {...input("endsAt")} />
                <FieldError name="endsAt" />
              </Field>
              <Field label="Happy hour from" htmlFor="startTime" hint="Optional (SAST)">
                <Input id="startTime" name="startTime" type="time" {...input("startTime")} />
                <FieldError name="startTime" />
              </Field>
              <Field label="Until" htmlFor="endTime">
                <Input id="endTime" name="endTime" type="time" {...input("endTime")} />
                <FieldError name="endTime" />
              </Field>
              <div className="sm:col-span-2">
                <Label>Stores</Label>
                <MultiPick name="storeIds" options={stores} defaultValue={v.storeIds} onChange={(x) => set("storeIds", x)} emptyLabel="Whole network" placeholder="Search stores…" height="max-h-40" />
                <FieldError name="storeIds" />
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="sticky top-20 space-y-6">
            <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-card" aria-live="polite">
              <div className="eyebrow text-brand-500">Live preview</div>
              <div className="mt-2 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
                  <BadgePercent className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-xl font-semibold leading-tight">
                    {preview.headline ?? <span className="text-ink-400">{KINDS.find((k) => k.key === v.kind)?.label}: add the details</span>}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-300">{v.name || "Untitled promotion"}</div>
                </div>
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-ink-800 pt-3 text-sm">
                <Row k="On">{preview.on}</Row>
                {preview.reward && <Row k="Reward">{preview.reward}</Row>}
                <Row k="Where">
                  {preview.where}, {preview.ch}
                </Row>
                <Row k="When">
                  {preview.days}, {preview.hours}
                </Row>
                <Row k="Runs">
                  {fmt(v.startsAt)} → {fmt(v.endsAt)}
                </Row>
                {v.code && (
                  <Row k="Code">
                    <span className="font-mono">{v.code.toUpperCase()}</span>
                  </Row>
                )}
                {v.firstPurchaseOnly && <Row k="Who">A member&apos;s first purchase only (welcome gift)</Row>}
              </dl>
            </div>
            {(excluded.length > 0 || preview.longReduction) && (
              <div className="space-y-2">
                {excluded.length > 0 && (
                  <p className="rounded-xl border border-sky-500/20 bg-sky-50 px-3 py-2.5 text-xs text-sky-700">
                    Medicines never qualify or get discounted (Medicines Act s18A): {excluded.join(" and ")} are excluded automatically.
                  </p>
                )}
                {preview.longReduction && (
                  <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Runs longer than 3 months. ARB Code 5.3.2 limits how long a single price reduction may be advertised.
                  </p>
                )}
              </div>
            )}
            <Card>
              <CardHeader title="Code and limits" />
              <CardBody className="space-y-4">
                <Field label="Promo code" htmlFor="code" hint="Optional. With a code, the deal only applies when it's entered.">
                  <Input id="code" name="code" {...input("code")} className="font-mono uppercase" placeholder="WELCOMEBACK" />
                  <FieldError name="code" />
                </Field>
                <Field label="Maximum uses" htmlFor="maxUses" hint="Optional cap across the network">
                  <Input id="maxUses" name="maxUses" {...input("maxUses")} inputMode="numeric" />
                  <FieldError name="maxUses" />
                </Field>
                <Checkbox
                  name="firstPurchaseOnly"
                  checked={v.firstPurchaseOnly}
                  onChange={(e) => set("firstPurchaseOnly", e.target.checked)}
                  label="First purchase only (welcome gift)"
                  description="Only for a member with no purchases yet, once identified at the till or signed in online. If the gift isn't in the basket, they see “Free with your basket. Add it…”."
                />
                <Checkbox name="active" checked={v.active} onChange={(e) => set("active", e.target.checked)} label="Active" description="Untick to pause without ending it" />
              </CardBody>
            </Card>
            {!readOnly && (
              <div className="flex justify-end">
                <SubmitButton size="lg" pendingLabel="Saving…">Save promotion</SubmitButton>
              </div>
            )}
          </div>
        </div>
      </fieldset>
    </ActionForm>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-ink-500">{k}</dt>
      <dd className="min-w-0 text-ink-100">{children}</dd>
    </div>
  );
}
