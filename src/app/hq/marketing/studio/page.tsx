import Link from "next/link";
import { QrCode, Sparkles } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { socialConnected } from "@/server/social";
import { aiReady } from "@/server/studio-ai";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { longDate, STUDIO_CHANNELS, WEEKDAYS, type StudioChannel } from "@/lib/studio";
import { dayKey, fmtDate } from "@/lib/format";
import { plural } from "@/lib/plural";
import { Notice, PageHeader } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ViewOnly } from "@/components/hq/ui";
import { MarketingTabs } from "../tabs";
import { clearFirstAccess, createLaunchPlans, createStudioPlan, importFirstAccess } from "./actions";
import { LAUNCH_GAPS } from "@/server/studio";
import { earlyAccessCount } from "@/server/early-access";

export const metadata = { title: "Studio" };

const PAGE = 15;

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireStaff(HQ_ROLES);
  const page = pageParam((await searchParams).page);
  const [total, plans, stores, firstAccess] = await Promise.all([
    db.studioPlan.count(),
    db.studioPlan.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { store: { select: { name: true } } } }),
    // A store opening is laid out for a store that's opening soon (there are only ever a few).
    db.store.findMany({ where: { kind: "RETAIL", status: "OPENING_SOON" }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" }, take: 50 }),
    earlyAccessCount(),
  ]);
  const counts = await db.studioItem.groupBy({ by: ["planId", "status"], where: { planId: { in: plans.map((p) => p.id) } }, _count: true });
  const tally = (planId: string, ...status: string[]) => counts.filter((c) => c.planId === planId && status.includes(c.status)).reduce((n, c) => n + c._count, 0);

  return (
    <>
      <PageHeader
        overline="Members"
        title="Studio"
        description="Whole campaigns, laid out from one day: brand-safe posts with their cards for social, the WhatsApp Channel and Google, and the messages members get by email, SMS and push. Read them, approve them, and the Studio schedules each one on its channel."
        actions={
          <ButtonLink href="/hq/marketing/studio/qr" variant="outline" size="sm">
            <QrCode className="h-4 w-4" aria-hidden /> QR codes and links
          </ButtonLink>
        }
      />
      <MarketingTabs current="studio" />
      {!(await socialConnected()) && (
        <Notice tone="info" title="No social network is connected" className="mb-5">
          Social posts wait in the list for you to post by hand (copy the words, download the card). Connect the networks and the Studio posts them for you. See docs/INTEGRATIONS.md.
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-2">
          {can(user, "network") && (
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold text-ink-900">The launch</h2>
              <p className="mt-1 text-sm text-ink-500">In its order: the brand first, then the online shop, then the stores&apos; doors. Each campaign is laid out from its own day, and each day comes after the one before.</p>
              <ActionForm action={createLaunchPlans} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="1 · Brand launch" htmlFor="brand" hint="A Tuesday, two weeks or more before the shop.">
                    <Input id="brand" name="brand" type="date" required min={dayKey(new Date())} />
                  </Field>
                  <Field label="2 · Shop opens" htmlFor="shop" hint="A Tuesday.">
                    <Input id="shop" name="shop" type="date" required min={dayKey(new Date())} />
                  </Field>
                  <Field label="3 · Doors open" htmlFor="doors" hint={`A Tuesday, ${LAUNCH_GAPS.doors} days or more after the shop.`}>
                    <Input id="doors" name="doors" type="date" required min={dayKey(new Date())} />
                  </Field>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-ink-700">Stores that open</legend>
                  {stores.length ? (
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                      {stores.map((s) => (
                        <Checkbox key={s.id} name="storeIds" value={s.id} defaultChecked label={s.name} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-ink-500">No store is opening soon. Set a store to Opening soon in HQ → Stores first.</p>
                  )}
                </fieldset>
                <SubmitButton pendingLabel="Laying it out…" disabled={!stores.length}>
                  Lay out the launch
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
          {can(user, "network") ? (
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold text-ink-900">New campaign</h2>
              <p className="mt-1 text-sm text-ink-500">Pick a playbook and its day T. Every post is placed around that day, filled in for the store, and checked against the brand and platform rules.</p>
              <ActionForm action={createStudioPlan} className="mt-4 space-y-4">
                <Field label="Campaign" htmlFor="playbook">
                  <Select id="playbook" name="playbook" required defaultValue="">
                    <option value="" disabled>
                      Choose a playbook
                    </option>
                    {PLAYBOOKS.filter((p) => !p.date || p.date >= dayKey(new Date())).map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.date ? `${p.name} (from ${longDate(p.date)})` : `${p.name} (day T: ${p.anchor.toLowerCase()}${p.weekday !== undefined ? `, a ${WEEKDAYS[p.weekday]}` : ""})`}
                      </option>
                    ))}
                  </Select>
                  <FieldError name="playbook" />
                </Field>
                <Field label="Store" htmlFor="storeId" hint="Store openings only: the stores opening soon.">
                  <Select id="storeId" name="storeId" defaultValue="">
                    <option value="">No store (a network campaign)</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}, {s.city}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Product" htmlFor="product" hint="Product launches only: its page address (slug) or a SKU.">
                  <Input id="product" name="product" autoComplete="off" />
                </Field>
                <Field label="Day T" htmlFor="anchor" hint="Month campaigns keep their own dates.">
                  <Input id="anchor" name="anchor" type="date" min={dayKey(new Date())} />
                </Field>
                <SubmitButton pendingLabel="Laying it out…">Lay it out</SubmitButton>
              </ActionForm>
            </Card>
          ) : null}
          {can(user, "network") ? (
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold text-ink-900">First-access list</h2>
              <p className="mt-1 text-sm text-ink-500">
                {firstAccess ? `${plural(firstAccess, "person", "people")} waiting to hear the shop is open.` : "Nobody on it."} Paste the export from herbalholland.com (docs/RUNBOOK.md): the online shop launch tells each person once, on opening day, and their sign-up is deleted as their message goes.
              </p>
              <ActionForm action={importFirstAccess} className="mt-4 space-y-3">
                <Field label="The export (JSON or CSV)" htmlFor="firstAccessList">
                  <Textarea id="firstAccessList" name="list" rows={4} required className="font-mono text-xs" />
                </Field>
                <SubmitButton size="sm" pendingLabel="Importing…">Import</SubmitButton>
              </ActionForm>
              {firstAccess > 0 && (
                <ActionForm action={clearFirstAccess} className="mt-3">
                  <SubmitButton size="sm" variant="ghost" pendingLabel="Deleting…">Delete the list</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ) : (
            <ViewOnly>Campaigns are laid out and approved by HQ marketing.</ViewOnly>
          )}
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Playbooks</h2>
            <ul className="mt-3 space-y-4">
              {PLAYBOOKS.map((p) => {
                const by = Object.entries(Object.groupBy(p.items, (i) => i.channel)) as [StudioChannel, unknown[]][];
                return (
                  <li key={p.key}>
                    <p className="font-semibold text-ink-900">{p.name}</p>
                    <p className="text-sm text-ink-600">{p.blurb}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      Day T: {p.anchor} · {by.map(([c, xs]) => `${xs.length} ${STUDIO_CHANNELS[c].label}`).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
            {aiReady() && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI drafting is on: any post can be rewritten in the brand&apos;s voice, then checked like the rest.
              </p>
            )}
          </Card>
        </div>
        <Card className="self-start xl:col-span-3">
          <CardHeader title="Campaigns" description="Newest first." />
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Day T</Th>
                <Th align="right">Out or queued</Th>
                <Th align="right">To do</Th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 && <TableEmpty cols={4} title="No campaigns yet">Lay one out from a playbook.</TableEmpty>}
              {plans.map((p) => {
                const out = tally(p.id, "POSTED", "SCHEDULED");
                const todo = tally(p.id, "DRAFT", "APPROVED", "FAILED");
                return (
                  <Tr key={p.id} href={`/hq/marketing/studio/${p.id}`}>
                    <Td>
                      <Link href={`/hq/marketing/studio/${p.id}`} className="font-semibold text-ink-900 hover:underline">
                        {p.name}
                      </Link>
                      {p.paused && (
                        <Badge tone="amber" className="ml-2">
                          Paused
                        </Badge>
                      )}
                      <p className="text-xs text-ink-500">{p.createdBy ? `By ${p.createdBy}` : ""}</p>
                    </Td>
                    <Td className="tnum whitespace-nowrap">{fmtDate(`${p.anchor}T10:00:00Z`)}</Td>
                    <Td align="right" className="tnum">{out}</Td>
                    <Td align="right">{todo ? <Badge tone="amber">{plural(todo, "post")}</Badge> : <Badge tone="green">Done</Badge>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={total} href={(n) => `/hq/marketing/studio?page=${n}`} />
        </Card>
      </div>
    </>
  );
}
