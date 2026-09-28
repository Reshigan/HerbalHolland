// In-store menu board for a 16:9 TV. Public catalogue only in MEDICAL mode — licensed
// medicines are never displayed; a panel points patients to the pharmacist instead.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Crown, ShoppingBag } from "lucide-react";
import { db } from "@/server/db";
import { APP_URL } from "@/server/invoices";
import { getClasses } from "@/server/shop/access";
import { dealHeadline } from "@/server/shop/catalogue";
import { storeDeals, storeMenu, type MenuItem } from "@/server/shop/stores";
import { openState, parseHours } from "@/server/shop/hours";
import { featuredDrop, upcomingEvents, type DropView, type EventCard } from "@/server/shop/launch";
import { earlyLabel } from "@/server/shop/launch-rules";
import { ShopSurface } from "@/components/shop/chrome";
import { Clock, MenuRotator } from "@/components/shop/menu-board";
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
  | { kind: "items"; title: string; blurb: string | null; items: MenuItem[]; page: number; pages: number }
  | { kind: "dispensary" }
  | { kind: "club" }
  | { kind: "drop"; drop: DropView }
  | { kind: "event"; event: EventCard };

export default async function MenuBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findFirst({ where: { slug, kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } }, select: { id: true, code: true, name: true, hours: true } });
  if (!store) notFound();
  const classes = await getClasses();
  const showLicensed = classes.thcMode === "ADULT_USE";
  const [menu, deals, drop, events] = await Promise.all([
    storeMenu(store.id, { includeLicensed: showLicensed }),
    storeDeals(store.id),
    featuredDrop(null), // the public view: when it opens for everyone
    upcomingEvents({ storeId: store.id, take: 2 }),
  ]);

  const panels: Panel[] = [];
  for (const c of menu) {
    const pages = Math.ceil(c.items.length / PER_PANEL);
    for (let p = 0; p < pages; p++) panels.push({ kind: "items", title: c.name, blurb: c.blurb, items: c.items.slice(p * PER_PANEL, (p + 1) * PER_PANEL), page: p + 1, pages });
  }
  if (!showLicensed) panels.splice(Math.min(2, panels.length), 0, { kind: "dispensary" });
  // Launch programme: the live/next drop early in the loop, this store's events after the dispensary panel.
  if (drop && drop.products.length && !(drop.phase === "live" && drop.left <= 0)) panels.splice(Math.min(1, panels.length), 0, { kind: "drop", drop });
  panels.splice(Math.min(4, panels.length), 0, ...events.map((event) => ({ kind: "event" as const, event })));
  panels.push({ kind: "club" });
  const o = openState(parseHours(store.hours));
  const base = APP_URL();

  return (
    <main className="fixed inset-0 flex cursor-none select-none flex-col overflow-hidden bg-ink-950 text-ink-100">
      <ShopSurface />
      <header className="flex h-[11vh] shrink-0 items-center justify-between border-b border-ink-850 px-[3vw]">
        <div className="flex items-center gap-[1.2vw] text-brand-500">
          <Mark className="h-[7vh] w-[7vh]" spin />
          <Wordmark className="text-[2.2vh]" />
          <span className="ml-[1vw] border-l border-ink-800 pl-[1.4vw] font-display text-[3.2vh] font-semibold text-white">{store.name}</span>
        </div>
        <div className="flex items-center gap-[2vw]">
          <span className={`rounded-full px-[1vw] py-[0.6vh] text-[1.6vh] font-semibold ${o.open ? "bg-leaf-500/15 text-leaf-100" : "bg-ink-800 text-ink-300"}`}>{o.label}</span>
          <Clock />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_27vw] gap-[2.5vw] px-[3vw] py-[3vh]">
        <MenuRotator count={panels.length}>
          {panels.map((p, n) =>
            p.kind === "items" ? (
              <div key={n} className="flex h-full flex-col pb-[3vh]">
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="font-display text-[6.4vh] font-semibold leading-none tracking-tight text-white">{p.title}</h1>
                    {p.blurb && <p className="mt-[1vh] text-[2vh] text-ink-400">{p.blurb}</p>}
                  </div>
                  {p.pages > 1 && <span className="tnum text-[1.8vh] text-ink-500">{p.page} / {p.pages}</span>}
                </div>
                <ul className="mt-[3.5vh] grid flex-1 auto-rows-min grid-cols-2 gap-x-[1.6vw] gap-y-[1.6vh]">
                  {p.items.map((i) => (
                    <li key={i.variantId} className="flex items-center gap-[1.2vw] rounded-[1.8vh] border border-ink-800 bg-ink-900/70 p-[1.3vh] pr-[1.6vw]">
                      <ProductArt slug={i.slug} strain={i.strain} regClass={i.regClass} label={i.name} className="h-[9.5vh] w-[9.5vh] shrink-0 rounded-[1.3vh]" />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[2.5vh] font-semibold leading-[1.15] text-white">{i.name}</div>
                        <div className="mt-[0.3vh] truncate text-[1.9vh] text-ink-400">
                          {i.variant}
                          {i.heritage && <span className="ml-[0.8vw] font-semibold text-brand-400">Heritage</span>}
                          {i.qty <= 3 && <span className="ml-[0.8vw] font-semibold text-amber-100">Last few</span>}
                        </div>
                      </div>
                      <div className="tnum shrink-0 text-right font-display text-[3vh] font-semibold text-white">{zar(i.priceCents)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : p.kind === "dispensary" ? (
              <div key={n} className="flex h-full items-center pb-[3vh]">
                <div className="hh-frame flex w-full items-center gap-[3vw] p-[5vh]">
                  <Mark className="h-[26vh] w-[26vh] shrink-0 text-brand-500" />
                  <div>
                    <div className="eyebrow text-[1.8vh] text-brand-500">Dispensary</div>
                    <h1 className="mt-[1.5vh] font-display text-[6vh] font-semibold leading-[1.05] text-white">Registered patient? Ask our pharmacist.</h1>
                    <p className="mt-[2vh] max-w-[46vw] text-[2.3vh] leading-relaxed text-ink-300">
                      Licensed medicines are supplied only on a valid SAHPRA authorisation, by an authorised dispenser — so they&apos;re not shown on this screen. Speak to our team in private at the counter.
                    </p>
                  </div>
                </div>
              </div>
            ) : p.kind === "drop" ? (
              <DropSlide key={n} d={p.drop} url={`${base}/drops/${p.drop.slug}`} />
            ) : p.kind === "event" ? (
              <EventSlide key={n} e={p.event} url={`${base}/events/${p.event.slug}`} />
            ) : (
              <div key={n} className="flex h-full items-center pb-[3vh]">
                <div className="flex w-full items-center gap-[4vw] rounded-[3vh] border border-ink-800 bg-ink-900 p-[5vh]">
                  <div className="w-[22vh] shrink-0 rounded-[2vh] bg-white p-[1.4vh]">
                    <QrCode value={`${base}/club/join?store=${store.code}`} label="Join Herbal Holland Rewards" margin={1} />
                  </div>
                  <div>
                    <div className="eyebrow text-[1.8vh] text-brand-500">Herbal Holland Rewards</div>
                    <h1 className="mt-[1.5vh] font-display text-[6vh] font-semibold leading-[1.05] text-white">Scan to join free. Pay less today.</h1>
                    <p className="mt-[2vh] max-w-[44vw] text-[2.3vh] leading-relaxed text-ink-300">Instant member prices, points on every rand, and your card on your phone. Adults 18+.</p>
                  </div>
                </div>
              </div>
            ),
          )}
        </MenuRotator>

        <aside className="flex min-h-0 flex-col gap-[2.5vh]">
          <div className="min-h-0 flex-1 overflow-hidden rounded-[2.2vh] border border-brand-500/40 bg-brand-500/[0.06] p-[2.8vh]">
            <div className="eyebrow text-[1.6vh] text-brand-400">Today&apos;s deals</div>
            {deals.length ? (
              <ul className="mt-[2vh] space-y-[2vh]">
                {deals.slice(0, 4).map((d) => (
                  <li key={d.id}>
                    <div className="font-display text-[2.5vh] font-semibold leading-tight text-white">{d.name}</div>
                    <div className="mt-[0.4vh] text-[1.7vh] leading-snug text-ink-300">{d.description ?? dealHeadline(d)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-[2vh] text-[2vh] text-ink-400">Ask about this week&apos;s member prices.</p>
            )}
          </div>
          <div className="flex items-center gap-[1.4vw] rounded-[2.2vh] border border-ink-800 bg-ink-900 p-[2.2vh]">
            <div className="w-[13vh] shrink-0 rounded-[1.4vh] bg-white p-[0.8vh]">
              <QrCode value={`${base}/shop`} label="Shop online" margin={1} />
            </div>
            <div>
              <div className="font-display text-[2.4vh] font-semibold text-white">Shop online</div>
              <div className="text-[1.6vh] leading-snug text-ink-400">Order now, collect here or get it delivered.</div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex h-[6vh] shrink-0 items-center justify-between border-t border-ink-850 px-[3vw] text-[1.7vh] text-ink-400">
        <span>Lab-tested &amp; batch-traceable · Scan any pack for its certificate · Prices include VAT</span>
        <span className="flex items-center gap-[0.6vw] font-semibold text-ink-200">
          <span className="rounded-full border-2 border-brand-500 px-[0.5vw] text-[1.4vh] font-bold text-brand-500">18+</span> Adults only
        </span>
      </footer>
    </main>
  );
}

/** The live or next drop: artwork, when it opens, the rules and a QR to shop it or get notified. */
function DropSlide({ d, url }: { d: DropView; url: string }) {
  const early = earlyLabel(d);
  const live = d.phase === "live" || d.phase === "early";
  return (
    <div className="flex h-full items-center pb-[3vh]">
      <div className="grid w-full grid-cols-[40%_minmax(0,1fr)] items-center gap-[3vw] rounded-[3vh] border border-brand-500/40 bg-ink-900 p-[4vh]">
        <DropArt d={d} className="aspect-square w-full rounded-[2.4vh]" />
        <div className="min-w-0">
          <div className="eyebrow text-[1.8vh] text-brand-500">{live ? "Live now · limited drop" : "Limited drop · coming soon"}</div>
          <h1 className="mt-[1.4vh] font-display text-[6.4vh] font-semibold leading-[1.02] tracking-tight text-white">{d.name}</h1>
          <p className="mt-[1.8vh] line-clamp-3 text-[2.3vh] leading-relaxed text-ink-300">{d.blurb}</p>
          {!live && (
            <p className="mt-[2.4vh] text-[2.6vh] text-ink-200">
              Opens {fmtWhen(d.opensAt)} · <Countdown to={d.opensAt} label={`Opens ${fmtWhen(d.opensAt)}`} className="font-display font-semibold text-white" />
            </p>
          )}
          <ul className="mt-[2.4vh] space-y-[0.8vh] text-[2vh] text-ink-300">
            {early && (
              <li className="flex items-center gap-[0.6vw]">
                <Crown className="h-[2.2vh] w-[2.2vh] shrink-0 text-brand-400" /> {early}
              </li>
            )}
            <li className="flex items-center gap-[0.6vw]">
              <ShoppingBag className="h-[2.2vh] w-[2.2vh] shrink-0 text-brand-400" /> Limit {d.perMemberLimit} per member{d.membersOnly ? " · Rewards members only" : ""}
            </li>
          </ul>
          <div className="mt-[3vh] flex items-center gap-[1.4vw]">
            <div className="w-[16vh] shrink-0 rounded-[1.6vh] bg-white p-[1vh]">
              <QrCode value={url} label={live ? "Shop the drop" : "Get notified when the drop opens"} margin={1} />
            </div>
            <p className="font-display text-[2.6vh] font-semibold leading-snug text-white">{live ? "Scan to shop the drop — or ask us at the counter." : "Scan and tap “Notify me” to hear the moment it opens."}</p>
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
    <div className="flex h-full items-center pb-[3vh]">
      <div className="flex w-full items-center gap-[3.5vw] rounded-[3vh] border border-ink-800 bg-ink-900 p-[5vh]">
        <div className="flex w-[20vh] shrink-0 flex-col items-center overflow-hidden rounded-[2.4vh] border border-ink-700 bg-ink-950 text-center">
          <span className="w-full bg-brand-500 py-[0.8vh] text-[2vh] font-bold uppercase tracking-[0.2em] text-ink-950">{mon}</span>
          <span className="tnum pt-[1.2vh] font-display text-[9vh] font-semibold leading-none text-white">{day}</span>
          <span className="pb-[1.6vh] pt-[0.6vh] text-[2vh] font-semibold uppercase tracking-wider text-ink-400">{DAY[weekdaySA(e.startsAt)]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-[1.8vh] text-brand-500">Windmill Days · in this store</div>
          <h1 className="mt-[1.4vh] font-display text-[6vh] font-semibold leading-[1.04] tracking-tight text-white">{e.title}</h1>
          <p className="mt-[1.6vh] text-[2.6vh] font-medium text-ink-100">{fmtSpan(e.startsAt, e.endsAt)}</p>
          <p className="mt-[1.4vh] line-clamp-2 text-[2.2vh] leading-relaxed text-ink-300">{e.blurb}</p>
          <p className="mt-[2vh] text-[2.2vh] font-semibold text-brand-300">{e.left > 0 ? `${e.left} places left · RSVP free · adults 18+, bring your ID` : "Fully booked — thank you!"}</p>
        </div>
        {e.left > 0 && (
          <div className="flex w-[22vh] shrink-0 flex-col items-center gap-[1.2vh]">
            <div className="w-full rounded-[2vh] bg-white p-[1.2vh]">
              <QrCode value={url} label={`RSVP for ${e.title}`} margin={1} />
            </div>
            <span className="text-[1.8vh] font-semibold text-ink-200">Scan to RSVP</span>
          </div>
        )}
      </div>
    </div>
  );
}
