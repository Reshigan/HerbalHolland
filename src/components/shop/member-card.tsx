// The digital Rewards card: member number as a scannable QR for the till, tier colour, points.
import { Mark, Wordmark } from "@/components/brand/logo";
import { QrCode } from "./qr";
import { fmtPoints } from "@/lib/loyalty-rules";
import { cn } from "@/lib/cn";

export const TIER_STYLE: Record<number, { card: string; chip: string; ring: string }> = {
  0: { card: "from-ink-800 via-ink-900 to-ink-950", chip: "bg-ink-200 text-ink-950", ring: "ring-ink-600" },
  1: { card: "from-leaf-700 via-ink-900 to-ink-950", chip: "bg-leaf-500 text-ink-950", ring: "ring-leaf-500/60" },
  2: { card: "from-series-4 via-ink-900 to-ink-950", chip: "bg-series-4 text-white", ring: "ring-series-4" },
  3: { card: "from-oranje-600 via-ink-900 to-ink-950", chip: "bg-oranje-500 text-ink-950", ring: "ring-oranje-500/70" },
};

export function MemberCard({ name, memberNo, tierName, tierIndex, points, className }: { name: string; memberNo: string; tierName: string; tierIndex: number; points: number; className?: string }) {
  const s = TIER_STYLE[tierIndex] ?? TIER_STYLE[0];
  return (
    <div className={cn("relative isolate overflow-hidden rounded-[1.6rem] bg-gradient-to-br p-5 shadow-lift ring-1 sm:p-6", s.card, s.ring, className)} role="group" aria-label={`${tierName} Rewards card for ${name}`}>
      <Mark aria-hidden className="pointer-events-none absolute -right-10 -top-12 -z-10 h-56 w-56 text-white/[0.06]" />
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex items-center gap-2 text-oranje-500">
          <Mark className="h-8 w-8" detail={false} />
          <Wordmark className="text-[0.7rem]" />
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider", s.chip)}>{tierName}</span>
      </div>
      <div className="mt-6 flex items-end justify-between gap-4 sm:mt-8">
        <div className="min-w-0">
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-ink-300">Rewards member</div>
          <div className="mt-1 truncate font-display text-2xl font-semibold text-white">{name}</div>
          <div className="tnum mt-0.5 text-sm tracking-[0.18em] text-ink-300">{memberNo}</div>
          <div className="mt-4 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-ink-300">Balance</div>
          <div className="tnum font-display text-3xl font-semibold text-white">{fmtPoints(points)}</div>
        </div>
        <div className="w-28 shrink-0 rounded-2xl bg-white p-2 sm:w-32">
          <QrCode value={memberNo} label={`Member number ${memberNo} as a QR code`} margin={1} />
        </div>
      </div>
    </div>
  );
}
