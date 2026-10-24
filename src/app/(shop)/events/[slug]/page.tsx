import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, CalendarPlus, CheckCircle2, ChevronRight, IdCard, MapPin, Navigation, QrCode as QrIcon, Ticket, Users } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getEvent } from "@/server/shop/launch";
import { cancelRsvpAction, rsvpAction } from "./actions";
import { CancelRsvp, RsvpButton } from "@/components/shop/launch-forms";
import { DateBlock, fmtSpan } from "@/components/shop/launch-cards";
import { directionsUrl } from "@/components/shop/store-card";
import { QrCode } from "@/components/shop/qr";
import { Container, Meter, Panel, Tag } from "@/components/shop/ui";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { fmtTime } from "@/lib/format";
import { APP_URL } from "@/server/invoices";
import { ShareLink } from "@/components/shop/club-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = await db.storeEvent.findUnique({ where: { slug: (await params).slug }, select: { title: true, blurb: true, slug: true, store: { select: { name: true } } } });
  if (!e) return { title: "Event not found" };
  const description = `${e.blurb} Herbal Holland ${e.store.name}. Free RSVP, adults 18+.`.slice(0, 158);
  return { title: e.title, description, alternates: { canonical: `/events/${e.slug}` }, openGraph: { title: `${e.title} · Herbal Holland`, description } };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const customer = await getCustomer();
  const e = await getEvent(slug, customer?.id);
  if (!e) notFound();
  const now = new Date();
  const ended = e.endsAt <= now;
  const full = e.left <= 0;
  const s = e.store;
  const next = `/events/${e.slug}`;

  return (
    <Container className="pt-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-400">
        <Link href="/stores" className="hover:text-white">
          Stores
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/stores/${s.slug}`} className="hover:text-white">
          {s.name}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-ink-200" aria-current="page">
          {e.title}
        </span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-14">
        <div>
          <div className="flex items-start gap-4">
            <DateBlock date={e.startsAt} className="mt-1 hidden sm:flex" />
            <div className="min-w-0">
              <div className="eyebrow text-brand-500">Windmill Days · Herbal Holland {s.name}</div>
              <h1 className="mt-2 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">{e.title}</h1>
            </div>
          </div>

          <dl className="mt-8 space-y-4 text-[0.95rem]">
            <div className="flex items-start gap-3">
              <dt className="sr-only">When</dt>
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <dd className="text-ink-100">{fmtSpan(e.startsAt, e.endsAt)}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="sr-only">Where</dt>
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <dd className="text-ink-100">
                Herbal Holland {s.name} · {s.addressLine}, {s.suburb}, {s.city}
                <a href={directionsUrl(s)} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-400 hover:underline">
                  <Navigation className="h-3.5 w-3.5" /> Directions
                </a>
              </dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="sr-only">Places</dt>
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <dd className="min-w-0 flex-1 text-ink-100">
                {ended ? "This event has ended" : full ? "Fully booked" : `${e.left} of ${e.capacity} places left`}
                {!ended && <Meter value={e.capacity - e.left} max={e.capacity} className="mt-2 max-w-sm" label="Places taken" />}
              </dd>
            </div>
          </dl>
        </div>

        <aside className="lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {e.mine ? (
            <>
              <Ticketed title={e.title} when={fmtSpan(e.startsAt, e.endsAt)} store={s.name} code={e.mine.code} checkedInAt={e.mine.checkedInAt} ended={ended} slug={e.slug} cancel={cancelRsvpAction.bind(null, e.id)} />
              {/* One ticket per member, so a plus-one joins Rewards with the member's link and lands back here to RSVP. */}
              {customer && !ended && !full && (
                <Panel className="mt-4 p-5">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                    <Users className="h-5 w-5 text-brand-500" /> Bring a friend
                  </h2>
                  <p className="mb-4 mt-1 text-sm text-ink-300">Send them your link: they join Rewards free (adults 18+) and come straight back here for their own ticket.</p>
                  <ShareLink
                    url={`${APP_URL()}/club/join?ref=${customer.referralCode}&next=${encodeURIComponent(next)}`}
                    text={`I'm going to ${e.title} at Herbal Holland ${s.name}. It's free for members: join with my link and grab a ticket too (adults 18+):`}
                    shareLabel="Invite a friend"
                  />
                </Panel>
              )}
            </>
          ) : (
            <Panel className="p-5 sm:p-6">
              <h2 className="font-display text-2xl font-semibold text-white">{ended ? "This event has ended" : full ? "Fully booked" : "Reserve your place"}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">
                {ended
                  ? "Thanks to everyone who came. Keep an eye on Rewards for the next one."
                  : full
                    ? "Every place has been taken, but come and see us in store any day."
                    : "Free for Rewards members, adults 18+. We'll hold your place and your ticket lives in Rewards."}
              </p>
              {!ended && !full && (
                <div className="mt-5">
                  {customer ? (
                    <RsvpButton action={rsvpAction.bind(null, e.id)} />
                  ) : (
                    <>
                      <ButtonLink href={`/club/join?next=${encodeURIComponent(next)}`} size="xl" className="w-full">
                        Sign in to RSVP
                      </ButtonLink>
                      <p className="mt-3 text-center text-xs text-ink-450">New here? Joining Rewards is free and takes a minute.</p>
                    </>
                  )}
                </div>
              )}
              {!ended && (
                <a href={`/events/${e.slug}/calendar.ics`} className={buttonClass("ghost-dark", "md", "mt-3 w-full")}>
                  <CalendarPlus className="h-4 w-4" /> Add to calendar
                </a>
              )}
            </Panel>
          )}
        </aside>

        <div className="lg:col-start-1 lg:row-start-2">
          <p className="max-w-2xl text-lg leading-relaxed text-ink-300">{e.blurb}</p>

          <Panel className="mt-8 max-w-2xl p-5">
            <h2 className="font-display text-lg font-semibold text-white">Good to know</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-300">
              <li className="flex gap-2.5">
                <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> Adults 18+ only. Bring your ID; it&apos;s checked at the door.
              </li>
              <li className="flex gap-2.5">
                <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> Free for Herbal Holland Rewards members. RSVP to hold your place. It&apos;s one ticket per member, so a friend joins free with your link and RSVPs too.
              </li>
              <li className="flex gap-2.5">
                <QrIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> Your ticket is a QR code in Rewards. Show it at the till when you arrive.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </Container>
  );
}

/** The member's ticket: QR for the door (HHRSVP:{code}), calendar file and cancel. */
function Ticketed({ title, when, store, code, checkedInAt, ended, slug, cancel }: { title: string; when: string; store: string; code: string; checkedInAt: Date | null; ended: boolean; slug: string; cancel: () => Promise<{ error?: string }> }) {
  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-brand-500/50 bg-ink-900 shadow-glow">
      <div className="bg-gradient-to-br from-brand-500/20 to-transparent p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow text-brand-400">Your ticket</span>
          {checkedInAt ? <Tag tone="green">Checked in {fmtTime(checkedInAt)}</Tag> : <Tag tone="orange">You&apos;re in</Tag>}
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-ink-300">
          {when} · {store}
        </p>
      </div>
      <div className="relative border-t border-dashed border-ink-700">
        <span aria-hidden className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-brand-500/50 bg-ink-950" />
        <span aria-hidden className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-brand-500/50 bg-ink-950" />
      </div>
      <div className="p-5 sm:p-6">
        {checkedInAt ? (
          <p className="flex items-start gap-2 text-sm text-leaf-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-500" /> You&apos;re checked in. Enjoy it.
          </p>
        ) : (
          <>
            <div className="mx-auto w-52 rounded-2xl bg-white p-3">
              <QrCode value={`HHRSVP:${code}`} label={`Ticket ${code} as a QR code`} margin={1} />
            </div>
            <p className="tnum mt-3 text-center font-mono text-sm tracking-[0.25em] text-ink-200">{code}</p>
            <p className="mt-3 text-center text-sm text-ink-400">Show this at the till when you arrive, with your ID.</p>
          </>
        )}
        {!ended && (
          <div className="mt-5 flex flex-col gap-2">
            <a href={`/events/${slug}/calendar.ics`} className={buttonClass("outline-dark", "lg", "w-full")}>
              <CalendarPlus className="h-4 w-4" /> Add to calendar
            </a>
            {!checkedInAt && (
              <div className="flex justify-center">
                <CancelRsvp action={cancel} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
