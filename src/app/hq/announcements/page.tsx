import Link from "next/link";
import { Bell, CheckCircle2, Clock } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { fmtDateTime, num, timeAgo } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/stat";
import { Field, Input, Textarea, Checkbox, Select } from "@/components/ui/form";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { KIND_TONE } from "@/components/hq/tones";
import { createAnnouncement } from "./actions";
import type { Prisma, StoreFormat } from "@/generated/prisma/client";

export const metadata = { title: "Announcements" };

/** Stores an audience string addresses, within the user's scope. */
function audienceWhere(audience: string, ids: string[]): Prisma.StoreWhereInput {
  const base: Prisma.StoreWhereInput = { id: { in: ids }, kind: "RETAIL", status: { not: "CLOSED" } };
  const [type, value] = audience.split(":");
  if (type === "region") return { ...base, region: { code: value } };
  if (type === "format") return { ...base, format: value as StoreFormat };
  return base;
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ a?: string; created?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const regions = await db.region.findMany({ orderBy: { name: "asc" } });
  const audienceLabel = (a: string) => {
    const [type, value] = a.split(":");
    if (type === "region") return regions.find((r) => r.code === value)?.name ?? value;
    if (type === "format") return `${value.charAt(0)}${value.slice(1).toLowerCase()} stores`;
    return "All stores";
  };

  if (sp.a) {
    const a = await db.announcement.findUnique({ where: { id: sp.a } });
    if (a) {
      const [stores, acks] = await Promise.all([
        db.store.findMany({ where: audienceWhere(a.audience, ids), select: { id: true, code: true, name: true, region: { select: { name: true } } }, orderBy: { name: "asc" } }),
        db.announcementAck.findMany({ where: { announcementId: a.id, storeId: { in: ids } } }),
      ]);
      const ackBy = new Map(acks.map((x) => [x.storeId, x]));
      const users = new Map((await db.user.findMany({ where: { id: { in: acks.flatMap((x) => (x.userId ? [x.userId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      const pending = stores.filter((s) => !ackBy.has(s.id));
      const done = stores.filter((s) => ackBy.has(s.id)).sort((x, y) => ackBy.get(y.id)!.at.getTime() - ackBy.get(x.id)!.at.getTime());
      return (
        <>
          <BackLink href="/hq/announcements">Announcements</BackLink>
          <PageHeader
            overline={`${a.kind.toLowerCase()} · ${audienceLabel(a.audience)} · ${fmtDateTime(a.createdAt)}`}
            title={
              <span className="inline-flex flex-wrap items-center gap-3">
                {a.title}
                <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{a.kind.toLowerCase()}</Badge>
              </span>
            }
          />
          {sp.created && <Notice tone="success" className="mb-6">Published. It shows on every store&apos;s dashboard{a.requiresAck ? " until a manager acknowledges it" : ""}.</Notice>}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Message" />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{a.body}</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={a.requiresAck ? "Acknowledgements" : "Read receipts"} description={a.requiresAck ? `${done.length} of ${stores.length} stores` : "This notice doesn't need acknowledging"} />
              <CardBody className="space-y-4">
                {a.requiresAck && <Meter value={done.length} max={Math.max(1, stores.length)} tone={pending.length ? "amber" : "green"} />}
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> Not yet acknowledged ({pending.length})
                  </div>
                  {pending.length === 0 ? (
                    <p className="text-sm text-leaf-700">Every store has acknowledged it.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {pending.map((s) => (
                        <li key={s.id} className="flex justify-between gap-3">
                          <Link href={`/hq/stores/${s.code}`} className="text-ink-850 hover:text-brand-700">{s.name}</Link>
                          <span className="text-xs text-ink-500">{s.region.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {done.length > 0 && (
                  <div className="border-t border-ink-100 pt-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-leaf-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Acknowledged ({done.length})
                    </div>
                    <ul className="space-y-1 text-sm">
                      {done.map((s) => {
                        const x = ackBy.get(s.id)!;
                        return (
                          <li key={s.id} className="flex justify-between gap-3">
                            <span className="text-ink-700">{s.name}</span>
                            <span className="text-right text-xs text-ink-500">{x.userId ? `${users.get(x.userId) ?? "Staff"} · ` : ""}{timeAgo(x.at)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      );
    }
  }

  const page = pageParam(sp.page);
  const pageSize = 15;
  const [total, list] = await Promise.all([
    db.announcement.count(),
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const audiences = [...new Set(list.map((a) => a.audience))];
  const [sizes, ackCounts] = await Promise.all([
    Promise.all(audiences.map((a) => db.store.count({ where: audienceWhere(a, ids) }))),
    db.announcementAck.groupBy({ by: ["announcementId"], where: { announcementId: { in: list.map((a) => a.id) }, storeId: { in: ids } }, _count: true }),
  ]);
  const size = new Map(audiences.map((a, i) => [a, sizes[i]]));
  const acked = new Map(ackCounts.map((x) => [x.announcementId, x._count]));
  const network = can(user, "network");

  return (
    <>
      <PageHeader overline="Governance" title="Announcements" description="News, launches, policy changes and recalls for store teams. They appear on each store's dashboard; policies and recalls must be acknowledged by a manager." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <ul className="divide-y divide-ink-100">
            {list.length === 0 && (
              <li className="px-5 py-14 text-center text-sm text-ink-500">
                <Bell className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No announcements yet.
              </li>
            )}
            {list.map((a) => {
              const n = size.get(a.audience) ?? 0;
              const k = acked.get(a.id) ?? 0;
              return (
                <li key={a.id}>
                  <Link href={`/hq/announcements${qs({ a: a.id })}`} className="block px-5 py-4 transition hover:bg-brand-50/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{a.kind.toLowerCase()}</Badge>
                        <span className="truncate font-medium text-ink-900">{a.title}</span>
                      </span>
                      <span className="text-xs text-ink-500">{timeAgo(a.createdAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-600">{a.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                      <span>{audienceLabel(a.audience)}</span>
                      {a.requiresAck ? (
                        <span className="flex items-center gap-2">
                          <span className="w-24">
                            <Meter value={k} max={Math.max(1, n)} tone={k >= n ? "green" : "amber"} />
                          </span>
                          <span className={`whitespace-nowrap ${k >= n ? "text-leaf-700" : "text-amber-700"}`}>
                            {num(k)} / {num(n)} acknowledged
                          </span>
                        </span>
                      ) : (
                        <span>No acknowledgement needed</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={pageSize} total={total} href={(p) => `/hq/announcements${qs({ page: p })}`} />
        </Card>
        <Card>
          <CardHeader title="New announcement" />
          <CardBody>
            {!network ? (
              <ViewOnly>Announcements are published by the HQ team.</ViewOnly>
            ) : (
              <ActionForm action={createAnnouncement} className="space-y-4">
                <Field label="Title" htmlFor="title">
                  <Input id="title" name="title" placeholder="e.g. New ID-check policy from 1 October" />
                  <FieldError name="title" />
                </Field>
                <Field label="Message" htmlFor="body">
                  <Textarea id="body" name="body" className="min-h-32" />
                  <FieldError name="body" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" htmlFor="kind">
                    <Select id="kind" name="kind" defaultValue="NEWS">
                      <option value="NEWS">News</option>
                      <option value="LAUNCH">Launch</option>
                      <option value="POLICY">Policy</option>
                      <option value="RECALL">Recall</option>
                    </Select>
                    <FieldError name="kind" />
                  </Field>
                  <Field label="Audience" htmlFor="audience">
                    <Select id="audience" name="audience" defaultValue="ALL">
                      <option value="ALL">All stores</option>
                      <optgroup label="Region">
                        {regions.map((r) => (
                          <option key={r.id} value={`region:${r.code}`}>{r.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Format">
                        <option value="format:FLAGSHIP">Flagship stores</option>
                        <option value="format:STANDARD">Standard stores</option>
                        <option value="format:EXPRESS">Express stores</option>
                      </optgroup>
                    </Select>
                    <FieldError name="audience" />
                  </Field>
                </div>
                <Checkbox name="requiresAck" label="Managers must acknowledge" description="Stays on the store dashboard until acknowledged. Always on for policies and recalls." />
                <SubmitButton className="w-full" pendingLabel="Publishing…">
                  Publish to stores
                </SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
