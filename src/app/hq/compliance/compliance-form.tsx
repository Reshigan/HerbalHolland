"use client";
import { useState } from "react";
import { AlertTriangle, BadgePercent, Lock, Stethoscope, Users } from "lucide-react";
import { Field, Input, Checkbox, Label } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { REG_CLASS_LABEL, REG_CLASSES as CLASSES, channelLabel, type ComplianceSettings, type SellChannel } from "@/lib/compliance";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/server/hq/guard";

const CHANNELS: SellChannel[] = ["POS", "COLLECT", "SAME_DAY", "COURIER"];

export function ComplianceForm({ action, value, readOnly }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; value: ComplianceSettings; readOnly: boolean }) {
  const [mode, setMode] = useState(value.thcMode);
  const [tobacco, setTobacco] = useState(value.tobaccoBillMode);
  const [members, setMembers] = useState(value.membersOnly);
  const modes = [
    {
      key: "MEDICAL" as const,
      icon: Stethoscope,
      title: "Medical (SAHPRA pathway)",
      body: "Licensed products are medicines: only for members with an active Section 21 patient authorisation, within its monthly quantity, handed over by an authorised dispenser. No promotions, tier savings or points on them (Medicines Act s18A).",
    },
    {
      key: "ADULT_USE" as const,
      icon: Users,
      title: "Adult use",
      body: "Verified adults may buy licensed products within the daily limit — for when a commercial adult-use regime is in force. Commercial THC trade is still unlawful today; the Cannabis Bill isn't expected before mid-2027.",
    },
  ];
  return (
    <ActionForm action={action} className="space-y-6">
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <div>
          <Label>THC mode</Label>
          <input type="hidden" name="thcMode" value={mode} />
          <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="THC mode">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                onClick={() => setMode(m.key)}
                className={cn("rounded-2xl border p-4 text-left transition disabled:cursor-default", mode === m.key ? "border-brand-500 bg-brand-50 ring-4 ring-brand-500/15" : "border-ink-200 bg-white hover:border-ink-300")}
              >
                <span className="flex items-center gap-2 font-display text-sm font-semibold text-ink-900">
                  <m.icon className={cn("h-4 w-4", mode === m.key ? "text-brand-700" : "text-ink-500")} /> {m.title}
                  {value.thcMode === m.key && <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[0.65rem] font-semibold text-white">Current</span>}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-ink-600">{m.body}</span>
              </button>
            ))}
          </div>
          <FieldError name="thcMode" />
          {mode === "ADULT_USE" && value.thcMode !== "ADULT_USE" && (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-50 p-4">
              <p className="flex gap-2 text-sm text-rose-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Only switch once counsel confirms an adult-use licensing regime is in force. Every till and the web shop start selling licensed products to verified adults immediately.
              </p>
              <Field label="Type ADULT USE to confirm" htmlFor="confirmAdult" className="mt-3 max-w-xs">
                <Input id="confirmAdult" name="confirmAdult" autoComplete="off" />
                <FieldError name="confirmAdult" />
              </Field>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum age" htmlFor="minAge" hint="Checked at sign-up, the till and every handover">
            <Input id="minAge" name="minAge" defaultValue={value.minAge} inputMode="numeric" />
            <FieldError name="minAge" />
          </Field>
          <Field label="Daily limit (grams)" htmlFor="dailyLimitGrams" hint={mode === "ADULT_USE" ? "Per member per day, licensed classes" : "Used in adult-use mode"}>
            <Input id="dailyLimitGrams" name="dailyLimitGrams" defaultValue={value.dailyLimitGrams} inputMode="decimal" />
            <FieldError name="dailyLimitGrams" />
          </Field>
        </div>

        <div>
          <Label>What can be sold where</Label>
          <p className="mb-2 text-xs text-ink-500">Tick the channels each class may be sold through. Licence-gated classes also need the store to hold a licence.</p>
          <div className="overflow-x-auto rounded-2xl border border-ink-150">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="bg-ink-50 text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <th className="px-4 py-2.5">Class</th>
                  {CHANNELS.map((c) => (
                    <th key={c} className="px-3 py-2.5 text-center">{channelLabel(c)}</th>
                  ))}
                  <th className="px-3 py-2.5 text-center">Licence-gated</th>
                  <th className="px-3 py-2.5 text-center">18+</th>
                </tr>
              </thead>
              <tbody>
                {CLASSES.map((cl) => (
                  <tr key={cl} className="border-t border-ink-100">
                    <td className="px-4 py-2.5 font-medium text-ink-850">{REG_CLASS_LABEL[cl]}</td>
                    {CHANNELS.map((c) => (
                      <td key={c} className="px-3 py-2.5 text-center">
                        <input type="checkbox" name={`ch_${c}`} value={cl} defaultChecked={value.channels[c].includes(cl)} aria-label={`${REG_CLASS_LABEL[cl]} via ${channelLabel(c)}`} className="h-[18px] w-[18px] cursor-pointer accent-brand-500" />
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center">
                      {cl === "THC" ? (
                        <>
                          <input type="hidden" name="licensedOnly" value="THC" />
                          <Lock className="mx-auto h-4 w-4 text-ink-400" aria-label="Always licence-gated" />
                        </>
                      ) : (
                        <input type="checkbox" name="licensedOnly" value={cl} defaultChecked={value.licensedOnly.includes(cl)} aria-label={`${REG_CLASS_LABEL[cl]} licence-gated`} className="h-[18px] w-[18px] cursor-pointer accent-brand-500" />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" name="ageRestricted" value={cl} defaultChecked={value.ageRestricted.includes(cl)} aria-label={`${REG_CLASS_LABEL[cl]} 18+`} className="h-[18px] w-[18px] cursor-pointer accent-brand-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <fieldset className="rounded-2xl border border-ink-150 p-4">
          <legend className="sr-only">No promotions, points or commission (Medicines Act s18A)</legend>
          <input type="hidden" name="noIncentivesShown" value="1" />
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-ink-900" aria-hidden>
            <BadgePercent className="h-4 w-4 text-brand-700" /> No promotions, points or commission (Medicines Act s18A)
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            CBD supplements are on this list by default: s18A bans incentives on any medicine, and Schedule 0 CBD counts until counsel clears it. Ticked classes get no deals, member prices, markdowns, points or staff commission, online or at the till.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
            {CLASSES.map((cl) =>
              mode === "MEDICAL" && value.licensedOnly.includes(cl) ? (
                <span key={cl} className="inline-flex items-center gap-2 text-sm text-ink-600" title="Licensed medicines never get incentives in medical mode">
                  {(value.noIncentives ?? []).includes(cl) && <input type="hidden" name="noIncentives" value={cl} />}
                  <Lock className="h-4 w-4 text-ink-400" aria-hidden />
                  {REG_CLASS_LABEL[cl]} <span className="text-xs text-ink-500">— always, in medical mode</span>
                </span>
              ) : (
                <Checkbox key={cl} name="noIncentives" value={cl} defaultChecked={(value.noIncentives ?? []).includes(cl)} label={REG_CLASS_LABEL[cl]} />
              ),
            )}
          </div>
        </fieldset>

        <div className={cn("rounded-2xl border p-4", members ? "border-ink-150" : "border-amber-500/40 bg-amber-50")}>
          <Checkbox
            name="membersOnly"
            checked={members}
            onChange={(e) => setMembers(e.target.checked)}
            label="Members only"
            description="Every sale needs a registered member who has accepted the membership terms — online and at the till. Walk-ins sign up at the till in about 20 seconds; offline, the till takes the member number from their card and checks it when it reconnects."
          />
        </div>

        <div className={cn("rounded-2xl border p-4", tobacco ? "border-amber-500/40 bg-amber-50" : "border-ink-150")}>
          <Checkbox
            name="tobaccoBillMode"
            checked={tobacco}
            onChange={(e) => setTobacco(e.target.checked)}
            label="Tobacco Bill (B33-2022) mode"
            description="Switch on if the Bill is enacted as introduced: pipes, water-pipes, papers and vapes become in-store only, with no online or courier sales, no points and no promotion. Products are flagged in the catalogue."
          />
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end">
          <SubmitButton size="lg" pendingLabel="Saving…">Save compliance rules</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
