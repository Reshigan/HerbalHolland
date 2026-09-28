import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { eventPhase, eventValues, rsvpCounts } from "@/server/hq/events";
import { hrefWith, sp1 } from "@/server/store/rules";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Chips, ReadOnlyNote } from "@/components/store/ui";
import { Drawer } from "@/components/store/drawer";
import { Flash } from "@/components/hq/flash";
import { EmptyRow } from "@/components/hq/ui";
import { EventForm } from "@/components/hq/event-form";
import { Capacity, EVENT_PHASE, eventWhen } from "@/components/hq/events";
import { saveStoreEvent } from "./actions";

export const metadata = { title: "Events" };

const PAGE_SIZE = 20;
type SP = Record<string, string | string[] | undefined>;

export default async function StoreEventsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/events`;
  const now = new Date();
  const tab = sp1(sp.tab) === "past" ? "past" : "upcoming";
  const page = pageParam(sp.page);
  const byTab = { upcoming: { endsAt: { gt: now } }, past: { endsAt: { lte: now } } };
  const [upcoming, past, events] = await Promise.all([
    db.storeEvent.count({ where: { storeId: store.id, ...byTab.upcoming } }),
    db.storeEvent.count({ where: { storeId: store.id, ...byTab.past } }),
    db.storeEvent.findMany({ where: { storeId: store.id, ...byTab[tab] }, orderBy: { startsAt: tab === "past" ? "desc" : "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const counts = await rsvpCounts(events.map((e) => e.id));

  return (
    <>
      <PageHeader
        overline={`Members · ${store.name}`}
        title="Events"
        description={`Opening weekends and members' evenings at ${store.name}. Members RSVP in the Rewards app, tickets stop at capacity, and guests check in at the till by scanning their ticket.`}
        actions={
          canManage ? (
            <Drawer label="New event" icon={<Plus className="h-4 w-4" aria-hidden />} title="New event" description={`At ${store.name}. Adults 18+, ID at the door.`} defaultOpen={sp1(sp.new) === "1"}>
              <EventForm action={saveStoreEvent.bind(null, store.code, null)} values={eventValues(null, store.id)} submitLabel="Create event" narrow />
            </Drawer>
          ) : (
            <ReadOnlyNote />
          )
        }
      />
      <Flash message={sp1(sp.m) || undefined} />
      <Card>
        <div className="border-b border-ink-100 p-4 sm:px-5">
          <Chips
            label="When"
            current={tab}
            items={[
              { key: "upcoming", label: "Upcoming & on now", count: upcoming, href: hrefWith(path, {}, {}) },
              { key: "past", label: "Past", count: past, href: hrefWith(path, {}, { tab: "past" }) },
            ]}
          />
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Event</Th>
              <Th className="hidden md:table-cell">When</Th>
              <Th align="right" className="w-24 sm:w-40">RSVPs</Th>
              <Th align="right" className="hidden sm:table-cell">Checked in</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <EmptyRow cols={5}>{tab === "past" ? "No past events yet." : canManage ? "Nothing planned — a members' evening is a great reason to come in." : "Nothing planned yet."}</EmptyRow>
            )}
            {events.map((e) => {
              const c = counts.get(e.id)!;
              const phase = eventPhase(e, now);
              return (
                <Tr key={e.id}>
                  <Td className="min-w-40 sm:min-w-52">
                    <Link href={`${path}/${e.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {e.title}
                    </Link>
                    <span className="block text-xs text-ink-500 md:hidden">{eventWhen(e)}</span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{eventWhen(e)}</Td>
                  <Td align="right">
                    <Capacity rsvps={c.rsvps} capacity={e.capacity} />
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {phase === "upcoming" ? <span className="text-ink-300">—</span> : num(c.checkedIn)}
                  </Td>
                  <Td>
                    <Badge tone={EVENT_PHASE[phase][1]} dot>
                      {EVENT_PHASE[phase][0]}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={tab === "past" ? past : upcoming} href={(p) => hrefWith(path, sp, { page: p, m: null })} />
        </div>
      </Card>
    </>
  );
}
