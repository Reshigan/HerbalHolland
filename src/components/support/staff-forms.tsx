"use client";
// The staff side of a ticket: reply (with canned replies to start from), assign, set the priority, resolve. Shared by
// HQ and the store back office; each passes its own server actions (the same ActionState shape).
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Field, Label, Select, Textarea } from "@/components/ui/form";
import type { ActionState } from "@/server/hq/guard";
import { SUPPORT_PRIORITIES, SUPPORT_PRIORITY, type SupportPriorityKey } from "@/lib/support";

export type StaffAction = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function ReplyForm({ action, canned, memberName, channel }: { action: StaffAction; canned: { key: string; label: string; body: string }[]; memberName: string; channel: string }) {
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState("");
  return (
    <ActionForm action={action} resetOnSuccess onDone={(s) => s.ok && (setBody(""), setPicked(""))} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <Label htmlFor="reply-body" className="sm:col-span-2">
          Reply to {memberName}
        </Label>
        <div className="sm:col-start-2 sm:row-start-2">
          <Select
            id="canned"
            aria-label="Start from a canned reply"
            value={picked}
            onChange={(e) => {
              const c = canned.find((x) => x.key === e.target.value);
              setPicked(e.target.value);
              if (c) setBody(c.body);
            }}
          >
            <option value="">Start from a canned reply…</option>
            {canned.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
          <input type="hidden" name="canned" value={picked} />
        </div>
        <div className="sm:col-start-1 sm:row-start-2">
          <Textarea id="reply-body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={4000} placeholder="Plain and warm. Say what you've checked, what happens next and by when." className="min-h-40" />
          <FieldError name="body" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">{channel}. The ticket moves to “waiting for member”; their reply brings it back.</p>
        <SubmitButton pendingLabel="Sending…">
          <Send className="h-4 w-4" aria-hidden /> Send reply
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AssignForm({ action, staff, current, disabled }: { action: StaffAction; staff: { id: string; name: string }[]; current: string | null; disabled?: boolean }) {
  return (
    <ActionForm action={action} notices="bottom" className="space-y-2">
      <Field label="Assigned to" htmlFor="assignedToId">
        <div className="flex gap-2">
          {/* Keyed so a saved change shows as the new default after the form resets. */}
          <Select key={current ?? "none"} id="assignedToId" name="assignedToId" defaultValue={current ?? ""} wrapperClassName="flex-1" disabled={disabled}>
            <option value="">Nobody yet</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <SubmitButton variant="outline" pendingLabel="Saving…" disabled={disabled}>
            Save
          </SubmitButton>
        </div>
        <FieldError name="assignedToId" />
      </Field>
    </ActionForm>
  );
}

export function PriorityForm({ action, current, disabled }: { action: StaffAction; current: SupportPriorityKey; disabled?: boolean }) {
  return (
    <ActionForm action={action} notices="bottom" className="space-y-2">
      <Field label="Priority" htmlFor="priority">
        <div className="flex gap-2">
          <Select key={current} id="priority" name="priority" defaultValue={current} wrapperClassName="flex-1" disabled={disabled}>
            {SUPPORT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {SUPPORT_PRIORITY[p]}
              </option>
            ))}
          </Select>
          <SubmitButton variant="outline" pendingLabel="Saving…" disabled={disabled}>
            Save
          </SubmitButton>
        </div>
        <FieldError name="priority" />
      </Field>
    </ActionForm>
  );
}

export function ResolveForm({ action, number }: { action: StaffAction; number: string }) {
  return (
    <ConfirmAction action={action} label="Mark as resolved" title={`Resolve ${number}?`} confirmLabel="Resolve" variant="primary" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
      <p>The member is told it&apos;s resolved and can reopen it by replying within 30 days.</p>
      <Field label="A closing note for the member (optional)" htmlFor="resolve-note">
        <Textarea id="resolve-note" name="note" className="min-h-16" maxLength={500} placeholder="e.g. The missing points are on your card." />
      </Field>
    </ConfirmAction>
  );
}
