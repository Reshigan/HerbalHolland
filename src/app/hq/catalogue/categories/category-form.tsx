"use client";
import { useState } from "react";
import { Field, Input, Label } from "@/components/ui/form";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { CATEGORY_ICONS, CATEGORY_ICON_LABEL, CATEGORY_ICON_NAMES, categoryIcon } from "@/components/product/category-icons";
import { screenCopy } from "@/lib/compliance";
import { slugify } from "@/server/hq/form";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

export type CategoryInput = { name: string; slug: string; blurb: string | null; icon: string };

export function CategoryForm({ action, category, cancelHref }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; category: CategoryInput | null; cancelHref?: string }) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [blurb, setBlurb] = useState(category?.blurb ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "Leaf");
  const flags = screenCopy(`${name} ${blurb}`);
  const Icon = categoryIcon(icon);

  return (
    <ActionForm action={action} className="space-y-4">
      <Field label="Name" htmlFor="cat-name">
        <Input id="cat-name" name="name" value={name} maxLength={40} onChange={(e) => (setName(e.target.value), !slugTouched && setSlug(slugify(e.target.value)))} placeholder="e.g. Coffee & drinks" />
        <FieldError name="name" />
      </Field>
      <Field label="URL slug" htmlFor="cat-slug" hint={category ? `/shop?category=${slug || "…"} · changing it breaks links to the old address` : `/shop?category=${slug || "…"}`}>
        <Input id="cat-slug" name="slug" value={slug} onChange={(e) => (setSlug(e.target.value), setSlugTouched(true))} className="font-mono text-[0.8rem]" />
        <FieldError name="slug" />
      </Field>
      <Field label="Blurb" htmlFor="cat-blurb" hint={`One line under the name in the shop (${blurb.length}/140) — no health claims`}>
        <Input id="cat-blurb" name="blurb" value={blurb} maxLength={140} onChange={(e) => setBlurb(e.target.value)} placeholder="e.g. Coffee and rooibos with South African hemp" />
        <FieldError name="blurb" />
      </Field>
      {flags.map((f) => (
        <p key={f.term} className="-mt-2 text-xs font-medium text-rose-600">
          “{f.term}” — {f.reason}
        </p>
      ))}
      <fieldset>
        <legend className="mb-1.5 block text-[0.78rem] font-semibold text-ink-700">Icon</legend>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 xl:grid-cols-6">
          {CATEGORY_ICON_NAMES.map((n) => {
            const I = CATEGORY_ICONS[n];
            const on = icon === n;
            return (
              <label
                key={n}
                title={CATEGORY_ICON_LABEL[n]}
                className={cn(
                  "grid h-11 cursor-pointer place-items-center rounded-xl border text-ink-600 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/30",
                  on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-150 hover:border-ink-300 hover:text-ink-900",
                )}
              >
                <input type="radio" name="icon" value={n} checked={on} onChange={() => setIcon(n)} className="sr-only" aria-label={CATEGORY_ICON_LABEL[n]} />
                <I className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              </label>
            );
          })}
        </div>
        <FieldError name="icon" />
      </fieldset>
      <div>
        <Label>In the shop</Label>
        <div className="rounded-2xl border border-ink-800 bg-ink-950 p-4" aria-hidden>
          <Icon className="h-7 w-7 text-brand-500" strokeWidth={1.6} />
          <div className="mt-4 font-display text-lg font-semibold text-white">{name || "Category name"}</div>
          <p className="mt-1 line-clamp-2 text-sm text-ink-400">{blurb || "One line about what's in it."}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {cancelHref && (
          <ButtonLink href={cancelHref} variant="ghost">
            Cancel
          </ButtonLink>
        )}
        <SubmitButton pendingLabel="Saving…">{category ? "Save category" : "Add category"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
