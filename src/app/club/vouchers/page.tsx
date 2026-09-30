import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { Gift, Search } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { memberVouchers, voucherBalance } from "@/server/shop/vouchers";
import { Container, Panel, Tag, inputClass, type TagTone } from "@/components/shop/ui";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata = { title: "Gift vouchers" };
const STATUS: Record<string, [string, TagTone]> = { PENDING: ["Awaiting payment", "amber"], ACTIVE: ["Active", "green"], REDEEMED: ["Used up", "neutral"], EXPIRED: ["Expired", "red"], CANCELLED: ["Cancelled", "red"] };

export default async function ClubVouchers({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  const [customer, { check }] = await Promise.all([getCustomer(), searchParams]);
  if (!customer) redirect("/club/join?next=/club/vouchers");
  const [rows, checked] = await Promise.all([memberVouchers(customer.id), check ? voucherBalance(check) : null]);
  return (
    <Container className="pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Gift vouchers</h1>
          <p className="mt-1 text-sm text-ink-400">Vouchers you&apos;ve bought, and a balance check for one you were given. Valid for three years; redeemable online on anything in the range.</p>
        </div>
        <ButtonLink href="/gift" size="md">
          <Gift className="h-4 w-4" /> Buy a voucher
        </ButtonLink>
      </div>

      <Panel className="mt-6 p-5">
        <h2 className="font-display text-lg font-semibold text-white">Check a balance</h2>
        <Form action="/club/vouchers" className="mt-3 flex max-w-md gap-2">
          <label htmlFor="check" className="sr-only">
            Voucher code
          </label>
          <input id="check" name="check" defaultValue={check ?? ""} placeholder="HH-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" className={cn(inputClass, "h-11 uppercase placeholder:normal-case")} />
          <button className={buttonClass("outline-dark", "md", "h-11 shrink-0")}>
            <Search className="h-4 w-4" /> Check
          </button>
        </Form>
        {check && (
          <p className="mt-3 text-sm" role="status">
            {checked ? (
              <span className="text-ink-100">
                <strong className="tnum text-white">{checked.code}</strong>: {zar(checked.balanceCents)} of {zar(checked.amountCents)} left · {checked.status === "ACTIVE" ? `valid until ${fmtDate(checked.expiresAt)}` : STATUS[checked.status][0].toLowerCase()}
              </span>
            ) : (
              <span className="text-rose-100">We don&apos;t recognise that code — check it against the email or card.</span>
            )}
          </p>
        )}
      </Panel>

      {rows.length ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((v) => {
            const [label, tone] = STATUS[v.status];
            return (
              <li key={v.id} className="hh-beads-foot relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 p-5 pb-7">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="eyebrow text-brand-500">{zar(v.amountCents)} voucher</div>
                    <div className="tnum mt-1 font-display text-xl font-semibold tracking-[0.06em] text-white">{v.status === "PENDING" ? "Issued when paid" : v.code}</div>
                  </div>
                  <Tag tone={tone}>{label}</Tag>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-450">Balance</dt>
                    <dd className="tnum text-ink-100">{zar(v.balanceCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-450">{v.status === "PENDING" ? "Bought" : "Valid until"}</dt>
                    <dd className="text-ink-100">{fmtDate(v.status === "PENDING" ? v.createdAt : v.expiresAt)}</dd>
                  </div>
                  {v.recipientEmail && (
                    <div className="col-span-2">
                      <dt className="text-xs text-ink-450">Sent to</dt>
                      <dd className="truncate text-ink-100">
                        {v.recipientName ? `${v.recipientName} · ` : ""}
                        {v.recipientEmail}
                      </dd>
                    </div>
                  )}
                </dl>
                {v.purchaseOrderId && v.status === "PENDING" && (
                  <Link href={`/checkout/pay/${v.purchaseOrderId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400 hover:underline">
                    Pay for this voucher →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <Gift className="mx-auto h-9 w-9 text-ink-600" />
          <h2 className="mt-4 font-display text-xl font-semibold text-white">No vouchers bought yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">A Herbal Holland gift voucher is emailed with your message and redeemable on anything in the range — a gift that&apos;s always the right size.</p>
          <ButtonLink href="/gift" className="mt-6">
            Buy a gift voucher
          </ButtonLink>
        </div>
      )}
    </Container>
  );
}
