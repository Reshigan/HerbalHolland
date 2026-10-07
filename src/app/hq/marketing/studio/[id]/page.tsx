import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { toLocalInput } from "@/server/hq/form";
import { postizConnected } from "@/server/social";
import { aiReady } from "@/server/studio-ai";
import { EARLY_ACCESS, itemFlags, playbookOf } from "@/server/studio";
import { segmentLabel } from "@/server/marketing";
import { SOCIAL_IMAGES } from "@/lib/social";
import { dayKey, fmtDate, fmtTime } from "@/lib/format";
import { longDate, STUDIO_CHANNELS, type Card, type StudioChannel } from "@/lib/studio";
import { plural } from "@/lib/plural";
import { Flash } from "@/components/hq/flash";
import { Notice, PageHeader } from "@/components/ui/page";
import { Card as Panel } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CopyButton } from "@/components/trade/copy-button";
import { MarketingTabs } from "../../tabs";
import { approveStudio, handStudioItem, pauseStudio, postedStudioItem, saveStudioItem, scheduleStudio, skipStudioItem, suggestStudioRewrite, unscheduleStudioItem } from "../actions";
import { ItemEditor } from "./item-editor";

export const metadata = { title: "Studio campaign" };

const STATUS: Record<string, [string, Tone]> = {
  DRAFT: ["Draft", "neutral"],
  APPROVED: ["Approved", "blue"],
  SCHEDULED: ["Queued", "violet"],
  POSTED: ["Out", "green"],
  FAILED: ["Failed", "red"],
  SKIPPED: ["Left out", "neutral"],
};
// The card size each channel shows best: WhatsApp Status and Channels are tall, Google profiles square.
const DOWNLOAD: Record<StudioChannel, "portrait" | "story" | "square"> = { SOCIAL: "portrait", WHATSAPP: "story", GOOGLE: "square", EMAIL: "square", SMS: "square", PUSH: "square" };

export default async function StudioPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const user = await requireStaff(HQ_ROLES);
  const { id } = await params;
  const plan = await db.studioPlan.findUnique({ where: { id }, include: { store: { select: { name: true } }, items: { orderBy: { at: "asc" } } } });
  if (!plan) notFound();
  const write = can(user, "network");
  const social = postizConnected();
  const pb = playbookOf(plan.playbook);
  const by = (s: string) => plan.items.filter((i) => i.status === s).length;
  const days = Map.groupBy(plan.items, (i) => dayKey(i.at));

  return (
    <>
      <PageHeader
        overline="Studio"
        title={plan.name}
        description={`Day T (${pb?.anchor.toLowerCase() ?? "the day"}): ${fmtDate(`${plan.anchor}T10:00:00Z`)}. ${plural(plan.items.length, "post")}: ${by("POSTED")} out, ${by("SCHEDULED")} queued, ${by("APPROVED")} approved, ${by("DRAFT")} drafts${by("FAILED") ? `, ${by("FAILED")} failed` : ""}.`}
        actions={
          <ButtonLink href="/hq/marketing/studio" variant="outline" size="sm">
            All campaigns
          </ButtonLink>
        }
      />
      <MarketingTabs current="studio" />
      <Flash message={(await searchParams).m} />
      {write && (
        <div className="mb-5 flex flex-wrap items-start gap-3">
          <ActionForm action={approveStudio.bind(null, plan.id, null)} notices="bottom">
            <SubmitButton variant="dark" pendingLabel="Checking…">
              Approve every post that passes
            </SubmitButton>
          </ActionForm>
          <ActionForm action={scheduleStudio.bind(null, plan.id)} notices="bottom">
            <SubmitButton pendingLabel="Queuing…">Schedule what&apos;s approved</SubmitButton>
          </ActionForm>
          <ActionForm action={pauseStudio.bind(null, plan.id, !plan.paused)} notices="bottom">
            <SubmitButton variant="outline" pendingLabel="Saving…">
              {plan.paused ? "Resume releases" : "Pause releases"}
            </SubmitButton>
          </ActionForm>
        </div>
      )}
      {plan.paused && (
        <Notice tone="warn" title="Paused" className="mb-5">
          Nothing more in this campaign goes out until it&apos;s resumed. A queued post more than six hours past its time when you resume isn&apos;t sent: it waits for a new time.
        </Notice>
      )}
      <Notice tone="info" className="mb-5">
        Approved posts wait here until their time: the scheduler releases each one then (it runs every 15 minutes), so you can pause the whole campaign or take a post back until the moment it goes.{" "}
        {social ? "Social posts go to Postiz with their card." : "Postiz isn't connected, so social posts are made by hand like WhatsApp and Google: copy the words, download the card, then mark it posted."} Email, SMS and push go
        to {plan.store ? `${plan.store.name}'s` : "all"} members who said yes to that channel (or to the audience a post names), inside the legal send times. WhatsApp Channel and Google posts are always made by hand: their rules don&apos;t allow a cannabis brand&apos;s posts through an API.
      </Notice>
      <div className="space-y-8">
        {[...days].map(([day, items]) => (
          <section key={day} aria-labelledby={`d-${day}`}>
            <h2 id={`d-${day}`} className="eyebrow mb-3">
              {longDate(day)}
            </h2>
            <div className="space-y-3">
              {items.map((it) => {
                const channel = it.channel as StudioChannel;
                const card = it.card as Card | null;
                const flags = it.status === "DRAFT" ? itemFlags(it) : [];
                const hand = STUDIO_CHANNELS[channel].hand || (channel === "SOCIAL" && (!social || it.hand));
                const [label, tone] = it.status === "SCHEDULED" && it.releasedAt ? (["Released", "violet"] as const) : STATUS[it.status];
                const v = it.updatedAt.getTime();
                return (
                  <Panel key={it.id} className="flex flex-col gap-4 p-4 sm:flex-row" id={`p-${it.key}`}>
                    {card && (
                      <a href={`/hq/marketing/studio/card/${it.id}?size=${DOWNLOAD[channel]}&v=${v}`} target="_blank" rel="noreferrer" className="shrink-0 self-start">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/hq/marketing/studio/card/${it.id}?size=square&v=${v}`} alt={`Card: ${card.headline}`} width={128} height={128} loading="lazy" className="h-32 w-32 rounded-xl bg-ink-950 object-cover" />
                      </a>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        <span className="tnum font-semibold text-ink-700">{fmtTime(it.at)}</span>
                        <Badge tone="orange">{STUDIO_CHANNELS[channel].label}</Badge>
                        <Badge tone={tone}>{label}</Badge>
                        {hand && it.status === "APPROVED" && <Badge tone="amber">Post by hand</Badge>}
                        {it.audience && <Badge tone="blue">To: {it.audience === EARLY_ACCESS ? "First-access list" : segmentLabel(it.audience)}</Badge>}
                        {it.linkedin && <Badge tone="neutral">{it.linkedin === "only" ? "LinkedIn only" : "LinkedIn too"}</Badge>}
                        {it.doneBy && <span>· {it.doneBy}</span>}
                      </p>
                      {it.title && <p className="mt-2 font-semibold text-ink-900">{it.title}</p>}
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-800">{it.text}</p>
                      {it.short && <p className="mt-1.5 text-xs text-ink-500">Short version: {it.short}</p>}
                      {it.brief && (
                        <p className="mt-1.5 text-xs text-ink-600">
                          <span className="font-semibold text-ink-800">Shoot:</span> {it.brief}
                        </p>
                      )}
                      {it.note && <p className="mt-1.5 text-xs text-ink-500">{it.note}</p>}
                      {flags.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-xs font-medium text-rose-600">
                          {flags.map((f) => (
                            <li key={f.term + f.reason}>
                              “{f.term}”: {f.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                      {it.link && (
                        <a href={it.link} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-semibold text-brand-700 hover:underline">
                          See the post
                        </a>
                      )}
                      {write && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {it.status === "DRAFT" && (
                            <ActionForm action={approveStudio.bind(null, plan.id, it.id)} notices="bottom">
                              <SubmitButton size="sm" variant="dark" disabled={flags.length > 0}>
                                Approve
                              </SubmitButton>
                            </ActionForm>
                          )}
                          {hand && (it.status === "APPROVED" || it.status === "FAILED") && (
                            <>
                              <CopyButton text={it.text} label="Copy the words" className="h-9 border border-ink-200 text-ink-700 hover:bg-ink-100 hover:text-ink-900 sm:h-9" />
                              {card && (
                                <ButtonLink href={`/hq/marketing/studio/card/${it.id}?size=${DOWNLOAD[channel]}&download`} variant="outline" size="sm" prefetch={false}>
                                  <Download className="h-4 w-4" aria-hidden /> Card
                                </ButtonLink>
                              )}
                              <ActionForm action={postedStudioItem.bind(null, it.id)} notices="bottom" className="flex flex-wrap items-center gap-2">
                                <Input name="link" type="url" placeholder="Link to the post (optional)" aria-label="Link to the post" className="h-9 w-56" />
                                <SubmitButton size="sm">Mark posted</SubmitButton>
                              </ActionForm>
                            </>
                          )}
                          {channel === "SOCIAL" && social && ["DRAFT", "APPROVED", "FAILED"].includes(it.status) && (
                            <ActionForm action={handStudioItem.bind(null, it.id, !it.hand)} notices="bottom">
                              <SubmitButton size="sm" variant="outline">
                                {it.hand ? "Send the card through Postiz" : "I'll post it by hand"}
                              </SubmitButton>
                            </ActionForm>
                          )}
                          {it.status === "SCHEDULED" && (!it.releasedAt || channel !== "SOCIAL") && (
                            <ActionForm action={unscheduleStudioItem.bind(null, it.id)} notices="bottom">
                              <SubmitButton size="sm" variant="outline">
                                Take back
                              </SubmitButton>
                            </ActionForm>
                          )}
                          {["DRAFT", "APPROVED", "FAILED", "SKIPPED"].includes(it.status) && (
                            <ActionForm action={skipStudioItem.bind(null, it.id, it.status !== "SKIPPED")} notices="bottom">
                              <SubmitButton size="sm" variant="ghost">
                                {it.status === "SKIPPED" ? "Bring back" : "Leave out"}
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      )}
                      {write && ["DRAFT", "APPROVED", "FAILED"].includes(it.status) && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit</summary>
                          <ItemEditor
                            id={it.id}
                            channel={channel}
                            at={toLocalInput(it.at)}
                            title={it.title}
                            text={it.text}
                            short={it.short}
                            card={card}
                            images={SOCIAL_IMAGES}
                            save={saveStudioItem.bind(null, it.id)}
                            suggest={aiReady() ? suggestStudioRewrite : null}
                          />
                        </details>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
