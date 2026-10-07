// In-store menu board for a TV (16:9 landscape or 9:16 portrait). Public catalogue only in MEDICAL mode —
// licensed medicines are never displayed; a panel points patients to an authorised dispenser instead. Member prices appear
// only on classes where incentives are allowed (incentiveExcluded); sold-out lines stay on the board, greyed.
// Server-rendered; board-client.tsx rotates panels, polls live stock and keeps the screen awake.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Crown, ShoppingBag } from "lucide-react";
import { APP_URL } from "@/server/invoices";
import { boardMenu, boardStore, type BoardItem } from "@/server/menu-board";
import { getClasses } from "@/server/shop/access";
import { dealHeadline } from "@/server/shop/catalogue";
import { storeDeals } from "@/server/shop/stores";
import { openState, parseHours } from "@/server/shop/hours";
import { featuredDrop, upcomingEvents, type DropView, type EventCard } from "@/server/shop/launch";
import { earlyLabel } from "@/server/shop/launch-rules";
import { ShopSurface } from "@/components/shop/chrome";
import { BoardRuntime, Clock, MenuRotator } from "@/components/menu/board-client";
import { BeadFrame, BeadRule } from "@/components/menu/beadwork";
import { Countdown } from "@/components/shop/countdown";
import { DropArt, fmtSpan, fmtWhen } from "@/components/shop/launch-cards";
import { QrCode } from "@/components/shop/qr";
import { Mark, Wordmark } from "@/components/brand/logo";
import { ProductArt } from "@/components/product/art";
import { fmtDay, weekdaySA } from "@/lib/format";
import { zar } from "@/lib/money";

export const metadata: Metadata = { title: "Menu", robots: { index: false, follow: false } };

const PER_PANEL = 10;
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Panel =
  | { kind: "items"; title: string; blurb: string | null; items: BoardItem[]; page: number; pages: number }
  | { kind: "dispensary" }
  | { kind: "club" }
  | { kind: "drop"; drop: DropView }
  | { kind: "event"; event: EventCard };

// Board-wide styles: the bead frame's thickness, item states driven by the live poll, and portrait/landscape tweaks.
const BOARD_CSS = `
.board{--bead:2.6vmin;cursor:none}
.board *{cursor:none!important}
.menu-item[data-sold-out]{opacity:.42}
.menu-item[data-sold-out] .price,.menu-item[data-sold-out] .member,.menu-item[data-sold-out] .low{display:none}
.menu-item .soldout{display:none}
.menu-item[data-sold-out] .soldout{display:inline-flex}
.menu-item .low{display:none}
.menu-item[data-low] .low{display:inline}
@media (prefers-reduced-motion:reduce){.board .animate-spin-slow{animation:none!important}}
`;

export default async function MenuBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await boardStore(slug);
  if (!store) notFound();
  const classes = await getClasses();
  const showLicensed = classes.thcMode === "ADULT_USE";
  const [menu, deals, drop, events] = await Promise.all([
    boardMenu(store.id, { includeLicensed: showLicensed }),
    storeDeals(store.id),
    featuredDrop(null), // the public view: when it opens for everyone
    upcomingEvents({ storeId: store.id, take: 2 }),
  ]);

  const panels: Panel[] = [];
  for (const c of menu) {
    const pages = Math.ceil(c.items.length / PER_PANEL);
    for (let p = 0; p < pages; p++) panels.push({ kind: "items", title: c.name, blurb: c.blurb, items: c.items.slice(p * PER_PANEL, (p + 1) * PER_PANEL), page: p + 1, pages });
  }
  // The dispensary panel only where this store is licensed to dispense (medical mode keeps medicines off the board).
  if (!showLicensed && store.licences.some((c) => classes.licensed.includes(c))) panels.splice(Math.min(2, panels.length), 0, { kind: "dispensary" });
  // Launch programme: the live/next drop early in the loop, this store's events after the dispensary panel.
  if (drop && drop.products.length && !(drop.phase === "live" && drop.left <= 0)) panels.splice(Math.min(1, panels.length), 0, { kind: "drop", drop });
  panels.splice(Math.min(4, panels.length), 0, ...events.map((event) => ({ kind: "event" as const, event })));
  panels.push({ kind: "club" });
  const o = openState(parseHours(store.hours));
  const base = APP_URL();
  const anyMemberPrices = menu.some((c) => c.items.some((i) => i.memberCents != null));

  return (
    <main className="board fixed inset-0 flex select-none flex-col overflow-hidden bg-ink-950 text-ink-100" style={{ padding: "var(--bead)" }}>
      <ShopSurface />
      <style>{BOARD_CSS}</style>
      <BeadFrame />
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-[10vmin] shrink-0 items-center justify-between border-b border-ink-850 px-[2.4vmin]">
          <div className="flex min-w-0 items-center gap-[1.4vmin] text-brand-500">
            <Mark className="h-[6.4vmin] w-[6.4vmin]" spin />
            <Wordmark className="text-[2vmin]" />
            <span className="ml-[0.8vmin] truncate border-l border-ink-800 pl-[1.6vmin] font-display text-[3.2vmin] font-semibold text-white">{store.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-[2.2vmin]">
            <span className={`rounded-full px-[1.4vmin] py-[0.6vmin] text-[1.6vmin] font-semibold ${o.open ? "bg-leaf-500/15 text-leaf-100" : "bg-ink-800 text-ink-300"}`}>{o.label}</span>
            <Clock />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_28vmin] gap-[2.4vmin] px-[2.4vmin] py-[2.4vmin] portrait:grid-cols-1 portrait:grid-rows-[minmax(0,1fr)_auto]">
          <MenuRotator count={panels.length}>
            {panels.map((p, n) =>
              p.kind === "items" ? (
                <div key={n} className="flex h-full flex-col pb-[2.6vmin]">
                  <div className="flex items-end justify-between gap-[2vmin]">
                    <div className="min-w-0">
                      <h1 className="truncate font-display text-[6.2vmin] font-semibold leading-none tracking-tight text-white">{p.title}</h1>
                      <BeadRule className="mt-[1.2vmin] h-[0.9vmin] w-[14vmin]" />
                      {p.blurb && <p className="mt-[1vmin] line-clamp-1 text-[2vmin] text-ink-400">{p.blurb}</p>}
                    </div>
                    {p.pages > 1 && (
                      <span className="tnum shrink-0 text-[1.8vmin] text-ink-450">
                        {p.page} / {p.pages}
                      </span>
                    )}
                  </div>
                  <ul className="mt-[2.6vmin] grid flex-1 auto-rows-min grid-cols-2 gap-x-[1.8vmin] gap-y-[1.4vmin] portrait:grid-cols-1">
                    {p.items.map((i) => (
                      <li
                        key={i.variantId}
                        data-variant={i.variantId}
                        {...(i.qty <= 0 ? { "data-sold-out": "" } : i.qty <= 3 ? { "data-low": "" } : {})}
                        className="menu-item flex items-center gap-[1.4vmin] rounded-[1.8vmin] border border-ink-800 bg-ink-900/70 p-[1.2vmin] pr-[1.8vmin] transition-opacity duration-700"
                      >
                        <ProductArt slug={i.slug} strain={i.strain} regClass={i.regClass} label={i.name} className="h-[8.6vmin] w-[8.6vmin] shrink-0 rounded-[1.3vmin]" />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[2.4vmin] font-semibold leading-[1.12] text-white">{i.name}</div>
                          <div className="mt-[0.4vmin] truncate text-[1.8vmin] text-ink-400">
                            {i.variant}
                            {i.heritage && <span className="ml-[0.8vmin] font-semibold text-brand-400">Heritage</span>}
                            <span className="low ml-[0.8vmin] font-semibold text-amber-100">Last few</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="price tnum font-display text-[2.9vmin] font-semibold leading-none text-white" data-price>
                            {zar(i.priceCents)}
                          </div>
                          {i.wasCents != null && i.wasCents > i.priceCents && <div className="price tnum mt-[0.3vmin] text-[1.5vmin] text-ink-450 line-through">{zar(i.wasCents)}</div>}
                          <div className="member tnum mt-[0.5vmin] text-[1.6vmin] font-semibold text-brand-400" data-member hidden={i.memberCents == null}>
                            {i.memberCents != null ? `Members ${zar(i.memberCents)}` : ""}
                          </div>
                          <span className="soldout items-center rounded-full border border-ink-600 px-[1vmin] py-[0.3vmin] text-[1.5vmin] font-semibold uppercase tracking-[0.12em] text-ink-300">Sold out</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : p.kind === "dispensary" ? (
                <div key={n} className="flex h-full items-center pb-[2.6vmin]">
                  <div className="hh-frame flex w-full items-center gap-[3vmin] p-[4.5vmin] portrait:flex-col portrait:text-center">
                    <Mark className="h-[24vmin] w-[24vmin] shrink-0 text-brand-500" />
                    <div>
                      <div className="eyebrow text-[1.8vmin] text-brand-500">Dispensary</div>
                      <h1 className="mt-[1.5vmin] font-display text-[5.6vmin] font-semibold leading-[1.05] text-white">Registered patient? Ask our dispenser.</h1>
                      <p className="mt-[2vmin] max-w-[60vmin] text-[2.3vmin] leading-relaxed text-ink-300">
                        Licensed medicines are supplied only on a valid SAHPRA authorisation, by an authorised dispenser, so they&apos;re not shown on this screen. Speak to our team in private at the counter.
                      </p>
                    </div>
                  </div>
                </div>
              ) : p.kind === "drop" ? (
                <DropSlide key={n} d={p.drop} url={`${base}/drops/${p.drop.slug}`} />
              ) : p.kind === "event" ? (
                <EventSlide key={n} e={p.event} url={`${base}/events/${p.event.slug}`} />
              ) : (
                <div key={n} className="flex h-full items-center pb-[2.6vmin]">
                  <div className="flex w-full items-center gap-[4vmin] rounded-[3vmin] border border-ink-800 bg-ink-900 p-[4.5vmin] portrait:flex-col portrait:text-center">
                    <div className="w-[22vmin] shrink-0 rounded-[2vmin] bg-white p-[1.4vmin]">
                      <QrCode value={`${base}/club/join?store=${store.code}`} label="Join Herbal Holland Rewards" margin={1} />
                    </div>
                    <div>
                      <div className="eyebrow text-[1.8vmin] text-brand-500">Herbal Holland Rewards</div>
                      <h1 className="mt-[1.5vmin] font-display text-[5.6vmin] font-semibold leading-[1.05] text-white">Scan to join free. Pay less today.</h1>
                      <p className="mt-[2vmin] max-w-[60vmin] text-[2.3vmin] leading-relaxed text-ink-300">Instant member prices, points on every rand, and your card on your phone. Adults 18+.</p>
                    </div>
                  </div>
                </div>
              ),
            )}
          </MenuRotator>

          <aside className="flex min-h-0 flex-col gap-[2.2vmin] portrait:grid portrait:grid-cols-[minmax(0,1fr)_38vmin] portrait:gap-[2.2vmin]">
            <div className="min-h-0 flex-1 overflow-hidden rounded-[2.2vmin] border border-brand-500/40 bg-brand-500/[0.06] p-[2.6vmin] portrait:max-h-[30vmin]">
              <div className="eyebrow text-[1.6vmin] text-brand-400">Today&apos;s deals</div>
              {deals.length ? (
                <ul className="mt-[1.8vmin] space-y-[1.8vmin] portrait:grid portrait:grid-cols-2 portrait:gap-[1.6vmin] portrait:space-y-0">
                  {deals.slice(0, 4).map((d) => (
                    <li key={d.id}>
                      <div className="font-display text-[2.4vmin] font-semibold leading-tight text-white">{d.name}</div>
                      <div className="mt-[0.4vmin] line-clamp-2 text-[1.7vmin] leading-snug text-ink-300">{d.description ?? dealHeadline(d)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-[2vmin] text-[2vmin] text-ink-400">Ask about this week&apos;s member prices.</p>
              )}
            </div>
            <div className="flex items-center gap-[1.6vmin] rounded-[2.2vmin] border border-ink-800 bg-ink-900 p-[2vmin]">
              <div className="w-[12vmin] shrink-0 rounded-[1.4vmin] bg-white p-[0.8vmin]">
                <QrCode value={`${base}/shop`} label="Shop online" margin={1} />
              </div>
              <div className="min-w-0">
                <div className="font-display text-[2.3vmin] font-semibold text-white">Shop online</div>
                <div className="text-[1.6vmin] leading-snug text-ink-400">Order now, collect here or get it delivered.</div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="flex h-[6vmin] shrink-0 items-center justify-between gap-[2vmin] border-t border-ink-850 px-[2.4vmin] text-[1.6vmin] text-ink-400">
          <span className="truncate">
            Lab-tested &amp; batch-traceable · Prices include VAT
            {anyMemberPrices ? " · Member prices for Herbal Holland Rewards members" : ""}
            {!showLicensed ? " · Medicines: ask an authorised dispenser" : ""}
          </span>
          <span className="flex shrink-0 items-center gap-[1.8vmin]">
            <BoardRuntime slug={store.slug} />
            <span className="flex items-center gap-[0.6vmin] font-semibold text-ink-200">
              <span className="rounded-full border-2 border-brand-500 px-[0.6vmin] text-[1.4vmin] font-bold text-brand-500">18+</span> Adults only
            </span>
          </span>
        </footer>
      </div>
    </main>
  );
}

/** The live or next drop: artwork, when it opens, the rules and a QR to shop it or get notified. */
function DropSlide({ d, url }: { d: DropView; url: string }) {
  const early = earlyLabel(d);
  const live = d.phase === "live" || d.phase === "early";
  return (
    <div className="flex h-full items-center pb-[2.6vmin]">
      <div className="grid w-full grid-cols-[38%_minmax(0,1fr)] items-center gap-[3vmin] rounded-[3vmin] border border-brand-500/40 bg-ink-900 p-[3.6vmin] portrait:grid-cols-1">
        <DropArt d={d} className="aspect-square w-full rounded-[2.4vmin] portrait:mx-auto portrait:w-[40vmin]" />
        <div className="min-w-0">
          <div className="eyebrow text-[1.8vmin] text-brand-500">{live ? "Live now · limited drop" : "Limited drop · coming soon"}</div>
          <h1 className="mt-[1.4vmin] font-display text-[6vmin] font-semibold leading-[1.02] tracking-tight text-white">{d.name}</h1>
          <p className="mt-[1.8vmin] line-clamp-3 text-[2.3vmin] leading-relaxed text-ink-300">{d.blurb}</p>
          {!live && (
            <p className="mt-[2.4vmin] text-[2.6vmin] text-ink-200">
              Opens {fmtWhen(d.opensAt)} · <Countdown to={d.opensAt} label={`Opens ${fmtWhen(d.opensAt)}`} className="font-display font-semibold text-white" />
            </p>
          )}
          <ul className="mt-[2.4vmin] space-y-[0.8vmin] text-[2vmin] text-ink-300">
            {early && (
              <li className="flex items-center gap-[0.8vmin]">
                <Crown className="h-[2.2vmin] w-[2.2vmin] shrink-0 text-brand-400" /> {early}
              </li>
            )}
            <li className="flex items-center gap-[0.8vmin]">
              <ShoppingBag className="h-[2.2vmin] w-[2.2vmin] shrink-0 text-brand-400" /> Limit {d.perMemberLimit} per member{d.membersOnly ? " · Rewards members only" : ""}
            </li>
          </ul>
          <div className="mt-[3vmin] flex items-center gap-[1.8vmin]">
            <div className="w-[16vmin] shrink-0 rounded-[1.6vmin] bg-white p-[1vmin]">
              <QrCode value={url} label={live ? "Shop the drop" : "Get notified when the drop opens"} margin={1} />
            </div>
            <p className="font-display text-[2.6vmin] font-semibold leading-snug text-white">{live ? "Scan to shop the drop, or ask us at the counter." : "Scan and tap “Notify me” to hear the moment it opens."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** An upcoming event at this store with a QR to RSVP. */
function EventSlide({ e, url }: { e: EventCard; url: string }) {
  const [day, mon] = fmtDay(e.startsAt).split(" ");
  return (
    <div className="flex h-full items-center pb-[2.6vmin]">
      <div className="flex w-full items-center gap-[3.5vmin] rounded-[3vmin] border border-ink-800 bg-ink-900 p-[4.5vmin] portrait:flex-col portrait:text-center">
        <div className="flex w-[20vmin] shrink-0 flex-col items-center overflow-hidden rounded-[2.4vmin] border border-ink-700 bg-ink-950 text-center">
          <span className="w-full bg-brand-500 py-[0.8vmin] text-[2vmin] font-bold uppercase tracking-[0.2em] text-ink-950">{mon}</span>
          <span className="tnum pt-[1.2vmin] font-display text-[9vmin] font-semibold leading-none text-white">{day}</span>
          <span className="pb-[1.6vmin] pt-[0.6vmin] text-[2vmin] font-semibold uppercase tracking-wider text-ink-400">{DAY[weekdaySA(e.startsAt)]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-[1.8vmin] text-brand-500">Windmill Days · in this store</div>
          <h1 className="mt-[1.4vmin] font-display text-[5.6vmin] font-semibold leading-[1.04] tracking-tight text-white">{e.title}</h1>
          <p className="mt-[1.6vmin] text-[2.6vmin] font-medium text-ink-100">{fmtSpan(e.startsAt, e.endsAt)}</p>
          <p className="mt-[1.4vmin] line-clamp-2 text-[2.2vmin] leading-relaxed text-ink-300">{e.blurb}</p>
          <p className="mt-[2vmin] text-[2.2vmin] font-semibold text-brand-300">{e.left > 0 ? `${e.left} places left · RSVP free · adults 18+, bring your ID` : "Fully booked, thank you!"}</p>
        </div>
        {e.left > 0 && (
          <div className="flex w-[22vmin] shrink-0 flex-col items-center gap-[1.2vmin]">
            <div className="w-full rounded-[2vmin] bg-white p-[1.2vmin]">
              <QrCode value={url} label={`RSVP for ${e.title}`} margin={1} />
            </div>
            <span className="text-[1.8vmin] font-semibold text-ink-200">Scan to RSVP</span>
          </div>
        )}
      </div>
    </div>
  );
}
