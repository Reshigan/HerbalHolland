"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock, Mail, MessageSquare, Send, Smartphone, Users } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Label } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/hq/select";
import { Mark } from "@/components/brand/logo";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { screenCopy } from "@/lib/compliance";
import { INTERESTS, SEGMENTS, type InterestKey } from "@/lib/rfm";
import { TIERS } from "@/lib/loyalty-rules";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

export type CampaignValues = { name: string; channel: string; segment: string; storeId: string; message: string; promotionId: string; cost: string; scheduledAt: string };
type Reach = { total: number; reachable: number; suppressionList: number } | null;

const CHANNELS = [
  { key: "SMS", label: "SMS", icon: Smartphone, note: "Widest reach · CPA windows apply" },
  { key: "EMAIL", label: "Email", icon: Mail, note: "Rich content · unsubscribe link" },
  { key: "PUSH", label: "Push", icon: Bell, note: "Rewards app alerts · free" },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageSquare, note: "Utility messages only" },
] as const;
const TOKENS = [
  ["{{firstName}}", "First name"],
  ["{{points}}", "Points balance"],
  ["{{code}}", "Promo code"],
] as const;
// Push notifications: the campaign name is the bold title; lock screens truncate long bodies.
const PUSH_TITLE_MAX = 40;
const PUSH_BODY_MAX = 140;
const fmt = (d: Date) => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

export function Composer({
  action,
  estimate,
  values,
  stores,
  promotions,
  footers,
  canSend,
  requireStore,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  estimate: (segment: string, channel: string, storeId: string | null) => Promise<Reach>;
  values: CampaignValues;
  stores: { id: string; name: string }[];
  promotions: { id: string; label: string; code: string | null }[];
  footers: { email: string; text: string; push: string };
  canSend: boolean;
  requireStore: boolean;
}) {
  const [v, setV] = useState(values);
  const set = <K extends keyof CampaignValues>(k: K, val: CampaignValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const [reach, setReach] = useState<Reach>(null);
  const [loading, start] = useTransition();
  const [now, setNow] = useState<Date | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (requireStore && !v.storeId) return setReach(null);
    const t = setTimeout(() => start(async () => setReach(await estimate(v.segment, v.channel, v.storeId || null))), 250);
    return () => clearTimeout(t);
  }, [v.segment, v.channel, v.storeId, estimate, requireStore]);

  const promo = promotions.find((p) => p.id === v.promotionId);
  const flags = useMemo(() => screenCopy(`${v.name} ${v.message}`), [v.name, v.message]);
  const rendered = v.message.replaceAll("{{firstName}}", "Thandi").replaceAll("{{points}}", "1,250 pts").replaceAll("{{code}}", promo?.code ?? "CODE");
  const footer = v.channel === "EMAIL" ? footers.email : v.channel === "PUSH" ? footers.push : footers.text;
  const full = rendered + footer;
  const parts = full.length <= 160 ? 1 : Math.ceil(full.length / 153);
  const push = v.channel === "PUSH";
  const titleLong = push && v.name.length > PUSH_TITLE_MAX;
  const bodyLong = push && v.message.length > PUSH_BODY_MAX;
  const window = now ? marketingWindow(now) : null;
  const scheduled = v.scheduledAt ? new Date(`${v.scheduledAt}:00+02:00`) : null;
  const scheduledOk = scheduled ? marketingWindow(scheduled) : null;

  const insert = (token: string) => {
    const el = text.current;
    const pos = el?.selectionStart ?? v.message.length;
    const next = v.message.slice(0, pos) + token + v.message.slice(el?.selectionEnd ?? pos);
    set("message", next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + token.length, pos + token.length);
    });
  };

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-6 xl:grid-cols-3" noticeClassName="xl:col-span-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="Channel and audience" />
          <CardBody className="space-y-5">
            <div>
              <Label>Channel</Label>
              <input type="hidden" name="channel" value={v.channel} />
              <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Channel">
                {CHANNELS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={v.channel === c.key}
                    onClick={() => set("channel", c.key)}
                    className={cn("rounded-xl border p-3 text-left transition", v.channel === c.key ? "border-brand-500 bg-brand-50 ring-4 ring-brand-500/15" : "border-ink-200 bg-white hover:border-ink-300")}
                  >
                    <c.icon className={cn("mb-1.5 h-5 w-5", v.channel === c.key ? "text-brand-700" : "text-ink-500")} strokeWidth={1.9} />
                    <span className="block text-sm font-semibold text-ink-900">{c.label}</span>
                    <span className="block text-xs text-ink-500">{c.note}</span>
                  </button>
                ))}
              </div>
              {v.channel === "WHATSAPP" && (
                <p className="mt-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-xs text-amber-700" role="note">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  WhatsApp&apos;s Commerce Policy prohibits promoting drugs, including cannabis and medical products — the number can be banned. Use WhatsApp for utility messages only (order updates, collection reminders), never for offers.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audience" htmlFor="segment">
                <Select id="segment" name="segment" value={v.segment} onChange={(e) => set("segment", e.target.value)}>
                  <option value="ALL">All members</option>
                  <optgroup label="Segments">
                    {Object.entries(SEGMENTS).map(([k, s]) => (
                      <option key={k} value={k}>{s.name} — {s.blurb}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Tiers">
                    {TIERS.map((t) => (
                      <option key={t.key} value={`tier:${t.key}`}>{t.name} tier</option>
                    ))}
                  </optgroup>
                  <optgroup label="Interests (told us at sign-up)">
                    {(Object.keys(INTERESTS) as InterestKey[]).map((k) => (
                      <option key={k} value={`interest:${k}`}>Into {INTERESTS[k]}</option>
                    ))}
                  </optgroup>
                </Select>
                <FieldError name="segment" />
              </Field>
              <Field label="Home store" htmlFor="storeId" hint={requireStore ? "Required — members homed at one of your stores" : "Optional — only members whose home store this is"}>
                <Select id="storeId" name="storeId" value={v.storeId} onChange={(e) => set("storeId", e.target.value)}>
                  <option value="">{requireStore ? "Choose a store" : "Any store (network)"}</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <FieldError name="storeId" />
              </Field>
            </div>
            {v.segment in SEGMENTS && <p className="text-xs text-ink-600"><b className="text-brand-700">Suggested play:</b> {SEGMENTS[v.segment as keyof typeof SEGMENTS].play}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Message" description="Copy is screened as you type (ARB Code, Medicines Act s20). A sender footer with our details and opt-out is added to every message." />
          <CardBody className="space-y-4">
            <Field
              label={v.channel === "EMAIL" ? "Name (email subject line)" : push ? "Name (push title)" : "Campaign name"}
              htmlFor="name"
              hint={
                v.channel === "EMAIL" ? (
                  "Members see this as the subject"
                ) : push ? (
                  <span className={cn(titleLong && "font-medium text-rose-600")}>
                    Shown in bold on the notification · {v.name.length} / {PUSH_TITLE_MAX} characters
                  </span>
                ) : (
                  "For reporting — members don't see it"
                )
              }
            >
              <Input
                id="name"
                name="name"
                value={v.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={push ? "e.g. Sunset Hoodie drops Friday" : "e.g. We miss you — R75 off"}
                aria-invalid={titleLong || undefined}
                className={cn(titleLong && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
              />
              <FieldError name="name" />
            </Field>
            <div>
              <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
                <Label htmlFor="message" className="mb-0">Message</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TOKENS.map(([t, l]) => (
                    <Button key={t} type="button" size="sm" variant="outline" onClick={() => insert(t)} className="h-7 px-2.5 text-[0.7rem]">
                      + {l}
                    </Button>
                  ))}
                </div>
              </div>
              <textarea
                id="message"
                name="message"
                ref={text}
                value={v.message}
                onChange={(e) => set("message", e.target.value)}
                aria-invalid={bodyLong || flags.length > 0 || undefined}
                className={cn(
                  "min-h-32 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition placeholder:text-ink-400 focus:outline-none focus:ring-4",
                  flags.length > 0 || bodyLong ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15" : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/15",
                )}
                placeholder="Hi {{firstName}}, …"
              />
              <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-ink-500">
                <span className={cn(bodyLong && "font-medium text-rose-600")}>
                  {push ? `${v.message.length} / ${PUSH_BODY_MAX} characters — keep push short` : `${v.message.length} characters`}
                  {v.channel === "SMS" && ` · ${parts} SMS part${parts === 1 ? "" : "s"} with footer`}
                </span>
                {v.message.includes("{{code}}") && !promo?.code && <span className="font-medium text-rose-600">Link a promotion with a code for {"{{code}}"}</span>}
              </div>
              <FieldError name="message" />
              <div className="mt-2 space-y-1" aria-live="polite">
                {flags.map((f) => (
                  <p key={f.term} className="flex gap-1.5 text-xs font-medium text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> “{f.term}” — {f.reason}
                  </p>
                ))}
                {!flags.length && v.message.length > 10 && (
                  <p className="flex gap-1.5 text-xs font-medium text-leaf-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Copy passes screening
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Linked promotion" htmlFor="promotionId" hint="Sales using its code are attributed to this campaign">
                <Select id="promotionId" name="promotionId" value={v.promotionId} onChange={(e) => set("promotionId", e.target.value)}>
                  <option value="">None</option>
                  {promotions.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </Select>
                <FieldError name="promotionId" />
              </Field>
              <Field label="Cost (R)" htmlFor="cost" hint="Drawn from the marketing fund — used for ROI">
                <Input id="cost" name="cost" value={v.cost} onChange={(e) => set("cost", e.target.value)} inputMode="decimal" placeholder="0.00" />
                <FieldError name="cost" />
              </Field>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Reach" description="Consented members, before the do-not-contact list is checked at send time" />
          <CardBody>
            {requireStore && !v.storeId ? (
              <p className="text-sm text-ink-500">Choose a home store to see the reach.</p>
            ) : (
              <div className={cn("transition-opacity", loading && "opacity-60")} aria-live="polite">
                <div className="flex items-baseline gap-2">
                  <Users className="h-5 w-5 self-center text-brand-700" aria-hidden />
                  <span className="font-display text-3xl font-semibold tnum text-ink-950">{reach ? reach.reachable.toLocaleString() : "…"}</span>
                  <span className="text-sm text-ink-500">reachable</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {reach ? `of ${reach.total.toLocaleString()} in the audience have opted in to ${CHANNELS.find((c) => c.key === v.channel)?.label}. ${reach.suppressionList.toLocaleString()} numbers and emails are on the do-not-contact list.` : "Counting…"}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="rounded-2xl bg-ink-950 p-4 text-white shadow-card">
          <div className="eyebrow mb-3 text-brand-500">Preview</div>
          {push ? (
            <div className="rounded-2xl bg-white/95 p-3 text-ink-900 shadow-lift">
              <div className="flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-wide text-ink-500">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-ink-950 text-brand-500">
                  <Mark className="h-4 w-4" detail={false} />
                </span>
                Herbal Holland · now
              </div>
              <div className="mt-1.5 truncate text-sm font-semibold">{v.name || "Title"}</div>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink-700">{rendered || "Your message…"}</p>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[0.68rem] text-ink-400">{footer.trim()}</p>
            </div>
          ) : v.channel === "EMAIL" ? (
            <div className="rounded-xl bg-white p-3 text-ink-850">
              <div className="border-b border-ink-100 pb-2 text-xs text-ink-500">
                <b className="text-ink-900">{v.name || "Subject line"}</b>
                <br />
                Herbal Holland &lt;hello@herbalholland.co.za&gt;
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{rendered || "Your message…"}</p>
              <p className="mt-2 whitespace-pre-wrap text-[0.7rem] text-ink-500">{footer.trim()} Unsubscribe</p>
            </div>
          ) : (
            <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-ink-800 px-3.5 py-2.5 text-sm leading-relaxed text-ink-100">
              <p className="whitespace-pre-wrap">{rendered || "Your message…"}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[0.7rem] text-ink-400">{footer.trim()}</p>
            </div>
          )}
        </div>

        <Card>
          <CardHeader title="Send" description="CPA Regulation 4: weekdays 08:00–20:00, Saturdays 09:00–13:00, never on Sundays or public holidays" />
          <CardBody className="space-y-4">
            {window && (
              <p className={cn("flex gap-2 rounded-xl px-3 py-2.5 text-xs", window.allowed ? "bg-leaf-50 text-leaf-700" : "bg-amber-50 text-amber-700")}>
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                {window.allowed ? "Inside the legal send window — Send now goes out immediately." : `${window.reason}. Send now will hold it until ${fmt(nextMarketingSlot(now!))}.`}
              </p>
            )}
            {canSend && (
              <Field label="Or schedule for" htmlFor="scheduledAt">
                <Input id="scheduledAt" name="scheduledAt" type="datetime-local" value={v.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} />
                <FieldError name="scheduledAt" />
                {scheduled && scheduledOk && !scheduledOk.allowed && <p className="mt-1.5 text-xs text-amber-700">{scheduledOk.reason} — it will move to {fmt(nextMarketingSlot(scheduled))}.</p>}
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              {canSend && (
                <SubmitButton name="intent" value="send" size="lg" disabled={flags.length > 0 || titleLong || bodyLong} pendingLabel="Sending…" className="col-span-2">
                  <Send className="h-4 w-4" /> Send now
                </SubmitButton>
              )}
              <SubmitButton name="intent" value="draft" variant="outline" pendingLabel="Saving…" className={canSend ? undefined : "col-span-2"}>
                Save draft
              </SubmitButton>
              {canSend && (
                <SubmitButton name="intent" value="schedule" variant="dark" disabled={!v.scheduledAt || flags.length > 0 || titleLong || bodyLong}>
                  Schedule
                </SubmitButton>
              )}
            </div>
            {!canSend && <p className="text-xs text-ink-500">HQ marketing reviews and sends drafts from area managers.</p>}
          </CardBody>
        </Card>
      </div>
    </ActionForm>
  );
}
