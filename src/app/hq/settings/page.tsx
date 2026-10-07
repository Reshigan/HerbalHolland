import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { centsToInput } from "@/lib/money";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { ViewOnly } from "@/components/hq/ui";
import { saveTradeSettings } from "./actions";

export const metadata = { title: "Settings" };

const ELSEWHERE = [
  { href: "/hq/compliance", title: "Compliance", text: "Licensing mode, age checks, CBD limits, no-incentive classes, marketing consent and send windows." },
  { href: "/hq/loyalty", title: "Rewards", text: "Points, bonuses, tier savings and My Deals." },
  { href: "/hq/orders?tab=settings", title: "Delivery & collection", text: "Consumer delivery fees, free-delivery threshold, cut-offs and holds." },
  { href: "/hq/pricing", title: "Pricing rules", text: "Near-expiry markdowns and the store margin guide." },
  { href: "/hq/loss-prevention", title: "Loss prevention & banking", text: "Alert thresholds and the cash banking deadline." },
  { href: "/hq/commission", title: "Commission", text: "Rates by product class." },
  { href: "/hq/launch", title: "Founding Members", text: "The launch programme's dates and places." },
];

export default async function SettingsPage() {
  const user = await requireStaff(HQ_ROLES);
  const t = (await getSettings()).trade;
  const admin = can(user, "admin");

  return (
    <>
      <PageHeader overline="Governance" title="Settings" description="Network-wide terms the HQ administrator sets. Everything here is audited; the rest of the programme's settings live with their own pages." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" id="trade">
          <CardHeader title="Trade (wholesale)" description="Businesses buying at ex-VAT trade prices online (courier from the DC, or click & collect at a store) and at the till. Amounts are rand ex VAT; VAT is added per line." />
          <CardBody>
            {!admin && <ViewOnly className="mb-4">View only: set by the HQ administrator.</ViewOnly>}
            <ActionForm action={saveTradeSettings}>
              <fieldset disabled={!admin} className="min-w-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Minimum order (R ex VAT)" htmlFor="minOrder" hint="After any promotion">
                  <Input id="minOrder" name="minOrder" defaultValue={centsToInput(t.minOrderCents)} inputMode="decimal" />
                  <FieldError name="minOrder" />
                </Field>
                <Field label="Courier fee (R ex VAT)" htmlFor="courierFee" hint="Flat, from the DC">
                  <Input id="courierFee" name="courierFee" defaultValue={centsToInput(t.deliveryCents)} inputMode="decimal" />
                  <FieldError name="courierFee" />
                </Field>
                <Field label="Free courier over (R ex VAT)" htmlFor="freeCourierOver" hint="0 = never free">
                  <Input id="freeCourierOver" name="freeCourierOver" defaultValue={centsToInput(t.freeDeliveryOverCents)} inputMode="decimal" />
                  <FieldError name="freeCourierOver" />
                </Field>
                <Field label="Collect handling fee (R ex VAT)" htmlFor="collectHandling" hint="The store's fee on click & collect">
                  <Input id="collectHandling" name="collectHandling" defaultValue={centsToInput(t.collectHandlingCents)} inputMode="decimal" />
                  <FieldError name="collectHandling" />
                </Field>
                <Field label="EFT hold (days)" htmlFor="eftHoldDays" hint="Unpaid pro formas lapse after this">
                  <Input id="eftHoldDays" name="eftHoldDays" defaultValue={t.eftHoldDays} inputMode="numeric" />
                  <FieldError name="eftHoldDays" />
                </Field>
                <Field label="Overdue grace (days)" htmlFor="overdueGraceDays" hint="Past due by more than this puts an account on hold">
                  <Input id="overdueGraceDays" name="overdueGraceDays" defaultValue={t.overdueGraceDays} inputMode="numeric" />
                  <FieldError name="overdueGraceDays" />
                </Field>
                <Field label="Statement day" htmlFor="statementDay" hint="Day of the month last month's statements go out">
                  <Input id="statementDay" name="statementDay" defaultValue={t.statementDay} inputMode="numeric" />
                  <FieldError name="statementDay" />
                </Field>
                <Field label="Terms version" htmlFor="termsVersion" hint="Stored on each account when it applies">
                  <Input id="termsVersion" name="termsVersion" defaultValue={t.termsVersion} maxLength={40} />
                  <FieldError name="termsVersion" />
                </Field>
                <div className="sm:col-span-2 lg:col-span-4">
                  <div className="font-display text-sm font-semibold text-ink-900">Bank details for EFTs</div>
                  <p className="text-xs text-ink-500">Printed on every pro forma with the reference HH-TO-…: fill these in before the first trade order.</p>
                </div>
                <Field label="Bank" htmlFor="bank">
                  <Input id="bank" name="bank" defaultValue={t.bank.bank} maxLength={80} placeholder="e.g. FNB" />
                  <FieldError name="bank" />
                </Field>
                <Field label="Account name" htmlFor="bankAccountName">
                  <Input id="bankAccountName" name="bankAccountName" defaultValue={t.bank.accountName} maxLength={120} />
                  <FieldError name="bankAccountName" />
                </Field>
                <Field label="Account number" htmlFor="bankAccountNumber">
                  <Input id="bankAccountNumber" name="bankAccountNumber" defaultValue={t.bank.accountNumber} inputMode="numeric" maxLength={20} />
                  <FieldError name="bankAccountNumber" />
                </Field>
                <Field label="Branch code" htmlFor="bankBranchCode">
                  <Input id="bankBranchCode" name="bankBranchCode" defaultValue={t.bank.branchCode} inputMode="numeric" maxLength={6} />
                  <FieldError name="bankBranchCode" />
                </Field>
              </fieldset>
              {admin && (
                <div className="mt-5 flex justify-end">
                  <SubmitButton pendingLabel="Saving…">Save trade settings</SubmitButton>
                </div>
              )}
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Other settings" description="Each lives with the page it governs." />
          <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
            {ELSEWHERE.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-900">{e.title}</span>
                    <span className="block text-xs text-ink-500">{e.text}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
