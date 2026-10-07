// Event overview and guest list, shared by the HQ console and the store back office (server-safe).
import { Download, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat, Meter } from "@/components/ui/stat";
import { Badge, type Tone } from "@/components/ui/badge";
import { TierBadge } from "@/components/ui/status";
import { buttonClass } from "@/components/ui/button";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Chips, SearchForm } from "@/components/store/ui";
import { EmptyRow } from "@/components/hq/ui";
import { hrefWith } from "@/server/store/rules";
import { TZ, dayKey, fmtDate, fmtDateTime, fmtDay, fmtTime, num } from "@/lib/format";
import type { EventPhase, RsvpFilter, rsvpPage } from "@/server/hq/events";

const weekday = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short" });

export const EVENT_PHASE: Record<EventPhase, [string, Tone]> = { upcoming: ["Upcoming", "blue"], on: ["On now", "green"], ended: ["Ended", "neutral"] };

/** "Sat 3 Oct · 10:00–18:00" or "3 Oct 10:00 – 4 Oct 18:00". */
export const eventWhen = (e: { startsAt: Date; endsAt: Date }) =>
  dayKey(e.startsAt) === dayKey(e.endsAt) ? `${fmtDate(e.startsAt)} · ${fmtTime(e.startsAt)}–${fmtTime(e.endsAt)}` : `${fmtDateTime(e.startsAt)} – ${fmtDateTime(e.endsAt)}`;

/** RSVPs against capacity: count, meter and "Full" (never colour alone). */
export function Capacity({ rsvps, capacity, className }: { rsvps: number; capacity: number; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-end gap-1.5 whitespace-nowrap text-sm">
        <span className="tnum font-medium text-ink-900">{num(rsvps)}</span>
        <span className="tnum text-xs text-ink-500">/ {num(capacity)}</span>
        {rsvps >= capacity && <Badge tone="orange">Full</Badge>}
      </div>
      <Meter value={rsvps} max={capacity} className="mt-1.5 h-1.5" />
    </div>
  );
}

export function EventStats({ event, rsvps, checkedIn }: { event: { startsAt: Date; endsAt: Date; capacity: number }; rsvps: number; checkedIn: number }) {
  const left = Math.max(0, event.capacity - rsvps);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border border-ink-150 bg-white p-4 shadow-card">
        <div className="text-[0.78rem] font-medium text-ink-500">RSVPs</div>
        <div className="mt-1 font-display text-[1.65rem] font-semibold leading-none tracking-tight text-ink-950 tnum">{num(rsvps)}</div>
        <Meter value={rsvps} max={event.capacity} className="mt-3" />
        <div className="mt-2 text-xs text-ink-500">of {num(event.capacity)} places</div>
      </div>
      <Stat label="Places left" value={left ? num(left) : "Full"} sub={left ? "first come, first served" : "members see “this event is full”"} />
      <Stat label="Checked in" value={num(checkedIn)} sub={rsvps ? `${Math.round((checkedIn / rsvps) * 100)}% of RSVPs · at the till` : "tickets are scanned at the till"} />
      <Stat label="When" value={`${weekday.format(event.startsAt)} ${fmtDay(event.startsAt)}`} sub={dayKey(event.startsAt) === dayKey(event.endsAt) ? `${fmtTime(event.startsAt)}–${fmtTime(event.endsAt)}` : `to ${fmtDay(event.endsAt)}, ${fmtTime(event.endsAt)}`} />
    </div>
  );
}

type Page = Awaited<ReturnType<typeof rsvpPage>>;

/** Guest list: filter by check-in, search by name or member number, and the door-list download. */
export function GuestList({
  path,
  sp,
  filter,
  q,
  page,
  pageSize,
  list,
  rsvps,
  checkedIn,
  exportHref,
}: {
  path: string;
  sp: Record<string, string | string[] | undefined>;
  filter: RsvpFilter;
  q: string;
  page: number;
  pageSize: number;
  list: Page;
  rsvps: number;
  checkedIn: number;
  exportHref?: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Guest list"
        description="Members who RSVP'd, by name. They check in at the till by scanning the QR on their ticket."
        action={
          rsvps > 0 &&
          exportHref && (
            <a href={exportHref} download className={buttonClass("outline", "sm")}>
              <Download className="h-4 w-4" aria-hidden /> Door list (CSV)
            </a>
          )
        }
      />
      <div className="mt-4 space-y-3 border-y border-ink-100 p-4 sm:px-5">
        <SearchForm path={path} q={q} keep={{ f: filter === "all" ? undefined : filter }} placeholder="Name or member number" />
        <Chips
          label="Check-in"
          current={filter}
          items={[
            { key: "all", label: "Everyone", count: rsvps, href: hrefWith(path, sp, { f: null, page: null }) },
            { key: "in", label: "Checked in", count: checkedIn, tone: "green", href: hrefWith(path, sp, { f: "in", page: null }) },
            { key: "waiting", label: "Not yet", count: rsvps - checkedIn, tone: "amber", href: hrefWith(path, sp, { f: "waiting", page: null }) },
          ]}
        />
      </div>
      <Table className="relative">
        <thead>
          <tr>
            <Th>Member</Th>
            <Th className="hidden sm:table-cell">Tier</Th>
            <Th className="hidden md:table-cell">RSVP&apos;d</Th>
            <Th>Checked in</Th>
          </tr>
        </thead>
        <tbody>
          {list.rows.length === 0 && (
            <EmptyRow cols={4}>
              <Users className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
              {q ? "Nobody on the list matches that search." : filter === "in" ? "Nobody has checked in yet." : filter === "waiting" ? "Everyone on the list has checked in." : "No RSVPs yet. Members book from the event page in the Rewards app."}
            </EmptyRow>
          )}
          {list.rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <span className="font-medium text-ink-900">
                  {r.customer.firstName} {r.customer.lastName ?? ""}
                </span>
                <span className="block font-mono text-xs text-ink-500">{r.customer.memberNo}</span>
              </Td>
              <Td className="hidden sm:table-cell">
                <TierBadge tier={r.customer.tier} />
              </Td>
              <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{fmtDate(r.createdAt)}</Td>
              <Td className="whitespace-nowrap">
                {r.checkedInAt ? (
                  <Badge tone="green" dot>
                    {fmtTime(r.checkedInAt)}
                  </Badge>
                ) : (
                  <span className="text-xs text-ink-500">Not yet</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageSize={pageSize} total={list.total} href={(p) => hrefWith(path, sp, { page: p })} />
    </Card>
  );
}
