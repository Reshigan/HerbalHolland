import Link from "next/link";
import { CalendarClock, ExternalLink, Gavel, ScrollText } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { addDays, fmtDate, fmtDateTime, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Input } from "@/components/ui/form";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { FilterForm, SearchField } from "@/components/hq/filter-form";
import { ViewOnly } from "@/components/hq/ui";
import { saveCompliance, saveLicences } from "./actions";
import { ComplianceForm } from "./compliance-form";

export const metadata = { title: "Compliance" };

const CLASSES = Object.keys(REG_CLASS_LABEL) as RegClass[];
const EVENT: Record<string, string> = { "compliance.block": "Sale blocked", "compliance.settings": "Rules changed", "compliance.licence": "Licence updated", "compliance.product": "Product compliance data changed" };

// Regulatory watch-list — from docs/research/COMPLIANCE-RESEARCH.md (researched 27 Sep 2026; not legal advice).
const WATCH: { item: string; status: string; tone: "amber" | "blue" | "neutral" | "red"; date: string; action: string }[] = [
  { item: "Cannabis for Private Purposes Act 7 of 2024", status: "Commencement pending", tone: "amber", date: "Draft s6 regulations published 2 Feb 2026; Parliament must approve them before the President proclaims commencement (reply NW4480, 18 Sep 2026)", action: "Commercial THC trade stays unlawful — keep THC licence-gated" },
  { item: "Cannabis Bill (commercial framework)", status: "Expected mid-2027", tone: "blue", date: "Portfolio Committee, 6 Mar 2026; repeated 25 Sep 2026", action: "Adult-use mode stays off until a licensing regime commences" },
  { item: "Tobacco Products & Electronic Delivery Systems Control Bill B33-2022", status: "In committee", tone: "amber", date: "Clause-by-clause deliberation since 12 Aug 2026", action: "Ready: Tobacco Bill mode (in-store only, no loyalty or promotion for related products)" },
  { item: "SAHPRA Schedule 0 CBD (GN 586 of 2020)", status: "In force", tone: "neutral", date: "≤600 mg per pack, ≤20 mg daily dose, low-risk claims only; re-confirm with SAHPRA", action: "Enforced in the catalogue (CBD validator + claim screening)" },
  { item: "VAT Act s7(4) — Minister's rate-change power", status: "ConCourt judgment pending", tone: "blue", date: "Declared invalid by WC High Court 5 Mar 2026 (suspended 24 months); heard late Aug 2026", action: "VAT stays 15%; watch for a rate change with effective date" },
  { item: "CPA Amendment Regulations — NCC opt-out registry", status: "Launching 2026", tone: "amber", date: "GN R.7380 of 15 Apr 2026; registration opened Jul 2026, launch expected 'in the coming weeks' (15 Sep 2026)", action: "Import the registry monthly under Campaigns → Do-not-contact list" },
];

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const admin = can(user, "admin");
  const now = new Date();
  const page = pageParam(sp.page);
  const pageSize = 12;
  const q = sp.q?.trim();
  const storeWhere = { id: { in: ids }, kind: "RETAIL" as const, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const memberScope = scope.kind === "HQ" ? {} : { customer: { homeStoreId: { in: ids } } };
  const [settings, stores, totalStores, licensed, retailCount, events, expiring, expiringCount, blocks] = await Promise.all([
    getSettings(),
    db.store.findMany({ where: storeWhere, select: { id: true, code: true, name: true, status: true, licences: true, licenceRef: true }, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.store.count({ where: storeWhere }),
    db.store.count({ where: { id: { in: ids }, kind: "RETAIL", licences: { has: "THC" } } }),
    db.store.count({ where: { id: { in: ids }, kind: "RETAIL" } }),
    db.auditLog.findMany({ where: { action: { startsWith: "compliance." }, ...(scope.kind === "HQ" ? {} : { storeId: { in: ids } }) }, orderBy: { at: "desc" }, take: 12 }),
    db.patientAuth.findMany({
      where: { status: "ACTIVE", validTo: { gte: now, lte: addDays(now, 30) }, ...memberScope },
      include: { customer: { select: { id: true, firstName: true, lastName: true, memberNo: true, homeStore: { select: { name: true } } } } },
      orderBy: { validTo: "asc" },
      take: 8,
    }),
    db.patientAuth.count({ where: { status: "ACTIVE", validTo: { gte: now, lte: addDays(now, 30) }, ...memberScope } }),
    db.auditLog.count({ where: { action: "compliance.block", at: { gte: addDays(now, -30) }, ...(scope.kind === "HQ" ? {} : { storeId: { in: ids } }) } }),
  ]);
  const storeNames = new Map((await db.store.findMany({ where: { id: { in: events.flatMap((e) => (e.storeId ? [e.storeId] : [])) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const c = settings.compliance;

  return (
    <>
      <PageHeader
        overline="Governance"
        title="Compliance"
        description="The rules every till, the web shop and the Rewards app enforce. They're data, not code — so the network can follow South African regulation as it changes, without a release."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="THC mode" value={c.thcMode === "MEDICAL" ? "Medical" : "Adult use"} sub={c.thcMode === "MEDICAL" ? "SAHPRA pathway, dispenser required" : `${c.dailyLimitGrams} g daily limit`} />
        <Stat label="Stores licensed for THC" value={`${num(licensed)} / ${num(retailCount)}`} />
        <Stat label="Sales blocked · 30 days" value={num(blocks)} sub="by the compliance engine" />
        <Stat label="Authorisations expiring" value={num(expiringCount)} sub="in the next 30 days" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Rules" description="Changes are audited and apply to the next basket everywhere" />
          <CardBody>
            {!admin && <ViewOnly className="mb-4">View only — compliance rules are set by the HQ administrator.</ViewOnly>}
            <ComplianceForm action={saveCompliance} value={c} readOnly={!admin} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Gavel className="h-4 w-4 text-oranje-700" /> Regulatory watch-list
                </span>
              }
              description="As at 27 Sep 2026 · research, not legal advice"
            />
            <CardBody className="space-y-4">
              {WATCH.map((w) => (
                <div key={w.item} className="border-l-2 border-ink-150 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{w.item}</span>
                    <Badge tone={w.tone}>{w.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">{w.date}</p>
                  <p className="mt-1 text-xs text-ink-700">→ {w.action}</p>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-oranje-700" /> Authorisations expiring
                </span>
              }
              description="Patients need a renewed Section 21 authorisation to keep buying"
            />
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {expiring.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-500">None in the next 30 days.</li>}
              {expiring.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <Link href={`/hq/customers/${a.customer.id}`} className="font-medium text-ink-850 hover:text-oranje-700">
                      {a.customer.firstName} {a.customer.lastName ?? ""}
                    </Link>
                    <span className="block truncate text-xs text-ink-500">
                      {a.authNumber} · {a.customer.homeStore?.name ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-amber-700">{fmtDate(a.validTo)}</span>
                </li>
              ))}
              {expiringCount > expiring.length && <li className="px-5 py-2 text-xs text-ink-500">+{num(expiringCount - expiring.length)} more</li>}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Store licences" description="Licence-gated classes are only sellable at stores holding the licence. The reference prints on receipts and tax invoices." />
          <div className="mt-4 border-y border-ink-100 p-4">
            <FilterForm action="/hq/compliance">
              <SearchField defaultValue={sp.q} placeholder="Find a store" />
            </FilterForm>
          </div>
          <div className="divide-y divide-ink-100">
            {stores.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-500">No stores match.</p>}
            {stores.map((s) => (
              <ActionForm key={s.id} action={saveLicences.bind(null, s.id)} className="px-5 py-3" notices="bottom">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="w-44 min-w-0">
                    <Link href={`/hq/stores/${s.code}`} className="font-medium text-ink-900 hover:text-oranje-700">{s.name}</Link>
                    <span className="block text-xs text-ink-500">
                      <span className="font-mono">{s.code}</span> · <StatusBadge status={s.status} className="ml-0.5" />
                    </span>
                  </div>
                  <fieldset disabled={!admin} className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {CLASSES.filter((cl) => c.licensedOnly.includes(cl) || s.licences.includes(cl)).map((cl) => (
                      <label key={cl} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-800">
                        <input type="checkbox" name="licences" value={cl} defaultChecked={s.licences.includes(cl)} className="h-4 w-4 accent-oranje-500" />
                        {cl}
                      </label>
                    ))}
                  </fieldset>
                  <div className="min-w-48 flex-1">
                    <Input name="licenceRef" defaultValue={s.licenceRef ?? ""} placeholder="Licence / permit reference" aria-label={`${s.name} licence reference`} disabled={!admin} className="h-9 text-xs" />
                    <FieldError name="licenceRef" />
                  </div>
                  {admin && (
                    <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                  )}
                </div>
              </ActionForm>
            ))}
          </div>
          <Pagination page={page} pageSize={pageSize} total={totalStores} href={(p) => `/hq/compliance${qs({ q: sp.q, page: p })}`} />
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-oranje-700" /> Recent compliance events
              </span>
            }
            action={
              <Link href="/hq/audit?action=compliance." className="inline-flex items-center gap-1 text-xs font-semibold text-oranje-700 hover:underline">
                Audit log <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
            {events.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-500">No compliance events yet.</li>}
            {events.map((e) => {
              const d = (e.data ?? {}) as Record<string, unknown>;
              const detail = typeof d.reason === "string" ? d.reason : Array.isArray(d.blocks) ? String(d.blocks[0] ?? "") : Array.isArray(d.changed) ? `Changed: ${(d.changed as string[]).join(", ")}` : "";
              return (
                <li key={e.id} className="px-5 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-850">{EVENT[e.action] ?? e.action.replace("compliance.", "").replaceAll("_", " ")}</span>
                    <span className="shrink-0 text-xs text-ink-500">{fmtDateTime(e.at)}</span>
                  </div>
                  <p className="truncate text-xs text-ink-500">
                    {[e.actorName, e.storeId ? storeNames.get(e.storeId) : null, detail].filter(Boolean).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
