"use client";
import { useState } from "react";
import { BadgeCheck, PackageOpen, PackageCheck, Truck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { ActionForm, ConfirmAction, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";

type Status = "PENDING_PAYMENT" | "PLACED" | "PICKING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";

export function OrderActions({ next, fulfilment, paid, dueCents, ageRestricted, needsDispenser, canDispense, collectionCode, action }: {
  next: Status[];
  fulfilment: "COLLECT" | "SAME_DAY" | "COURIER";
  paid: boolean;
  dueCents: number;
  ageRestricted: boolean;
  needsDispenser: boolean;
  canDispense: boolean;
  collectionCode: string;
  action: FormAction;
}) {
  const [panel, setPanel] = useState<"handover" | "dispatch" | "delivered" | null>(null);
  const [method, setMethod] = useState("CARD");
  // Payment confirmation (PENDING_PAYMENT → PLACED) belongs to the gateway, not the store.
  const simple = next.filter((s) => s === "PICKING" || s === "READY");
  const label: Partial<Record<Status, string>> = {
    PICKING: "Start picking",
    READY: fulfilment === "COLLECT" ? "Packed and ready for collection" : "Packed and ready to dispatch",
  };
  const blockedDispense = needsDispenser && !canDispense;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {simple.map((s) => (
          <ActionForm key={s} action={action} notices="bottom">
            <input type="hidden" name="to" value={s} />
            <SubmitButton pendingLabel="Updating…">
              {s === "PICKING" ? <PackageOpen className="h-4 w-4" aria-hidden /> : <PackageCheck className="h-4 w-4" aria-hidden />}
              {label[s]}
            </SubmitButton>
          </ActionForm>
        ))}
        {next.includes("COMPLETED") && fulfilment === "COLLECT" && (
          <Button type="button" variant={panel === "handover" ? "dark" : "primary"} onClick={() => setPanel(panel === "handover" ? null : "handover")} aria-expanded={panel === "handover"}>
            <BadgeCheck className="h-4 w-4" aria-hidden /> Hand over to member
          </Button>
        )}
        {next.includes("OUT_FOR_DELIVERY") && (
          <Button type="button" variant={panel === "dispatch" ? "dark" : "primary"} onClick={() => setPanel(panel === "dispatch" ? null : "dispatch")} aria-expanded={panel === "dispatch"}>
            <Truck className="h-4 w-4" aria-hidden /> Dispatch
          </Button>
        )}
        {next.includes("COMPLETED") && fulfilment !== "COLLECT" && (
          <Button type="button" variant={panel === "delivered" ? "dark" : "primary"} onClick={() => setPanel(panel === "delivered" ? null : "delivered")} aria-expanded={panel === "delivered"}>
            <BadgeCheck className="h-4 w-4" aria-hidden /> Mark delivered
          </Button>
        )}
      </div>

      {panel === "handover" && (
        <ActionForm action={action} className="space-y-4 rounded-2xl border border-ink-150 bg-ink-50 p-4">
          <input type="hidden" name="to" value="COMPLETED" />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
            <li>
              Ask for the collection code. It must be <span className="font-mono font-bold tracking-widest text-ink-950">{collectionCode}</span>.
            </li>
            <li>Check an ID document. Adults 18+ only.</li>
          </ol>
          {blockedDispense && (
            <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> This order contains licensed medicines. An authorised dispenser must hand it over (at the POS or signed in here).
            </p>
          )}
          <Checkbox name="idChecked" required={ageRestricted} label="I've seen the member's ID and they are 18 or older" description={ageRestricted ? "Required for this order" : "Recommended"} />
          {!paid && dueCents > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Take payment of {zar(dueCents)}</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  ["CARD", "Card"],
                  ["PAYSHAP", "PayShap"],
                  ["EFT", "EFT"],
                  ["CASH", "Cash"],
                ].map(([k, l]) => (
                  <label key={k} className={cn("cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold", method === k ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
                    <input type="radio" name="method" value={k} checked={method === k} onChange={() => setMethod(k)} className="sr-only" />
                    {l}
                  </label>
                ))}
              </div>
              <FieldError name="method" />
              {method !== "CASH" && (
                <Field label="Terminal / payment reference (optional)" htmlFor="pay-ref" className="mt-3 max-w-xs">
                  <Input id="pay-ref" name="reference" maxLength={60} />
                </Field>
              )}
            </fieldset>
          )}
          <SubmitButton pendingLabel="Posting sale…" disabled={blockedDispense}>
            Complete handover{!paid && dueCents > 0 ? ` · ${zar(dueCents)}` : ""}
          </SubmitButton>
        </ActionForm>
      )}

      {panel === "dispatch" && (
        <ActionForm action={action} className="space-y-4 rounded-2xl border border-ink-150 bg-ink-50 p-4">
          <input type="hidden" name="to" value="OUT_FOR_DELIVERY" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Courier" htmlFor="courier">
              <Input id="courier" name="courier" maxLength={80} defaultValue={fulfilment === "SAME_DAY" ? "Herbal Holland driver" : ""} placeholder="e.g. The Courier Guy" />
            </Field>
            <Field label="Tracking number (optional)" htmlFor="tracking" hint="Left blank, we generate one">
              <Input id="tracking" name="trackingNo" maxLength={80} />
            </Field>
          </div>
          <p className="text-xs text-ink-500">Dispatch posts the sale and books the stock out. The driver checks ID (18+) at the door.</p>
          <SubmitButton pendingLabel="Dispatching…">Dispatch order</SubmitButton>
        </ActionForm>
      )}

      {panel === "delivered" && (
        <ActionForm action={action} className="space-y-4 rounded-2xl border border-ink-150 bg-ink-50 p-4">
          <input type="hidden" name="to" value="COMPLETED" />
          <Checkbox name="idChecked" required={ageRestricted} label="The driver checked ID (18+) at handover" description="Proof of delivery" />
          <SubmitButton pendingLabel="Saving…">Confirm delivery</SubmitButton>
        </ActionForm>
      )}

      {next.includes("CANCELLED") && (
        <ConfirmAction action={action} label="Cancel order" title="Cancel this order?" confirmLabel="Cancel order" fields={{ to: "CANCELLED" }}>
          <p>Reserved stock is released and the member is told. Paid orders are refunded in full and points used are returned.</p>
          <Field label="Reason (shared with the team)" htmlFor="cancel-note">
            <Input id="cancel-note" name="note" maxLength={300} placeholder="e.g. Member asked to cancel" />
          </Field>
        </ConfirmAction>
      )}
    </div>
  );
}
