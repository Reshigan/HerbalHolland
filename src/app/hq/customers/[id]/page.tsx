import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ShieldX, Star } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { segmentOf, SEGMENTS } from "@/lib/rfm";
import { fmtPoints, tierInfo, tierBenefits, TIERS, type TierKey } from "@/lib/loyalty-rules";
import { getSettings } from "@/server/settings";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, num, timeAgo, addDays } from "@/lib/format";
import { ageOn, displayPhone } from "@/lib/sa";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { Detail } from "@/components/ui/misc";
import { Meter } from "@/components/ui/stat";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ConfirmAction } from "@/components/hq/action-form";
import { BackLink, EmptyRow, MiniStat } from "@/components/hq/ui";
import { CHANNEL_LABEL } from "@/components/hq/tones";
import { Flash } from "@/components/hq/flash";
import { anonymiseCustomer } from "../actions";

export const metadata = { title: "Member" };

const AGE_CHECK: Record<string, string> = { NONE: "Not verified", ID_SIGHTED: "ID sighted in store", ID_NUMBER: "ID number checked", VERIFIED: "Verified (Home Affairs)" };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const c = await db.customer.findUnique({ where: { id }, include: { homeStore: { select: { code: true, name: true } } } });
  if (!c || (scope.kind !== "HQ" && (!c.homeStoreId || !ids.includes(c.homeStoreId)))) notFound();
  const year = addDays(new Date(), -365);
  const [ledger, consents, sales, byStore, spend12, auths, reviews, orders, referrer, referrals, settings] = await Promise.all([
    db.loyaltyEntry.findMany({ where: { customerId: id }, include: { store: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.consentEvent.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.sale.findMany({ where: { customerId: id }, include: { store: { select: { name: true, code: true } }, lines: { select: { qty: true } } }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.sale.groupBy({ by: ["storeId"], where: { customerId: id, kind: "SALE" }, _count: true, _sum: { totalCents: true } }),
    db.sale.aggregate({ where: { customerId: id, createdAt: { gte: year } }, _sum: { totalCents: true } }),
    db.patientAuth.findMany({ where: { customerId: id }, orderBy: { validTo: "desc" } }),
    db.review.findMany({ where: { customerId: id }, include: { product: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.order.findMany({ where: { customerId: id }, select: { code: true, status: true, createdAt: true, totalCents: true, fulfilment: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    c.referredById ? db.customer.findUnique({ where: { id: c.referredById }, select: { id: true, firstName: true, memberNo: true } }) : null,
    db.customer.count({ where: { referredById: id } }),
    getSettings(),
  ]);
  const storeNames = new Map((await db.store.findMany({ where: { id: { in: byStore.map((b) => b.storeId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const anonymised = c.phone.startsWith("anon-");
  const segment = segmentOf(c);
  const tier = tierInfo(c.tier as TierKey);
  const spend = spend12._sum.totalCents ?? 0;
  const nt = TIERS[TIERS.findIndex((t) => t.key === c.tier) + 1];
  const next = nt ? { tier: nt, remainingCents: Math.max(0, nt.minCents - spend), progress: Math.min(1, spend / nt.minCents) } : null;
  const admin = can(user, "admin");
  const now = new Date();

  return (
    <>
      <BackLink href="/hq/customers">Members & CRM</BackLink>
      <PageHeader
        overline={`${c.memberNo} · member since ${fmtDate(c.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {c.firstName} {c.lastName ?? ""}
            <TierBadge tier={c.tier} />
            <Badge tone="dark">{SEGMENTS[segment].name}</Badge>
          </span>
        }
        description={c.homeStore ? `Home store: ${c.homeStore.name} (${c.homeStore.code})` : "No home store"}
        actions={
          admin &&
          !anonymised && (
            <a href={`/hq/customers/${c.id}/export`} download className={buttonClass("outline")}>
              <Download className="h-4 w-4" /> Export data
            </a>
          )
        }
      />
      <Flash message={sp.m} />
      {anonymised && (
        <Notice tone="warn" className="mb-6" title="Anonymised">
          This member&apos;s personal information was erased on request. Purchase, invoice and points records remain for statutory retention, detached from the person.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Lifetime spend" value={zar(c.lifetimeCents)} sub={`${num(c.visits)} visits`} className="border border-ink-150 bg-white shadow-card" />
        <MiniStat label="Spend · 12 months" value={zar(spend12._sum.totalCents ?? 0)} sub={next ? `${zar(next.remainingCents)} more for ${next.tier.name}` : "Top tier"} className="border border-ink-150 bg-white shadow-card" />
        <MiniStat label="Points balance" value={fmtPoints(c.points)} sub={`worth ${zar(c.points * 100)}`} className="border border-ink-150 bg-white shadow-card" />
        <MiniStat label="Last purchase" value={c.lastPurchaseAt ? timeAgo(c.lastPurchaseAt) : "Never"} sub={c.firstPurchaseAt ? `first ${fmtDate(c.firstPurchaseAt)}` : "Prospect"} className="border border-ink-150 bg-white shadow-card" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Purchases" description={`${byStore.length} store${byStore.length === 1 ? "" : "s"} · till and online`} />
            {byStore.length > 1 && (
              <CardBody className="flex flex-wrap gap-2 pb-0">
                {byStore
                  .sort((a, b) => (b._sum.totalCents ?? 0) - (a._sum.totalCents ?? 0))
                  .map((b) => (
                    <span key={b.storeId} className="rounded-full bg-ink-50 px-3 py-1 text-xs text-ink-700">
                      {storeNames.get(b.storeId)} · <b>{b._count}</b> · {zar(b._sum.totalCents ?? 0)}
                    </span>
                  ))}
              </CardBody>
            )}
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Sale</Th>
                  <Th className="hidden sm:table-cell">Store</Th>
                  <Th align="right">Items</Th>
                  <Th align="right">Total</Th>
                  <Th align="right" className="hidden md:table-cell">Points</Th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && <EmptyRow cols={5}>No purchases yet.</EmptyRow>}
                {sales.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <span className="font-mono text-xs text-ink-800">{s.number}</span>
                      {s.kind === "REFUND" && <Badge tone="amber" className="ml-2">Refund</Badge>}
                      {s.channel === "ONLINE" && <Badge tone="blue" className="ml-2">Online</Badge>}
                      <span className="block text-xs text-ink-500">{fmtDateTime(s.createdAt)}</span>
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{s.store.name}</Td>
                    <Td align="right">{s.lines.reduce((a, l) => a + l.qty, 0)}</Td>
                    <Td align="right" className="font-medium">{zar(s.totalCents)}</Td>
                    <Td align="right" className="hidden text-ink-600 md:table-cell">{s.pointsEarned ? `+${num(s.pointsEarned)}` : "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Points ledger" description="Latest movements · 1 point = R1" />
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th className="hidden sm:table-cell">Where / note</Th>
                  <Th align="right">Points</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 && <EmptyRow cols={4}>No points movements yet.</EmptyRow>}
                {ledger.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-ink-600">{fmtDateTime(e.createdAt)}</Td>
                    <Td>
                      <Badge tone={e.points >= 0 ? "green" : "neutral"}>{e.kind.charAt(0) + e.kind.slice(1).toLowerCase()}</Badge>
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{[e.store?.name, e.note].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td align="right" className={e.points >= 0 ? "font-medium text-leaf-700" : "font-medium text-ink-700"}>
                      {e.points >= 0 ? "+" : "−"}
                      {num(Math.abs(e.points))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {orders.length > 0 && (
            <Card>
              <CardHeader title="Online orders" />
              <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                {orders.map((o) => (
                  <li key={o.code} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <Link href={`/hq/orders/${o.code}`} className="font-mono font-semibold text-ink-900 hover:text-oranje-700">
                      {o.code}
                    </Link>
                    <span className="hidden text-xs text-ink-500 sm:inline">{fmtDateTime(o.createdAt)}</span>
                    <StatusBadge status={o.status} />
                    <span className="tnum">{zar(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <dl className="divide-y divide-ink-100">
                <Detail label="Mobile">{anonymised ? "—" : displayPhone(c.phone)}</Detail>
                <Detail label="Email">{c.email ?? "—"}</Detail>
                <Detail label="Age">{c.dob ? `${ageOn(c.dob)} (born ${fmtDate(c.dob)})` : "—"}</Detail>
                <Detail label="Age check">{AGE_CHECK[c.ageCheck]}{c.idLast4 ? ` · ID ••••${c.idLast4}` : ""}</Detail>
                <Detail label="Joined via">{c.source ?? "—"}</Detail>
                <Detail label="Referral code">
                  <span className="font-mono text-xs">{c.referralCode}</span>
                  {referrals > 0 && <span className="text-xs text-ink-500"> · {referrals} referred</span>}
                </Detail>
                {referrer && (
                  <Detail label="Referred by">
                    <Link href={`/hq/customers/${referrer.id}`} className="hover:text-oranje-700">{referrer.firstName} ({referrer.memberNo})</Link>
                  </Detail>
                )}
              </dl>
              <div className="mt-4 rounded-xl bg-ink-50 p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-800">{tier.name}</span>
                  <span className="text-ink-500">{next ? `${next.tier.name} at ${zar(next.tier.minCents)}` : "Top tier"}</span>
                </div>
                <Meter value={next ? next.progress : 1} max={1} />
                <p className="mt-1.5 text-xs text-ink-500">{tierBenefits(c.tier as TierKey, settings.loyalty.tierSavingsPct, settings.loyalty.earnPer100).join(" · ")}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Marketing consent" description="POPIA s69 — per channel, with the evidence trail" />
            <CardBody>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["SMS", c.consentSms],
                    ["EMAIL", c.consentEmail],
                    ["PUSH", c.consentPush],
                    ["WHATSAPP", c.consentWhatsapp],
                  ] as const
                ).map(([ch, on]) => (
                  <div key={ch} className={`rounded-xl border px-3 py-2 text-sm ${on ? "border-leaf-500/30 bg-leaf-50 text-leaf-700" : "border-ink-150 text-ink-500"}`}>
                    <span className="font-semibold">{CHANNEL_LABEL[ch]}</span> · {on ? "Yes" : "No"}
                  </div>
                ))}
              </div>
              <ol className="mt-4 space-y-2 border-t border-ink-100 pt-3">
                {consents.length === 0 && <li className="text-xs text-ink-500">No consent events recorded.</li>}
                {consents.map((e) => (
                  <li key={e.id} className="text-xs">
                    <span className={e.granted ? "font-semibold text-leaf-700" : "font-semibold text-ink-700"}>
                      {CHANNEL_LABEL[e.channel]} {e.granted ? "granted" : "withdrawn"}
                    </span>{" "}
                    <span className="text-ink-500">
                      · {e.source.replaceAll("_", " ").toLowerCase()} · {fmtDateTime(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Patient authorisations" description="SAHPRA Section 21 — the condition itself is never stored" />
            <CardBody className="space-y-3">
              {auths.length === 0 && <p className="text-sm text-ink-500">None on file.</p>}
              {auths.map((a) => {
                const live = a.status === "ACTIVE" && a.validFrom <= now && a.validTo >= now;
                return (
                  <div key={a.id} className="rounded-xl border border-ink-150 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-ink-900">{a.authNumber}</span>
                      <Badge tone={live ? "green" : a.status === "REVOKED" ? "red" : "neutral"} dot>
                        {live ? "Active" : a.status === "REVOKED" ? "Revoked" : a.validTo < now ? "Expired" : "Not yet valid"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-600">
                      {a.prescriber} ({a.prescriberRegNo}) · {a.scope} · {a.monthlyLimitGrams} g / month
                    </p>
                    <p className="text-xs text-ink-500">
                      {fmtDate(a.validFrom)} → {fmtDate(a.validTo)}
                    </p>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {reviews.length > 0 && (
            <Card>
              <CardHeader title="Reviews" />
              <CardBody className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="text-sm">
                    <div className="flex items-center gap-1 text-oranje-600" aria-label={`${r.rating} out of 5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "text-ink-200"}`} aria-hidden />
                      ))}
                      <span className="ml-1 text-xs text-ink-500">{r.product.name}</span>
                    </div>
                    {r.title && <p className="mt-0.5 font-medium text-ink-850">{r.title}</p>}
                    {r.body && <p className="text-xs text-ink-600">{r.body}</p>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {admin && !anonymised && (
            <Card className="border-rose-500/20">
              <CardHeader title="Right to erasure" description="POPIA s24 — for a verified request from the member" />
              <CardBody>
                <ConfirmAction
                  action={anonymiseCustomer.bind(null, c.id)}
                  label="Anonymise member"
                  icon={<ShieldX className="h-4 w-4" />}
                  title="Anonymise this member?"
                  confirmLabel="Erase personal information"
                  typeToConfirm="ANONYMISE"
                  className="w-full"
                >
                  <p>This can&apos;t be undone. Name, mobile, email, date of birth and ID details are erased, marketing consent is withdrawn and {fmtPoints(Math.max(0, c.points))} are forfeited. Their mobile and email stay on the do-not-contact list so they&apos;re never marketed to again.</p>
                  <p className="text-xs text-ink-500">Sales, tax invoices, the points ledger and dispensing records are kept for statutory retention, detached from the person. Export their data first if they asked for a copy.</p>
                  <Field label="Request reference" htmlFor="erase-reason">
                    <Input id="erase-reason" name="reason" placeholder="e.g. Email request 27 Sep 2026, ID verified" />
                  </Field>
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
