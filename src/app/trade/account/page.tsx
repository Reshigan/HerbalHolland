// The trade account: status and terms, credit (limit, exposure, available), balance and ageing from the ledger,
// the licences the business must hold (status, and uploading a renewal), the business details (editable by an
// owner), and the buyers (owners add and remove).
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, FileCheck2, Users } from "lucide-react";
import { tradeAccountSummary, tradeEmail } from "@/server/trade/accounts";
import { Callout, Container, Panel, Tag } from "@/components/shop/ui";
import { AccountStatusTag } from "@/components/trade/status";
import { AddBuyerForm, DetailsForm, RemoveBuyerButton, type Details } from "@/components/trade/account-forms";
import { className as classLabel } from "@/components/trade/format";
import { addressLineOf, tradeKindPhrase, TRADE_KINDS } from "@/lib/trade";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { requireBuyer } from "../_lib/context";
import { licenceOverview } from "@/server/trade/licences";
import { LicenceUploadForm } from "@/components/trade/licence-form";
import { TRADE_LICENCE_KINDS, type LicenceLine } from "@/lib/trade-licences";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

const provinceName = (p: string | null | undefined) => (p && p in PROVINCES ? PROVINCES[p as ProvinceCode] : (p ?? ""));

export default async function TradeAccountPage() {
  const buyer = await requireBuyer("/trade/account");
  const s = await tradeAccountSummary(buyer.tradeAccountId);
  if (!s) return null;
  const a = s.account;
  const owner = buyer.role === "OWNER";
  const exposure = s.balanceCents + s.openOnAccountCents;
  const details: Details = {
    name: a.name, legalName: a.legalName, kind: a.kind, regNumber: a.regNumber ?? "", vatNumber: a.vatNumber ?? "", email: a.email, phone: a.phone ?? "",
    addressLine: a.addressLine, suburb: a.suburb ?? "", city: a.city, province: a.province, postalCode: a.postalCode,
    deliveryLine: a.deliveryLine ?? "", deliverySuburb: a.deliverySuburb ?? "", deliveryCity: a.deliveryCity ?? "", deliveryProvince: a.deliveryProvince ?? "", deliveryPostalCode: a.deliveryPostalCode ?? "",
  };
  const ageing: [string, number][] = [["Current", s.ageing.current], ["30 days", s.ageing.d30], ["60 days", s.ageing.d60], ["90+ days", s.ageing.d90plus]];
  const { standing: licences, others } = await licenceOverview(a);
  const firstProblem = licences.lines.find((l) => l.problem)?.kind ?? licences.lines.find((l) => l.state === "expiring")?.kind ?? licences.lines[0]?.kind ?? TRADE_LICENCE_KINDS[0];
  // Any licence can be sent — the ones the account needs first, then the rest (ahead of asking for a new range).
  const uploadKinds = [...licences.lines.map((l) => l.kind), ...TRADE_LICENCE_KINDS.filter((k) => !licences.lines.some((l) => l.kind === k))];

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow text-brand-500">
            Account <span className="tnum">{a.number}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{a.name}</h1>
          <p className="mt-2 text-ink-400">
            {a.legalName}
            {a.legalName !== a.name ? ` (trading as ${a.name})` : ""} · {TRADE_KINDS[a.kind as keyof typeof TRADE_KINDS] ?? a.kind} · signed in as {buyer.name} ({owner ? "owner" : "buyer"})
          </p>
        </div>
        <AccountStatusTag status={a.status} className="px-3 py-1 text-xs" />
      </div>

      {a.status === "PENDING" && (
        <Callout tone="info" className="mt-8" title="Your application is being reviewed">
          We reply by email within one business day with the terms. Ordering opens once the account is approved.
        </Callout>
      )}
      {a.status === "ON_HOLD" && (
        <Callout tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} className="mt-8" title="Your account is on hold">
          {a.holdReason === "overdue"
            ? `An invoice is past its due date: ${zar(s.ageing.overdue)} is overdue on a balance of ${zar(s.balanceCents)}. Settle it and the hold lifts by itself. Nothing new goes on account meanwhile; you can still see prices and your statements.`
            : a.holdReason === "licence"
              ? "A licence the business needs has lapsed. Upload the renewal under Licences below — ordering resumes as soon as we've checked it."
              : `Reason given: ${a.holdReason ?? "ask the trade team"}. Nothing new goes on account meanwhile; you can still see prices and your statements.`}
        </Callout>
      )}

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="account-figures">
        <Panel className="p-5">
          <div className="text-xs font-medium text-ink-400">Terms</div>
          <div className="mt-1 font-display text-2xl font-semibold text-white">{a.terms === "ACCOUNT" ? "On account" : "Prepaid (EFT)"}</div>
          <p className="mt-1 text-xs text-ink-400">
            {a.terms === "ACCOUNT" ? `Invoices fall due ${a.paymentDays} days from their date · credit limit ${zar(a.creditLimitCents)}` : "Pay each order by EFT against its pro forma. Account terms follow once we know each other."}
          </p>
        </Panel>
        <Panel className="p-5">
          <div className="text-xs font-medium text-ink-400">Balance owing</div>
          <div className="tnum mt-1 font-display text-2xl font-semibold text-white" data-testid="balance">
            {zar(s.balanceCents)}
          </div>
          <p className="mt-1 text-xs text-ink-400">{s.ageing.overdue > 0 ? `${zar(s.ageing.overdue)} past due` : s.balanceCents < 0 ? "In credit" : "Nothing past due"}</p>
        </Panel>
        <Panel className="p-5">
          <div className="text-xs font-medium text-ink-400">Available credit</div>
          <div className="tnum mt-1 font-display text-2xl font-semibold text-white" data-testid="available">
            {a.terms === "ACCOUNT" ? zar(s.availableCents) : "—"}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            {a.terms === "ACCOUNT" ? `${zar(exposure)} used of ${zar(a.creditLimitCents)}${s.openOnAccountCents ? ` (${zar(s.openOnAccountCents)} on open orders)` : ""}` : "No credit limit on prepaid terms"}
          </p>
        </Panel>
      </div>

      <section id="licences" aria-labelledby="licences-h" className="mt-12 scroll-mt-24">
        <h2 id="licences-h" className="flex items-center gap-2 font-display text-xl font-semibold text-white">
          <FileCheck2 className="h-5 w-5 text-brand-500" aria-hidden /> Licences
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-400">
          What {tradeKindPhrase(a.kind)} needs for the ranges it buys. We check each one with its issuer before the first order, remind you a month before one lapses, and pause ordering while a required licence has lapsed.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ul className="space-y-3" data-testid="licences">
            {[...licences.lines, ...others].map((l) => (
              <LicenceItem key={l.kind} line={l} />
            ))}
          </ul>
          {a.status !== "CLOSED" && (
            <Panel className="p-5">
              <h3 className="font-semibold text-white">Upload a licence or its renewal</h3>
              <div className="mt-4">
                <LicenceUploadForm kinds={uploadKinds} initial={firstProblem} regNumber={a.regNumber} />
              </div>
            </Panel>
          )}
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="ageing">
          <h2 id="ageing" className="font-display text-xl font-semibold text-white">
            Age analysis
          </h2>
          <dl className="tnum mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ageing.map(([label, cents]) => (
              <div key={label} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4">
                <dt className="text-xs text-ink-400">{label}</dt>
                <dd className="mt-1 font-semibold text-white">{zar(cents)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-ink-400">
            {s.openOrders.count > 0 ? `${s.openOrders.count} open ${s.openOrders.count === 1 ? "order" : "orders"} worth ${zar(s.openOrders.cents)} incl. VAT. ` : ""}
            Every invoice, payment and credit note is on your{" "}
            <Link href="/trade/statements" className="font-semibold text-brand-400 underline hover:text-brand-300">
              statements
            </Link>
            . Pay by EFT with the invoice number as your reference.
          </p>
          <h2 className="mt-10 font-display text-xl font-semibold text-white">Ranges you may buy</h2>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Ranges">
            {a.classes.length ? a.classes.map((c) => (
              <li key={c}>
                <Tag tone="orange">{classLabel(c)}</Tag>
              </li>
            )) : <li className="text-sm text-ink-400">Set by the trade team when the account is approved.</li>}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            Terms, credit limit, ranges and price lists are set by Herbal Holland Trade —{" "}
            <a href={`mailto:${tradeEmail()}`} className="underline hover:text-ink-200">
              email the trade team
            </a>{" "}
            to change them.
          </p>
        </section>

        <section aria-labelledby="details">
          <h2 id="details" className="font-display text-xl font-semibold text-white">
            Business details
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            {(
              [
                ["Registered name", a.legalName],
                ["Trading name", a.name],
                ["Registration number", a.regNumber ?? "—"],
                ["VAT number", a.vatNumber ?? "Not a VAT vendor"],
                ["Billing email", a.email],
                ["Phone", a.phone ?? "—"],
                ["Billing address", `${addressLineOf(a)}, ${provinceName(a.province)}`],
                ["Delivery address", a.deliveryLine ? `${addressLineOf({ addressLine: a.deliveryLine, suburb: a.deliverySuburb, city: a.deliveryCity, postalCode: a.deliveryPostalCode })}, ${provinceName(a.deliveryProvince)}` : "Same as billing"],
                ["Trade terms accepted", a.termsAcceptedAt ? `${a.termsVersion ?? ""} on ${fmtDate(a.termsAcceptedAt)}` : "—"],
                ["Approved", a.approvedAt ? fmtDate(a.approvedAt) : "Not yet"],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 border-b border-ink-800 py-2">
                <dt className="text-ink-400">{k}</dt>
                <dd className="text-right text-ink-100">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">{owner ? <DetailsForm details={details} /> : <p className="text-xs text-ink-400">The account&apos;s owner can change these details.</p>}</div>
        </section>
      </div>

      <section className="mt-12" aria-labelledby="buyers">
        <h2 id="buyers" className="flex items-center gap-2 font-display text-xl font-semibold text-white">
          <Users className="h-5 w-5 text-brand-500" aria-hidden /> Buyers
        </h2>
        <p className="mt-1 text-sm text-ink-400">Who can sign in and place orders for {a.name}. Each signs in with a code sent to their email.</p>
        <ul className="mt-4 divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/40" data-testid="buyers">
          {a.buyers.map((b) => (
            <li key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{b.name}</span>
                  <Tag tone={b.role === "OWNER" ? "orange" : "neutral"}>{b.role === "OWNER" ? "Owner" : "Buyer"}</Tag>
                  {!b.active && <Tag tone="red">Removed</Tag>}
                  {b.id === buyer.id && <Tag tone="green">You</Tag>}
                </div>
                <p className="mt-0.5 text-sm text-ink-300">
                  {b.email}
                  {b.phone ? ` · ${b.phone}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-ink-450">{b.lastSignInAt ? `Last signed in ${fmtDateTime(b.lastSignInAt)}` : "Hasn't signed in yet"}</p>
              </div>
              {owner && b.active && b.id !== buyer.id && <RemoveBuyerButton buyerId={b.id} name={b.name} />}
            </li>
          ))}
        </ul>
        {owner && (
          <div className="mt-4">
            <AddBuyerForm />
          </div>
        )}
      </section>
    </Container>
  );
}

const LICENCE_TAG: Record<LicenceLine["state"], { tone: "green" | "amber" | "red" | "neutral"; label: string }> = {
  ok: { tone: "green", label: "Verified" },
  expiring: { tone: "amber", label: "Expires soon" },
  pending: { tone: "neutral", label: "Being checked" },
  rejected: { tone: "red", label: "Not accepted" },
  expired: { tone: "red", label: "Expired" },
  missing: { tone: "red", label: "Needed" },
};

function LicenceItem({ line: l }: { line: LicenceLine }) {
  const shown = l.current ?? l.latest;
  const tag = LICENCE_TAG[l.state];
  return (
    <li className="rounded-2xl border border-ink-800 bg-ink-900/60 p-4" data-testid={`licence-${l.kind}`} data-state={l.state}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{l.name}</p>
          <p className="mt-0.5 text-xs text-ink-400">{l.why}.</p>
        </div>
        <Tag tone={tag.tone}>{tag.label}</Tag>
      </div>
      {shown && (
        <p className="tnum mt-3 text-sm text-ink-200">
          No. {shown.number}
          {shown.expiresAt ? ` · expires ${fmtDate(shown.expiresAt)}` : ""} ·{" "}
          <a href={`/trade/licences/${shown.id}/file`} target="_blank" rel="noopener" className="font-semibold text-brand-400 underline hover:text-brand-300">
            View the document
          </a>
        </p>
      )}
      {l.pending && l.current && <p className="mt-2 text-xs text-ink-300">A renewal (no. {l.pending.number}) is with the trade team for checking.</p>}
      {l.problem && <p className="mt-2 text-xs font-medium text-rose-100">{l.problem}</p>}
    </li>
  );
}
