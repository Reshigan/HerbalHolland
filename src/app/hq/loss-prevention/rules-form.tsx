// HQ admin: the loss-prevention thresholds, in plain words. Rand amounts are entered in rand, factors as plain numbers.
import { Field, Input } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/cn";
import { saveLossRules } from "./actions";
import type { Settings } from "@/server/settings";

function Group({ title, rules, children }: { title: string; rules: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-2xl border border-ink-150 p-4 sm:p-5">
      <legend className="px-1.5 font-display text-sm font-semibold text-ink-900">{title}</legend>
      <p className="mb-4 text-xs text-ink-500">{rules}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Num({ name, label, hint, value, prefix, suffix, decimal }: { name: string; label: string; hint?: string; value: string | number; prefix?: string; suffix?: string; decimal?: boolean }) {
  const id = `lp-${name}`;
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500">{prefix}</span>}
        <Input id={id} name={name} defaultValue={value} inputMode={decimal || prefix ? "decimal" : "numeric"} autoComplete="off" className={cn("tnum", prefix && "pl-7", suffix && "pr-9")} />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500" aria-hidden>
            {suffix}
          </span>
        )}
      </div>
      <FieldError name={name} />
    </Field>
  );
}

export function RulesForm({ loss, banking }: { loss: Settings["loss"]; banking: Settings["banking"] }) {
  return (
    <ActionForm action={saveLossRules} className="space-y-5">
      <Group title="Cash-ups" rules="Cash-up short · Repeated cash shortages">
        <Num name="cashShort" label="Alert when a cash-up is short by (R)" prefix="R" value={centsToInput(loss.cashShortCents)} hint="Counted cash under what the till expected (medium severity)" />
        <Num name="cashShortHigh" label="High severity from (R)" prefix="R" value={centsToInput(loss.cashShortHighCents)} hint="Must be more than the amount above" />
        <Num name="repeatShorts" label="Repeated: short this many times in 30 days" value={loss.repeatShorts} hint="The same person closing short this often is always high severity" />
      </Group>

      <Group title="Banking" rules="Cash not banked in time · Deposit short">
        <Num name="dueBusinessDays" label="Bank the cash within (business days)" value={banking.dueBusinessDays} hint="After the shift closes. Weekends and public holidays don't count" />
        <Num name="shortTolerance" label="A deposit may be short by up to (R)" prefix="R" value={centsToInput(banking.shortToleranceCents)} hint="Any more under its cash-ups raises a high-severity alert" />
      </Group>

      <Group title="Refunds" rules="Suspicious refund · High refund rate · Own sales refunded">
        <Num name="quickRefundMinutes" label="Quick refund: within this many minutes of the sale" value={loss.quickRefundMinutes} hint="One red flag. Two flags, or a card sale refunded in cash, raise an alert" />
        <Num name="refundFactor" label="High refund rate: times the norm for their role" suffix="×" decimal value={loss.refundFactor} hint="Over 30 days, against people in the same role across the network" />
        <Num name="refundMin" label="…with at least this many refunds in 30 days" value={loss.refundMin} />
        <Num name="refundedShare" label="Own sales refunded this month (% of their sales)" suffix="%" decimal value={Math.round(loss.refundedShare * 10_000) / 100} hint="Refunded sales can inflate commission" />
        <Num name="refundedMin" label="…with at least this many of their sales refunded" value={loss.refundedMin} />
      </Group>

      <Group title="Stock" rules="Stock write-offs">
        <Num name="writeOffFactor" label="Write-offs this week: times the store's weekly norm" suffix="×" decimal value={loss.writeOffFactor} hint="Damaged, theft, lost, expired and stock-take losses at cost, against the last 12 weeks" />
        <Num name="writeOffMin" label="…and at least this much at cost (R)" prefix="R" value={centsToInput(loss.writeOffMinCents)} hint="High severity at twice the factor" />
      </Group>

      <Group title="Tills & member cards" rules="One card, many sales · Unusual offline selling">
        <Num name="memberRepeat" label="One member card on this many of one person's sales in a day" value={loss.memberRepeat} hint="Points skimming onto a friend's or their own card" />
        <Num name="offlineFactor" label="Offline selling: times the store's usual share" suffix="×" decimal value={loss.offlineFactor} hint="Offline sales skip the live member and compliance checks" />
        <Num name="offlineMin" label="…with at least this many offline sales in a week" value={loss.offlineMin} />
      </Group>

      <p className="text-xs text-ink-500">
        Always on, with nothing to set: sales rung up on the person&apos;s own member card, sales more than 30 minutes outside trading hours, and offline sales that broke a compliance rule.
      </p>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save rules</SubmitButton>
      </div>
    </ActionForm>
  );
}
