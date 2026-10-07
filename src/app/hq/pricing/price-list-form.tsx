"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Checkbox, Label, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MultiPick } from "@/components/hq/multi-pick";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { parseRand, zar } from "@/lib/money";
import type { ActionState } from "@/server/hq/guard";

type Item = { variantId: string; price: string; minQty: string };
export type PriceListValues = {
  name: string; kind: string; channel: string; tiers: string[]; storeIds: string[]; regionIds: string[]; adjustPct: string;
  startsAt: string; endsAt: string; priority: string; active: boolean; items: Item[];
};

const HELP: Record<string, string> = {
  ZONE: "Regional or scheduled prices, such as a tourist-zone uplift or next month's price update. Sets the shelf price.",
  CHANNEL: "Prices for one channel only, such as online-only prices.",
  MEMBER: "Members-only prices on specific products (e.g. this week's Rewards deals), optionally for certain tiers. Applies when it beats the shelf price and the member's instant tier saving.",
  TRADE: "Trade (wholesale) prices for business accounts, ex VAT. The account's own list first, else the live trade lists by priority, else the wholesale price. Never scoped by store.",
};

export function PriceListForm({
  action,
  values,
  variants,
  stores,
  regions,
  tiers,
  readOnly,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values: PriceListValues;
  variants: { id: string; label: string; rrpCents: number; wholesaleCents: number; group: string }[];
  stores: { value: string; label: string; hint?: string }[];
  regions: { id: string; name: string }[];
  tiers: { key: string; name: string }[];
  readOnly?: boolean;
}) {
  const [kind, setKind] = useState(values.kind);
  const [items, setItems] = useState<Item[]>(values.items.length ? values.items : [{ variantId: "", price: "", minQty: "1" }]);
  const trade = kind === "TRADE";
  const rrp = new Map(variants.map((v) => [v.id, trade ? v.wholesaleCents : v.rrpCents]));
  const groups = [...new Set(variants.map((v) => v.group))];
  const set = (i: number, patch: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <fieldset disabled={readOnly} className="min-w-0 contents">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={trade ? "Prices ex VAT" : "Prices"} description={trade ? "Trade prices are ex VAT: what the account pays per unit before VAT is added per line. Add a row with a minimum quantity above 1 for a quantity break." : "Item prices are VAT-inclusive. Add a row with a minimum quantity above 1 for a quantity break."} />
            <CardBody className="space-y-2">
              <div className="hidden grid-cols-[1fr_8rem_6rem_2.5rem] gap-2 px-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-500 sm:grid">
                <span>Item</span>
                <span>{trade ? "Price ex VAT" : "Price"}</span>
                <span>Min qty</span>
                <span />
              </div>
              {items.map((it, i) => {
                const base = rrp.get(it.variantId);
                const p = parseRand(it.price);
                const diff = base && p ? (p - base) / base : null;
                return (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_8rem_6rem_2.5rem] sm:border-0 sm:p-0">
                    <Select name="itemVariant" aria-label={`Item ${i + 1}`} value={it.variantId} onChange={(e) => set(i, { variantId: e.target.value })} wrapperClassName="col-span-2 sm:col-span-1">
                      <option value="">Choose an item…</option>
                      {groups.map((g) => (
                        <optgroup key={g} label={g}>
                          {variants.filter((v) => v.group === g).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label} — {trade ? `wholesale ${zar(v.wholesaleCents)}` : `RRP ${zar(v.rrpCents)}`}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                    <div>
                      <Input name="itemPrice" aria-label={`Price ${i + 1}`} value={it.price} onChange={(e) => set(i, { price: e.target.value })} inputMode="decimal" placeholder="0.00" className="tnum" />
                      {diff != null && Number.isFinite(diff) && <span className={`mt-0.5 block text-[0.7rem] ${diff < 0 ? "text-leaf-700" : "text-ink-500"}`}>{diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}% vs {trade ? "wholesale" : "RRP"}</span>}
                    </div>
                    <Input name="itemMinQty" aria-label={`Minimum quantity ${i + 1}`} value={it.minQty} onChange={(e) => set(i, { minQty: e.target.value })} inputMode="numeric" className="tnum" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : [{ variantId: "", price: "", minQty: "1" }])} aria-label={`Remove row ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <FieldError name="items" />
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { variantId: "", price: "", minQty: "1" }])}>
                  <Plus className="h-4 w-4" /> Add item
                </Button>
              )}
            </CardBody>
          </Card>
          {trade ? (
            <Card>
              <CardHeader title="Who it applies to" description="Trade lists price the wholesale channel for every trade account; HQ can assign a list to one account on its account page. Stores and regions don't apply." />
            </Card>
          ) : (
          <Card>
            <CardHeader title="Where it applies" description="Leave stores and regions empty to apply network-wide." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label>Regions</Label>
                <div className="space-y-2 rounded-xl border border-ink-200 p-3">
                  {regions.map((r) => (
                    <Checkbox key={r.id} name="regionIds" value={r.id} defaultChecked={values.regionIds.includes(r.id)} label={r.name} />
                  ))}
                </div>
              </div>
              <div>
                <Label>Specific stores</Label>
                <MultiPick name="storeIds" options={stores} defaultValue={values.storeIds} emptyLabel="No specific stores" placeholder="Search stores…" height="max-h-44" />
              </div>
            </CardBody>
          </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Price list" />
            <CardBody className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={values.name} placeholder="e.g. Atlantic Seaboard tourist zone" />
                <FieldError name="name" />
              </Field>
              <Field label="Type" htmlFor="kind" hint={HELP[kind]}>
                <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="ZONE">Zone / scheduled</option>
                  <option value="CHANNEL">Channel</option>
                  <option value="MEMBER">Rewards deal (members only)</option>
                  <option value="TRADE">Trade (ex VAT, wholesale channel)</option>
                </Select>
                <FieldError name="kind" />
              </Field>
              {trade ? (
                <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">Channel: trade (wholesale), covering the portal, HQ-placed orders and trade sales at the till.</p>
              ) : (
              <Field label="Channel" htmlFor="channel">
                <Select id="channel" name="channel" defaultValue={values.channel}>
                  {kind !== "CHANNEL" && <option value="">In store and online</option>}
                  <option value="POS">In store only</option>
                  <option value="ONLINE">Online only</option>
                </Select>
                <FieldError name="channel" />
              </Field>
              )}
              {kind === "MEMBER" && (
                <div>
                  <Label>Member tiers</Label>
                  <p className="mb-2 text-xs text-ink-500">None ticked = every member.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {tiers.map((t) => (
                      <Checkbox key={t.key} name="tiers" value={t.key} defaultChecked={values.tiers.includes(t.key)} label={t.name} />
                    ))}
                  </div>
                </div>
              )}
              <Field label={trade ? "Blanket adjustment on the wholesale price" : "Blanket adjustment on RRP"} htmlFor="adjustPct" hint="For items without a set price, e.g. −5 for 5% off. Leave blank for none.">
                <div className="relative">
                  <Input id="adjustPct" name="adjustPct" defaultValue={values.adjustPct} inputMode="decimal" className="pr-7" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">%</span>
                </div>
                <FieldError name="adjustPct" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Starts" htmlFor="startsAt">
                  <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={values.startsAt} />
                  <FieldError name="startsAt" />
                </Field>
                <Field label="Ends" htmlFor="endsAt">
                  <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={values.endsAt} />
                  <FieldError name="endsAt" />
                </Field>
              </div>
              <Field label="Priority" htmlFor="priority" hint={trade ? "When several trade lists are live, the highest priority prices an item first." : "When several zone lists match, the highest priority sets the shelf price."}>
                <div className="w-28">
                  <Input id="priority" name="priority" defaultValue={values.priority} inputMode="numeric" />
                </div>
                <FieldError name="priority" />
              </Field>
              <Checkbox name="active" defaultChecked={values.active} label="Active" description="Switch off to pause without deleting" />
            </CardBody>
          </Card>
          {!readOnly && (
            <div className="flex justify-end">
              <SubmitButton size="lg" pendingLabel="Saving…">Save price list</SubmitButton>
            </div>
          )}
        </div>
      </fieldset>
    </ActionForm>
  );
}
