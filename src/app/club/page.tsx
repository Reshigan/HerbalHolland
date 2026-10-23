import Link from "next/link";
import { ArrowRight, BadgePercent, Cake, CalendarClock, Crown, Gift, Pill, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { CONSENT_WORDING } from "@/server/customers";
import { APP_URL } from "@/server/invoices";
import { foundingTaken, launchState, waitlistPlace } from "@/server/launch";
import { foundingPlaces } from "@/server/shop/launch-rules";
import { sharePath } from "@/server/share";
import { LEDGER_LABEL, ledgerTitle, memberOverview, tierIndex } from "@/server/shop/club";
import { getPreferredStore, getRetailStores, homeStoreOptions } from "@/server/shop/context";
import { canBuyOnline } from "@/lib/launch-phase";
import { memberDeals, memberTickets, upcomingEvents, welcomeGifts } from "@/server/shop/launch";
import { MemberCard } from "@/components/shop/member-card";
import { WalletButtons } from "@/components/shop/wallet-buttons";
import { ClubMore } from "@/components/shop/club-more";
import { ReorderButton } from "@/components/shop/reorder-button";
import { PhoneAuth } from "@/components/shop/phone-auth";
import { ShareLink } from "@/components/shop/club-client";
import { DealsPanel, TicketsPanel, WaitlistCard, WelcomeGiftBanner } from "@/components/shop/club-launch";
import { ShareButton } from "@/components/shop/share";
import { Callout, Container, Meter, Panel, Tag, type TagTone } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { fmtDate, num, timeAgo } from "@/lib/format";
import { plural } from "@/lib/plural";
import { fmtPoints, tierBenefits, tierInfo, TIERS, type TierKey } from "@/lib/loyalty-rules";
import { zar, zarWhole } from "@/lib/money";
import { BOOST_DAYS, nextRung, windmillCrew } from "@/lib/referral-ladder";
import { cn } from "@/lib/cn";

export const metadata = { title: { absolute: "Herbal Holland Rewards" } };

const ORDER_TONE: Record<string, [string, TagTone]> = {
  PENDING_PAYMENT: ["Awaiting payment", "amber"], PLACED: ["Placed", "orange"], PICKING: ["Being packed", "violet"], READY: ["Ready", "green"],
  OUT_FOR_DELIVERY: ["Out for delivery", "violet"], COMPLETED: ["Completed", "neutral"], CANCELLED: ["Cancelled", "red"],
};

/** `?earned=<pts>`: points that just landed (a quest, the till's receipt link): the card counts them up with a burst. */
const earnedParam = (v: string | undefined) => {
  const n = v && /^\d{1,6}$/.test(v) ? Number(v) : 0;
  return Math.min(100_000, n);
};

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ welcome?: string; earned?: string }> }) {
  const sp = await searchParams;
  const [customer, settings] = await Promise.all([getCustomer(), getSettings()]);
  if (!customer) return <Landing />;

  const store = await getPreferredStore();
  const [m, launch, deals, tickets, gifts] = await Promise.all([
    memberOverview(customer.id),
    launchState(),
    memberDeals(customer.id),
    memberTickets(customer.id),
    welcomeGifts(customer, store?.id),
  ]);
  const [waitlist, coming] = await Promise.all([launch.preLaunch ? waitlistPlace(customer.id) : null, tickets.length ? [] : upcomingEvents({ take: 2, homeStoreId: customer.homeStoreId })]);
  const canBuy = canBuyOnline(settings.launch.phase);
  const savings = settings.loyalty.tierSavingsPct as Record<TierKey, number>;
  const idx = tierIndex(m.customer.tier);
  const base = APP_URL();
  const referUrl = `${base}/club/join?ref=${m.customer.referralCode}`;
  const rung = nextRung(m.qualifiedReferrals);
  const name = [m.customer.firstName, m.customer.lastName].filter(Boolean).join(" ");
  // Signed share cards: first name, savings and tier only, never what the member bought.
  const card = { referralCode: m.customer.referralCode, firstName: m.customer.firstName, tier: m.customer.tier as TierKey };
  const shareSavings = m.savedCents >= 100 ? `${base}${sharePath({ ...card, savedCents: m.savedCents })}` : null;
  const shareTier = `${base}${sharePath({ ...card, savedCents: 0 })}`;
  // The floor line on the card only matters while it is what holds the tier.
  const floorUntil = m.floor && m.floor.tier.key === m.customer.tier ? m.floor.until : null;
  // Where the balance counts up from: 0 on the welcome, below the points that just landed, or below the latest entry
  // when it is fresh (the last hour), so the count is a moment, not a replay on every visit.
  const earned = earnedParam(sp.earned);
  const latest = m.ledger[0];
  const countFrom = sp.welcome ? 0 : earned ? m.customer.points - earned : latest && Date.now() - latest.createdAt.getTime() < 3_600_000 ? m.customer.points - latest.points : m.customer.points;

  return (
    <Container className="pt-8">
      {sp.welcome && (
        <Callout tone="success" icon={<Sparkles className="h-5 w-5" />} title={`Welcome to Herbal Holland Rewards, ${m.customer.firstName}!`} className="hh-enter mb-8">
          {launch.preLaunch && launch.at
            ? `Your card is ready, and you're on the Founding Members list until ${fmtDate(launch.at)}. Share your link below to move up; ${fmtPoints(settings.loyalty.signupBonus)} are already on your card.`
            : `Your card is ready. Show the QR code at any till to earn points. We've added ${fmtPoints(settings.loyalty.signupBonus)} to get you started.`}
        </Callout>
      )}
      {sp.welcome && <InstallPrompt app="rewards" priority className="hh-enter mb-8 [--hh-delay:250ms]" />}
      {/* Right after joining is when a member is keenest to tell someone: the invite comes before anything else. */}
      {sp.welcome && (
        <Panel className="hh-enter mb-8 p-5 [--hh-delay:500ms]">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <Users className="h-5 w-5 text-brand-500" /> {launch.preLaunch && launch.at ? "Move up the Founding Members list" : "Bring your people"}
          </h2>
          <p className="mb-4 mt-1 text-sm text-ink-300">
            {launch.preLaunch && launch.at
              ? `Every friend (18+) who joins with your link moves you ${num(launch.referralBoost)} places up. The first ${num(launch.foundingCap)} get a numbered card.`
              : `When a friend (18+) joins with your link and makes their first purchase, you each get ${fmtPoints(settings.loyalty.referralBonus)}.`}
          </p>
          <ShareLink
            url={referUrl}
            text={
              launch.preLaunch && launch.at
                ? `I'm on the Herbal Holland Founding Members list. The first ${num(launch.foundingCap)} members get a numbered card, and it closes ${fmtDate(launch.at)}. Join free with my link (adults 18+):`
                : `Join me at Herbal Holland Rewards: member prices from day one, and we both get ${settings.loyalty.referralBonus} points after your first purchase. Adults 18+:`
            }
          />
        </Panel>
      )}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-4">
          <MemberCard name={name} memberNo={m.customer.memberNo} tierName={m.tier.name} tierIndex={idx} points={m.customer.points} founding={m.customer.foundingNo} firstYear={!m.customer.foundingNo && !!m.floor && !!launch.at && m.customer.createdAt < launch.at} floorUntil={floorUntil} countFrom={countFrom} earned={earned} className={sp.welcome ? "hh-shimmer-once" : undefined} />
          <p className="text-center text-xs text-ink-400">Scan at the till to earn and spend points · worth {zar(m.customer.points * 100)}</p>
          <WalletButtons />
          {!sp.welcome && <InstallPrompt app="rewards" />}
        </div>

        <div className="space-y-6">
          <div>
            <div className="eyebrow text-brand-500">{m.tier.name} member{m.customer.homeStore ? ` · ${m.customer.homeStore.name}` : ""}</div>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">Hi {m.customer.firstName}</h1>
            <p className="mt-2 text-ink-300">
              Your {m.tier.name} price takes {savings[m.tier.key]}% off instantly, and you earn {settings.loyalty.earnPer100} points for every R100. Member since {fmtDate(m.customer.createdAt)}.
            </p>
            {m.savedCents > 0 && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm text-brand-100">
                <BadgePercent className="h-4 w-4 text-brand-400" /> You&apos;ve saved <strong className="tnum text-white">{zar(m.savedCents)}</strong> with Herbal Holland Rewards
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {shareSavings && (
                <ShareButton
                  url={shareSavings}
                  title="Herbal Holland Rewards"
                  text={`I've saved ${zar(m.savedCents)} with Herbal Holland Rewards. Join free with my link (adults 18+):`}
                  label="Share your savings"
                />
              )}
              <ShareButton url={shareTier} title="Herbal Holland Rewards" text={`I'm a ${m.tier.name} member of Herbal Holland Rewards. Join free with my link (adults 18+):`} label="Share your tier" />
            </div>
          </div>

          {waitlist && launch.at && (
            <WaitlistCard
              w={waitlist}
              cap={launch.foundingCap}
              firstYear={launch.firstYearMonths ? `${tierInfo(launch.foundingTier).name} for ${launch.firstYearMonths} months` : null}
              referUrl={referUrl}
              firstName={m.customer.firstName}
              shareText={`I'm on the Herbal Holland Founding Members list. The first ${num(launch.foundingCap)} members get a numbered card, and it closes ${fmtDate(launch.at)}. Join free with my link (adults 18+):`}
            />
          )}
          {gifts.map((g) => (
            <WelcomeGiftBanner key={g.id} gift={g} canBuy={canBuy} />
          ))}

          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 className="flex shrink-0 items-center gap-2 font-display text-lg font-semibold text-white">
                <Trophy className="h-5 w-5 text-brand-500" /> Your tier
              </h2>
              <span className="tnum text-sm text-ink-400">{zarWhole(m.spend)} in the last 12 months</span>
            </div>
            <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Tiers">
              {TIERS.map((t, i) => (
                <li key={t.key} className="text-center">
                  <div className={cn("h-1.5 rounded-full", i <= idx ? "bg-brand-500" : "bg-ink-800")} />
                  <div className={cn("mt-2 text-xs font-semibold", i === idx ? "text-white" : i < idx ? "text-ink-300" : "text-ink-450")}>{t.name}</div>
                  <div className="text-[0.68rem] text-ink-450">{savings[t.key]}% off</div>
                </li>
              ))}
            </ol>
            {m.floor && (
              <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-brand-500/30 bg-brand-500/[0.07] px-3.5 py-3 text-sm text-brand-100">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>
                  As a Founding Member you keep <strong className="font-semibold text-white">{m.floor.tier.name}</strong> until {fmtDate(m.floor.until)}, whatever you spend.
                </span>
              </p>
            )}
            {m.goal ? (
              <div className="mt-5">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-300">
                    Spend <strong className="text-white">{zarWhole(Math.max(0, m.goal.remainingCents))}</strong> more {m.goal.mode === "keep" ? "to keep" : "to reach"} <strong className="text-white">{m.goal.tier.name}</strong>
                  </span>
                  <span className="tnum shrink-0 text-ink-450">{Math.min(99, Math.floor((m.spend / m.goal.tier.minCents) * 100))}%</span>
                </div>
                <Meter value={m.spend} max={m.goal.tier.minCents} className="mt-2" label={`Progress to ${m.goal.tier.name}`} />
                <p className="mt-2 text-xs text-ink-450">
                  {m.goal.mode === "keep" ? "Your tier is reviewed with every purchase against your last 12 months of spend in store and online." : "Tiers follow your rolling 12-month spend in store and online."}
                </p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-brand-200">You&apos;re at our top tier. Thank you for being one of our best members.</p>
            )}
            <div className="mt-5 grid grid-cols-1 gap-3 border-t border-ink-800 pt-5 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Your perks</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-100">
                  {tierBenefits(m.tier.key, savings, settings.loyalty.earnPer100).map((p) => (
                    <li key={p} className="flex gap-2">
                      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> {p}
                    </li>
                  ))}
                  {idx > 0 && (
                    <li className="flex gap-2">
                      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> Every {TIERS[idx - 1].name} perk, too
                    </li>
                  )}
                </ul>
              </div>
              {m.goal?.mode === "reach" && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Unlock at {m.goal.tier.name}</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-400">
                    {tierBenefits(m.goal.tier.key, savings, settings.loyalty.earnPer100).map((p) => (
                      <li key={p} className="flex gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ink-600" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <ClubMore customerId={customer.id} className="mt-8" />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DealsPanel deals={deals} personalised={m.customer.personalisedOffers} />
        {(tickets.length > 0 || coming.length > 0) && <TicketsPanel tickets={tickets} suggestions={coming} />}

        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">Recent points</h2>
            <Link href="/club/points" className="text-sm font-semibold text-brand-400 hover:underline">
              All activity
            </Link>
          </div>
          {m.ledger.length ? (
            <ul className="mt-3 divide-y divide-ink-800">
              {m.ledger.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-100">{ledgerTitle(e)}</div>
                    <div className="truncate text-xs text-ink-450">
                      {LEDGER_LABEL[e.kind] ?? e.kind} · {timeAgo(e.createdAt)}
                    </div>
                  </div>
                  <span className={cn("tnum shrink-0 font-semibold", e.points >= 0 ? "text-leaf-100" : "text-ink-300")}>
                    {e.points >= 0 ? "+" : "−"}
                    {fmtPoints(Math.abs(e.points))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-400">No activity yet. Your first purchase earns points.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">Recent orders</h2>
            <Link href="/club/orders" className="text-sm font-semibold text-brand-400 hover:underline">
              All orders
            </Link>
          </div>
          {m.orders.length ? (
            <ul className="mt-3 divide-y divide-ink-800">
              {m.orders.map((o) => {
                const [label, tone] = ORDER_TONE[o.status];
                return (
                  <li key={o.id} className="flex items-center gap-3 py-3 text-sm">
                    <Link href={`/orders/${o.code}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:text-white">
                      <div className="min-w-0">
                        <div className="font-medium text-ink-100">
                          Order {o.code} · {o._count.lines} item{o._count.lines === 1 ? "" : "s"}
                        </div>
                        <div className="truncate text-xs text-ink-450">
                          {o.fulfilment === "COLLECT" ? `Collect at ${o.store.name}` : "Delivery"} · {fmtDate(o.createdAt)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Tag tone={tone}>{label}</Tag>
                        <div className="tnum mt-1 text-xs text-ink-400">{zar(o.totalCents - o.pointsRedeemed * 100)}</div>
                      </div>
                    </Link>
                    {o.status === "COMPLETED" && <ReorderButton orderId={o.id} size="sm" variant="ghost-dark" label="Buy again" className="shrink-0" />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3 text-sm text-ink-400">
              No online orders yet.{" "}
              <Link href="/shop" className="font-semibold text-brand-400 hover:underline">
                Start shopping
              </Link>
            </div>
          )}
        </Panel>

        {!waitlist && (
          <Panel className="scroll-mt-28 p-5" id="refer">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Users className="h-5 w-5 text-brand-500" /> Invite a friend
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              When a friend (18+) joins with your link and makes their first purchase, you each get {fmtPoints(settings.loyalty.referralBonus)}.
              {m.referrals > 0 && ` You've invited ${m.referrals} member${m.referrals === 1 ? "" : "s"} so far.`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-200">
                <span className="tnum font-semibold text-white">{num(m.qualifiedReferrals)}</span> {m.qualifiedReferrals === 1 ? "friend has" : "friends have"} made a first purchase
              </span>
              {windmillCrew(m.qualifiedReferrals) && <Tag tone="solid" icon={<Trophy className="h-3 w-3" />}>Windmill Crew</Tag>}
            </div>
            {rung && (
              <p className="mt-1 text-sm text-ink-300">
                {rung.remaining} more {rung.remaining === 1 ? "friend's first purchase" : "friends' first purchases"}:{" "}
                <span className="font-semibold text-brand-400">{rung.kind === "BOOST" ? `${TIERS[Math.min(idx + 1, TIERS.length - 1)].name} for ${BOOST_DAYS} days` : rung.reward}</span>
              </p>
            )}
            <div className="mt-4">
              <ShareLink url={referUrl} text={`Join me at Herbal Holland Rewards and we both get ${settings.loyalty.referralBonus} points after your first purchase. Adults 18+.`} />
            </div>
            <p className="mt-3 text-xs text-ink-450">
              Your code: <span className="tnum font-semibold text-ink-300">{m.customer.referralCode}</span> ·{" "}
              <Link href="/legal/referrals" className="underline hover:text-ink-200">
                Referral rules
              </Link>
            </p>
          </Panel>
        )}

        <Panel className="p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <Pill className="h-5 w-5 text-brand-500" /> Patient authorisation
          </h2>
          {m.auth ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Tag tone="green" icon={<ShieldCheck className="h-3 w-3" />}>
                  Active
                </Tag>
                <span className="text-ink-300">SAHPRA Section 21 · {m.auth.authNumber}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-ink-450">Prescriber</dt>
                  <dd className="text-ink-100">{m.auth.prescriber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-450">Valid until</dt>
                  <dd className="text-ink-100">{fmtDate(m.auth.validTo)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-ink-450">Scope</dt>
                  <dd className="text-ink-100">{m.auth.scope}</dd>
                </div>
              </dl>
              {m.patient && (
                <div>
                  <div className="flex justify-between text-xs text-ink-400">
                    <span>Authorised quantity left (rolling 30 days)</span>
                    <span className="tnum font-semibold text-white">
                      {Math.round(m.patient.remainingGrams * 10) / 10} g / {m.auth.monthlyLimitGrams} g
                    </span>
                  </div>
                  <Meter value={m.patient.remainingGrams} max={m.auth.monthlyLimitGrams} className="mt-2" />
                </div>
              )}
              <ButtonLink href="/dispensary" variant="outline-dark" size="md">
                Open the dispensary <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink-400">
              No active authorisation on file. If your doctor has obtained a Section 21 authorisation for you, bring it and your ID to any store to register it.{" "}
              <Link href="/learn/section-21" className="font-semibold text-brand-400 hover:underline">
                How it works
              </Link>
            </p>
          )}
        </Panel>
      </div>

      {!m.customer.ageVerifiedAt && (
        <Callout tone="warn" title="Verify your age to order online" className="mt-6">
          Add your SA ID number in <Link href="/club/settings" className="font-semibold text-white underline">Settings</Link>, or show your ID or passport at any store.
        </Callout>
      )}
    </Container>
  );
}

async function Landing() {
  const [settings, stores, store, launch, taken] = await Promise.all([getSettings(), getRetailStores(), getPreferredStore(), launchState(), foundingTaken()]);
  const places = launch.preLaunch && launch.at ? foundingPlaces({ cap: launch.foundingCap, taken, firstYearMonths: launch.firstYearMonths, tierName: tierInfo(launch.foundingTier).name, closes: fmtDate(launch.at) }) : null;
  const trading = stores.filter((s) => s.status === "ACTIVE");
  return (
    <Container className="pt-10 sm:pt-16">
      {launch.preLaunch && launch.at && (
        <Callout tone="brand" icon={<CalendarClock className="h-5 w-5" />} title={`Founding Members close ${fmtDate(launch.at)}. Join free.`} className="mb-10">
          {places?.lead} {places?.full ? "" : `Founding Members get a numbered card and start at ${tierInfo(launch.foundingTier).name} for ${launch.foundingMonths} months.`} Every friend who joins with your link moves you up {num(launch.referralBoost)} places.
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
        <div>
          <div className="eyebrow text-brand-500">Herbal Holland Rewards</div>
          <h1 className="mt-3 font-display text-5xl font-semibold leading-[1] tracking-tight text-white sm:text-6xl">
            Join free.
            <br />
            <span className="text-brand-500">Pay less, earn points.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-300">
            Members pay less instantly, {trading.length ? `in ${plural(trading.length, "store")} and online` : "online"}, and earn {settings.loyalty.earnPer100} points for every R100 to spend like cash. 1 point = R1.
          </p>
          <ul className="mt-8 grid grid-cols-1 max-w-xl gap-3 sm:grid-cols-2">
            {[
              [<Gift key="g" className="h-5 w-5" />, `${fmtPoints(settings.loyalty.signupBonus)} when you join`],
              [<Cake key="c" className="h-5 w-5" />, `${fmtPoints(settings.loyalty.birthdayBonus)} on your birthday`],
              [<Users key="u" className="h-5 w-5" />, `${fmtPoints(settings.loyalty.referralBonus)} for each friend you invite`],
              [<BadgePercent key="t" className="h-5 w-5" />, `${settings.loyalty.tierSavingsPct.SEED}% off instantly from day one, up to ${settings.loyalty.tierSavingsPct.HARVEST}% at Harvest`],
            ].map(([i, t]) => (
              <li key={String(t)} className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/60 p-4 text-sm text-ink-100">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400">{i}</span>
                {t}
              </li>
            ))}
          </ul>
          <ol className="mt-10 grid max-w-xl grid-cols-4 gap-2">
            {TIERS.map((t, i) => (
              <li key={t.key} className="rounded-2xl border border-ink-800 p-3 text-center">
                <div className={cn("mx-auto h-2 w-8 rounded-full", ["bg-ink-300", "bg-leaf-500", "bg-series-4", "bg-brand-500"][i])} />
                <div className="mt-2 font-display font-semibold text-white">{t.name}</div>
                <div className="text-xs font-semibold text-brand-300">{settings.loyalty.tierSavingsPct[t.key]}% off</div>
                <div className="text-[0.7rem] text-ink-450">{t.minCents ? `${zarWhole(t.minCents)}+ a year` : "When you join"}</div>
              </li>
            ))}
          </ol>
        </div>
        <Panel className="h-fit p-6 sm:p-8">
          <PhoneAuth next="/club" stores={homeStoreOptions(stores)} defaultStoreId={store?.id} consentWording={CONSENT_WORDING} />
        </Panel>
      </div>
    </Container>
  );
}
