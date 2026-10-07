"use client";
// The staff side of a return: approve or decline, book the collection (by hand, for now), mark it received, refund it.
// Shared by HQ and the store back office; each passes its own server actions (the same ActionState shape).
import { BadgeCheck, Banknote, PackageCheck, Truck, XCircle } from "lucide-react";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import type { ActionState } from "@/server/hq/guard";
import { zar } from "@/lib/money";

export type StaffAction = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function DecideForms({ approve, decline }: { approve: StaffAction; decline: StaffAction }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <ConfirmAction action={approve} label="Approve" title="Approve this return?" confirmLabel="Approve" variant="primary" triggerVariant="primary" icon={<BadgeCheck className="h-4 w-4" aria-hidden />}>
        <p>The member is told it&apos;s approved and that a courier collection is coming. Book it in the next step.</p>
        <Field label="A note for the member (optional)" htmlFor="approve-note">
          <Textarea id="approve-note" name="note" className="min-h-14" maxLength={500} placeholder="e.g. Please keep the original box for the courier." />
        </Field>
      </ConfirmAction>
      <ConfirmAction action={decline} label="Decline" title="Decline this return?" confirmLabel="Decline" icon={<XCircle className="h-4 w-4" aria-hidden />}>
        <p>The member reads the reason. Faulty goods within 6 months and change-of-mind returns within 7 days are rights under the CPA and ECTA: decline only when the request falls outside them.</p>
        <Field label="Reason (the member is told)" htmlFor="decline-note">
          <Textarea id="decline-note" name="note" className="min-h-16" maxLength={500} placeholder="e.g. The seal was broken, so it can't be returned for a change of mind." />
          <FieldError name="note" />
        </Field>
      </ConfirmAction>
    </div>
  );
}

export function BookCollectionForm({ action }: { action: StaffAction }) {
  return (
    <ActionForm action={action} className="space-y-3 rounded-2xl border border-ink-150 bg-ink-50 p-4">
      <p className="text-sm text-ink-700">
        <b className="text-ink-900">Booking is manual for now:</b> book the collection with the courier (their portal or phone), then record it here. The member is sent the courier and waybill.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Courier" htmlFor="rt-courier">
          <Input id="rt-courier" name="courier" maxLength={80} placeholder="e.g. The Courier Guy" />
          <FieldError name="courier" />
        </Field>
        <Field label="Waybill / booking reference" htmlFor="rt-waybill">
          <Input id="rt-waybill" name="waybill" maxLength={80} />
          <FieldError name="waybill" />
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">
        <Truck className="h-4 w-4" aria-hidden /> Collection booked
      </SubmitButton>
    </ActionForm>
  );
}

export function ReceiveForm({ action }: { action: StaffAction }) {
  return (
    <ActionForm action={action} notices="bottom" className="inline-flex flex-col items-start gap-2">
      <SubmitButton pendingLabel="Saving…">
        <PackageCheck className="h-4 w-4" aria-hidden /> Parcel received
      </SubmitButton>
    </ActionForm>
  );
}

export function RefundForm({ action, items, plan, restockDefault }: {
  action: StaffAction;
  items: { variantId: string; name: string; qty: number }[];
  plan: { linesCents: number; deliveryCents: number; totalCents: number; note: string; gateway: string | null; voucherCents?: number; voucherCodes?: string[]; moneyCents?: number };
  restockDefault: Record<string, boolean>;
}) {
  const voucher = plan.voucherCents ?? 0;
  const money = plan.moneyCents ?? plan.totalCents;
  return (
    <ActionForm action={action} className="space-y-4 rounded-2xl border border-ink-150 bg-ink-50 p-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-500">Items</dt>
        <dd className="tnum text-right text-ink-900">{zar(plan.linesCents)}</dd>
        <dt className="text-ink-500">Delivery fee</dt>
        <dd className="tnum text-right text-ink-900">{plan.deliveryCents ? zar(plan.deliveryCents) : "—"}</dd>
        <dt className="font-semibold text-ink-900">Refund</dt>
        <dd className="tnum text-right font-display text-lg font-semibold text-ink-950">{zar(plan.totalCents)}</dd>
        {voucher > 0 && (
          <>
            <dt className="text-ink-500">Back onto gift voucher {plan.voucherCodes?.join(", ")}</dt>
            <dd className="tnum text-right text-ink-900">{zar(voucher)}</dd>
            <dt className="text-ink-500">In money</dt>
            <dd className="tnum text-right text-ink-900">{money ? zar(money) : "—"}</dd>
          </>
        )}
      </dl>
      {plan.note && <p className="text-xs text-ink-500">{plan.note}</p>}
      {voucher > 0 && <p className="text-xs text-ink-500">What the gift voucher paid goes back onto the voucher with the credit note. A voucher is never cashed out.</p>}
      <fieldset>
        <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Back on the shelf?</legend>
        <div className="space-y-2">
          {items.map((it) => (
            <Checkbox key={it.variantId} name={`restock:${it.variantId}`} defaultChecked={restockDefault[it.variantId]} label={`${it.qty} × ${it.name}`} description="Tick when it's sealed and sellable; faulty or damaged goods stay off the shelf" />
          ))}
        </div>
      </fieldset>
      {money === 0 ? (
        <p className="text-sm text-ink-700">Nothing to pay out in money: the credit note is posted at the store and the member told.</p>
      ) : plan.gateway ? (
        <p className="text-sm text-ink-700">
          Refunded through <b className="text-ink-900">{plan.gateway === "PEACH" ? "Peach Payments" : "Yoco"}</b> to the card or account that paid, then the credit note is posted at the store and the member told.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Refunded how" htmlFor="rt-method" hint="This order wasn't paid through the online gateway: refund it by hand first">
            <Select id="rt-method" name="manualMethod" defaultValue="EFT">
              <option value="EFT">EFT to the member</option>
              <option value="CARD">Card refund at the till</option>
              <option value="CASH">Cash at the till</option>
              <option value="PAYSHAP">PayShap</option>
            </Select>
          </Field>
          <Field label="Reference" htmlFor="rt-ref">
            <Input id="rt-ref" name="manualRef" maxLength={80} placeholder="Bank reference or till slip" />
            <FieldError name="manualRef" />
          </Field>
        </div>
      )}
      <SubmitButton pendingLabel="Refunding…">
        <Banknote className="h-4 w-4" aria-hidden /> Refund {zar(plan.totalCents)}
      </SubmitButton>
    </ActionForm>
  );
}
