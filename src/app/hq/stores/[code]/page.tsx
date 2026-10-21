import Link from "next/link";
import { ExternalLink, KeyRound, UserMinus } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { kpis, stockAlerts, orderQueue } from "@/server/dashboard";
import { todayList } from "@/server/today";
import { checklist } from "@/server/store-tasks";
import { can } from "@/server/hq/guard";
import { titleCase, FORMATS, STATUSES } from "@/server/hq/stores";
import { resolveRange } from "@/lib/ranges";
import { zar, zarCompact, bps, pct } from "@/lib/money";
import { fmtDate, num, timeAgo } from "@/lib/format";
import { PROVINCES, displayPhone } from "@/lib/sa";
import { REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Avatar, Detail } from "@/components/ui/misc";
import { Field, Input, Textarea, Checkbox, Select } from "@/components/ui/form";
import { AreaChart } from "@/components/charts/area-chart";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Flash } from "@/components/hq/flash";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { saveCompany, saveStoreFees, saveStoreProfile, saveStoreStatus } from "../actions";
import { addOwner, markTaskDone, markTaskOpen, resetOwnerPassword, setOwnerActive, startChecklist } from "./actions";
import { TodayList } from "@/components/store/today-list";
import { OpeningChecklist } from "@/components/hq/checklist";
import { saveLicences } from "../../compliance/actions";
import { asList } from "@/lib/json-list";

export const metadata = { title: "Store" };

const CLASSES = Object.keys(REG_CLASS_LABEL) as RegClass[];
const dayInput = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(d) : "");

export default async function StoreDetail({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ created?: string; m?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const store = await storeForUser(user, code);
  const r = resolveRange({ range: "30d" });
  const retail = store.kind === "RETAIL";
  const now = new Date();
  const admin = can(user, "admin");
  const [k, alerts, queue, members, regions, dcs, siblings, users, today, tasks, owners] = await Promise.all([
    kpis([store.id], r),
    stockAlerts([store.id]),
    orderQueue([store.id]),
    db.customer.count({ where: { homeStoreId: store.id } }),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.store.findMany({ where: { kind: "WAREHOUSE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.store.findMany({ where: { companyId: store.companyId, id: { not: store.id, in: ids } }, select: { code: true, name: true, status: true }, orderBy: { code: "asc" } }),
    db.user.count({ where: { storeId: store.id, active: true } }),
    retail ? todayList(store, user, now) : null,
    retail ? checklist(store.id, now) : null,
    // The franchisee's owner sign-ins: the HQ administrator's to manage, and only theirs to see.
    admin ? db.user.findMany({ where: { role: "OWNER", companyId: store.companyId }, select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }) : [],
  ]);
  const c = k.cur;
  const openOrders = (queue.PLACED ?? 0) + (queue.PICKING ?? 0) + (queue.READY ?? 0);
  const editProfile = can(user, "network");

  return (
    <>
      <BackLink href="/hq/stores">All stores</BackLink>
      <PageHeader
        overline={`${store.region.name} · ${store.code}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {retail ? `Herbal Holland ${store.name}` : store.name}
            <StatusBadge status={store.status} />
          </span>
        }
        description={`${store.addressLine}, ${store.suburb}, ${store.city} · ${titleCase(store.format)}${store.openedAt ? ` · opened ${fmtDate(store.openedAt)}` : ""}`}
        actions={
          retail && (
            <ButtonLink href={`/store/${store.code}`} variant="dark">
              Open back office <ExternalLink className="h-4 w-4" />
            </ButtonLink>
          )
        }
      />
      {sp.created && <Notice tone="success" className="mb-6" title="Store created">Set its licences once permits are issued, then add the owner&apos;s back-office sign-in under Franchisee owners. Ranging was copied from the template store.</Notice>}
      <Flash message={sp.m} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Net sales · 30 days" value={zarCompact(c.netCents)} delta={k.deltas.net} deltaLabel="vs prior 30" trend={k.trend.net.slice(-12)} className="col-span-2 lg:col-span-1" />
        <Stat label="Transactions" value={num(c.sales)} delta={k.deltas.tx} deltaLabel="vs prior 30" />
        <Stat label="Average basket" value={c.atvCents ? zar(c.atvCents) : "—"} delta={k.deltas.atv} deltaLabel="vs prior 30" />
        <Stat label="Members (home store)" value={num(members)} sub={`${pct(c.memberRate, 0)} of sales to members`} />
        <Stat label="Open online orders" value={num(openOrders)} sub={`${alerts.low} SKUs at reorder point`} />
      </div>

      {today && <TodayList items={today} className="mt-6" title={`Today at ${store.name}`} description={today.length ? undefined : "Nothing needs the store's attention right now"} />}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {tasks && (tasks.tasks.length > 0 || store.status !== "ACTIVE" || editProfile) && (
            <OpeningChecklist data={tasks} now={now} canEdit={editProfile} storeName={store.name} onStart={startChecklist.bind(null, store.id)} onDone={(id) => markTaskDone.bind(null, store.id, id)} onReopen={(id) => markTaskOpen.bind(null, store.id, id)} />
          )}
          <Card>
            <CardHeader title="Net sales" description="Daily, ex VAT, last 30 days" />
            <CardBody>
              {c.sales ? <AreaChart labels={k.trend.labels} series={[{ name: "Net sales", color: "var(--color-series-1)", values: k.trend.net }]} height={200} /> : <p className="py-10 text-center text-sm text-ink-500">No trading yet in this period.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Store profile" description="Location, contact details and services shown to members and on invoices" />
            <CardBody>
              {!editProfile && <ViewOnly className="mb-4" />}
              <ActionForm action={saveStoreProfile.bind(null, store.id)}>
                <fieldset disabled={!editProfile} className="min-w-0 grid gap-4 sm:grid-cols-2">
                  <Field label="Store name" htmlFor="name" className="sm:col-span-2">
                    <Input id="name" name="name" defaultValue={store.name} required />
                    <FieldError name="name" />
                  </Field>
                    <Field label="Format" htmlFor="format">
                      <Select id="format" name="format" defaultValue={store.format}>
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>{titleCase(f)}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Region" htmlFor="regionId">
                      <Select id="regionId" name="regionId" defaultValue={store.regionId}>
                        {regions.map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </Select>
                    </Field>
                  <Field label="Street address" htmlFor="addressLine" className="sm:col-span-2">
                    <Input id="addressLine" name="addressLine" defaultValue={store.addressLine} />
                    <FieldError name="addressLine" />
                  </Field>
                  <Field label="Suburb" htmlFor="suburb">
                    <Input id="suburb" name="suburb" defaultValue={store.suburb} />
                    <FieldError name="suburb" />
                  </Field>
                  <Field label="City" htmlFor="city">
                    <Input id="city" name="city" defaultValue={store.city} />
                    <FieldError name="city" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Province" htmlFor="province">
                      <Select id="province" name="province" defaultValue={store.province}>
                        {Object.entries(PROVINCES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Postal code" htmlFor="postalCode">
                      <Input id="postalCode" name="postalCode" defaultValue={store.postalCode} inputMode="numeric" maxLength={4} />
                      <FieldError name="postalCode" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude" htmlFor="lat">
                      <Input id="lat" name="lat" defaultValue={store.lat ?? ""} inputMode="decimal" />
                      <FieldError name="lat" />
                    </Field>
                    <Field label="Longitude" htmlFor="lng">
                      <Input id="lng" name="lng" defaultValue={store.lng ?? ""} inputMode="decimal" />
                    </Field>
                  </div>
                  <Field label="Phone" htmlFor="phone">
                    <Input id="phone" name="phone" defaultValue={store.phone ?? ""} type="tel" />
                  </Field>
                  <Field label="WhatsApp" htmlFor="whatsapp" hint="Utility messages only (collection reminders)">
                    <Input id="whatsapp" name="whatsapp" defaultValue={store.whatsapp ? displayPhone(store.whatsapp) : ""} type="tel" />
                    <FieldError name="whatsapp" />
                  </Field>
                  <Field label="Store email" htmlFor="email">
                    <Input id="email" name="email" defaultValue={store.email ?? ""} type="email" />
                    <FieldError name="email" />
                  </Field>
                  <Field label="Serving distribution centre" htmlFor="dcId">
                    <Select id="dcId" name="dcId" defaultValue={store.dcId ?? ""}>
                      <option value="">None</option>
                      {dcs.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </Select>
                    <FieldError name="dcId" />
                  </Field>
                  <Field label="Receipt footer" htmlFor="receiptFooter" className="sm:col-span-2">
                    <Textarea id="receiptFooter" name="receiptFooter" defaultValue={store.receiptFooter ?? ""} className="min-h-16" />
                  </Field>
                  <div className="flex flex-wrap gap-6 sm:col-span-2">
                    <Checkbox name="clickCollect" defaultChecked={store.clickCollect} label="Click & collect" description="Members can collect online orders here" />
                    <Checkbox name="sameDay" defaultChecked={store.sameDay} label="Same-day delivery" description="Store runs same-day dispatch (ID checked at the door)" />
                  </div>
                </fieldset>
                {editProfile && (
                  <div className="mt-5 flex justify-end">
                    <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Owner"
              description={store.company.kind === "FRANCHISOR" ? "The franchisor (HQ): its details print on tax invoices, the legal pages and emails" : "Franchisee company: merchant of record for this store"}
              action={store.company.vatNumber ? <Badge tone="green">VAT vendor</Badge> : <Badge tone="amber">Not VAT registered</Badge>}
            />
            <CardBody>
              <ActionForm action={saveCompany.bind(null, store.companyId, store.code)}>
                <fieldset disabled={!admin} className="min-w-0 space-y-3">
                  <Field label="Registered name" htmlFor="legalName">
                    <Input id="legalName" name="legalName" defaultValue={store.company.legalName} />
                    <FieldError name="legalName" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Reg. number" htmlFor="regNumber">
                      <Input id="regNumber" name="regNumber" defaultValue={store.company.regNumber ?? ""} />
                    </Field>
                    <Field label="VAT number" htmlFor="vatNumber" hint={store.company.vatNumber ? undefined : "Blank = plain invoices, no VAT"}>
                      <Input id="vatNumber" name="vatNumber" defaultValue={store.company.vatNumber ?? ""} inputMode="numeric" />
                      <FieldError name="vatNumber" />
                    </Field>
                  </div>
                  <Field label="Contact person" htmlFor="contactName">
                    <Input id="contactName" name="contactName" defaultValue={store.company.contactName ?? ""} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Email (statements)" htmlFor="coEmail">
                      <Input id="coEmail" name="email" type="email" defaultValue={store.company.email ?? ""} />
                      <FieldError name="email" />
                    </Field>
                    <Field label="Phone" htmlFor="coPhone">
                      <Input id="coPhone" name="phone" defaultValue={store.company.phone ?? ""} />
                    </Field>
                  </div>
                  <Field label="Registered address" htmlFor="coAddress">
                    <Input id="coAddress" name="address" defaultValue={store.company.address ?? ""} />
                  </Field>
                  <Field label="Directors" htmlFor="coDirectors" hint={store.company.kind === "FRANCHISOR" ? "Full names, as the membership terms list them (ECTA s43)" : "Full names"}>
                    <Input id="coDirectors" name="directors" defaultValue={store.company.directors ?? ""} autoComplete="off" />
                  </Field>
                  <input type="hidden" name="name" value={store.company.name} />
                </fieldset>
                {admin && (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">Save owner</SubmitButton>
                  </div>
                )}
              </ActionForm>
              {siblings.length > 0 && (
                <div className="mt-4 border-t border-ink-100 pt-3">
                  <div className="mb-1.5 text-xs font-semibold text-ink-500">Also owns</div>
                  <ul className="space-y-1 text-sm">
                    {siblings.map((s) => (
                      <li key={s.code} className="flex items-center justify-between">
                        <Link href={`/hq/stores/${s.code}`} className="font-medium text-ink-800 hover:text-brand-700">
                          {s.name} <span className="font-mono text-xs text-ink-500">{s.code}</span>
                        </Link>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {admin && store.company.kind === "FRANCHISEE" && (
            <Card>
              <CardHeader title="Franchisee owners" description={`Back-office sign-ins for ${store.company.name}, covering every store it owns`} />
              <CardBody className="space-y-4">
                {owners.length === 0 ? (
                  <p className="text-sm text-ink-500">No owner can sign in yet. Add one below.</p>
                ) : (
                  <ul className="divide-y divide-ink-100" aria-label="Owners">
                    {owners.map((o) => (
                      <li key={o.id} className={`py-3 first:pt-0 ${o.active ? "" : "opacity-70"}`}>
                        <div className="flex items-start gap-3">
                          <Avatar name={o.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 font-medium text-ink-900">
                              {o.name}
                              <Badge tone={o.active ? "green" : "neutral"} dot>{o.active ? "Active" : "Deactivated"}</Badge>
                            </div>
                            <div className="truncate text-xs text-ink-500">{o.email}</div>
                            <div className="text-xs text-ink-500">{o.lastLoginAt ? `Last signed in ${timeAgo(o.lastLoginAt)}` : `Never signed in · added ${fmtDate(o.createdAt)}`}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-start gap-2 pl-11">
                          {o.active && (
                            <ConfirmAction action={resetOwnerPassword.bind(null, store.id, o.id)} label="Reset password" icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />} triggerVariant="ghost" variant="dark" title={`Reset ${o.name}'s password?`} confirmLabel="Reset password" className="text-left">
                              <p>They&apos;re signed out everywhere and get a new temporary password, shown here once.</p>
                            </ConfirmAction>
                          )}
                          {o.active ? (
                            <ConfirmAction action={setOwnerActive.bind(null, store.id, o.id, false)} label="Deactivate" icon={<UserMinus className="h-3.5 w-3.5" aria-hidden />} title={`Deactivate ${o.name}?`} confirmLabel="Deactivate" className="text-left">
                              <p>They&apos;re signed out immediately and can&apos;t sign in to any of the company&apos;s stores. Their history stays in the audit log.</p>
                            </ConfirmAction>
                          ) : (
                            <ActionButton action={setOwnerActive.bind(null, store.id, o.id, true)} pendingLabel="Restoring…">
                              Reactivate
                            </ActionButton>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <ActionForm action={addOwner.bind(null, store.id)} resetOnSuccess className="space-y-3 border-t border-ink-100 pt-4">
                  <div className="text-sm font-semibold text-ink-900">Add an owner</div>
                  <Field label="Full name" htmlFor="ownerName">
                    <Input id="ownerName" name="name" autoComplete="off" />
                    <FieldError name="name" />
                  </Field>
                  <Field label="Email" htmlFor="ownerEmail" hint="They sign in with this and a temporary password">
                    <Input id="ownerEmail" name="email" type="email" autoComplete="off" />
                    <FieldError name="email" />
                  </Field>
                  <div className="flex justify-end">
                    <SubmitButton variant="outline" size="sm" pendingLabel="Adding…">Add owner</SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Franchise fees" description="Charged on net sales ex VAT, settled on the monthly statement" />
            <CardBody>
              <ActionForm action={saveStoreFees.bind(null, store.id)}>
                <fieldset disabled={!admin} className="min-w-0 grid grid-cols-3 gap-3">
                  {(
                    [
                      ["royalty", "Royalty", store.royaltyBps],
                      ["levy", "Levy", store.levyBps],
                      ["ecom", "E-com", store.ecomBps],
                    ] as const
                  ).map(([n, label, v]) => (
                    <Field key={n} label={label} htmlFor={n}>
                      <div className="relative">
                        <Input id={n} name={n} defaultValue={v / 100} inputMode="decimal" className="pr-7 tnum" />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-500">%</span>
                      </div>
                      <FieldError name={n} />
                    </Field>
                  ))}
                </fieldset>
                <p className="mt-2 text-xs text-ink-500">
                  Currently {bps(store.royaltyBps)} royalty ({store.royaltyBps} bps) + {bps(store.levyBps)} levy ({store.levyBps} bps) on all sales, {bps(store.ecomBps)} ({store.ecomBps} bps) on online sales. The levy funds the marketing fund.
                </p>
                {admin && (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">Update fees</SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Licences" description="Classes this store may sell where a licence is required" />
            <CardBody>
              <ActionForm action={saveLicences.bind(null, store.id)}>
                <fieldset disabled={!admin} className="min-w-0 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {CLASSES.map((cl) => (
                      <Checkbox key={cl} name="licences" value={cl} defaultChecked={asList(store.licences).includes(cl)} label={REG_CLASS_LABEL[cl]} />
                    ))}
                  </div>
                  <Field label="Licence / permit reference" htmlFor="licenceRef" hint="Printed on receipts and tax invoices">
                    <Input id="licenceRef" name="licenceRef" defaultValue={store.licenceRef ?? ""} />
                    <FieldError name="licenceRef" />
                  </Field>
                </fieldset>
                {admin && (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">Save licences</SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status" description={`${users} active staff logins · ${store.kind === "WAREHOUSE" ? "distribution centre" : "retail store"}`} />
            <CardBody>
              <ActionForm action={saveStoreStatus.bind(null, store.id)}>
                <fieldset disabled={!admin} className="min-w-0 grid grid-cols-2 gap-3">
                  <Field label="Status" htmlFor="status">
                    <Select id="status" name="status" defaultValue={store.status}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{titleCase(s)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Opened" htmlFor="openedAt">
                    <Input id="openedAt" name="openedAt" type="date" defaultValue={dayInput(store.openedAt)} />
                  </Field>
                </fieldset>
                {admin ? (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">Update status</SubmitButton>
                  </div>
                ) : (
                  <dl className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                    <Detail label="Serving DC">{store.dc?.name ?? "—"}</Detail>
                    <Detail label="Online">{[store.clickCollect && "Click & collect", store.sameDay && "Same-day"].filter(Boolean).join(" · ") || "—"}</Detail>
                  </dl>
                )}
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
