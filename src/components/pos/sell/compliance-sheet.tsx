"use client";
// Pre-payment checks: each block from the compliance engine with the action that resolves
// it — age check (ID sighted / SA ID number / passport), patient authorisation, authorised
// quantity, dispenser required ("switch user"), licence — and limited-drop rules (members
// only, not open yet, per-member limit; offline, drops can't be checked at all).
import { useMemo, useState } from "react";
import { BadgeCheck, Gem, IdCard, Pill, ShieldAlert, ShieldCheck, Stethoscope, Trash2, UserRound } from "lucide-react";
import { checkSaId, ageOn } from "@/lib/sa";
import { fmtDate } from "@/lib/format";
import { Alert, Field, PosButton, Sheet, TextInput } from "../ui";
import type { ComplianceDTO, BlockKind, CustomerDetail } from "@/server/pos/types";

const ICON: Record<BlockKind, React.ComponentType<{ className?: string }>> = {
  AGE: IdCard,
  UNDERAGE: ShieldAlert,
  PATIENT: Stethoscope,
  QUANTITY: Pill,
  DISPENSER: ShieldCheck,
  LICENCE: ShieldAlert,
  CHANNEL: ShieldAlert,
  DAILY_LIMIT: Pill,
  DROP: Gem,
  OTHER: ShieldAlert,
};

const TITLE: Record<BlockKind, string> = {
  AGE: "Check ID — adults 18+ only",
  UNDERAGE: "Customer is under age",
  PATIENT: "Patient authorisation needed",
  QUANTITY: "Over the authorised quantity",
  DISPENSER: "Authorised dispenser required",
  LICENCE: "Not licensed at this store",
  CHANNEL: "Can't be sold here",
  DAILY_LIMIT: "Over the daily limit",
  DROP: "Limited drop",
  OTHER: "Can't complete this sale yet",
};

export function ComplianceSheet({
  open,
  result,
  customer,
  minAge,
  online,
  busy,
  error,
  onClose,
  onAgeCheck,
  onFindPatient,
  onRemoveLicensed,
  onRemoveRestricted,
  onRemoveDrops,
  onSwitchUser,
}: {
  open: boolean;
  result: ComplianceDTO | null;
  customer: CustomerDetail | null;
  minAge: number;
  online: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAgeCheck: (method: "ID_SIGHTED" | "ID_NUMBER", idNumber?: string) => void;
  onFindPatient: () => void;
  onRemoveLicensed: () => void;
  onRemoveRestricted: () => void;
  onRemoveDrops: () => void;
  onSwitchUser: () => void;
}) {
  const [idNumber, setIdNumber] = useState("");
  const id = useMemo(() => {
    const raw = idNumber.replace(/\s/g, "");
    if (raw.length < 13) return null;
    const r = checkSaId(raw);
    return r.valid ? { ok: true as const, dob: r.dob, age: ageOn(r.dob) } : { ok: false as const, reason: r.reason };
  }, [idNumber]);

  const blocks = result?.blocks ?? [];
  return (
    <Sheet open={open} onClose={onClose} title="Before payment" subtitle="Checks for this basket" size="md" anchorBottom footer={<PosButton variant="ghost" onClick={onClose}>Back to the basket</PosButton>}>
      {error && <Alert className="mb-4">{error}</Alert>}
      <ul className="space-y-3" aria-label="Compliance checks">
        {blocks.map((b, i) => {
          const Icon = ICON[b.kind];
          const hard = b.kind === "UNDERAGE" || b.kind === "LICENCE" || b.kind === "CHANNEL";
          return (
            <li key={i} className={`rounded-2xl p-4 ring-1 ${hard ? "bg-rose-500/10 ring-rose-500/40" : "bg-ink-850 ring-amber-500/40"}`} data-testid={`block-${b.kind}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${hard ? "bg-rose-500/20 text-[#f29b9b]" : "bg-amber-500/15 text-[#f3c65a]"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{TITLE[b.kind]}</div>
                  <p className="mt-0.5 text-sm text-ink-300">{b.message}</p>
                </div>
              </div>

              {b.kind === "AGE" && (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PosButton variant="primary" busy={busy} onClick={() => onAgeCheck("ID_SIGHTED")}>
                      <IdCard className="h-4 w-4" /> ID sighted — {minAge}+
                    </PosButton>
                    <PosButton variant="secondary" busy={busy} onClick={() => onAgeCheck("ID_SIGHTED")}>
                      Passport sighted — {minAge}+
                    </PosButton>
                  </div>
                  <Field label="Or enter their SA ID number" htmlFor="cmp-id" error={id && !id.ok ? id.reason : id?.ok && id.age < minAge ? `Under ${minAge} — don't sell` : undefined}>
                    <div className="flex gap-2">
                      <TextInput id="cmp-id" inputMode="numeric" autoComplete="off" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="13 digits" />
                      <PosButton variant="secondary" disabled={!id?.ok || id.age < minAge || busy} onClick={() => onAgeCheck("ID_NUMBER", idNumber.replace(/\s/g, ""))}>
                        Verify
                      </PosButton>
                    </div>
                  </Field>
                  {id?.ok && (
                    <div className="flex items-center gap-2 text-sm text-[#7fd49a]">
                      <BadgeCheck className="h-4 w-4" /> Born {fmtDate(id.dob)} · {id.age}
                    </div>
                  )}
                  <p className="text-xs text-ink-400">{customer ? "Recorded on the member's profile, so they won't be asked again." : "Recorded on this sale."}</p>
                </div>
              )}

              {(b.kind === "PATIENT" || b.kind === "QUANTITY") && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {b.kind === "PATIENT" && (
                    <PosButton variant="primary" onClick={onFindPatient} disabled={!online}>
                      <UserRound className="h-4 w-4" /> {customer ? "Change member" : "Find the patient"}
                    </PosButton>
                  )}
                  <PosButton variant="secondary" onClick={onRemoveLicensed}>
                    <Trash2 className="h-4 w-4" /> Remove licensed items
                  </PosButton>
                  {b.kind === "QUANTITY" && <p className="w-full text-xs text-ink-400">Reduce the quantity in the basket to stay within the authorisation.</p>}
                </div>
              )}

              {b.kind === "DISPENSER" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <PosButton variant="primary" onClick={onSwitchUser}>
                    <ShieldCheck className="h-4 w-4" /> Switch to a dispenser
                  </PosButton>
                  <PosButton variant="secondary" onClick={onRemoveLicensed}>
                    <Trash2 className="h-4 w-4" /> Remove licensed items
                  </PosButton>
                </div>
              )}

              {(b.kind === "UNDERAGE" || b.kind === "DAILY_LIMIT") && (
                <div className="mt-4">
                  <PosButton variant="secondary" onClick={b.kind === "UNDERAGE" ? onRemoveRestricted : onRemoveLicensed}>
                    <Trash2 className="h-4 w-4" /> {b.kind === "UNDERAGE" ? "Remove age-restricted items" : "Remove licensed items"}
                  </PosButton>
                </div>
              )}

              {b.kind === "DROP" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {!customer && online && (
                    <PosButton variant="primary" onClick={onFindPatient}>
                      <UserRound className="h-4 w-4" /> Add the member
                    </PosButton>
                  )}
                  <PosButton variant="secondary" onClick={onRemoveDrops}>
                    <Trash2 className="h-4 w-4" /> Remove drop items
                  </PosButton>
                </div>
              )}

              {(b.kind === "LICENCE" || b.kind === "CHANNEL" || b.kind === "OTHER") && (
                <div className="mt-4">
                  <PosButton variant="secondary" onClick={onRemoveLicensed}>
                    <Trash2 className="h-4 w-4" /> Remove licensed items
                  </PosButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!online && <p className="mt-4 text-xs text-ink-400">Offline: checks run on this till with the rules it downloaded. Licensed medicines and limited drops can&apos;t be sold without a connection.</p>}
    </Sheet>
  );
}
