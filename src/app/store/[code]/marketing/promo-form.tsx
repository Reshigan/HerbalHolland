"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { describePromo, type PromoKind } from "@/lib/promotions";
import { Checkbox, Field, Input, Label } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";
import { parseRand, scheduleLabel } from "@/server/store/rules";

type Option = { id: string; name: string; group?: string };
export type PromoDraft = {
  name: string;
  description: string;
  kind: PromoKind;
  percent: string;
  amount: string;
  bundleQty: string;
  bundlePrice: string;
  buyQty: string;
  getQty: string;
  rewardPercent: string;
  minSpend: string;
  categoryIds: string[];
  productIds: string[];
  rewardCategoryIds: string[];
  rewardProductIds: string[];
  code: string;
  startsAt: string;
  endsAt: string;
  days: number[];
  from: string;
  to: string;
  maxUses: string;
  firstPurchaseOnly: boolean;
};

const KINDS: { key: PromoKind; label: string; hint: string }[] = [
  { key: "PERCENT", label: "% off", hint: "e.g. 10% off accessories" },
  { key: "FIXED", label: "Rand off", hint: "R off each item, or off the basket" },
  { key: "BUY_X_GET_Y", label: "Buy X, get Y", hint: "Bonus buys and free gifts" },
  { key: "MULTIBUY", label: "Multi-buy", hint: "Any N for a set price" },
];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Picker({ name, options, value, onChange, placeholder }: { name: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded-xl border border-ink-200">
      {value.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {options.length > 8 && (
        <div className="relative border-b border-ink-100">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 w-full rounded-t-xl bg-transparent pl-8 pr-3 text-sm focus:outline-none" />
        </div>
      )}
      <div className="max-h-40 overflow-y-auto p-1.5">
        {shown.map((o) => {
          const on = value.includes(o.id);
          return (
            <label key={o.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm", on ? "bg-brand-50 text-ink-950" : "text-ink-700 hover:bg-ink-50")}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} className="accent-brand-500" />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.group && <span className="shrink-0 text-[0.68rem] text-ink-500">{o.group}</span>}
            </label>
          );
        })}
        {!shown.length && <p className="px-2 py-1.5 text-xs text-ink-500">Nothing matches</p>}
      </div>
    </div>
  );
}

export function PromoForm({ action, initial, categories, products, storeName, submitLabel }: {
  action: FormAction;
  initial: PromoDraft;
  categories: Option[];
  products: Option[];
  storeName: string;
  submitLabel: string;
}) {
  const [d, setD] = useState(initial);
  const set = <K extends keyof PromoDraft>(k: K, v: PromoDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof PromoDraft) => ({ value: d[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never) });

  const preview = useMemo(() => {
    const cents = (s: string) => parseRand(s) ?? 0;
    const value = d.kind === "PERCENT" ? Number(d.percent) || 0 : d.kind === "FIXED" ? cents(d.amount) : d.kind === "MULTIBUY" ? cents(d.bundlePrice) : 0;
    const deal = describePromo({
      id: "preview", name: d.name, kind: d.kind, value, categoryIds: d.categoryIds, productIds: d.productIds, minSpendCents: cents(d.minSpend),
      buyQty: d.kind === "MULTIBUY" ? Number(d.bundleQty) || 0 : Number(d.buyQty) || null, getQty: Number(d.getQty) || 0, rewardPercent: Number(d.rewardPercent) || 100,
      rewardCategoryIds: d.rewardCategoryIds, rewardProductIds: d.rewardProductIds,
    });
    const targets = [...d.categoryIds.map((id) => categories.find((c) => c.id === id)?.name), ...d.productIds.map((id) => products.find((p) => p.id === id)?.name)].filter(Boolean);
    return { deal, targets };
  }, [d, categories, products]);

  const minutes = (s: string) => (/^\d{2}:\d{2}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

  return (
    <ActionForm action={action} className="space-y-5">
      <div className="rounded-2xl bg-ink-950 p-4 text-white">
        <div className="eyebrow text-brand-500">Shelf talker preview</div>
        <div className="mt-1 font-display text-xl font-semibold">{preview.deal}</div>
        <div className="mt-1 text-sm text-ink-300">
          {preview.targets.length ? `On ${preview.targets.slice(0, 3).join(", ")}${preview.targets.length > 3 ? ` +${preview.targets.length - 3} more` : ""}` : "On everything in store"} · {scheduleLabel(d.days, minutes(d.from), minutes(d.to))}
          {d.code && ` · code ${d.code.toUpperCase()}`}
          {d.firstPurchaseOnly && " · welcome gift: a member's first purchase only"}
        </div>
        <div className="mt-2 text-[0.7rem] text-ink-400">At {storeName}&apos;s tills only. Never applies to licensed medicines (Medicines Act s18A).</div>
      </div>

      <Field label="Name" htmlFor="pr-name" hint="Shown on receipts and the till">
        <Input id="pr-name" name="name" maxLength={80} {...text("name")} placeholder="Friday happy hour: 10% off pre-rolls" />
        <FieldError name="name" />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Deal</legend>
        <input type="hidden" name="kind" value={d.kind} />
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Deal type">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={d.kind === k.key}
              onClick={() => set("kind", k.key)}
              className={cn("rounded-xl border px-3 py-2 text-left transition", d.kind === k.key ? "border-brand-500 bg-brand-50 ring-4 ring-brand-500/15" : "border-ink-200 hover:border-ink-300")}
            >
              <span className="block text-sm font-semibold text-ink-900">{k.label}</span>
              <span className="block text-[0.7rem] text-ink-500">{k.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {d.kind === "PERCENT" && (
            <Field label="Discount %" htmlFor="pr-pct">
              <Input id="pr-pct" name="percent" inputMode="numeric" {...text("percent")} />
              <FieldError name="percent" />
            </Field>
          )}
          {d.kind === "FIXED" && (
            <Field label="Rand off" htmlFor="pr-amt">
              <Input id="pr-amt" name="amount" inputMode="decimal" {...text("amount")} />
              <FieldError name="amount" />
            </Field>
          )}
          {d.kind === "MULTIBUY" && (
            <>
              <Field label="Any" htmlFor="pr-bq">
                <Input id="pr-bq" name="bundleQty" inputMode="numeric" {...text("bundleQty")} />
                <FieldError name="bundleQty" />
              </Field>
              <Field label="For (R)" htmlFor="pr-bp">
                <Input id="pr-bp" name="bundlePrice" inputMode="decimal" {...text("bundlePrice")} />
                <FieldError name="bundlePrice" />
              </Field>
            </>
          )}
          {d.kind === "BUY_X_GET_Y" && (
            <>
              <Field label="Buy" htmlFor="pr-buy">
                <Input id="pr-buy" name="buyQty" inputMode="numeric" {...text("buyQty")} placeholder="—" />
                <FieldError name="buyQty" />
              </Field>
              <Field label="Get" htmlFor="pr-get">
                <Input id="pr-get" name="getQty" inputMode="numeric" {...text("getQty")} />
                <FieldError name="getQty" />
              </Field>
              <Field label="At % off" htmlFor="pr-rp" hint="100 = free">
                <Input id="pr-rp" name="rewardPercent" inputMode="numeric" {...text("rewardPercent")} />
                <FieldError name="rewardPercent" />
              </Field>
            </>
          )}
          <Field label="Min. spend (R)" htmlFor="pr-min">
            <Input id="pr-min" name="minSpend" inputMode="decimal" {...text("minSpend")} placeholder="None" />
            <FieldError name="minSpend" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[0.78rem] font-semibold text-ink-700">Qualifying items {d.categoryIds.length + d.productIds.length === 0 && <span className="font-normal text-ink-500">— none picked means everything</span>}</legend>
        <Label className="mb-0 text-xs font-medium text-ink-500">Categories</Label>
        <Picker name="categoryIds" options={categories} value={d.categoryIds} onChange={(v) => set("categoryIds", v)} placeholder="Filter categories" />
        <Label className="mb-0 pt-1 text-xs font-medium text-ink-500">Products</Label>
        <Picker name="productIds" options={products} value={d.productIds} onChange={(v) => set("productIds", v)} placeholder="Filter products" />
      </fieldset>

      {d.kind === "BUY_X_GET_Y" && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[0.78rem] font-semibold text-ink-700">Reward items <span className="font-normal text-ink-500">— none picked means the same as qualifying</span></legend>
          <Picker name="rewardCategoryIds" options={categories} value={d.rewardCategoryIds} onChange={(v) => set("rewardCategoryIds", v)} placeholder="Filter categories" />
          <Picker name="rewardProductIds" options={products} value={d.rewardProductIds} onChange={(v) => set("rewardProductIds", v)} placeholder="Filter products" />
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="pr-start">
          <Input id="pr-start" name="startsAt" type="datetime-local" {...text("startsAt")} />
          <FieldError name="startsAt" />
        </Field>
        <Field label="Ends" htmlFor="pr-end">
          <Input id="pr-end" name="endsAt" type="datetime-local" {...text("endsAt")} />
          <FieldError name="endsAt" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Days <span className="font-normal text-ink-500">— none picked means every day</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEK.map((day) => {
            const on = d.days.includes(day);
            return (
              <label key={day} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold", on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-600 hover:border-ink-300")}>
                <input type="checkbox" name="days" value={day} checked={on} onChange={() => set("days", on ? d.days.filter((x) => x !== day) : [...d.days, day])} className="sr-only" />
                {DAY[day]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Happy hour from" htmlFor="pr-from">
          <Input id="pr-from" name="from" type="time" {...text("from")} />
          <FieldError name="from" />
        </Field>
        <Field label="to" htmlFor="pr-to">
          <Input id="pr-to" name="to" type="time" {...text("to")} />
          <FieldError name="to" />
        </Field>
        <Field label="Max uses" htmlFor="pr-max">
          <Input id="pr-max" name="maxUses" inputMode="numeric" {...text("maxUses")} placeholder="No limit" />
          <FieldError name="maxUses" />
        </Field>
      </div>

      <Field label="Promo code (optional)" htmlFor="pr-code" hint="Leave blank to apply automatically. With a code, it applies only when the code is quoted at the till.">
        <Input id="pr-code" name="code" maxLength={16} {...text("code")} className="font-mono uppercase" placeholder="HATFIELD10" />
        <FieldError name="code" />
      </Field>
      <Checkbox
        name="firstPurchaseOnly"
        checked={d.firstPurchaseOnly}
        onChange={(e) => set("firstPurchaseOnly", e.target.checked)}
        label="First purchase only (welcome gift)"
        description="Only for a member with no purchases yet, once identified at the till. If the gift isn't in the basket, the till suggests “Free with your basket — add it…”."
      />
      <Field label="Internal note (optional)" htmlFor="pr-desc">
        <Input id="pr-desc" name="description" maxLength={200} {...text("description")} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
