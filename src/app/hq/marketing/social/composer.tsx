"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { limitFor, needsImage, screenSocial, SOCIAL_IMAGES, SOCIAL_NETWORKS, type SocialChannel, type SocialMode } from "@/lib/social";
import { num } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

const WHEN: { key: SocialMode; label: string }[] = [
  { key: "now", label: "Post now" },
  { key: "schedule", label: "Schedule" },
  { key: "draft", label: "Draft in Postiz" },
];
const pill = (on: boolean) =>
  cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition focus-within:ring-4 focus-within:ring-brand-500/25", on ? "border-brand-500 bg-brand-50 text-ink-900" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300");

export function SocialComposer({ action, channels }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; channels: SocialChannel[] }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(() => channels.map((c) => c.id));
  const [image, setImage] = useState("brand");
  const [when, setWhen] = useState<SocialMode>("now");
  const ids = channels.filter((c) => picked.includes(c.id)).map((c) => c.identifier);
  const flags = useMemo(() => screenSocial(text), [text]);
  const limit = limitFor(ids);
  const over = text.length > limit;
  const imageMissing = !image && needsImage(ids);

  return (
    <ActionForm action={action} onDone={(s) => s.ok && setText("")}>
      <Card>
        <CardHeader title="New post" description="Screened as you type: no THC, no selling cannabis or CBD, no health claims. The brand, merch, stores, events and Learn only." />
        <CardBody className="space-y-5">
          {channels.length > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-800">Post to</legend>
              <div className="flex flex-wrap gap-2">
                {channels.map((c) => (
                  <label key={c.id} className={pill(picked.includes(c.id))}>
                    <input type="checkbox" name="channel" value={c.id} checked={picked.includes(c.id)} onChange={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} className="accent-brand-600" />
                    <b className="font-semibold">{SOCIAL_NETWORKS[c.identifier].label}</b> {c.name}
                  </label>
                ))}
              </div>
              <FieldError name="channel" />
            </fieldset>
          )}

          <div>
            <Label htmlFor="content">Caption</Label>
            <textarea
              id="content"
              name="content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={over || flags.length > 0 || undefined}
              placeholder="e.g. The Windmill Tee is back: the mark embroidered in Sunset thread, made for you in Cape Town."
              className={cn(
                "min-h-36 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink-900 transition placeholder:text-ink-400 focus:outline-none focus:ring-4",
                over || flags.length ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15" : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/15",
              )}
            />
            <p className={cn("mt-1.5 text-xs text-ink-500", over && "font-medium text-rose-600")}>
              {num(text.length)} / {num(limit)} characters{limit < 2200 && ` (${ids.includes("x") ? "X" : "Threads"})`}
            </p>
            <FieldError name="content" />
            <div className="mt-2 space-y-1" aria-live="polite">
              {flags.map((f) => (
                <p key={f.term} className="flex gap-1.5 text-xs font-medium text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> “{f.term}”: {f.reason}
                </p>
              ))}
              {!flags.length && text.length > 10 && (
                <p className="flex gap-1.5 text-xs font-medium text-leaf-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Caption passes screening
                </p>
              )}
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-800">Picture</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {[{ key: "", label: "No picture" }, ...SOCIAL_IMAGES].map((i) => (
                <label key={i.key} className={cn("cursor-pointer rounded-xl border p-1 text-center text-[0.7rem] text-ink-600 transition focus-within:ring-4 focus-within:ring-brand-500/25", image === i.key ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-ink-300")}>
                  <input type="radio" name="image" value={i.key} checked={image === i.key} onChange={() => setImage(i.key)} className="sr-only" />
                  {i.key ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/social/${i.key}.jpg`} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                  ) : (
                    <span className="grid aspect-square place-items-center rounded-lg bg-ink-50 text-ink-500">None</span>
                  )}
                  <span className="mt-1 block truncate">{i.label}</span>
                </label>
              ))}
            </div>
            {imageMissing && <p className="mt-1.5 text-xs font-medium text-rose-600">Instagram needs a picture.</p>}
            <FieldError name="image" />
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-800">When</legend>
            <div className="flex flex-wrap items-center gap-2">
              {WHEN.map((w) => (
                <label key={w.key} className={pill(when === w.key)}>
                  <input type="radio" name="mode" value={w.key} checked={when === w.key} onChange={() => setWhen(w.key)} className="sr-only" />
                  {w.label}
                </label>
              ))}
              {when === "schedule" && <Input name="at" type="datetime-local" aria-label="Date and time (SAST)" className="w-auto" />}
            </div>
            <FieldError name="at" />
            {when === "draft" && <p className="mt-1.5 text-xs text-ink-500">Lands in Postiz as a draft. Add a video or tweak it per channel there, then schedule.</p>}
          </fieldset>

          <SubmitButton size="lg" disabled={flags.length > 0 || over || imageMissing || text.trim().length < 10} pendingLabel="Sending…">
            <Send className="h-4 w-4" /> {WHEN.find((w) => w.key === when)!.label}
          </SubmitButton>
        </CardBody>
      </Card>
    </ActionForm>
  );
}
