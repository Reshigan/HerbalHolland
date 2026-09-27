import { notFound } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { eventPhase, eventValues, rsvpCounts, rsvpPage, type RsvpFilter } from "@/server/hq/events";
import { sp1 } from "@/server/store/rules";
import { pageParam } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BackLink, ReadOnlyNote } from "@/components/store/ui";
import { ConfirmAction } from "@/components/store/action-form";
import { Flash } from "@/components/hq/flash";
import { EventForm } from "@/components/hq/event-form";
import { EVENT_PHASE, EventStats, GuestList } from "@/components/hq/events";
import { deleteStoreEvent, saveStoreEvent } from "../actions";

export const metadata = { title: "Event" };

type SP = Record<string, string | string[] | undefined>;

export default async function StoreEventPage({ params, searchParams }: { params: Promise<{ code: string; id: string }>; searchParams: Promise<SP> }) {
  const [{ code, id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const e = await db.storeEvent.findFirst({ where: { id, storeId: store.id } });
  if (!e) notFound();
  const f = sp1(sp.f);
  const filter: RsvpFilter = f === "in" || f === "waiting" ? f : "all";
  const q = sp1(sp.q).trim();
  const page = pageParam(sp.page);
  const [counts, list] = await Promise.all([rsvpCounts([e.id]).then((m) => m.get(e.id)!), rsvpPage(e.id, filter, q, page, 25)]);
  const phase = eventPhase(e);
  const path = `/store/${store.code}/events/${e.id}`;

  return (
    <>
      <BackLink href={`/store/${store.code}/events`}>Events</BackLink>
      <PageHeader
        overline={`Event · ${store.name}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {e.title}
            <Badge tone={EVENT_PHASE[phase][1]} dot>
              {EVENT_PHASE[phase][0]}
            </Badge>
          </span>
        }
        description={e.blurb}
        actions={
          <ButtonLink href={`/events/${e.slug}`} target="_blank" rel="noopener" variant="outline">
            Event page <ExternalLink className="h-4 w-4" aria-hidden />
          </ButtonLink>
        }
      />
      <Flash message={sp1(sp.m) || undefined} />
      <EventStats event={e} rsvps={counts.rsvps} checkedIn={counts.checkedIn} />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <GuestList
            path={path}
            sp={sp}
            filter={filter}
            q={q}
            page={page}
            pageSize={25}
            list={list}
            rsvps={counts.rsvps}
            checkedIn={counts.checkedIn}
            exportHref={canManage ? `${path}/door-list` : undefined}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Event details" description="Changes show in the Rewards app straight away" />
            <CardBody>
              {!canManage && <ReadOnlyNote className="mb-4" />}
              <EventForm action={saveStoreEvent.bind(null, store.code, e.id)} values={eventValues(e)} readOnly={!canManage} narrow />
            </CardBody>
          </Card>
          {canManage && counts.rsvps === 0 && (
            <Card>
              <CardHeader title="Delete this event" description="Only while nobody holds a ticket" />
              <CardBody>
                <ConfirmAction action={deleteStoreEvent.bind(null, store.code, e.id)} label="Delete event" icon={<Trash2 className="h-4 w-4" aria-hidden />} title={`Delete “${e.title}”?`} confirmLabel="Delete event">
                  It disappears from the Rewards app straight away. This can&apos;t be undone.
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
