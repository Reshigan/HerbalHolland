import Link from "next/link";
import { redirect } from "next/navigation";
import { Repeat } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { db } from "@/server/db";
import { eligibleVariants, memberSubscriptions } from "@/server/shop/subscriptions";
import { getPreferredStore, getRetailStores, shopPhase } from "@/server/shop/context";
import { listAddresses } from "@/server/shop/addresses";
import { asList } from "@/lib/json-list";
import { allowanceLabel, PERIOD_ADVERB } from "@/lib/subscriptions";
import { canBuyOnline, fulfilmentForPhase, PHASE_CLOSED } from "@/lib/launch-phase";
import { zar } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { Callout, CheckRow, Container, FieldRow, Panel, SelectInput, Tag, type TagTone, inputClass } from "@/components/shop/ui";
import { changeForm, claimForm, subscribeForm } from "./actions";

export const metadata = { title: "Club plans" };

const STATUS: Record<string, [string, TagTone]> = { ACTIVE: ["Active", "green"], PAUSED: ["Paused", "amber"], PAST_DUE: ["Payment overdue", "red"], CANCELLED: ["Ended", "neutral"] };
const FULFIL = { COLLECT: "Collect in store", COURIER: "Delivered" } as const;
const btn = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium";
const primary = `${btn} bg-brand-500 text-ink-950 hover:bg-brand-400`;
const quiet = `${btn} border border-ink-700 text-ink-200 hover:bg-ink-850`;

function Act({ id, act, children, extra }: { id: string; act: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <form action={changeForm} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="act" value={act} />
      {extra}
      <button className={quiet}>{children}</button>
    </form>
  );
}

export default async function ClubPlans({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/subscriptions");
  const [mine, plans, stores, preferred, addresses, phase] = await Promise.all([
    memberSubscriptions(customer.id),
    db.subscriptionPlan.findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 50 }),
    getRetailStores(),
    getPreferredStore(),
    listAddresses(customer.id),
    shopPhase(),
  ]);
  const open = stores.filter((s) => s.status === "ACTIVE");
  const storesFor = (p: { storeIds: unknown }) => {
    const ids = asList<string>(p.storeIds);
    return ids.length ? open.filter((s) => ids.includes(s.id)) : open;
  };
  const claimable = await Promise.all(mine.map((s) => (s.period?.status === "PAID" && s.status !== "CANCELLED" ? eligibleVariants(s.plan) : [])));
  const fulfilments = fulfilmentForPhase(phase).filter((f) => f !== "SAME_DAY");
  const homeId = preferred?.id ?? customer.homeStoreId ?? null;
  const live = mine.filter((s) => s.status !== "CANCELLED");

  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Club plans</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-400">
        A set allowance each period at a member price, for adults 18+. You pay each period by link; your allowance opens once it&apos;s paid. Pause or cancel any time.{" "}
        <Link href="/legal/subscriptions" className="text-brand-500 underline-offset-2 hover:underline">Plan terms</Link>
      </p>
      {sp.e && <Callout tone="danger" className="mt-6">{sp.e}</Callout>}

      {mine.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="font-display text-xl font-semibold text-white">Your plans</h2>
          {mine.map((s, i) => {
            const p = s.period;
            const total = p ? p.allowance + p.carryAllowance : 0;
            const variants = claimable[i];
            return (
              <Panel key={s.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{s.plan.name}</span>
                      <Tag tone={STATUS[s.status][1]}>{STATUS[s.status][0]}</Tag>
                      {s.cancelAtPeriodEnd && s.status !== "CANCELLED" && <Tag tone="neutral">Ends {fmtDate(s.periodEnd)}</Tag>}
                    </div>
                    <p className="mt-1 text-sm text-ink-300">
                      {allowanceLabel(s.plan.unit, s.plan.allowance, s.plan.itemWord)} {PERIOD_ADVERB[s.plan.period]} · {zar(s.priceCents)} · {FULFIL[s.fulfilment as keyof typeof FULFIL] ?? s.fulfilment} at {s.storeName}
                    </p>
                    {s.nextStoreName && <p className="text-xs text-ink-450">From next period: {s.nextStoreName}</p>}
                  </div>
                </div>

                {p && s.status !== "CANCELLED" && (
                  <div className="mt-4 rounded-xl border border-ink-800 p-4">
                    <p className="text-sm text-ink-300">
                      This period, {fmtDate(p.periodStart)} to {fmtDate(p.periodEnd)}: {allowanceLabel(s.plan.unit, total, s.plan.itemWord)}
                      {p.carryAllowance > 0 && " (including what carried over)"}
                    </p>
                    {p.status === "DUE" && p.billingOrderId && (
                      <Link href={`/checkout/pay/${p.billingOrderId}`} className={`${primary} mt-3`}>Pay {zar(p.priceCents)} to open it</Link>
                    )}
                    {p.status === "PAID" && (
                      variants.length ? (
                        <form action={claimForm} className="mt-3 space-y-2">
                          <input type="hidden" name="id" value={s.id} />
                          {variants.map((v) => (
                            <label key={v.id} className="flex items-center justify-between gap-3 text-sm text-ink-200">
                              <span>{v.product.name} · {v.name}</span>
                              <input type="number" name={`q_${v.id}`} min={0} max={99} defaultValue={0} aria-label={`How many ${v.product.name} ${v.name}`} className={`${inputClass} w-20`} />
                            </label>
                          ))}
                          <button className={primary}>Reserve my allowance</button>
                        </form>
                      ) : (
                        <p className="mt-2 text-sm text-ink-400">Nothing on this plan is on sale right now. Ask your store.</p>
                      )
                    )}
                    {p.status === "COLLECTED" && (
                      <p className="mt-2 text-sm text-ink-400">Reserved. <Link href="/club/orders" className="text-brand-500 hover:underline">See your order</Link></p>
                    )}
                    {p.status === "LAPSED" && <p className="mt-2 text-sm text-ink-400">This period wasn&apos;t paid in time, so it lapsed. Resume to start a new one.</p>}
                  </div>
                )}

                {s.status !== "CANCELLED" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(s.status === "ACTIVE" || s.status === "PAST_DUE") && <Act id={s.id} act="pause">Pause</Act>}
                    {s.status === "PAUSED" && <Act id={s.id} act="resume">Resume</Act>}
                    {!s.cancelAtPeriodEnd && <Act id={s.id} act="cancel">Cancel at period end</Act>}
                    <Act
                      id={s.id}
                      act="store"
                      extra={
                        <SelectInput name="storeId" defaultValue={s.nextStoreId ?? s.storeId} aria-label="Store for next period" className="w-56">
                          {storesFor(s.plan).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </SelectInput>
                      }
                    >
                      Change store
                    </Act>
                  </div>
                )}
              </Panel>
            );
          })}
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold text-white">{live.length ? "More plans" : "Choose a plan"}</h2>
        {!canBuyOnline(phase) ? (
          <Callout tone="info">{PHASE_CLOSED}</Callout>
        ) : plans.length === 0 ? (
          <Panel className="p-6 text-center text-sm text-ink-400">
            <Repeat className="mx-auto mb-2 h-6 w-6 text-ink-450" aria-hidden />
            No plans open yet. We&apos;ll let members know when they are.
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {plans.map((p) => {
              const where = storesFor(p);
              const def = where.find((s) => s.id === homeId)?.id ?? where[0]?.id;
              return (
                <Panel key={p.id} className="overflow-hidden">
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="h-40 w-full object-cover" />}
                  <div className="p-5">
                    <h3 className="font-semibold text-white">{p.name}</h3>
                    {p.tagline && <p className="text-sm text-ink-300">{p.tagline}</p>}
                    <p className="mt-2 font-display text-2xl font-semibold text-white tnum">
                      {zar(p.priceCents)} <span className="text-sm font-normal text-ink-400">{PERIOD_ADVERB[p.period]}</span>
                    </p>
                    <p className="text-sm text-ink-300">{allowanceLabel(p.unit, p.allowance, p.itemWord)} each period{p.rollover && ", and one unclaimed period carries over"}</p>
                    {p.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-400">{p.description}</p>}
                    {where.length === 0 ? (
                      <p className="mt-4 text-sm text-ink-400">Not open at a store yet.</p>
                    ) : (
                      <form action={subscribeForm} className="mt-4 space-y-3">
                        <input type="hidden" name="planId" value={p.id} />
                        <FieldRow label="Store" htmlFor={`st-${p.id}`}>
                          <SelectInput id={`st-${p.id}`} name="storeId" defaultValue={def}>
                            {where.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
                          </SelectInput>
                        </FieldRow>
                        <FieldRow label="How you get it" htmlFor={`fu-${p.id}`}>
                          <SelectInput id={`fu-${p.id}`} name="fulfilment" defaultValue={fulfilments[0]}>
                            {fulfilments.map((f) => <option key={f} value={f}>{FULFIL[f as keyof typeof FULFIL]}</option>)}
                          </SelectInput>
                        </FieldRow>
                        {fulfilments.includes("COURIER") && (
                          <FieldRow label="Delivery address" htmlFor={`ad-${p.id}`} hint={addresses.length ? "Only used for delivery." : <>Add one under <Link href="/club/addresses" className="underline">addresses</Link> to have it delivered.</>}>
                            <SelectInput id={`ad-${p.id}`} name="addressId" defaultValue={addresses[0]?.id ?? ""}>
                              <option value="">None</option>
                              {addresses.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.line}, {a.suburb}</option>)}
                            </SelectInput>
                          </FieldRow>
                        )}
                        <CheckRow name="acceptTerms" value="yes" required label={<>I&apos;m 18 or older and accept the <Link href="/legal/subscriptions" className="underline">plan terms</Link></>} />
                        <button className={primary}>Join and pay {zar(p.priceCents)}</button>
                      </form>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>
    </Container>
  );
}
