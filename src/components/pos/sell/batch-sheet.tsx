"use client";
// A scanned batch code (the code on the pack, or its lab-certificate QR): status, dates, potency, lab, stock of that
// lot here, and "Add to sale" for a released, in-date lot of a product this till sells.
import { AlertOctagon, BadgeCheck, FlaskConical, PauseCircle, ScanLine } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Alert, Chip, PosButton, Sheet } from "../ui";
import type { BatchLookup } from "@/server/pos/batch";

export function BatchSheet({ batch, onTill, onAdd, onClose }: { batch: BatchLookup | null; onTill: boolean; onAdd: (variantId: string) => void; onClose: () => void }) {
  if (!batch) return null;
  const b = batch;
  const sellable = b.status === "RELEASED" && !b.expired && b.variant.active && onTill;
  return (
    <Sheet
      open
      onClose={onClose}
      title={b.product.name}
      subtitle={`${b.variant.name} · batch ${b.code}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <PosButton variant="ghost" onClick={onClose}>
            Close
          </PosButton>
          <PosButton variant="primary" disabled={!sellable} onClick={() => (onAdd(b.variant.id), onClose())} data-testid="batch-add">
            Add to sale
          </PosButton>
        </div>
      }
    >
      <div data-testid="batch-sheet">
        {b.status === "RECALLED" && (
          <Alert className="mb-4">
            <div className="flex items-center gap-2 font-semibold">
              <AlertOctagon className="h-5 w-5" /> Recalled: do not sell
            </div>
            <div className="mt-1">{b.statusReason ?? "This batch has been recalled."} Take it off the shelf and log it for return to the DC.</div>
          </Alert>
        )}
        {b.status === "QUARANTINE" && (
          <Alert tone="warn" className="mb-4">
            <div className="flex items-center gap-2 font-semibold">
              <PauseCircle className="h-5 w-5" /> On hold: do not sell
            </div>
            <div className="mt-1">{b.statusReason ?? "Quality checks are in progress on this batch."}</div>
          </Alert>
        )}
        {b.status === "RELEASED" && b.expired && (
          <Alert tone="warn" className="mb-4">
            Past its best-before date ({fmtDate(b.expiresAt!)}). Don&apos;t sell it; write it off from Stock.
          </Alert>
        )}
        <div className="flex flex-wrap gap-1.5">
          {b.status === "RELEASED" && !b.expired ? (
            <Chip tone="green" icon={<BadgeCheck className="h-3 w-3" />}>
              Released
            </Chip>
          ) : b.status === "RECALLED" ? (
            <Chip tone="red">Recalled</Chip>
          ) : b.status === "QUARANTINE" ? (
            <Chip tone="amber">On hold</Chip>
          ) : (
            <Chip tone="amber">Expired</Chip>
          )}
          {b.labName && (
            <Chip tone="blue" icon={<FlaskConical className="h-3 w-3" />}>
              Lab tested · {b.labName}
            </Chip>
          )}
          <Chip tone="neutral" icon={<ScanLine className="h-3 w-3" />}>
            {b.onHandHere} of this lot here
          </Chip>
        </div>
        <dl className="mt-4 divide-y divide-ink-850 text-sm">
          {[
            ["Packed", fmtDate(b.packedAt)],
            ["Best before", b.expiresAt ? fmtDate(b.expiresAt) : "—"],
            ["Supplier", b.supplier],
            ...(b.thc != null ? [["THC", `${b.thc}%`]] : []),
            ...(b.cbd != null ? [["CBD", `${b.cbd}%`]] : []),
            ...(b.coaRef ? [["COA ref", b.coaRef]] : []),
            ["SKU", b.variant.sku],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-ink-400">{k}</dt>
              <dd className="text-white">{v}</dd>
            </div>
          ))}
        </dl>
        {!onTill && b.status === "RELEASED" && <p className="mt-3 text-sm text-ink-400">This product isn&apos;t ranged on this till, so it can&apos;t be added to the sale.</p>}
        <p className="mt-3 text-xs text-ink-450">Members can see the lab certificate by scanning the same code on their phone.</p>
      </div>
    </Sheet>
  );
}
