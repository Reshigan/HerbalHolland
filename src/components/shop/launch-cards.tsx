// Cards for the launch programme on the dark storefront: drops (limited releases) and store events.
import Link from "next/link";
import { ArrowRight, Clock, Crown, Lock, MapPin, ShoppingBag, Users } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { Countdown } from "./countdown";
import { Tag, type TagTone } from "./ui";
import { earlyLabel } from "@/server/shop/launch-rules";
import type { DropView, EventCard } from "@/server/shop/launch";
import { fmtDate, fmtDay, fmtTime, weekdaySA } from "@/lib/format";
import { cn } from "@/lib/cn";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Thu 1 Oct, 18:00" in SAST. */
export const fmtWhen = (d: Date) => `${DAY[weekdaySA(d)]} ${fmtDay(d)}, ${fmtTime(d)}`;
/** "Saturday 3 Oct 2026 · 10:00–18:00" (SAST). */
export const fmtSpan = (a: Date, b: Date) =>
  fmtDate(a) === fmtDate(b) ? `${DAY_LONG[weekdaySA(a)]} ${fmtDate(a)} · ${fmtTime(a)}–${fmtTime(b)}` : `${fmtWhen(a)} – ${fmtWhen(b)}`;

/** "Hatfield, Pretoria", or just "Polokwane" when the store is named after its city. */
export const storePlace = (s: { name: string; city: string }) => (s.name === s.city ? s.name : `${s.name}, ${s.city}`);

/** Calendar tile: month, day and weekday (SAST). */
export function DateBlock({ date, className }: { date: Date; className?: string }) {
  const [day, mon] = fmtDay(date).split(" ");
  return (
    <span className={cn("flex w-16 shrink-0 flex-col items-center overflow-hidden rounded-2xl border border-ink-700 bg-ink-950 text-center", className)}>
      <span className="sr-only">{`${DAY_LONG[weekdaySA(date)]} ${fmtDate(date)}`}</span>
      <span aria-hidden className="w-full bg-brand-500 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ink-950">{mon}</span>
      <span aria-hidden className="tnum pt-1 font-display text-2xl font-semibold leading-none text-white">{day}</span>
      <span aria-hidden className="pb-1.5 pt-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-ink-400">{DAY[weekdaySA(date)]}</span>
    </span>
  );
}

export function EventCardView({ e, showStore = true }: { e: EventCard; showStore?: boolean }) {
  const full = e.left <= 0;
  return (
    <Link href={`/events/${e.slug}`} className="group flex gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-4 transition hover:border-brand-500/60 hover:bg-ink-900">
      <DateBlock date={e.startsAt} className="self-start" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-display text-lg font-semibold leading-snug text-white group-hover:text-brand-100">{e.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {fmtTime(e.startsAt)}–{fmtTime(e.endsAt)}
          </span>
          {showStore && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {storePlace(e.store)}
            </span>
          )}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
          {full ? <Tag tone="neutral">Full</Tag> : <Tag tone={e.left <= 20 ? "amber" : "green"} icon={<Users className="h-3 w-3" />}>{e.left} place{e.left === 1 ? "" : "s"} left</Tag>}
          <span className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-400">
            {full ? "Details" : "RSVP free"} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Status of a drop for the viewer. `overlay` = dark pill for use on top of artwork. */
export function DropStatus({ d, overlay, className }: { d: DropView; overlay?: boolean; className?: string }) {
  const live = d.phase === "live" || d.phase === "early";
  const [label, tone, icon]: [string, TagTone, React.ReactNode] =
    d.phase === "ended"
      ? [`Ended ${fmtDay(d.endsAt!)}`, "neutral", null]
      : live && d.left <= 0
        ? ["Sold out", "neutral", null]
        : d.phase === "early"
          ? ["Open early for you", "orange", <Crown key="c" className="h-3 w-3" />]
          : d.phase === "live"
            ? [
                "Live now",
                "green",
                <span key="l" className="relative mr-0.5 flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-leaf-500" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-leaf-500" />
                </span>,
              ]
            : [`Opens ${fmtWhen(d.opensAt)}`, "solid", null];
  if (!overlay)
    return (
      <Tag tone={tone} icon={icon} className={className}>
        {label}
      </Tag>
    );
  const ring = { green: "text-leaf-100 ring-leaf-500/50", orange: "text-brand-300 ring-brand-500/60", solid: "text-ink-100 ring-ink-600", neutral: "text-ink-300 ring-ink-700" }[tone as string];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ink-950/85 px-2.5 py-1 text-[0.72rem] font-semibold ring-1 ring-inset backdrop-blur", ring, className)}>
      {icon}
      {label}
    </span>
  );
}

/** Early access, limit and members-only facts, as small lines. `earlyTime` adds when early access starts. */
export function DropFacts({ d, earlyTime, className }: { d: DropView; earlyTime?: boolean; className?: string }) {
  const early = earlyLabel({ earlyTier: d.earlyTier, earlyMinutes: d.earlyMinutes });
  return (
    <ul className={cn("space-y-1.5 text-xs text-ink-300", className)}>
      {early && (
        <li className="flex items-start gap-2">
          <Crown className="mt-px h-3.5 w-3.5 shrink-0 text-brand-400" />
          <span>
            {early}
            {earlyTime && `, from ${fmtWhen(new Date(d.startsAt.getTime() - d.earlyMinutes * 60_000))}`}
          </span>
        </li>
      )}
      <li className="flex items-center gap-2">
        <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-brand-400" /> Limit {d.perMemberLimit} per member
      </li>
      {d.membersOnly && (
        <li className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0 text-brand-400" /> Herbal Holland Rewards members only
        </li>
      )}
    </ul>
  );
}

export function DropArt({ d, className }: { d: DropView; className?: string }) {
  const art = d.products.slice(0, 2);
  return (
    <div className={cn("grid overflow-hidden", art.length > 1 ? "grid-cols-2" : "grid-cols-1", className)}>
      {art.length ? (
        art.map((p) => <ProductArt key={p.id} slug={p.slug} strain={p.strain} regClass={p.regClass} label={p.name} className="h-full w-full" />)
      ) : (
        <ProductArt slug={d.slug} regClass="APPAREL" label={d.name} className="h-full w-full" />
      )}
    </div>
  );
}

export function DropCardView({ d }: { d: DropView }) {
  return (
    <Link href={`/drops/${d.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 transition duration-300 hover:-translate-y-0.5 hover:border-brand-500/60">
      <div className="relative aspect-[16/10]">
        <DropArt d={d} className={cn("h-full w-full transition duration-700 group-hover:scale-[1.03]", d.phase === "ended" && "opacity-60 grayscale-[35%]")} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <DropStatus d={d} overlay />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="eyebrow text-brand-500">Limited drop</div>
        <h3 className="mt-1.5 font-display text-xl font-semibold leading-snug text-white group-hover:text-brand-100">{d.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-400">{d.blurb}</p>
        {d.phase === "upcoming" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-200">
            <Clock className="h-4 w-4 text-brand-400" /> Opens in <Countdown to={d.opensAt} label={`Opens ${fmtWhen(d.opensAt)}`} fallback={fmtWhen(d.opensAt)} className="font-semibold text-white" />
          </p>
        )}
        <DropFacts d={d} className="mt-4 border-t border-ink-800 pt-4" />
      </div>
    </Link>
  );
}
