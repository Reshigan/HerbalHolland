import { KeyRound, UserMinus, UserPlus } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { fmtDate, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Select } from "@/components/hq/select";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/hq/action-form";
import { ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { addUser, resetPassword, setUserActive } from "./actions";

export const metadata = { title: "Team" };

const ROLE: Record<string, [string, Tone, string]> = {
  HQ_ADMIN: ["HQ administrator", "dark", "Everything, incl. compliance, fees, users and POPIA requests"],
  HQ_STAFF: ["HQ team", "orange", "Catalogue, pricing, promotions, campaigns, distribution"],
  AREA_MANAGER: ["Area manager", "blue", "Their region's stores, members and orders (view + drafts)"],
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const [users, regions, storeCounts] = await Promise.all([
    db.user.findMany({ where: { role: { in: ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"] } }, include: { region: { select: { name: true } } }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] }),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.store.groupBy({ by: ["regionId"], where: { kind: "RETAIL", id: { in: ids } }, _count: true }),
  ]);
  const admin = can(user, "admin");

  return (
    <>
      <PageHeader overline="Governance" title="Team" description="HQ staff and area managers. Store teams are managed by each store's owner or manager in the back office." />
      <Flash message={sp.m} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table className="relative">
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th className="hidden md:table-cell">Last sign-in</Th>
                <Th align="right">{admin ? "Actions" : "Status"}</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id} className={u.active ? undefined : "opacity-60"}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <div className="min-w-0">
                        <div className="font-medium text-ink-900">
                          {u.name}
                          {u.id === user.id && <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>}
                        </div>
                        <div className="truncate text-xs text-ink-500">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={ROLE[u.role][1]}>{ROLE[u.role][0]}</Badge>
                    {u.region && (
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {u.region.name} · {storeCounts.find((c) => c.regionId === u.regionId)?._count ?? 0} stores
                      </span>
                    )}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">
                    {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span className="text-ink-400">Never</span>}
                    <span className="block text-xs text-ink-400">added {fmtDate(u.createdAt)}</span>
                  </Td>
                  <Td align="right">
                    {!admin || u.id === user.id ? (
                      <Badge tone={u.active ? "green" : "neutral"} dot>
                        {u.active ? "Active" : "Deactivated"}
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap items-start justify-end gap-2">
                        {u.active && (
                          <ConfirmAction action={resetPassword.bind(null, u.id)} label="Reset password" icon={<KeyRound className="h-3.5 w-3.5" />} triggerVariant="ghost" variant="dark" title={`Reset ${u.name}'s password?`} confirmLabel="Reset password" className="max-w-xs text-left">
                            <p>They&apos;re signed out everywhere and get a new temporary password, shown here once.</p>
                          </ConfirmAction>
                        )}
                        {u.active ? (
                          <ConfirmAction action={setUserActive.bind(null, u.id, false)} label="Deactivate" icon={<UserMinus className="h-3.5 w-3.5" />} title={`Deactivate ${u.name}?`} confirmLabel="Deactivate" className="max-w-xs text-left">
                            <p>They&apos;re signed out immediately and can&apos;t sign in. Their history stays in the audit log.</p>
                          </ConfirmAction>
                        ) : (
                          <ActionButton action={setUserActive.bind(null, u.id, true)} pendingLabel="Restoring…">
                            Reactivate
                          </ActionButton>
                        )}
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-oranje-700" /> Add a person
                </span>
              }
              description="They get a temporary password to sign in with"
            />
            <CardBody>
              {!admin ? (
                <ViewOnly>Only the HQ administrator adds people.</ViewOnly>
              ) : (
                <ActionForm action={addUser} resetOnSuccess className="space-y-4">
                  <Field label="Full name" htmlFor="name">
                    <Input id="name" name="name" autoComplete="off" />
                    <FieldError name="name" />
                  </Field>
                  <Field label="Work email" htmlFor="email">
                    <Input id="email" name="email" type="email" autoComplete="off" placeholder="name@herbalholland.co.za" />
                    <FieldError name="email" />
                  </Field>
                  <Field label="Role" htmlFor="role">
                    <Select id="role" name="role" defaultValue="HQ_STAFF">
                      <option value="HQ_STAFF">HQ team</option>
                      <option value="AREA_MANAGER">Area manager</option>
                      <option value="HQ_ADMIN">HQ administrator</option>
                    </Select>
                    <FieldError name="role" />
                  </Field>
                  <Field label="Region" htmlFor="regionId" hint="Area managers only">
                    <Select id="regionId" name="regionId" defaultValue="">
                      <option value="">—</option>
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Select>
                    <FieldError name="regionId" />
                  </Field>
                  <SubmitButton className="w-full" pendingLabel="Adding…">
                    Add and create password
                  </SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="What each role can do" />
            <CardBody className="space-y-3">
              {Object.entries(ROLE).map(([k, [label, tone, what]]) => (
                <div key={k}>
                  <Badge tone={tone}>{label}</Badge>
                  <p className="mt-1 text-xs text-ink-600">{what}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
