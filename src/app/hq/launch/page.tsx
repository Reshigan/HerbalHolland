import Link from "next/link";
import { CalendarClock, Crown, Rocket, Share2, Users } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { sast } from "@/server/sql";
import { can } from "@/server/hq/guard";
import { toLocalInput } from "@/server/hq/form";
import { countdown } from "@/server/hq/launch-rules";
import { TIERS, tierInfo, type TierKey } from "@/lib/loyalty-rules";
import { addDays, dayKey, fmtDate, fmtDateTime, fmtDay, num, startOfDaySA } from "@/lib/format";
import { pct } from "@/lib/money";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, Meter } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ColumnChart } from "@/components/charts/bar-chart";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { EmptyRow, ViewOnly } from "@/components/hq/ui";
import { Prisma } from "@/generated/prisma/client";
import { assignFoundingNow, saveLaunch } from "./actions";

export const metadata = { title: "Founding Members" };

const DAYS = 60;
const four = (n: number) => `#${String(n).padStart(4, "0")}`;

export default async function LaunchPage() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const hq = scope.kind === "HQ";
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const members: Prisma.CustomerWhereInput = hq ? {} : { homeStoreId: { in: ids } };
  const regionOf = (col: string) => (hq ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(col)} = ANY(${ids}::text[])`);

  const settings = await getSettings();
  const l = settings.launch;
  const now = new Date();
  const at = l.launchAt ? new Date(l.launchAt) : null;
  const pre = !!at && now < at;
  const chartEnd = at && at < now ? at : now;
  const chartStart = startOfDaySA(addDays(chartEnd, -(DAYS - 1)));

  const [waitlist, viaFriend, founders, assignedNetwork, referrers, perDay] = await Promise.all([
    at ? db.customer.count({ where: { ...members, createdAt: { lt: at } } }) : 0,
    at ? db.customer.count({ where: { ...members, createdAt: { lt: at }, referredById: { not: null } } }) : 0,
    db.customer.count({ where: { ...members, foundingNo: { not: null } } }),
    db.customer.count({ where: { foundingNo: { not: null } } }),
    at
      ? db.$queryRaw<{ id: string; firstName: string; lastName: string | null; memberNo: string; foundingNo: number | null; store: string | null; friends: number }[]>`
          SELECT r.id, r."firstName", r."lastName", r."memberNo", r."foundingNo", s.name AS store, COUNT(*)::int AS friends
          FROM "Customer" f
          JOIN "Customer" r ON r.id = f."referredById"
          LEFT JOIN "Store" s ON s.id = r."homeStoreId"
          WHERE f."createdAt" < ${at} AND r."createdAt" < ${at} ${regionOf('r."homeStoreId"')}
          GROUP BY r.id, s.name
          ORDER BY friends DESC, r."createdAt" ASC
          LIMIT 10`
      : [],
    db.$queryRaw<{ day: string; n: number; friends: number }[]>`
      SELECT to_char(${sast('c."createdAt"')}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n, (COUNT(*) FILTER (WHERE c."referredById" IS NOT NULL))::int AS friends
      FROM "Customer" c
      WHERE c."createdAt" >= ${chartStart} AND c."createdAt" < ${chartEnd} ${regionOf('c."homeStoreId"')}
      GROUP BY 1`,
  ]);

  const admin = can(user, "admin");
  const assigned = assignedNetwork > 0;
  const locked = assigned || !admin;
  const tier = tierInfo(l.foundingTier);
  const saving = settings.loyalty.tierSavingsPct[l.foundingTier] ?? 0;
  const floorEnds = at ? new Date(at) : null;
  floorEnds?.setMonth(floorEnds.getMonth() + l.foundingMonths);
  const byDay = new Map(perDay.map((d) => [d.day, d]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const key = dayKey(addDays(chartStart, i));
    const d = byDay.get(key);
    return { key, n: d?.n ?? 0, friends: d?.friends ?? 0 };
  });
  const chartTotal = days.reduce((s, d) => s + d.n, 0);
  const filled = Math.min(waitlist, l.foundingCap);

  const hero = !at
    ? { eyebrow: "Founding Members · not scheduled", title: "No closing date set", sub: "Set a closing date to run the Founding Members list with its referral ladder and numbered cards. The shop stays open either way." }
    : pre
      ? { eyebrow: "Founding Members · list open", title: `List closes in ${countdown(at, now)}`, sub: `Closes ${fmtDateTime(at)} SAST. Until then members join, share their link and climb the list; the shop stays open.` }
      : {
          eyebrow: "Founding Members · list closed",
          title: `Closed ${fmtDate(at)}`,
          sub: assigned
            ? `${num(assignedNetwork)} Founding Members numbered · at least ${tier.name} until ${fmtDate(floorEnds!)}.`
            : "The list has closed. The scheduler numbers the Founding Members within 15 minutes.",
        };

  return (
    <>
      <PageHeader
        overline="Launch programme"
        title="Founding Members"
        description="The Founding Members list, the referral ladder and the numbered cards. Win on value, status and trust, never on medicines."
      />

      <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-ink-950 p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-500 text-ink-950">
            <Rocket className="h-6 w-6" strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="eyebrow text-brand-500">{hero.eyebrow}</div>
            <div className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-[1.7rem]">{hero.title}</div>
            <p className="mt-1 max-w-2xl text-sm text-ink-300">{hero.sub}</p>
          </div>
        </div>
        {at && (
          <dl className="grid shrink-0 grid-cols-3 gap-5 border-t border-ink-800 pt-4 text-sm sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <div>
              <dt className="text-xs text-ink-400">Friend boost</dt>
              <dd className="font-display text-lg font-semibold tnum">+{num(l.referralBoost)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Founding places</dt>
              <dd className="font-display text-lg font-semibold tnum">{num(l.foundingCap)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Tier floor</dt>
              <dd className="font-display text-lg font-semibold">{tier.name}</dd>
            </div>
          </dl>
        )}
      </div>

      {!hq && <Notice className="mb-6">Member figures cover members whose home store is in your region; the list and the Founding Member numbers run network-wide.</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={pre ? "On the list" : "Joined before the list closed"} value={at ? num(waitlist) : "—"} sub={at ? (hq ? "members, network-wide" : "members in your region") : "no closing date"} />
        <Stat label="Joined with a friend's link" value={at ? num(viaFriend) : "—"} sub={waitlist ? `${pct(viaFriend / waitlist)} of the list` : "while the list is open"} />
        <div className="rounded-2xl border border-ink-150 bg-white p-4 shadow-card">
          <div className="text-[0.78rem] font-medium text-ink-500">Founding Members</div>
          <div className="mt-1 font-display text-[1.65rem] font-semibold leading-none tracking-tight text-ink-950 tnum">{assigned ? num(founders) : at ? (hq ? num(filled) : "Pending") : "—"}</div>
          {hq && at && <Meter value={assigned ? founders : filled} max={l.foundingCap} className="mt-3" />}
          <div className="mt-2 text-xs text-ink-500">
            {assigned ? (hq ? `numbered, of ${num(l.foundingCap)} places` : "numbered, homed in your region") : at ? (hq ? `of ${num(l.foundingCap)} places filled, numbered at launch` : "numbered at launch, network-wide") : "set a launch date"}
          </div>
        </div>
        {pre || !at ? (
          <Stat label="Founding places left" value={at ? num(Math.max(0, l.foundingCap - waitlist)) : "—"} sub={at ? "join now to be numbered" : "no launch date"} />
        ) : (
          <Stat label="Founding floor ends" value={fmtDate(floorEnds!)} sub="then tier follows 12-month spend" />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Sign-ups per day"
              description={`${at && !pre ? `The ${DAYS} days before the list closed` : `Last ${DAYS} days`} · ${num(chartTotal)} members joined${hq ? "" : " in your region"}`}
            />
            <CardBody>
              <ColumnChart
                format="number"
                data={days.map((d) => {
                  const label = fmtDay(`${d.key}T12:00:00+02:00`);
                  return { label, value: d.n, tip: `${label}\n${num(d.n)} sign-up${d.n === 1 ? "" : "s"}\n${num(d.friends)} with a friend's link` };
                })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Top referrers" description={`Most friends who joined before launch · each moved them up ${num(l.referralBoost)} places`} />
            <Table stickyFirst className="relative mt-4">
              <thead>
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Member</Th>
                  <Th className="hidden sm:table-cell">Home store</Th>
                  <Th align="right">Friends</Th>
                  <Th align="right" className="hidden md:table-cell">Places gained</Th>
                  <Th align="right">Founding no.</Th>
                </tr>
              </thead>
              <tbody>
                {referrers.length === 0 && (
                  <EmptyRow cols={6}>
                    <Share2 className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                    {at ? "Nobody has joined with a friend's link yet." : "Set a closing date to start the referral ladder."}
                  </EmptyRow>
                )}
                {referrers.map((r, i) => (
                  <Tr key={r.id}>
                    <Td className="tnum text-ink-500">{i + 1}</Td>
                    <Td>
                      <Link href={`/hq/customers/${r.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {r.firstName} {r.lastName ?? ""}
                      </Link>
                      <span className="block font-mono text-xs text-ink-500">{r.memberNo}</span>
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{r.store ?? "—"}</Td>
                    <Td align="right" className="font-semibold text-ink-900">{num(r.friends)}</Td>
                    <Td align="right" className="hidden text-ink-600 md:table-cell">+{num(r.friends * l.referralBoost)}</Td>
                    <Td align="right" className="font-mono text-xs">{r.foundingNo ? four(r.foundingNo) : <span className="text-ink-500">—</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="How places and founding work" description="What members see on their Rewards card while the list is open and after it closes" />
            <CardBody className="pt-4">
              <ol className="grid gap-5 text-sm md:grid-cols-3">
                {[
                  { icon: Users, title: "Join the list", body: "Every member who joins before the list closes gets a place: first come, first served. Joining is free and needs no purchase." },
                  { icon: Share2, title: "Bring friends, move up", body: `Each friend who joins with their link (/club/join?ref=CODE) before the list closes moves them up ${num(l.referralBoost)} places. The friend gets their own place at the bottom of the list.` },
                  {
                    icon: Crown,
                    title: "Founding Members when it closes",
                    body: `When the list closes, the first ${num(l.foundingCap)} places are numbered ${four(1)}–${four(l.foundingCap)} and hold at least ${tier.name} (${saving}% off instantly) for ${l.foundingMonths} months. Then their tier follows 12-month spend like everyone else's.`,
                  },
                ].map((s, i) => (
                  <li key={s.title}>
                    <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700" aria-hidden>
                      <s.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                    </span>
                    <div className="font-semibold text-ink-900">
                      {i + 1}. {s.title}
                    </div>
                    <p className="mt-1 text-ink-600">{s.body}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-5 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
                Founding status is a Rewards tier: its instant savings never apply to licensed medicines (Medicines Act s18A), and places are never earned by buying.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Founding Members settings" description="The list, its closing date and what founding members get" />
            <CardBody>
              {!admin && <ViewOnly className="mb-4">View only: set by the HQ administrator.</ViewOnly>}
              {admin && assigned && <ViewOnly className="mb-4">Locked: founding numbers are assigned, so the list can&apos;t be rewritten.</ViewOnly>}
              <ActionForm action={saveLaunch}>
                <fieldset disabled={locked} className="min-w-0 grid grid-cols-2 gap-3">
                  <Field label="List closes (SAST)" htmlFor="launchAt" hint="Members who join before this moment are on the list; the shop stays open. Leave empty for no list." className="col-span-2">
                    <Input id="launchAt" name="launchAt" type="datetime-local" defaultValue={toLocalInput(at)} />
                    <FieldError name="launchAt" />
                  </Field>
                  <Field label="Founding places" htmlFor="foundingCap">
                    <Input id="foundingCap" name="foundingCap" defaultValue={l.foundingCap} inputMode="numeric" className="tnum" />
                    <FieldError name="foundingCap" />
                  </Field>
                  <Field label="Founding tier" htmlFor="foundingTier">
                    <Select id="foundingTier" name="foundingTier" defaultValue={l.foundingTier}>
                      {TIERS.filter((t) => t.key !== "SEED").map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name} · {settings.loyalty.tierSavingsPct[t.key as TierKey] ?? 0}%
                        </option>
                      ))}
                    </Select>
                    <FieldError name="foundingTier" />
                  </Field>
                  <Field label="Founding months" htmlFor="foundingMonths" hint="How long the floor holds">
                    <Input id="foundingMonths" name="foundingMonths" defaultValue={l.foundingMonths} inputMode="numeric" className="tnum" />
                    <FieldError name="foundingMonths" />
                  </Field>
                  <Field label="Friend boost" htmlFor="referralBoost" hint="Places per friend">
                    <Input id="referralBoost" name="referralBoost" defaultValue={l.referralBoost} inputMode="numeric" className="tnum" />
                    <FieldError name="referralBoost" />
                  </Field>
                </fieldset>
                {!locked && (
                  <div className="mt-4 flex justify-end">
                    <SubmitButton variant="outline" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Founding numbers" description="Assigned once, when the list closes. Numbers are permanent." />
            <CardBody className="space-y-3 text-sm text-ink-600">
              {assigned ? (
                <p className="flex gap-2.5">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
                  <span>
                    <b className="text-ink-900">{num(assignedNetwork)} numbered</b> across the network. Their {tier.name} floor lapses on {floorEnds ? fmtDate(floorEnds) : "—"}; the daily job moves them to the tier their spend earns.
                  </span>
                </p>
              ) : !at || pre ? (
                <>
                  <p>{at ? `The scheduler numbers the first ${num(l.foundingCap)} places automatically at ${fmtDateTime(at)}.` : "Set a closing date first."} The button unlocks once the list has closed.</p>
                  <Button variant="outline" size="sm" disabled>
                    Assign founding numbers now
                  </Button>
                </>
              ) : admin ? (
                <>
                  <p>The list has closed. The scheduler assigns numbers within 15 minutes, or you can do it now.</p>
                  <ConfirmAction
                    action={assignFoundingNow}
                    variant="primary"
                    label="Assign founding numbers now"
                    title={`Number the first ${num(l.foundingCap)} places?`}
                    confirmLabel="Assign numbers"
                  >
                    <p>
                      Members in the first {num(l.foundingCap)} places on the list get their Founding Member number and at least {tier.name} until {floorEnds ? fmtDate(floorEnds) : "—"}. This happens once and can&apos;t be undone.
                    </p>
                  </ConfirmAction>
                </>
              ) : (
                <ViewOnly>Numbers are pending. The HQ administrator or the scheduler assigns them.</ViewOnly>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
