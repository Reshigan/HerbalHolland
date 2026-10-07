import { CreditCard, KeyRound, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { sp1 } from "@/server/store/rules";
import { timeAgo } from "@/lib/format";
import { addStaff, resetPassword, resetPin, setActive, setDispenser, setMemberCard } from "./actions";
import { TEMP_PASSWORD_HOURS } from "@/server/passwords";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { InlineEdit } from "@/components/ui/inline-edit";
import { ReadOnlyNote } from "@/components/store/ui";
import { Drawer } from "@/components/store/drawer";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Flash } from "@/components/hq/flash";

export const metadata = { title: "Team" };
const ROLE: Record<string, string> = { MANAGER: "Store manager", BUDTENDER: "Member advisor", OWNER: "Owner" };

export default async function TeamPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const ownerLevel = user.role === "OWNER" || user.role === "HQ_ADMIN";
  const [staff, owners] = await Promise.all([
    db.user.findMany({ where: { storeId: store.id, role: { in: ["MANAGER", "BUDTENDER"] } }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] }),
    db.user.findMany({ where: { companyId: store.companyId, role: "OWNER" }, select: { id: true, name: true, email: true, lastLoginAt: true } }),
  ]);
  const active = staff.filter((s) => s.active);
  // lastLoginAt isn't written by sign-in, so "last active" also looks at sessions (back office or till PIN) and sales rung up here.
  const ids = staff.map((s) => s.id);
  const [sessions, sold, cards] = await Promise.all([
    db.session.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
    db.sale.groupBy({ by: ["staffId"], where: { storeId: store.id, staffId: { in: ids } }, _max: { createdAt: true } }),
    db.customer.findMany({ where: { id: { in: staff.flatMap((s) => (s.memberId ? [s.memberId] : [])) } }, select: { id: true, memberNo: true } }),
  ]);
  const cardNo = new Map(cards.map((c) => [c.id, c.memberNo]));
  const seen = new Map<string, Date>();
  for (const [id, at] of [...sessions.map((r) => [r.userId, r._max.createdAt] as const), ...sold.map((r) => [r.staffId, r._max.createdAt] as const), ...staff.map((s) => [s.id, s.lastLoginAt] as const)])
    if (id && at && (!seen.has(id) || seen.get(id)! < at)) seen.set(id, at);
  const may = (t: (typeof staff)[number]) => ownerLevel || (user.role === "MANAGER" && (t.role === "BUDTENDER" || t.id === user.id));
  // A manager may link their own card, but only the owner can change or clear it once it's linked.
  const mayLinkCard = (t: (typeof staff)[number]) => may(t) && (ownerLevel || t.id !== user.id || !t.memberId);

  return (
    <>
      <PageHeader
        overline={`Store · ${store.name}`}
        title="Team"
        description="Everyone who works the tills. Staff sign in at a paired POS with a personal 4-digit PIN; managers can also have a back-office login."
        actions={
          canManage && (
            <Drawer label="Add staff" icon={<UserPlus className="h-4 w-4" aria-hidden />} title="Add a team member" description={`Works at ${store.name}`}>
              <ActionForm action={addStaff.bind(null, store.code)} className="space-y-4">
                <Field label="Full name" htmlFor="st-name">
                  <Input id="st-name" name="name" maxLength={80} autoComplete="off" />
                  <FieldError name="name" />
                </Field>
                <Field label="Role" htmlFor="st-role" hint={ownerLevel ? undefined : "Only the owner can add managers"}>
                  <Select id="st-role" name="role" defaultValue="BUDTENDER">
                    <option value="BUDTENDER">Member advisor</option>
                    {ownerLevel && <option value="MANAGER">Store manager</option>}
                  </Select>
                  <FieldError name="role" />
                </Field>
                <Field label="Till PIN (4 digits)" htmlFor="st-pin" hint="No repeated or running digits. Share it in person.">
                  <Input id="st-pin" name="pin" inputMode="numeric" maxLength={4} autoComplete="off" className="tnum tracking-[0.4em]" />
                  <FieldError name="pin" />
                </Field>
                <fieldset className="space-y-3 rounded-2xl bg-ink-50 p-4">
                  <legend className="sr-only">Back-office login</legend>
                  <p className="text-xs font-semibold text-ink-700">Back-office login (optional)</p>
                  <Field label="Work email" htmlFor="st-email">
                    <Input id="st-email" name="email" type="email" maxLength={120} autoComplete="off" />
                    <FieldError name="email" />
                  </Field>
                  <Field label="Temporary password" htmlFor="st-pass" hint={`At least 10 characters, without their name or email. They choose their own at first sign-in, within ${TEMP_PASSWORD_HOURS} hours.`}>
                    <Input id="st-pass" name="password" type="password" autoComplete="new-password" />
                    <FieldError name="password" />
                  </Field>
                </fieldset>
                {ownerLevel && (
                  <Checkbox name="canDispense" label="Authorised dispenser" description="May complete sales of licensed medicines (SAHPRA). Only tick for your responsible pharmacist or trained, authorised staff." />
                )}
                <SubmitButton className="w-full" pendingLabel="Adding…">Add to team</SubmitButton>
              </ActionForm>
            </Drawer>
          )
        }
      />

      <Flash message={sp1(sp.m) || undefined} />
      <Notice tone="info" className="mb-6">
        {active.filter((s) => s.canDispense).length} of {active.length} active staff are authorised dispensers. Licensed medicines can only be sold when one of them is signed in at the till.
      </Notice>

      <Card>
        {staff.length === 0 ? (
          <EmptyState icon={<UsersRound className="h-5 w-5" />} title="No staff yet" />
        ) : (
          <Table density="comfortable" stickyFirst minWidth="56rem">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th className="whitespace-nowrap">Last active</Th>
                <Th>Status</Th>
                {canManage && <Th><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <Tr key={s.id} className={!s.active ? "text-ink-500" : undefined}>
                  <Td className="min-w-48">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} className={!s.active ? "opacity-50" : undefined} />
                      <div>
                        <div className="font-medium text-ink-900">
                          {s.name}
                          {s.id === user.id && <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>}
                        </div>
                        <div className="text-xs text-ink-500">{s.email ?? "Till PIN only"}</div>
                        {s.memberId && cardNo.get(s.memberId) && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-500">
                            <CreditCard className="h-3 w-3" aria-hidden /> Own Rewards card <span className="font-mono text-ink-700">{cardNo.get(s.memberId)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={s.role === "MANAGER" ? "dark" : "neutral"}>{ROLE[s.role]}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.canDispense && (
                        <Badge tone="green">
                          <ShieldCheck className="h-3 w-3" aria-hidden /> Dispenser
                        </Badge>
                      )}
                      {!s.pinHash && s.active && <Badge tone="amber">No PIN</Badge>}
                      {s.email && <Badge tone="blue">Back office</Badge>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{seen.get(s.id) ? timeAgo(seen.get(s.id)!) : <span className="text-ink-500">Not yet</span>}</Td>
                  <Td>{s.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</Td>
                  {canManage && (
                    <Td className="text-right">
                      {may(s) && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {s.active && (
                            <InlineEdit
                              variant="button"
                              action={resetPin.bind(null, store.code, s.id)}
                              secret
                              fields={[{ name: "pin", label: "New 4-digit PIN", value: "", type: "password", inputMode: "numeric", maxLength: 4, placeholder: "••••", width: "w-24", className: "tracking-[0.35em]" }]}
                              display={<><KeyRound className="h-3.5 w-3.5" aria-hidden /> {s.pinHash ? "Reset PIN" : "Set PIN"}</>}
                              editLabel={`New till PIN for ${s.name}`}
                              saveLabel="Save PIN"
                            />
                          )}
                          {s.active && s.email && s.id !== user.id && (
                            <ConfirmAction
                              action={resetPassword.bind(null, store.code, s.id)}
                              label="Reset password"
                              icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />}
                              title={`Reset ${s.name}'s password?`}
                              confirmLabel="Reset password"
                              variant="dark"
                              className="min-w-64"
                            >
                              They&apos;re signed out of the back office and get a temporary password, shown here once.
                            </ConfirmAction>
                          )}
                          {s.active && mayLinkCard(s) && (
                            <ConfirmAction
                              action={setMemberCard.bind(null, store.code, s.id)}
                              label={s.memberId ? "Change card" : "Link card"}
                              icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />}
                              title={`${s.name}'s own Rewards card`}
                              confirmLabel="Save card"
                              variant="dark"
                              className="min-w-72"
                            >
                              <p>Sales they ring onto their own card are flagged and don&apos;t earn commission.</p>
                              <Field label="Member number" htmlFor={`card-${s.id}`} hint={s.memberId ? "Clear it to unlink the card" : "Optional, from their Rewards card or app"}>
                                <Input id={`card-${s.id}`} name="memberNo" defaultValue={(s.memberId && cardNo.get(s.memberId)) || ""} placeholder="HH0123456" autoComplete="off" maxLength={24} className="font-mono uppercase" />
                                <FieldError name="memberNo" />
                              </Field>
                            </ConfirmAction>
                          )}
                          {ownerLevel && s.active && (
                            <ActionButton action={setDispenser.bind(null, store.code, s.id, !s.canDispense)} variant="ghost">
                              {s.canDispense ? "Remove dispenser" : "Make dispenser"}
                            </ActionButton>
                          )}
                          {s.id !== user.id &&
                            (s.active ? (
                              <ConfirmAction action={setActive.bind(null, store.code, s.id, false)} label="Deactivate" title={`Deactivate ${s.name}?`} confirmLabel="Deactivate" className="min-w-64">
                                They&apos;re signed out of every till and the back office straight away. Their sales history is kept.
                              </ConfirmAction>
                            ) : (
                              <ActionButton action={setActive.bind(null, store.code, s.id, true)} variant="outline">Reactivate</ActionButton>
                            ))}
                        </div>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Owners" description={`Owners of ${store.company.legalName} see every store in the company`} />
        <div className="flex flex-wrap gap-3 p-5">
          {owners.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-xl border border-ink-150 px-3 py-2">
              <Avatar name={o.name} />
              <div className="text-sm">
                <div className="font-medium text-ink-900">{o.name}</div>
                <div className="text-xs text-ink-500">{o.email}</div>
              </div>
            </div>
          ))}
          {!owners.length && <p className="text-sm text-ink-500">No owner login on file.</p>}
        </div>
        {!canManage && <ReadOnlyNote className="m-5 mt-0" />}
      </Card>
    </>
  );
}
