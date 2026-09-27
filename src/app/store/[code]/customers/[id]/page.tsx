import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, ShieldAlert, Stethoscope } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { spend12m } from "@/server/loyalty";
import { getSettings } from "@/server/settings";
import { SEGMENT_TONE, hrefWith } from "@/server/store/rules";
import { SEGMENTS, segmentOf } from "@/lib/rfm";
import { fmtPoints, tierInfo, TIERS, type TierKey } from "@/lib/loyalty-rules";
import { ageOn, displayPhone } from "@/lib/sa";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { changeConsent, checkAge } from "../actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, Meter } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BackLink, Line, Qty, ReadOnlyNote } from "@/components/store/ui";
import { Select } from "@/components/store/select";
import { ActionButton, ActionForm, FieldError, SubmitButton } from "@/components/store/action-form";
import type { MsgChannel } from "@/generated/prisma/client";

export const metadata = { title: "Member" };
const PAGE_SIZE = 10;
const CHANNEL: Record<MsgChannel, string> = { SMS: "SMS", WHATSAPP: "WhatsApp", EMAIL: "Email", PUSH: "App push" };
const KIND: Record<string, string> = { EARN: "Earned", REDEEM: "Redeemed", SIGNUP: "Welcome bonus", REFERRAL: "Referral", BIRTHDAY: "Birthday", BONUS: "Bonus", REVERSAL: "Reversal", EXPIRE: "Expired", ADJUST: "Adjustment" };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ code, id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const c = await db.customer.findFirst({ where: { id, homeStoreId: store.id } });
  if (!c) notFound();
  const page = pageParam(sp.page);
  const [sales, salesTotal, ledger, consents, auths, referrer, spend, settings] = await Promise.all([
    db.sale.findMany({
      where: { customerId: c.id, storeId: store.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { lines: { select: { qty: true } }, payments: { select: { method: true } } },
    }),
    db.sale.count({ where: { customerId: c.id, storeId: store.id } }),
    db.loyaltyEntry.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 15, include: { store: { select: { name: true } } } }),
    db.consentEvent.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.patientAuth.findMany({ where: { customerId: c.id }, orderBy: { validTo: "desc" } }),
    c.referredById ? db.customer.findUnique({ where: { id: c.referredById }, select: { firstName: true, memberNo: true } }) : null,
    spend12m(db, c.id),
    getSettings(),
  ]);
  const seg = segmentOf(c);
  const tier = tierInfo(c.tier as TierKey);
  const above = TIERS[TIERS.findIndex((t) => t.key === c.tier) + 1];
  const tierNote =
    spend < tier.minCents
      ? `${zar(tier.minCents - spend)} more in 12 months to keep ${tier.name}`
      : above
        ? `${zar(above.minCents - spend)} more in 12 months to ${above.name}`
        : "top tier";
  const base = `/store/${store.code}`;
  const now = new Date();
  const consent: Record<MsgChannel, boolean> = { SMS: c.consentSms, WHATSAPP: c.consentWhatsapp, EMAIL: c.consentEmail, PUSH: c.consentPush };

  return (
    <>
      <BackLink href={`${base}/customers`}>Members</BackLink>
      <PageHeader
        overline={`Member ${c.memberNo}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={`${c.firstName} ${c.lastName ?? ""}`} className="h-11 w-11 text-sm" />
            {c.firstName} {c.lastName ?? ""}
            <TierBadge tier={c.tier} />
            <Badge tone={SEGMENT_TONE[seg]}>{SEGMENTS[seg].name}</Badge>
          </span>
        }
        description={`Joined ${fmtDate(c.createdAt)}${c.source ? ` via ${c.source.toLowerCase().replaceAll("_", " ")}` : ""} · ${SEGMENTS[seg].blurb}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Points balance" value={fmtPoints(c.points)} sub={`worth ${zar(c.points * 100)}`} />
        <Stat label="Lifetime spend" value={zar(c.lifetimeCents)} sub="all stores" />
        <Stat label="Visits" value={c.visits.toLocaleString()} sub={c.visits ? `avg ${zar(Math.round(c.lifetimeCents / c.visits))}` : "no purchases yet"} />
        <Stat label="Last visit" value={c.lastPurchaseAt ? timeAgo(c.lastPurchaseAt) : "—"} sub={c.firstPurchaseAt ? `first ${fmtDate(c.firstPurchaseAt)}` : "never purchased"} />
        <Stat label={`${tier.name} tier`} value={`${settings.loyalty.tierSavingsPct[c.tier as TierKey] ?? 0}% off`} sub={tierNote} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title={`Purchases at ${store.name}`} description={`${salesTotal} transactions`} />
            {sales.length === 0 ? (
              <EmptyState title="No purchases here yet" />
            ) : (
              <Table className="mt-3">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Sale</Th>
                    <Th>Channel</Th>
                    <Th align="right">Items</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Points earned</Th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <Tr key={s.id}>
                      <Td className="whitespace-nowrap text-ink-600">{fmtDateTime(s.createdAt)}</Td>
                      <Td>
                        <span className="font-mono text-xs text-ink-800">{s.number}</span>
                        {s.kind === "REFUND" && <Badge tone="amber" className="ml-2">Refund</Badge>}
                      </Td>
                      <Td className="text-ink-600">{s.channel === "ONLINE" ? "Online" : "In store"}</Td>
                      <Td align="right">{s.lines.reduce((a, l) => a + l.qty, 0)}</Td>
                      <Td align="right" className="font-medium text-ink-900">{zar(s.totalCents)}</Td>
                      <Td align="right" className="text-ink-600">{s.pointsEarned ? `+${s.pointsEarned.toLocaleString()}` : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
            <div className="border-t border-ink-100">
              <Pagination page={page} pageSize={PAGE_SIZE} total={salesTotal} href={(p) => hrefWith(`${base}/customers/${c.id}`, {}, { page: p })} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Points ledger" description="Latest 15 entries · 1 point = R1" />
            {ledger.length === 0 ? (
              <EmptyState title="No points activity" />
            ) : (
              <Table className="mt-3">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Entry</Th>
                    <Th>Where</Th>
                    <Th align="right">Points</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap text-ink-600">{fmtDateTime(e.createdAt)}</Td>
                      <Td>
                        <span className="font-medium text-ink-850">{KIND[e.kind] ?? e.kind}</span>
                        {e.note && <div className="text-xs text-ink-500">{e.note}</div>}
                      </Td>
                      <Td className="text-ink-600">{e.store?.name ?? "Online / HQ"}</Td>
                      <Td align="right"><Qty n={e.points} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="pt-3">
              <Line label="Mobile" value={displayPhone(c.phone)} />
              <Line label="Email" value={c.email ?? <span className="text-ink-400">—</span>} />
              <Line label="Date of birth" value={c.dob ? `${fmtDate(c.dob)} (${ageOn(c.dob)})` : <span className="text-ink-400">Not captured</span>} />
              <Line label="SA ID" value={c.idLast4 ? <span className="font-mono">•••••••••{c.idLast4}</span> : <span className="text-ink-400">Not captured</span>} />
              <Line label="Referral code" value={<span className="font-mono">{c.referralCode}</span>} />
              {referrer && <Line label="Referred by" value={`${referrer.firstName} (${referrer.memberNo})`} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Age check" />
            <CardBody className="space-y-4 pt-3">
              <div className={`flex items-start gap-3 rounded-xl p-3 text-sm ${c.ageVerifiedAt ? "bg-leaf-50 text-leaf-700" : "bg-amber-50 text-amber-700"}`}>
                {c.ageVerifiedAt ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <div>
                  <b>{c.ageVerifiedAt ? { VERIFIED: "Verified (Home Affairs)", ID_NUMBER: "SA ID number checked", ID_SIGHTED: "ID document sighted", NONE: "" }[c.ageCheck] : "Not verified"}</b>
                  <div className="text-xs opacity-90">{c.ageVerifiedAt ? `Recorded ${fmtDate(c.ageVerifiedAt)}` : "Check ID before any age-restricted sale."}</div>
                </div>
              </div>
              {canManage && c.ageCheck !== "VERIFIED" && (
                <ActionForm action={checkAge.bind(null, store.code, c.id)} className="space-y-3">
                  <Field label="Record a check" htmlFor="age-method">
                    <Select id="age-method" name="method" defaultValue="ID_SIGHTED">
                      <option value="ID_SIGHTED">I&apos;ve seen their ID document</option>
                      <option value="ID_NUMBER">Validate an SA ID number</option>
                    </Select>
                    <FieldError name="method" />
                  </Field>
                  <Field label="SA ID number (for ID number checks)" htmlFor="age-id">
                    <Input id="age-id" name="idNumber" inputMode="numeric" maxLength={13} autoComplete="off" />
                    <FieldError name="idNumber" />
                  </Field>
                  <SubmitButton variant="dark" size="sm" pendingLabel="Recording…">Record age check</SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Marketing consent" description="Change only when the member asks. Every change is kept as POPIA evidence." />
            <CardBody className="space-y-2 pt-3">
              {(Object.keys(CHANNEL) as MsgChannel[]).map((ch) => (
                <div key={ch} className="flex items-center justify-between gap-3 rounded-xl border border-ink-150 px-3 py-2">
                  <span className="text-sm font-medium text-ink-850">{CHANNEL[ch]}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={consent[ch] ? "green" : "neutral"} dot>{consent[ch] ? "Opted in" : "Opted out"}</Badge>
                    {canManage && (
                      <ActionButton action={changeConsent.bind(null, store.code, c.id, ch, !consent[ch])} variant="ghost" title={consent[ch] ? `Record opt-out of ${CHANNEL[ch]}` : `Record opt-in to ${CHANNEL[ch]}`}>
                        {consent[ch] ? "Opt out" : "Opt in"}
                      </ActionButton>
                    )}
                  </span>
                </div>
              ))}
              {consents.length > 0 && (
                <details className="pt-2 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-oranje-700">Consent history ({consents.length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {consents.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                        <span>
                          <b className="text-ink-800">{CHANNEL[e.channel]}</b> {e.granted ? "granted" : "withdrawn"} <span className="text-ink-400">· {e.source.toLowerCase().replaceAll("_", " ")}</span>
                        </span>
                        <span className="whitespace-nowrap text-ink-500">{fmtDate(e.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {!canManage && <ReadOnlyNote className="mt-2" />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Patient authorisations"
              description="SAHPRA Section 21 — for licensed medicines"
              action={canManage && <ButtonLink href={`${base}/patients?member=${c.memberNo}`} variant="ghost" size="sm">Add</ButtonLink>}
            />
            <CardBody className="space-y-2 pt-3">
              {auths.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-ink-500">
                  <Stethoscope className="h-4 w-4" aria-hidden /> None on file.
                </p>
              )}
              {auths.map((a) => {
                const live = a.status === "ACTIVE" && a.validFrom <= now && a.validTo >= now;
                return (
                  <div key={a.id} className="rounded-xl border border-ink-150 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-ink-900">{a.authNumber}</span>
                      {a.status === "REVOKED" ? <Badge tone="red">Revoked</Badge> : live ? <StatusBadge status="ACTIVE" /> : <Badge tone="neutral">{a.validTo < now ? "Expired" : "Not yet valid"}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-ink-600">
                      {a.prescriber} · {a.monthlyLimitGrams} g / month · to {fmtDate(a.validTo)}
                    </div>
                    {live && <Meter value={a.validTo.getTime() - now.getTime()} max={a.validTo.getTime() - a.validFrom.getTime()} className="mt-2" />}
                  </div>
                );
              })}
              {auths.length > 0 && (
                <Link href={`${base}/patients?q=${c.memberNo}`} className="block pt-1 text-xs font-semibold text-oranje-700 hover:underline">
                  Open in the patient register →
                </Link>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
