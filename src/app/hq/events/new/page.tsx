import { redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { eventValues } from "@/server/hq/events";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BackLink } from "@/components/hq/ui";
import { EventForm } from "@/components/hq/event-form";
import { saveEvent } from "../actions";

export const metadata = { title: "New event" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  if (!can(user, "network") && user.role !== "AREA_MANAGER") redirect("/hq/events");
  const ids = await scopedStoreIds(scopeOf(user), { kind: "RETAIL", status: { not: "CLOSED" } });
  const stores = await db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, status: true }, orderBy: { name: "asc" } });
  return (
    <>
      <BackLink href="/hq/events">Events</BackLink>
      <PageHeader
        overline="Launch programme"
        title="New event"
        description="An opening weekend or a members' evening at one store. Members RSVP from the event page; tickets stop at capacity and are scanned at the till on the day."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardBody>
            <EventForm
              action={saveEvent.bind(null, null)}
              values={eventValues(null, sp.store && ids.includes(sp.store) ? sp.store : "")}
              stores={stores.map((s) => ({ id: s.id, label: `${s.name} (${s.code})${s.status === "OPENING_SOON" ? " · opening soon" : ""}` }))}
              submitLabel="Create event"
            />
          </CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="How events work" />
          <CardBody>
            <ol className="list-decimal space-y-2.5 pl-4 text-sm text-ink-600 marker:font-semibold marker:text-brand-700">
              <li>Members RSVP from the event page in the Rewards app. Each gets a ticket with a QR code; RSVPs stop at capacity.</li>
              <li>On the day, the till scans the ticket from two hours before the start — it checks the guest in and attaches them to their purchase.</li>
              <li>Download the door list (name and member number only) from the event page if you want a printed backup.</li>
            </ol>
            <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
              Events are for adults 18+ with ID at the door. Never promote, sample or give away licensed medicines at an event.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
