"use client";
// A member's reply on their request, with an optional photo (JPG or PNG, 5 MB), checked before it's sent.
import { useActionState, useState } from "react";
import { Camera, Send } from "lucide-react";
import { replyAction, type ReplyState } from "@/app/club/support/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, inputClass } from "@/components/shop/ui";
import { PHOTO_MAX_BYTES } from "@/server/uploads";
import { cn } from "@/lib/cn";

export function MemberReply({ ticketId, resolved }: { ticketId: string; resolved: boolean }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyAction.bind(null, ticketId), {});
  const [photoError, setPhotoError] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-3" aria-label="Reply">
      <FieldRow label={resolved ? "Reply (this reopens your request)" : "Your reply"} htmlFor="reply-body" error={state.field === "body" ? state.error : undefined}>
        <textarea id="reply-body" name="body" required minLength={2} maxLength={4000} rows={4} defaultValue={state.values?.body} className={cn(inputClass, "py-3")} placeholder="Write your reply…" />
      </FieldRow>
      <FieldRow label="Add a photo (optional)" htmlFor="reply-photo" error={state.field === "photo" ? state.error : photoError} hint="JPG or PNG, up to 5 MB.">
        <input
          id="reply-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            const m = f && f.size > PHOTO_MAX_BYTES ? "That photo is over 5 MB — try a smaller one." : "";
            e.currentTarget.setCustomValidity(m);
            setPhotoError(m || null);
          }}
          className="block w-full text-sm text-ink-300 file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-800 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-700"
        />
      </FieldRow>
      {state.error && !state.field && (
        <p className="text-sm font-medium text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={buttonClass("primary", "lg")}>
          {pending ? "Sending…" : <><Send className="h-4 w-4" aria-hidden /> Send reply</>}
        </button>
        {state.ok && (
          <span className="text-sm font-medium text-leaf-100" role="status">
            Sent — we&apos;ll reply within one business day.
          </span>
        )}
        <span className="ml-auto hidden items-center gap-1 text-xs text-ink-450 sm:flex">
          <Camera className="h-3.5 w-3.5" aria-hidden /> Photos help with faults and damage
        </span>
      </div>
    </form>
  );
}
