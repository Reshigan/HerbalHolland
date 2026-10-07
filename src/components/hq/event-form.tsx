"use client";
// Event editor shared by the HQ console (with a store picker) and the store back office (its own store).
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { slugify } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

export type EventValues = { storeId: string; title: string; slug: string; blurb: string; startsAt: string; endsAt: string; capacity: string };

export function EventForm({
  action,
  values,
  stores,
  readOnly,
  narrow,
  submitLabel = "Save event",
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  values: EventValues;
  stores?: { id: string; label: string }[];
  readOnly?: boolean;
  narrow?: boolean;
  submitLabel?: string;
}) {
  const [v, setV] = useState(values);
  const [slugEdited, setSlugEdited] = useState(!!values.slug);
  const set = <K extends keyof EventValues>(k: K, val: EventValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const flags = useMemo(() => screenCopy(`${v.title} ${v.blurb}`), [v.title, v.blurb]);
  const ageNote = v.blurb.length > 10 && !/18/.test(v.blurb);
  const two = narrow ? "grid gap-4" : "grid gap-4 sm:grid-cols-2";

  return (
    <ActionForm action={action} className="space-y-4">
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        {stores && (
          <Field label="Store" htmlFor="ev-store">
            <Select id="ev-store" name="storeId" value={v.storeId} onChange={(e) => set("storeId", e.target.value)}>
              <option value="">Choose a store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <FieldError name="storeId" />
          </Field>
        )}
        <div className={two}>
          <Field label="Title" htmlFor="ev-title">
            <Input
              id="ev-title"
              name="title"
              maxLength={80}
              value={v.title}
              onChange={(e) => setV((x) => ({ ...x, title: e.target.value, slug: slugEdited ? x.slug : slugify(e.target.value) }))}
              placeholder="Members' evening: heritage landraces"
            />
            <FieldError name="title" />
          </Field>
          <Field label="Web address" htmlFor="ev-slug" hint={v.slug ? `…/events/${v.slug}` : "Made from the title"}>
            <Input id="ev-slug" name="slug" maxLength={80} value={v.slug} onChange={(e) => (setSlugEdited(true), set("slug", e.target.value.toLowerCase()))} className="font-mono" />
            <FieldError name="slug" />
          </Field>
        </div>
        <div>
          <Label htmlFor="ev-blurb">What's on</Label>
          <Textarea
            id="ev-blurb"
            name="blurb"
            maxLength={500}
            value={v.blurb}
            onChange={(e) => set("blurb", e.target.value)}
            className={cn(flags.length > 0 && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
            placeholder="Meet the team, taste Rooibos & CBD tea and pick up a welcome gift. Adults 18+, ID at the door."
          />
          <p className="mt-1.5 text-xs text-ink-500">{v.blurb.length} / 500 · say who it&apos;s for: adults 18+, ID at the door</p>
          <FieldError name="blurb" />
          <div className="mt-1.5 space-y-1" aria-live="polite">
            {flags.map((f) => (
              <p key={f.term} className="flex gap-1.5 text-xs font-medium text-rose-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> “{f.term}”: {f.reason}
              </p>
            ))}
            {!flags.length && ageNote && (
              <p className="flex gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Add “Adults 18+, ID at the door” so guests know before they come.
              </p>
            )}
            {!flags.length && !ageNote && v.blurb.length > 10 && (
              <p className="flex gap-1.5 text-xs font-medium text-leaf-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Copy passes screening
              </p>
            )}
          </div>
        </div>
        <div className={two}>
          <Field label="Starts (SAST)" htmlFor="ev-start">
            <Input id="ev-start" name="startsAt" type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            <FieldError name="startsAt" />
          </Field>
          <Field label="Ends" htmlFor="ev-end">
            <Input id="ev-end" name="endsAt" type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            <FieldError name="endsAt" />
          </Field>
        </div>
        <div className={two}>
          <Field label="Capacity" htmlFor="ev-cap" hint="Tickets stop when it's full; the door list prints from here">
            <Input id="ev-cap" name="capacity" inputMode="numeric" value={v.capacity} onChange={(e) => set("capacity", e.target.value)} className="tnum" />
            <FieldError name="capacity" />
          </Field>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving…" disabled={flags.length > 0} className={narrow ? "w-full" : undefined} size={narrow ? "lg" : "md"}>
            {submitLabel}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
