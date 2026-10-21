import { Bell, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { plural, readHours, WEEK } from "@/server/store/rules";
import { REG_CLASS_LABEL, type RegClass } from "@/lib/compliance";
import { bps } from "@/lib/money";
import { displayPhone, PROVINCES } from "@/lib/sa";
import { fmtDate, timeAgo } from "@/lib/format";
import { disableStaffPush, enableStaffPush, revokeDevice, saveHours, saveStoreDetails } from "./actions";
import { StaffPushToggle } from "@/components/store/push-toggle";
import { STAFF_PUSH_ROLES, staffDeviceCount, staffVapidKey } from "@/server/staff-push";
import { HoursEditor } from "./hours-editor";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Line, ReadOnlyNote } from "@/components/store/ui";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { asList } from "@/lib/json-list";

export const metadata = { title: "Store settings" };

export default async function SettingsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const devices = await db.device.findMany({ where: { storeId: store.id }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  const live = devices.filter((d) => d.active);
  const revoked = devices.filter((d) => !d.active).sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0));
  const hours = readHours(store.hours);
  const pushRole = STAFF_PUSH_ROLES.includes(user.role);
  const pushDevices = pushRole ? await staffDeviceCount(user.id) : 0;

  return (
    <>
      <PageHeader
        overline={`Store · ${store.name}`}
        title="Settings"
        description={`${store.addressLine}, ${store.suburb}, ${store.city}, ${PROVINCES[store.province]} ${store.postalCode}. Address, licences and commercial terms are managed by HQ.`}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Store details" description="Shown on the website, store finder, receipts and order messages. A changed day of trading hours can be saved on its own from its row." />
          <CardBody>
            {canManage ? (
              <ActionForm action={saveStoreDetails.bind(null, store.code)} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-[1fr_1fr_1.4fr]">
                  <Field label="Phone" htmlFor="s-phone">
                    <Input id="s-phone" name="phone" type="tel" defaultValue={store.phone ?? ""} placeholder="012 345 6789" />
                    <FieldError name="phone" />
                  </Field>
                  <Field label="WhatsApp (mobile)" htmlFor="s-wa" hint="For service messages to members only">
                    <Input id="s-wa" name="whatsapp" type="tel" defaultValue={store.whatsapp ? displayPhone(store.whatsapp) : ""} placeholder="071 234 5678" />
                    <FieldError name="whatsapp" />
                  </Field>
                  <Field label="Email" htmlFor="s-email" className="sm:col-span-2 2xl:col-span-1">
                    <Input id="s-email" name="email" type="email" defaultValue={store.email ?? ""} />
                    <FieldError name="email" />
                  </Field>
                </div>
                <HoursEditor initial={hours} saveDay={Object.fromEntries(WEEK.map(([k]) => [k, saveHours.bind(null, store.code, k)]))} />
                <FieldError name="hours" />
                <fieldset className="grid gap-3 rounded-2xl bg-ink-50 p-4 sm:grid-cols-2">
                  <legend className="sr-only">Online fulfilment</legend>
                  <Checkbox name="clickCollect" defaultChecked={store.clickCollect} label="Click & collect" description="Members can order online and collect here. Turn off during stock takes or renovations." />
                  <Checkbox name="sameDay" defaultChecked={store.sameDay} label="Same-day delivery" description="This store may be picked for same-day orders within 30 km." />
                </fieldset>
                <Field label="PayShap ShapID" htmlFor="s-shapid" hint="The ShapID your bank issued for this store's account. The tills offer PayShap only while one is set: leave it empty to switch PayShap off.">
                  <Input id="s-shapid" name="payshapId" defaultValue={store.payshapId ?? ""} maxLength={60} autoComplete="off" spellCheck={false} className="max-w-sm font-mono" />
                  <FieldError name="payshapId" />
                </Field>
                <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
              </ActionForm>
            ) : (
              <div className="space-y-4">
                <div>
                  <Line label="Phone" value={store.phone ?? "—"} />
                  <Line label="WhatsApp" value={store.whatsapp ? displayPhone(store.whatsapp) : "—"} />
                  <Line label="Email" value={store.email ?? "—"} />
                  <Line label="Click & collect" value={store.clickCollect ? "On" : "Off"} />
                  <Line label="Same-day delivery" value={store.sameDay ? "On" : "Off"} />
                  <Line label="PayShap ShapID" value={store.payshapId ? <span className="font-mono">{store.payshapId}</span> : "Not set: no PayShap at the till"} />
                </div>
                <div>
                  {WEEK.map(([k, name]) => (
                    <Line key={k} label={name} value={hours[k] ? `${hours[k]!.open}–${hours[k]!.close}` : "Closed"} />
                  ))}
                </div>
                <ReadOnlyNote />
              </div>
            )}
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-6">
          {pushRole && (
            <Card>
              <CardHeader title="Notifications" description="Push notifications to your phone for the stores you look after" action={<Bell className="h-4 w-4 text-brand-600" aria-hidden />} />
              <CardBody className="space-y-3 pt-3">
                <StaffPushToggle vapidKey={staffVapidKey()} devices={pushDevices} enable={enableStaffPush.bind(null, store.code)} disable={disableStaffPush.bind(null, store.code)} />
                <p className="text-xs leading-relaxed text-ink-500">
                  You&apos;ll hear about new online orders as they come in (checked every 5 minutes), loss-prevention alerts about other people, HQ updates that need acknowledging, lots about to expire, cash due at the bank and a daily low-stock digest.
                </p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Licences & VAT" description="Held on record by HQ. Contact HQ to change them." />
            <CardBody className="space-y-4 pt-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <ShieldCheck className="h-4 w-4 text-leaf-600" aria-hidden /> Licensed to sell
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {asList(store.licences).length ? asList(store.licences).map((l) => <Badge key={l} tone="green">{REG_CLASS_LABEL[l as RegClass]}</Badge>) : <span className="text-sm text-ink-500">No licensed classes</span>}
                </div>
                {store.licenceRef && <p className="mt-2 font-mono text-xs text-ink-500">{store.licenceRef}</p>}
              </div>
              <div className="border-t border-ink-100 pt-3">
                <Line label="Company" value={store.company.legalName} />
                <Line label="Registration no." value={store.company.regNumber ?? "—"} />
                <Line label="VAT" value={store.company.vatNumber ? <span className="font-mono">{store.company.vatNumber}</span> : <Badge tone="amber">Not VAT-registered</Badge>} />
                <Line label="Status" value={<StatusBadge status={store.status} />} />
                <Line label="Format" value={store.format.charAt(0) + store.format.slice(1).toLowerCase()} />
                <Line label="Region" value={store.region.name} />
                <Line label="Supplied by" value={store.dc?.name ?? "—"} />
                {store.openedAt && <Line label="Trading since" value={fmtDate(store.openedAt)} />}
              </div>
              <div className="border-t border-ink-100 pt-3">
                <Line label="Royalty" value={bps(store.royaltyBps)} />
                <Line label="Marketing fund levy" value={bps(store.levyBps)} />
                <Line label="E-commerce commission" value={bps(store.ecomBps)} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Paired tills"
              description="Devices that can trade as this store"
              action={canManage && <ButtonLink href="/pos/pair" variant="ghost" size="sm">Pair a till</ButtonLink>}
            />
            <CardBody className="space-y-2 pt-3">
              {devices.length === 0 && <EmptyState className="py-6" icon={<MonitorSmartphone className="h-5 w-5" />} title="No tills paired">Open Pair a till on the device while signed in as a manager or owner.</EmptyState>}
              {live.map((d) => (
                <DeviceRow key={d.id} d={d}>
                  {canManage ? (
                    <ConfirmAction action={revokeDevice.bind(null, store.code, d.id)} label="Revoke" title={`Revoke ${d.name}?`} confirmLabel="Revoke till" className="min-w-56">
                      It stops trading immediately and signs out whoever is on it. Sync any offline sales on it first.
                    </ConfirmAction>
                  ) : (
                    <Badge tone="green" dot>Active</Badge>
                  )}
                </DeviceRow>
              ))}
              {live.length === 0 && revoked.length > 0 && <p className="text-sm text-ink-500">No active tills. Pair one to start trading.</p>}
              {revoked.length > 0 && (
                <details className="group pt-1">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-ink-500 hover:text-ink-800">
                    <span className="group-open:hidden">Show {plural(revoked.length, "revoked till")}</span>
                    <span className="hidden group-open:inline">Hide revoked tills</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    {revoked.map((d) => (
                      <DeviceRow key={d.id} d={d}>
                        <Badge>Revoked</Badge>
                      </DeviceRow>
                    ))}
                  </div>
                </details>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function DeviceRow({ d, children }: { d: { name: string; prefix: string; lastSeenAt: Date | null }; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-150 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink-900">{d.name}</div>
        <div className="text-xs text-ink-500">
          Prefix {d.prefix} · {d.lastSeenAt ? `seen ${timeAgo(d.lastSeenAt)}` : "never used"}
        </div>
      </div>
      {children}
    </div>
  );
}
