"use client";
// "Return or report a problem": the member picks a reason, the items (only what may come back for that reason), adds
// a note and up to three photos, confirms sealed consumables for a change of mind, and sends it. What comes back for
// each reason was worked out on the server (@/lib/returns); the form only shows it.
import { useActionState, useMemo, useState } from "react";
import { Camera, Info, X } from "lucide-react";
import { requestReturnAction, type ReturnFormState } from "@/app/club/orders/[code]/return/actions";
import { buttonClass } from "@/components/ui/button";
import { Callout, CheckRow, FieldRow, inputClass } from "@/components/shop/ui";
import { RETURN_NOTE_MAX, RETURN_PHOTOS, RETURN_REASON, RETURN_REASONS, type Eligibility, type ReturnReasonKey } from "@/lib/returns";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type Photo = { file: File; url: string };

export function ReturnForm({ orderCode, eligibility }: { orderCode: string; eligibility: Record<ReturnReasonKey, Eligibility> }) {
  const [state, action, pending] = useActionState<ReturnFormState, FormData>(requestReturnAction.bind(null, orderCode), {});
  const [reason, setReason] = useState<ReturnReasonKey>((state.values?.reason as ReturnReasonKey) ?? "DEFECTIVE");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const e = eligibility[reason];
  const chosen = e.lines.filter((l) => (qty[l.variantId] ?? 0) > 0);
  const needsSealed = chosen.some((l) => l.sealed);
  const canSend = e.ok && chosen.length > 0;

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...photos];
    let err: string | null = null;
    for (const f of Array.from(list)) {
      if (next.length >= RETURN_PHOTOS.max) (err = `Up to ${RETURN_PHOTOS.max} photos, please`), (list = null);
      else if (!["image/jpeg", "image/png"].includes(f.type)) err = `${f.name} isn't a JPG or PNG`;
      else if (f.size > RETURN_PHOTOS.maxBytes) err = `${f.name} is over 5 MB. Try a smaller one.`;
      else next.push({ file: f, url: URL.createObjectURL(f) });
      if (!list) break;
    }
    setPhotos(next);
    setPhotoError(err);
  };
  // The file input is uncontrolled; the chosen files go in a DataTransfer so removing one from the previews removes it from the form.
  const fileList = useMemo(() => {
    if (typeof DataTransfer === "undefined") return null;
    const dt = new DataTransfer();
    for (const p of photos) dt.items.add(p.file);
    return dt.files;
  }, [photos]);

  return (
    <form
      action={action}
      className="space-y-6"
      aria-label="Return or report a problem"
      ref={(form) => {
        const input = form?.querySelector<HTMLInputElement>('input[name="photos"]');
        if (input && fileList) input.files = fileList;
      }}
    >
      <fieldset>
        <legend className="mb-2 text-[0.8rem] font-semibold text-ink-200">What&apos;s wrong?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {RETURN_REASONS.map((r) => {
            const on = r === reason;
            return (
              <label key={r} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition", on ? "border-brand-500 bg-brand-500/10" : "border-ink-700 hover:border-ink-500")}>
                <input type="radio" name="reason" value={r} checked={on} onChange={() => (setReason(r), setQty({}))} className="mt-1 h-4 w-4 accent-brand-500" />
                <span>
                  <span className={cn("block text-sm font-semibold", on ? "text-white" : "text-ink-100")}>{RETURN_REASON[r].label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-400">{RETURN_REASON[r].hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {e.ok ? (
        <fieldset>
          <legend className="mb-2 text-[0.8rem] font-semibold text-ink-200">Which items?</legend>
          {e.windowEnds && <p className="mb-2 text-xs text-ink-400">You have until {fmtDate(e.windowEnds)} for this reason.</p>}
          <ul className="divide-y divide-ink-800 rounded-2xl border border-ink-800">
            {e.lines.map((l) => (
              <li key={l.variantId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className={cn("text-sm font-medium", l.blocked ? "text-ink-500" : "text-white")}>{l.name}</div>
                  {l.blocked ? <div className="text-xs text-ink-500">{l.blocked}</div> : l.sealed ? <div className="text-xs text-amber-100/80">Must be unopened and sealed</div> : null}
                </div>
                {!l.blocked && (
                  <label className="flex shrink-0 items-center gap-2 text-xs text-ink-400">
                    Qty
                    <select
                      name={`qty:${l.variantId}`}
                      value={qty[l.variantId] ?? 0}
                      onChange={(ev) => setQty((q) => ({ ...q, [l.variantId]: Number(ev.target.value) }))}
                      className={cn(inputClass, "h-11 w-20 cursor-pointer appearance-none text-center")}
                      aria-label={`Quantity of ${l.name} to return`}
                    >
                      {Array.from({ length: l.qty + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <Callout tone="warn" icon={<Info className="h-5 w-5" />}>
          {e.reason}
        </Callout>
      )}

      <FieldRow label={reason === "OTHER" ? "What happened?" : "Anything we should know? (optional)"} htmlFor="rt-note" error={state.field === "note" ? state.error : undefined} hint={reason === "DEFECTIVE" || reason === "DAMAGED" ? "What's wrong with it, and when you noticed. Photos help." : undefined}>
        <textarea id="rt-note" name="note" rows={3} maxLength={RETURN_NOTE_MAX} defaultValue={state.values?.note} required={reason === "OTHER"} className={cn(inputClass, "py-3")} />
      </FieldRow>

      <div>
        <label htmlFor="rt-photos" className="mb-1.5 block text-[0.8rem] font-semibold text-ink-200">
          Photos (optional)
        </label>
        <input id="rt-photos" name="photos" type="file" accept="image/jpeg,image/png" multiple onChange={(ev) => addPhotos(ev.currentTarget.files)} className="block w-full text-sm text-ink-300 file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-800 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-700" />
        <p className="mt-1.5 text-xs text-ink-400">{RETURN_PHOTOS.note}.</p>
        {(photoError ?? (state.field === "photos" ? state.error : null)) && (
          <p className="mt-1.5 text-xs font-medium text-rose-100" role="alert">
            {photoError ?? state.error}
          </p>
        )}
        {photos.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <li key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-ink-700" />
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink-800 text-ink-200 ring-1 ring-ink-600 hover:bg-ink-700">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {needsSealed && (
        <div>
          <CheckRow name="sealed" label="These items are unopened, sealed and as they arrived" description="A change-of-mind return of food, drink, supplements or skin care has to be." required />
          {state.field === "sealed" && (
            <p className="mt-1 text-xs font-medium text-rose-100" role="alert">
              {state.error}
            </p>
          )}
        </div>
      )}

      {state.error && !state.field && (
        <p className="text-sm font-medium text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      {state.error && state.field === "items" && (
        <p className="text-sm font-medium text-rose-100" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending || !canSend} className={buttonClass("primary", "lg")}>
          {pending ? "Sending…" : "Send return request"}
        </button>
        <span className="flex items-center gap-1.5 text-xs text-ink-400">
          <Camera className="h-3.5 w-3.5" aria-hidden /> We reply within one business day and book the collection.
        </span>
      </div>
    </form>
  );
}
