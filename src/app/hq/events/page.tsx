import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { eventPhase, rsvpCounts } from "@/server/hq/events";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { Flash } from "@/components/hq/flash";
import { EmptyRow } from "@/components/hq/ui";
import { Capacity, EVENT_PHASE, eventWhen } from "@/components/hq/events";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Events" };

const PAGE_SIZE = 20;
type SP = { tab?: string; store?: string; q?: string; page?: string; m?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const now = new Date();
  const tab = sp.tab === "past" ? "past" : "upcoming";
  const page = pageParam(sp.page);
  const q = sp.q?.trim();
  const storeFilter = sp.store && ids.includes(sp.store) ? [sp.store] : ids;
  const base: Prisma.StoreEventWhereInput = { storeId: { in: storeFilter }, ...(q && { title: { contains: q, mode: "insensitive" } }) };
  const byTab: Record<string, Prisma.StoreEventWhereInput> = { upcoming: { endsAt: { gt: now } }, past: { endsAt: { lte: now } } };
  const where = { AND: [base, byTab[tab]] };
  const [stores, counts, events] = await Promise.all([
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    Promise.all(["upcoming", "past"].map((t) => db.storeEvent.count({ where: { AND: [base, byTab[t]] } }))),
    db.storeEvent.findMany({ where, include: { store: { select: { code: true, name: true } } }, orderBy: { startsAt: tab === "past" ? "desc" : "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const rsvps = await rsvpCounts(events.map((e) => e.id));
  const create = can(user, "network") || user.role === "AREA_MANAGER";
  const href = (p: Record<string, string | number | undefined>) => `/hq/events${qs({ tab: tab === "past" ? "past" : undefined, store: sp.store, q, ...p })}`;

  return (
    <>
      <PageHeader
        overline="Launch programme"
        title="Events"
        description="Opening weekends and members' evenings across the network. Members RSVP in the Rewards app, tickets stop at capacity, and guests check in at the till by scanning their ticket."
        actions={
          create && (
            <ButtonLink href="/hq/events/new">
              <Plus className="h-4 w-4" /> New event
            </ButtonLink>
          )
        }
      />
      <Flash message={sp.m} />
      <TabLinks
        className="mb-4"
        current={href({ page: undefined })}
        tabs={[
          { label: "Upcoming & on now", count: counts[0], href: `/hq/events${qs({ store: sp.store, q })}` },
          { label: "Past", count: counts[1], href: `/hq/events${qs({ tab: "past", store: sp.store, q })}` },
        ]}
      />
      <Card>
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/events" keep={{ tab: tab === "past" ? "past" : undefined }}>
            <SearchField defaultValue={q} placeholder="Search events" />
            {stores.length > 1 && (
              <FilterSelect name="store" label="Store" defaultValue={sp.store} allLabel={scope.kind === "HQ" ? "All stores" : "Your region"} options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))} />
            )}
          </FilterForm>
        </div>
        <Table stickyFirst className="relative">
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
              <EmptyRow cols={5}>{q || sp.store ? "No events match." : tab === "past" ? "No past events yet." : "Nothing planned — add an opening weekend or a members' evening."}</EmptyRow>
            )}
            {events.map((e) => {
              const c = rsvps.get(e.id)!;
              const phase = eventPhase(e, now);
              return (
                <Tr key={e.id}>
                  <Td className="min-w-40 sm:min-w-56">
                    <Link href={`/hq/events/${e.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {e.title}
                    </Link>
                    <span className="block text-xs text-ink-500">
                      {e.store.name} ({e.store.code})<span className="md:hidden"> · {eventWhen(e)}</span>
                    </span>
                  </Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{eventWhen(e)}</Td>
                  <Td align="right">
                    <Capacity rsvps={c.rsvps} capacity={e.capacity} />
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {phase === "upcoming" ? <span className="text-ink-500">—</span> : num(c.checkedIn)}
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
        <Pagination page={page} pageSize={PAGE_SIZE} total={counts[tab === "past" ? 1 : 0]} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
