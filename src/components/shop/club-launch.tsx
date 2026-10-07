// Rewards (/club) sections for the launch programme: waitlist place, welcome gift, My Deals and event tickets.
import Link from "next/link";
import { ArrowRight, BadgePercent, CalendarDays, Gift, Ticket } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { AddToBag } from "./add-to-bag";
import { ShareLink } from "./club-client";
import { DateBlock, EventCardView, storePlace } from "./launch-cards";
import { Panel, Tag } from "./ui";
import { waitlistView } from "@/server/shop/launch-rules";
import type { EventCard, WelcomeGift } from "@/server/shop/launch";
import { fmtDate, fmtDay, fmtTime, num } from "@/lib/format";
import { cn } from "@/lib/cn";

/** While the Founding Members list is open: the member's place, the Founding zone and the referral link that moves them up. */
export function WaitlistCard({ w, cap, referUrl, shareText, firstName }: { w: { place: number; total: number; referrals: number; boost: number; launchAt: Date }; cap: number; referUrl: string; shareText: string; firstName: string }) {
  const v = waitlistView(w, cap);
  const pos = Math.min(100, Math.max(0, v.marker * 100));
  return (
    <Panel id="founding" className="scroll-mt-28 border-brand-500/40 bg-gradient-to-br from-brand-500/[0.09] via-ink-900/80 to-ink-900/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-brand-500">Your place on the list</div>
          <p className="tnum mt-2 font-display text-5xl font-semibold leading-none tracking-tight text-white">#{num(w.place)}</p>
          <p className="mt-2 text-sm text-ink-400">
            of {num(Math.max(w.total, w.place))} members on the list · closes {fmtDate(w.launchAt)}
          </p>
        </div>
        <Tag tone={v.founding ? "orange" : "neutral"} className="mt-1">
          {v.founding ? "In the Founding zone" : `${num(v.toFounding)} places to go`}
        </Tag>
      </div>

      <div className="mt-7" aria-hidden>
        <div className="relative h-3 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${v.zone * 100}%` }} />
        </div>
        <div className="relative mt-1 h-9">
          <span className="absolute top-0 flex flex-col items-center" style={{ left: `${pos}%`, transform: `translateX(${pos < 8 ? "0" : pos > 92 ? "-100%" : "-50%"})` }}>
            <span className={cn("h-0 w-0 border-x-[6px] border-b-[7px] border-x-transparent border-b-white", pos < 8 ? "self-start" : pos > 92 ? "self-end" : "")} />
            <span className="mt-0.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-bold text-ink-950">You · #{num(w.place)}</span>
          </span>
        </div>
        <div className="flex justify-between text-[0.7rem] text-ink-450">
          <span>Top of the list</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> First {num(cap)} = Founding Members
          </span>
        </div>
      </div>
      <p className="sr-only">
        You are number {num(w.place)} of {num(w.total)}. The first {num(cap)} places become Founding Members.
      </p>

      <p className="mt-5 text-sm leading-relaxed text-ink-200">
        {v.founding
          ? `You're inside the first ${num(cap)}, so a numbered Founding Member card is yours when the list closes. Places can shift as others bring friends, so keep sharing.`
          : `Bring ${v.friendsNeeded} friend${v.friendsNeeded === 1 ? "" : "s"} to reach a Founding spot.`}{" "}
        <strong className="font-semibold text-white">Each friend who joins moves you up {num(w.boost)} places.</strong>
        {w.referrals > 0 && ` You've brought ${w.referrals} so far. Thank you, ${firstName}.`}
      </p>
      <div className="mt-4">
        <ShareLink url={referUrl} text={shareText} shareLabel="Share your link" />
      </div>
    </Panel>
  );
}

/** "Your welcome gift: a free hemp wick with your first purchase — add it to your bag" (from the live promotion). */
export function WelcomeGiftBanner({ gift, where = "card", className }: { gift: WelcomeGift; where?: "card" | "bag"; className?: string }) {
  const what = gift.name.replace(/^welcome gift:\s*/i, "");
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border border-brand-500/40 bg-gradient-to-r from-brand-500/[0.14] to-brand-500/[0.03] p-4 sm:flex-row sm:items-center", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {gift.product ? (
          <ProductArt slug={gift.product.slug} strain={gift.product.strain} regClass={gift.product.regClass} label={gift.product.name} className="h-14 w-14 shrink-0 rounded-xl" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-brand-500 text-ink-950">
            <Gift className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-white">
            Your welcome gift: {what} with your first purchase
          </div>
          <div className="mt-0.5 text-ink-300">{where === "bag" ? "Add it to your bag and it comes off at checkout." : `${gift.description ? `${gift.description} ` : ""}Online or at any till.`}</div>
        </div>
      </div>
      {gift.product && <AddToBag plain variantId={gift.product.variantId} name={gift.product.name} label="Add it to your bag" className="shrink-0" />}
    </div>
  );
}

type Deal = { id: string; title: string; label: string; endsAt: Date; product: { slug: string; name: string; strain: string | null; regClass: string } | null };

export function DealsPanel({ deals, personalised }: { deals: Deal[]; personalised: boolean }) {
  return (
    <Panel id="deals" className="scroll-mt-28 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
          <BadgePercent className="h-5 w-5 text-brand-500" /> My Deals
        </h2>
        <Link href="/club/settings#deals" className="text-sm font-semibold text-brand-400 hover:underline">
          Settings
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-400">Personal deals on your card. They apply automatically at the till and online, with no codes and one use each.</p>
      {deals.length ? (
        <ul className="mt-3 divide-y divide-ink-800">
          {deals.map((d) => {
            const body = (
              <>
                {d.product ? (
                  <ProductArt slug={d.product.slug} strain={d.product.strain} regClass={d.product.regClass} label={d.product.name} className="h-12 w-12 shrink-0 rounded-xl" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
                    <BadgePercent className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-100">{d.title}</span>
                  <span className="block text-xs text-ink-450">Ends {fmtDay(d.endsAt)} · applies automatically at the till and online</span>
                </span>
                <Tag tone="orange" className="shrink-0">
                  {d.label}
                </Tag>
              </>
            );
            return (
              <li key={d.id}>
                {d.product ? (
                  <Link href={`/p/${d.product.slug}`} className="flex items-center gap-3 py-3 text-sm hover:text-white">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3 text-sm">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : personalised ? (
        <p className="mt-4 rounded-xl bg-ink-850 px-4 py-3 text-sm text-ink-300">No deals on your card right now. New ones land every Monday, picked from what you buy most.</p>
      ) : (
        <p className="mt-4 rounded-xl bg-ink-850 px-4 py-3 text-sm text-ink-300">
          Personalised deals are off.{" "}
          <Link href="/club/settings#deals" className="font-semibold text-brand-400 hover:underline">
            Turn them on
          </Link>{" "}
          for a weekly deal on something you buy often.
        </p>
      )}
    </Panel>
  );
}

type TicketRow = { id: string; checkedInAt: Date | null; event: { slug: string; title: string; startsAt: Date; endsAt: Date; store: { name: string; city: string } } };

/** Upcoming tickets; with none, what's coming up. */
export function TicketsPanel({ tickets, suggestions }: { tickets: TicketRow[]; suggestions: EventCard[] }) {
  return (
    <Panel className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
        <Ticket className="h-5 w-5 text-brand-500" /> Your tickets
      </h2>
      {tickets.length ? (
        <ul className="mt-3 space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/events/${t.event.slug}`} className="group flex items-center gap-3 rounded-2xl border border-ink-800 p-2.5 pr-4 transition hover:border-brand-500/60">
                <DateBlock date={t.event.startsAt} className="w-14" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium leading-snug text-white">{t.event.title}</span>
                  <span className="block truncate text-xs text-ink-400">
                    {storePlace(t.event.store)} · {fmtTime(t.event.startsAt)}–{fmtTime(t.event.endsAt)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-400">
                  {t.checkedInAt ? "Checked in" : "Ticket"} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-400">
            <CalendarDays className="h-4 w-4 shrink-0" /> No tickets yet. Here&apos;s what&apos;s coming up. RSVP is free.
          </p>
          <div className="mt-3 grid gap-2">
            {suggestions.map((e) => (
              <EventCardView key={e.id} e={e} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
