import Link from "next/link";
import { Download, FileText, Plus, Stethoscope } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { authRegister, authWhere, dispensingRegister, type AuthView } from "@/server/store/patients";
import { expiryState, hrefWith, sp1 } from "@/server/store/rules";
import { rangeFromParams, dayKey, fmtDate, fmtDateTime } from "@/lib/format";
import { addAuthorisation, revokeAuthorisation } from "./actions";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/stat";
import { Field, Input } from "@/components/ui/form";
import { ButtonLink } from "@/components/ui/button";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, SearchForm } from "@/components/store/ui";
import { ConfirmAction } from "@/components/store/action-form";
import { Drawer } from "@/components/store/drawer";
import { AddAuthForm } from "./add-auth-form";

export const metadata = { title: "Patient register" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;
const VIEWS: Record<AuthView, string> = { active: "Active", expiring: "Expiring ≤ 30 days", expired: "Expired", revoked: "Revoked" };

export default async function PatientsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/patients`;
  const tab = sp1(sp.tab) === "register" ? "register" : "auths";
  const tabHref = (t: string) => hrefWith(path, {}, { tab: t === "auths" ? null : t });

  return (
    <>
      <PageHeader
        overline={`Customers · ${store.name}`}
        title="Patient register"
        description="SAHPRA Section 21 authorisations for your members, and the dispensing register for licensed medicines. Clinical conditions are never stored (POPIA s26)."
      />
      <Card>
        <TabLinks className="px-4" current={tabHref(tab)} tabs={[{ href: tabHref("auths"), label: "Authorisations" }, { href: tabHref("register"), label: "Dispensing register" }]} />
        {tab === "auths" ? <Authorisations store={store} canManage={canManage} sp={sp} path={path} /> : <Register store={store} sp={sp} path={path} />}
      </Card>
    </>
  );
}

type StoreCtx = Awaited<ReturnType<typeof storeForUser>>;

async function Authorisations({ store, canManage, sp, path }: { store: StoreCtx; canManage: boolean; sp: SP; path: string }) {
  const view = (sp1(sp.view) in VIEWS ? sp1(sp.view) : "active") as AuthView;
  const q = sp1(sp.q).trim();
  const page = pageParam(sp.page);
  const [{ total, rows }, counts] = await Promise.all([
    authRegister(store.id, view, q, page, PAGE_SIZE),
    Promise.all((Object.keys(VIEWS) as AuthView[]).map(async (v) => [v, await db.patientAuth.count({ where: authWhere(store.id, v, q) })] as const)),
  ]);
  const count = Object.fromEntries(counts);
  const member = sp1(sp.member);
  const today = dayKey(new Date());

  return (
    <div>
      <div className="min-w-0">
        <div className="space-y-3 border-b border-ink-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <SearchForm path={path} q={q} keep={{ view: view === "active" ? undefined : view }} placeholder="Patient, member number, authorisation or prescriber" className="min-w-0 flex-1" />
            {canManage && (
              <Drawer label="Add authorisation" icon={<Plus className="h-4 w-4" aria-hidden />} title="Add an authorisation" description="Capture it exactly as on the SAHPRA letter and file the signed copy." defaultOpen={!!member}>
                <AddAuthForm action={addAuthorisation.bind(null, store.code)} member={member} today={today} />
              </Drawer>
            )}
          </div>
          <Chips
            label="Authorisations"
            current={view}
            items={(Object.keys(VIEWS) as AuthView[]).map((v) => ({
              key: v,
              label: VIEWS[v],
              count: count[v],
              tone: v === "expiring" ? "amber" : v === "expired" || v === "revoked" ? "red" : "green",
              href: hrefWith(path, sp, { view: v === "active" ? null : v, page: null }),
            }))}
          />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Stethoscope className="h-5 w-5" />} title="No authorisations here">
            {view === "expiring" ? "Nothing expires in the next 30 days." : "Add a member's SAHPRA authorisation to let them buy licensed medicines."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Patient</Th>
                <Th>Authorisation</Th>
                <Th>Prescriber</Th>
                <Th>This month (30 days)</Th>
                <Th>Valid</Th>
                {canManage && <Th><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const left = Math.max(0, a.monthlyLimitGrams - a.usedGrams);
                const exp = expiryState(a.validTo);
                return (
                  <Tr key={a.id}>
                    <Td className="min-w-40">
                      <Link href={`/store/${store.code}/customers/${a.customer.id}`} className="font-medium text-ink-900 hover:text-oranje-700">
                        {a.customer.firstName} {a.customer.lastName ?? ""}
                      </Link>
                      <div className="font-mono text-xs text-ink-400">{a.customer.memberNo}</div>
                    </Td>
                    <Td className="min-w-44">
                      <div className="font-mono text-xs font-semibold text-ink-900">{a.authNumber}</div>
                      <div className="max-w-56 truncate text-xs text-ink-500" title={a.scope}>{a.scope}</div>
                      {a.documentRef && (
                        <div className="mt-0.5 flex items-center gap-1 text-[0.7rem] text-ink-400" title={a.documentRef}>
                          <FileText className="h-3 w-3" aria-hidden /> Document on file
                        </div>
                      )}
                    </Td>
                    <Td className="min-w-36">
                      <div className="text-ink-800">{a.prescriber}</div>
                      <div className="font-mono text-xs text-ink-400">HPCSA {a.prescriberRegNo}</div>
                    </Td>
                    <Td className="min-w-44">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="tnum font-semibold text-ink-900">{left.toFixed(1)} g left</span>
                        <span className="tnum text-ink-400">of {a.monthlyLimitGrams} g</span>
                      </div>
                      <Meter value={a.usedGrams} max={a.monthlyLimitGrams} tone={left <= 0 ? "red" : left < a.monthlyLimitGrams * 0.2 ? "amber" : "green"} className="mt-1.5" />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="text-xs text-ink-600">
                        {fmtDate(a.validFrom)} – {fmtDate(a.validTo)}
                      </div>
                      {a.status === "REVOKED" ? <Badge tone="red">Revoked</Badge> : <Badge tone={exp.tone === "neutral" ? "green" : exp.tone}>{exp.label}</Badge>}
                    </Td>
                    {canManage && (
                      <Td className="text-right">
                        {a.status === "ACTIVE" && (
                          <ConfirmAction action={revokeAuthorisation.bind(null, store.code, a.id)} label="Revoke" title={`Revoke ${a.authNumber}?`} confirmLabel="Revoke authorisation" className="min-w-64">
                            <p>The patient can&apos;t buy licensed medicines on this authorisation any more.</p>
                            <Field label="Reason" htmlFor={`rv-${a.id}`}>
                              <Input id={`rv-${a.id}`} name="reason" maxLength={200} placeholder="e.g. Prescriber withdrew it" />
                            </Field>
                          </ConfirmAction>
                        )}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </div>

    </div>
  );
}

async function Register({ store, sp, path }: { store: StoreCtx; sp: SP; path: string }) {
  const today = dayKey(new Date());
  const r = rangeFromParams({ from: sp1(sp.from) || `${today.slice(0, 7)}-01`, to: sp1(sp.to) || today });
  const page = pageParam(sp.page);
  const { total, rows } = await dispensingRegister(store.id, r, page, PAGE_SIZE);
  const unauthorised = rows.filter((x) => !x.authNumber || !x.dispenserAuthorised).length;

  return (
    <>
      <form method="get" action={path} className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4 sm:px-5">
        <input type="hidden" name="tab" value="register" />
        <Field label="From" htmlFor="rg-from">
          <Input id="rg-from" type="date" name="from" defaultValue={r.from} max={today} />
        </Field>
        <Field label="To" htmlFor="rg-to">
          <Input id="rg-to" type="date" name="to" defaultValue={r.to} max={today} />
        </Field>
        <button className="h-10 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800">Show</button>
        <ButtonLink href={hrefWith(`${path}/register`, {}, { from: r.from, to: r.to })} variant="outline" prefetch={false} className="ml-auto">
          <Download className="h-4 w-4" aria-hidden /> Download CSV
        </ButtonLink>
      </form>
      {unauthorised > 0 && (
        <Notice tone="warn" className="mx-5 mt-4">
          {unauthorised} line{unauthorised > 1 ? "s" : ""} on this page have no matching authorisation or weren&apos;t dispensed by an authorised dispenser — review them with your responsible pharmacist.
        </Notice>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<Stethoscope className="h-5 w-5" />} title="No licensed medicines dispensed in this period" />
      ) : (
        <Table className="mt-2">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Sale</Th>
              <Th>Patient</Th>
              <Th>Authorisation · prescriber</Th>
              <Th>Product · batch</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Grams</Th>
              <Th>Dispenser</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <Tr key={x.id} className={x.refund ? "bg-amber-50/60" : undefined}>
                <Td className="whitespace-nowrap text-ink-600">{fmtDateTime(x.at)}</Td>
                <Td className="whitespace-nowrap">
                  <span className="font-mono text-xs">{x.saleNumber}</span>
                  {x.refund && <Badge tone="amber" className="ml-1">Return</Badge>}
                </Td>
                <Td className="min-w-32">
                  {x.patient ?? <span className="text-rose-600">No patient</span>}
                  {x.memberNo && <div className="font-mono text-xs text-ink-400">{x.memberNo}</div>}
                </Td>
                <Td className="min-w-40">
                  {x.authNumber ? <span className="font-mono text-xs font-semibold">{x.authNumber}</span> : <span className="text-xs font-semibold text-rose-600">None valid</span>}
                  {x.prescriber && <div className="text-xs text-ink-500">{x.prescriber}</div>}
                </Td>
                <Td className="min-w-44">
                  <div className="text-ink-850">{x.product}</div>
                  <div className="font-mono text-[0.7rem] text-ink-400">{x.batches || "—"}</div>
                </Td>
                <Td align="right">{x.qty}</Td>
                <Td align="right">{x.grams.toFixed(1)}</Td>
                <Td className="whitespace-nowrap">
                  {x.dispenser ?? "—"}
                  {x.dispenser && !x.dispenserAuthorised && <div className="text-xs font-semibold text-rose-600">Not authorised</div>}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="border-t border-ink-100">
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
      </div>
    </>
  );
}
