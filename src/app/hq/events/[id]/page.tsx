import { notFound } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { eventPhase, eventValues, rsvpCounts, rsvpPage, type RsvpFilter } from "@/server/hq/events";
import { pageParam } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction } from "@/components/hq/action-form";
import { Flash } from "@/components/hq/flash";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { EventForm } from "@/components/hq/event-form";
import { EVENT_PHASE, EventStats, GuestList } from "@/components/hq/events";
import { deleteEvent, saveEvent } from "../actions";

export const metadata = { title: "Event" };

type SP = { f?: string; q?: string; page?: string; m?: string };

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const ids = await scopedStoreIds(scopeOf(user));
  const e = await db.storeEvent.findUnique({ where: { id }, include: { store: { select: { code: true, name: true } } } });
  if (!e || !ids.includes(e.storeId)) notFound();
  const filter: RsvpFilter = sp.f === "in" || sp.f === "waiting" ? sp.f : "all";
  const q = (sp.q ?? "").trim();
  const page = pageParam(sp.page);
  const [counts, list] = await Promise.all([rsvpCounts([e.id]).then((m) => m.get(e.id)!), rsvpPage(e.id, filter, q, page, 25)]);
  const phase = eventPhase(e);
  const edit = can(user, "network") || user.role === "AREA_MANAGER"; // area managers only reach events in their region
  const path = `/hq/events/${e.id}`;

  return (
    <>
      <BackLink href="/hq/events">Events</BackLink>
      <PageHeader
        overline={`Event · ${e.store.name} (${e.store.code})`}
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
      <Flash message={sp.m} />
      <EventStats event={e} rsvps={counts.rsvps} checkedIn={counts.checkedIn} />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <GuestList path={path} sp={sp} filter={filter} q={q} page={page} pageSize={25} list={list} rsvps={counts.rsvps} checkedIn={counts.checkedIn} exportHref={`${path}/door-list`} />
        </div>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Event details" description="Changes show on the event page straight away" />
            <CardBody>
              {!edit && <ViewOnly className="mb-4">View only — events are managed by the HQ team and area managers.</ViewOnly>}
              <EventForm action={saveEvent.bind(null, e.id)} values={eventValues(e)} readOnly={!edit} narrow />
            </CardBody>
          </Card>
          {edit && counts.rsvps === 0 && (
            <Card>
              <CardHeader title="Delete this event" description="Only while nobody holds a ticket" />
              <CardBody>
                <ConfirmAction action={deleteEvent.bind(null, e.id)} label="Delete event" icon={<Trash2 className="h-4 w-4" aria-hidden />} title={`Delete “${e.title}”?`} confirmLabel="Delete event">
                  <p>It disappears from the Rewards app straight away. This can&apos;t be undone.</p>
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
