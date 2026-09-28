"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Clock, Loader2, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { screenCopy } from "@/lib/compliance";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { fmtDateTime } from "@/lib/format";
import { Field, Input } from "@/components/ui/form";
import { Select } from "@/components/store/select";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";

type Reach = { total: number; reachable: number };

export function CampaignForm({ action, reach, segments, promos, initialSegment }: {
  action: FormAction;
  reach: (segment: string, channel: string) => Promise<Reach>;
  segments: { value: string; label: string; hint?: string }[];
  promos: { id: string; name: string; code: string | null }[];
  initialSegment?: string;
}) {
  const [segment, setSegment] = useState(initialSegment ?? "ALL");
  const [channel, setChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [message, setMessage] = useState("Hi {{firstName}}, ");
  const [promoId, setPromoId] = useState("");
  const [size, setSize] = useState<Reach | null>(null);
  const [loading, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    start(async () => setSize(await reach(segment, channel)));
  }, [segment, channel, reach]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const flags = screenCopy(message);
  const win = marketingWindow(now);
  const promo = promos.find((p) => p.id === promoId);
  const sample = message.replaceAll("{{firstName}}", "Thandi").replaceAll("{{points}}", "1,250 pts").replaceAll("{{code}}", promo?.code ?? "CODE");
  const parts = channel === "SMS" ? Math.ceil((sample.length + 110) / 153) : 0;
  const insert = (token: string) => {
    const el = box.current;
    const at = el?.selectionStart ?? message.length;
    const next = message.slice(0, at) + token + message.slice(el?.selectionEnd ?? at);
    setMessage(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  return (
    <ActionForm action={action} className="space-y-4">
      <Field label="Campaign name" htmlFor="cp-name" hint="Internal name — also the email subject">
        <Input id="cp-name" name="name" maxLength={80} placeholder="Hatfield: Heritage weekend" />
        <FieldError name="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Send to" htmlFor="cp-seg" hint={segments.find((s) => s.value === segment)?.hint}>
          <Select id="cp-seg" name="segment" value={segment} onChange={(e) => setSegment(e.target.value)}>
            {segments.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <FieldError name="segment" />
        </Field>
        <Field label="Channel" htmlFor="cp-ch">
          <Select id="cp-ch" name="channel" value={channel} onChange={(e) => setChannel(e.target.value as "SMS" | "EMAIL")}>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
          </Select>
        </Field>
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2.5 text-sm" aria-live="polite">
        <Users className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />
        {loading || !size ? (
          <span className="inline-flex items-center gap-2 text-ink-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Counting…</span>
        ) : (
          <span className="text-ink-700">
            <b className="text-ink-950">{size.reachable.toLocaleString()}</b> of {size.total.toLocaleString()} members can receive {channel === "SMS" ? "SMS" : "email"} marketing
            <span className="text-ink-500"> — the rest haven&apos;t opted in.</span>
          </span>
        )}
      </div>

      <Field label="Link a promotion (optional)" htmlFor="cp-promo" hint="Lets you use {{code}} in the message and tracks the sales it drives">
        <Select id="cp-promo" name="promotionId" value={promoId} onChange={(e) => setPromoId(e.target.value)}>
          <option value="">No promotion</option>
          {promos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.code ? ` · ${p.code}` : ""}
            </option>
          ))}
        </Select>
        <FieldError name="promotionId" />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="cp-msg" className="text-[0.78rem] font-semibold text-ink-700">Message</label>
          <span className="flex gap-1">
            {["{{firstName}}", "{{points}}", "{{code}}"].map((t) => (
              <button key={t} type="button" onClick={() => insert(t)} className="rounded-full border border-ink-200 px-2 py-0.5 font-mono text-[0.68rem] text-ink-600 hover:border-brand-300 hover:text-brand-700">
                {t}
              </button>
            ))}
          </span>
        </div>
        <textarea
          id="cp-msg"
          ref={box}
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={channel === "SMS" ? 459 : 2000}
          aria-describedby="cp-lint"
          className="min-h-24 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
        />
        <FieldError name="message" />
        <div id="cp-lint" className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          {flags.length ? (
            <span className="inline-flex items-start gap-1.5 font-medium text-rose-600">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> “{flags[0].term}” — {flags[0].reason}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-leaf-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Copy passes the advertising checks
            </span>
          )}
          <span className="tnum text-ink-500">
            {message.length} chars{channel === "SMS" ? ` · ≈${parts} SMS with footer` : ""}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-ink-150 p-3 text-sm">
        <div className="eyebrow mb-1 text-ink-400">Preview</div>
        <p className="whitespace-pre-line text-ink-800">{sample}</p>
        <p className="mt-1 text-xs text-ink-400">— Herbal Holland sender details{channel === "SMS" ? " · Reply STOP to opt out" : " · unsubscribe link"} (added automatically)</p>
      </div>

      <p className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-xs", win.allowed ? "bg-leaf-50 text-leaf-700" : "bg-amber-50 text-amber-700")}>
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {win.allowed
          ? "Direct marketing is allowed right now (CPA Regulation 4: weekdays 08:00–20:00, Saturdays 09:00–13:00, never Sundays or public holidays)."
          : `${win.reason} — sending now schedules it for ${fmtDateTime(nextMarketingSlot(now))}, the next legal slot (CPA Regulation 4).`}
      </p>

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="send" pendingLabel="Sending…" disabled={flags.length > 0 || !size?.reachable}>
          {win.allowed ? `Send to ${size?.reachable.toLocaleString() ?? "…"}` : "Schedule send"}
        </SubmitButton>
        <SubmitButton name="intent" value="draft" variant="outline" pendingLabel="Saving…">
          Save draft
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
