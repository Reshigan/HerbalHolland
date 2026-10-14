"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Label, Textarea, Select } from "@/components/ui/form";
import { MultiPick, type PickOption } from "@/components/hq/multi-pick";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { slugify } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import { TIERS } from "@/lib/loyalty-rules";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

export type DropValues = {
  name: string;
  slug: string;
  blurb: string;
  variantIds: string[];
  startsAt: string;
  endsAt: string;
  earlyTier: string;
  earlyMinutes: string;
  perMemberLimit: string;
  membersOnly: boolean;
};

const EARLY = [15, 30, 60, 120, 180, 240, 360, 720, 1440];
const early = (m: number) => (m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m === 60 ? "1 hour" : `${m / 60} hours`);
const at = (s: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+02:00`) : null);
const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

export function DropForm({
  action,
  values,
  options,
  readOnly,
  submitLabel = "Save drop",
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values: DropValues;
  options: PickOption[];
  readOnly?: boolean;
  submitLabel?: string;
}) {
  const [v, setV] = useState(values);
  const [slugEdited, setSlugEdited] = useState(!!values.slug);
  const set = <K extends keyof DropValues>(k: K, val: DropValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const flags = useMemo(() => screenCopy(`${v.name} ${v.blurb}`), [v.name, v.blurb]);
  const minutes = Number(v.earlyMinutes) || 0;
  const minuteChoices = EARLY.includes(minutes) || !minutes ? EARLY : [...EARLY, minutes].sort((a, b) => a - b);

  const timing = useMemo(() => {
    const start = at(v.startsAt);
    const end = at(v.endsAt);
    const first = start && v.earlyTier ? new Date(start.getTime() - minutes * 60_000) : start;
    // Alerts to watchers only go out inside CPA Regulation 4 contact windows (notifyDrops holds them otherwise).
    const held = [first, start].filter((d): d is Date => !!d).map((d) => ({ d, w: marketingWindow(d) })).filter((x) => !x.w.allowed);
    return { start, end, first, held };
  }, [v.startsAt, v.endsAt, v.earlyTier, minutes]);
  const tierName = TIERS.find((t) => t.key === v.earlyTier)?.name;

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <fieldset disabled={readOnly} className="contents min-w-0">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="The drop" description="What members see on the drop page and in the alert" />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name">
                  <Input
                    id="name"
                    name="name"
                    maxLength={80}
                    value={v.name}
                    onChange={(e) => setV((x) => ({ ...x, name: e.target.value, slug: slugEdited ? x.slug : slugify(e.target.value) }))}
                    placeholder="e.g. Sunset Hoodie No. 1"
                  />
                  <FieldError name="name" />
                </Field>
                <Field label="Web address" htmlFor="slug" hint={`shop.herbalholland.com/drops/${v.slug || "…"}`}>
                  <Input id="slug" name="slug" maxLength={80} value={v.slug} onChange={(e) => (setSlugEdited(true), set("slug", e.target.value.toLowerCase()))} className="font-mono" />
                  <FieldError name="slug" />
                </Field>
              </div>
              <div>
                <Label htmlFor="blurb">Blurb</Label>
                <Textarea
                  id="blurb"
                  name="blurb"
                  maxLength={300}
                  value={v.blurb}
                  onChange={(e) => set("blurb", e.target.value)}
                  className={cn(flags.length > 0 && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                  placeholder="A numbered first run of our brushed-fleece hoodie. One per member."
                />
                <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-ink-500">
                  <span>{v.blurb.length} / 300 · warm and plain, with no medical claims</span>
                </div>
                <FieldError name="blurb" />
                <div className="mt-1.5 space-y-1" aria-live="polite">
                  {flags.map((f) => (
                    <p key={f.term} className="flex gap-1.5 text-xs font-medium text-rose-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> “{f.term}”: {f.reason}
                    </p>
                  ))}
                  {!flags.length && v.blurb.length > 10 && (
                    <p className="flex gap-1.5 text-xs font-medium text-leaf-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Copy passes screening
                    </p>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Products" description="The variants in the drop. Apparel, accessories and CBD only: licensed medicines can't be dropped and aren't listed." />
            <CardBody>
              <MultiPick name="variantIds" options={options} defaultValue={v.variantIds} onChange={(x) => set("variantIds", x)} emptyLabel="Pick at least one product" placeholder="Search products or SKUs…" height="max-h-64" />
              <FieldError name="variantIds" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timing and access" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens for everyone (SAST)" htmlFor="startsAt">
                <Input id="startsAt" name="startsAt" type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
                <FieldError name="startsAt" />
              </Field>
              <Field label="Ends" htmlFor="endsAt" hint="Optional. After the drop, leftover stock sells normally.">
                <Input id="endsAt" name="endsAt" type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
                <FieldError name="endsAt" />
              </Field>
              <Field label="Early access" htmlFor="earlyTier" hint="This tier and above get in first">
                <Select id="earlyTier" name="earlyTier" value={v.earlyTier} onChange={(e) => set("earlyTier", e.target.value)}>
                  <option value="">No early access</option>
                  {TIERS.filter((t) => t.key !== "SEED").map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name} and above
                    </option>
                  ))}
                </Select>
                <FieldError name="earlyTier" />
              </Field>
              <Field label="How early" htmlFor="earlyMinutes">
                <Select id="earlyMinutes" name="earlyMinutes" value={String(minutes || 60)} onChange={(e) => set("earlyMinutes", e.target.value)} disabled={!v.earlyTier}>
                  {minuteChoices.map((m) => (
                    <option key={m} value={m}>
                      {early(m)} early
                    </option>
                  ))}
                </Select>
                <FieldError name="earlyMinutes" />
              </Field>
              <Field label="Limit per member" htmlFor="perMemberLimit" hint="Across the till and online, for the whole drop">
                <Input id="perMemberLimit" name="perMemberLimit" inputMode="numeric" value={v.perMemberLimit} onChange={(e) => set("perMemberLimit", e.target.value)} className="tnum" />
                <FieldError name="perMemberLimit" />
              </Field>
              <div className="flex items-center sm:pt-6">
                <Checkbox name="membersOnly" checked={v.membersOnly} onChange={(e) => set("membersOnly", e.target.checked)} label="Rewards members only" description="Walk-ins join free at the till to buy" />
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-card" aria-live="polite">
              <div className="eyebrow text-brand-500">Drop preview</div>
              <div className="mt-2 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-xl font-semibold leading-tight">{v.name || <span className="text-ink-400">Untitled drop</span>}</div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-ink-300">{v.blurb || "Add a blurb"}</div>
                </div>
              </div>
              <dl className="mt-4 space-y-1.5 border-t border-ink-800 pt-3 text-sm">
                {v.earlyTier && timing.first && <Row k={tierName ?? "Early"}>{fmt(timing.first)}</Row>}
                <Row k="Everyone">{timing.start ? fmt(timing.start) : "—"}</Row>
                <Row k="Ends">{timing.end ? fmt(timing.end) : "When it sells out"}</Row>
                <Row k="Limit">{Number(v.perMemberLimit) > 0 ? `${v.perMemberLimit} per member` : "—"}</Row>
                <Row k="Who">{v.membersOnly ? "Rewards members" : "Everyone 18+"}</Row>
                <Row k="Items">{v.variantIds.length ? `${v.variantIds.length} product${v.variantIds.length === 1 ? "" : "s"}` : "None yet"}</Row>
              </dl>
            </div>
            {timing.held.length > 0 ? (
              <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-xs text-amber-700" role="note">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {timing.held[0].w.reason}: “notify me” alerts wait for the next legal contact slot, {fmt(nextMarketingSlot(timing.held[0].d))} (CPA Regulation 4). You can still open then, or pick a weekday 08:00–20:00 or Saturday 09:00–13:00.
                </span>
              </p>
            ) : (
              timing.start && (
                <p className="flex gap-2 rounded-xl bg-leaf-50 px-3 py-2.5 text-xs text-leaf-700">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden /> Opens inside the legal contact window, so watchers are alerted the moment it opens for them.
                </p>
              )
            )}
            {!readOnly && (
              <div className="flex justify-end">
                <SubmitButton size="lg" pendingLabel="Saving…" disabled={flags.length > 0}>
                  {submitLabel}
                </SubmitButton>
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
      <dt className="w-20 shrink-0 text-ink-500">{k}</dt>
      <dd className="min-w-0 text-ink-100">{children}</dd>
    </div>
  );
}
