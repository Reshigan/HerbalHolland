import { Bell, CheckCircle2, Megaphone, Rocket, ShieldAlert, ScrollText } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { hrefWith, sp1 } from "@/server/store/rules";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { acknowledge } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips } from "@/components/store/ui";
import { ActionButton } from "@/components/store/action-form";
import { cn } from "@/lib/cn";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "HQ updates" };
const PAGE_SIZE = 10;
const KIND: Record<string, { label: string; tone: Tone; icon: typeof Bell }> = {
  RECALL: { label: "Recall", tone: "red", icon: ShieldAlert },
  POLICY: { label: "Policy", tone: "amber", icon: ScrollText },
  LAUNCH: { label: "Launch", tone: "orange", icon: Rocket },
  NEWS: { label: "News", tone: "neutral", icon: Megaphone },
};

export default async function UpdatesPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/updates`;
  const view = sp1(sp.view) === "todo" ? "todo" : "all";
  const page = pageParam(sp.page);
  const audience = { in: ["ALL", `format:${store.format}`, `region:${store.region.code}`] };
  const todo: Prisma.AnnouncementWhereInput = { audience, requiresAck: true, acks: { none: { storeId: store.id } } };
  const where: Prisma.AnnouncementWhereInput = view === "todo" ? todo : { audience };
  const [total, pending, list] = await Promise.all([
    db.announcement.count({ where: { audience } }),
    db.announcement.count({ where: todo }),
    db.announcement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { acks: { where: { storeId: store.id } } } }),
  ]);
  const ackers = await db.user.findMany({ where: { id: { in: list.flatMap((a) => a.acks.map((x) => x.userId)).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const who = new Map(ackers.map((u) => [u.id, u.name]));
  const count = view === "todo" ? pending : total;

  return (
    <>
      <PageHeader overline={`Store · ${store.name}`} title="HQ updates" description="News, launches, policy changes and recalls from Herbal Holland HQ. Some need a manager to confirm the store has read and acted on them." />
      <Chips
        className="mb-4"
        label="Updates"
        current={view}
        items={[
          { key: "all", label: "All updates", count: total, href: hrefWith(path, {}, {}) },
          { key: "todo", label: "Needs acknowledgement", count: pending, tone: pending ? "red" : undefined, href: hrefWith(path, {}, { view: "todo" }) },
        ]}
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title={view === "todo" ? "All caught up" : "No updates yet"}>
            {view === "todo" ? "Every update that needs your acknowledgement has been confirmed." : "HQ announcements for your store will appear here."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((a) => {
            const k = KIND[a.kind] ?? KIND.NEWS;
            const ack = a.acks[0];
            const due = a.requiresAck && !ack;
            return (
              <Card key={a.id} className={cn("overflow-hidden", due && "border-oranje-300 ring-4 ring-oranje-500/10")}>
                <article className="flex gap-4 p-5">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", k.tone === "red" ? "bg-rose-50 text-rose-600" : k.tone === "amber" ? "bg-amber-50 text-amber-700" : k.tone === "orange" ? "bg-oranje-50 text-oranje-700" : "bg-ink-100 text-ink-600")}>
                    <k.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={k.tone}>{k.label}</Badge>
                      {a.audience !== "ALL" && <Badge>{a.audience.startsWith("format:") ? `${a.audience.slice(7).toLowerCase()} stores` : "your region"}</Badge>}
                      <span className="text-xs text-ink-500">{fmtDate(a.createdAt)}</span>
                    </div>
                    <h2 className="mt-2 font-display text-lg font-semibold text-ink-950">{a.title}</h2>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{a.body}</p>
                    {a.requiresAck && (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {ack ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-leaf-700">
                            <CheckCircle2 className="h-4 w-4" aria-hidden /> Acknowledged {fmtDateTime(ack.at)}
                            {ack.userId && who.get(ack.userId) ? ` by ${who.get(ack.userId)}` : ""}
                          </span>
                        ) : canManage ? (
                          <ActionButton action={acknowledge.bind(null, store.code, a.id)} variant="primary" size="md">
                            I&apos;ve read this and briefed the team
                          </ActionButton>
                        ) : (
                          <span className="text-sm font-medium text-oranje-700">Waiting for a manager to acknowledge</span>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              </Card>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <Pagination page={page} pageSize={PAGE_SIZE} total={count} href={(p) => hrefWith(path, sp, { page: p })} />
      </div>
    </>
  );
}
