"use client";
// Handing a click & collect trade order over at the counter: the collector's ID checked (18+), the six-digit code
// they were sent typed in, and anything short noted — then the sale posts at the store.
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import type { ActionState } from "@/server/hq/guard";

export function HandoverForm({ action, number, lines }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; number: string; lines: { id: string; name: string; qty: number; onHand: number }[] }) {
  const [open, setOpen] = useState(false);
  const [short, setShort] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-4 w-4" aria-hidden /> Hand over {number}
      </Button>
    );
  return (
    <div className="rounded-2xl border border-ink-200 bg-ink-50 p-4" role="group" aria-label={`Hand over ${number}`}>
      <ActionForm action={action} className="space-y-4">
        <div className="font-display text-sm font-semibold text-ink-900">Hand over {number}</div>
        <Checkbox name="idChecked" label="I've seen the collector's ID — they're 18 or older" description="Everyone collecting for a trade account is an adult; the sale records that ID was sighted." />
        <FieldError name="idChecked" />
        <Field label="Collection code (the six digits the buyer was sent)" htmlFor="collection-code" hint="Ask for it — never read it out to them">
          <Input id="collection-code" name="collectionCode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="tnum max-w-[12rem] text-lg tracking-[0.3em]" placeholder="000000" />
          <FieldError name="collectionCode" />
        </Field>
        <div>
          <Checkbox checked={short} onChange={(e) => setShort(e.target.checked)} label="Something is short" description="Hand over less of a line than was ordered; the invoice is for what went." />
          {short && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {lines.map((l) => (
                <Field key={l.id} label={`${l.name} · ordered ${l.qty}, ${l.onHand} on hand`} htmlFor={`short-${l.id}`}>
                  <Input id={`short-${l.id}`} name={`short:${l.id}`} inputMode="numeric" placeholder={String(l.qty)} />
                  <FieldError name={`short:${l.id}`} />
                </Field>
              ))}
            </div>
          )}
        </div>
        <Field label="Note to the account (optional)" htmlFor="handover-note">
          <Textarea id="handover-note" name="note" className="min-h-16" maxLength={300} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Posting the sale…">Complete handover</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </ActionForm>
    </div>
  );
}
