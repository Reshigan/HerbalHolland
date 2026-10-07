// Campaign Studio, the server side: a playbook laid out into dated drafts, approved by HQ, then handed to its channel.
// Social drafts go to Postiz with their card; email, SMS and push become Campaigns (consent, the do-not-contact list
// and CPA windows as always); WhatsApp Channel and Google posts wait as "post by hand" with their text and card.
import { db } from "./db";
import { audit, type Actor } from "./audit";
import { deletePostiz, postizConnected, postizPosts, publishSocial, socialChannels } from "./social";
import { cardJpeg } from "./studio-cards";
import { hoursLine, parseHours } from "./shop/hours";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { layout, longDate, OWN_CHANNELS, screenDraft, type Card, type Fields, type StudioChannel } from "@/lib/studio";
import { SOCIAL_NETWORKS } from "@/lib/social";
import { marketingWindow, nextMarketingSlot } from "@/lib/sa";
import { dayKey } from "@/lib/format";
import type { Prisma, StudioItem } from "@/generated/prisma/client";

export class StudioError extends Error {}

export const playbookOf = (key: string) => PLAYBOOKS.find((p) => p.key === key);

/** The flags that stop an item going out (src/lib/studio.ts screenDraft). */
export const itemFlags = (it: Pick<StudioItem, "channel" | "text" | "short" | "title" | "card" | "at">) =>
  screenDraft({ channel: it.channel as StudioChannel, text: it.text, short: it.short, title: it.title, card: it.card as Card | null, at: it.at });

/** Lays a playbook out from day T. For a store, its name, address and hours fill the copy. Days already gone are skipped. */
export async function createPlan(p: { playbook: string; anchor: string; storeId: string | null; by: string; actor: Actor }, now = new Date()) {
  const pb = playbookOf(p.playbook);
  if (!pb) throw new StudioError("Choose a campaign");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.anchor) || Number.isNaN(Date.parse(p.anchor))) throw new StudioError("Pick day T");
  if (p.anchor < dayKey(now)) throw new StudioError("Day T has passed: pick today or a later day");
  const store = pb.store && p.storeId ? await db.store.findUnique({ where: { id: p.storeId }, select: { id: true, name: true, addressLine: true, suburb: true, hours: true } }) : null;
  if (pb.store && !store) throw new StudioError("Choose the store");
  const hours = store ? hoursLine(parseHours(store.hours)) : "";
  const fields: Fields = {
    date: longDate(p.anchor),
    ...(store && { store: store.name.startsWith("Herbal Holland") ? store.name : `Herbal Holland ${store.name}`, town: store.name, address: [store.addressLine, store.suburb].filter(Boolean).join(", ") }),
    ...(hours && { hours }),
  };
  const drafts = layout(pb, p.anchor, fields);
  const plan = await db.studioPlan.create({
    data: {
      playbook: pb.key,
      name: store ? `${pb.name}: ${store.name}` : pb.name,
      anchor: p.anchor,
      storeId: store?.id ?? null,
      createdBy: p.by,
      items: {
        create: drafts.map((d) => ({
          key: d.key,
          channel: d.channel,
          at: d.at,
          title: d.title ?? null,
          text: d.text,
          short: d.short ?? null,
          card: (d.card ?? undefined) as Prisma.InputJsonValue | undefined,
          ...(d.at <= now ? { status: "SKIPPED" as const, note: "Its day had passed when the campaign was laid out" } : d.moved ? { note: d.moved } : {}),
        })),
      },
    },
  });
  await audit(db, p.actor, "studio.create", { storeId: store?.id ?? null, entity: "StudioPlan", entityId: plan.id, data: { playbook: pb.key, anchor: p.anchor, items: drafts.length } });
  return plan;
}

/**
 * The launch in its order: the brand first, then the online shop, then the stores' doors. Each day must come after
 * the one before; each store opening is laid out for its store. Returns the campaigns made.
 */
export async function createLaunch(p: { brand: string; shop: string; doors: string; storeIds: string[]; by: string; actor: Actor }, now = new Date()) {
  const days = [p.brand, p.shop, p.doors];
  if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new StudioError("Pick all three days");
  if (!(p.brand < p.shop && p.shop < p.doors)) throw new StudioError("The brand launches first, then the shop, then the stores: each day after the one before");
  if (!p.storeIds.length) throw new StudioError("Choose the stores that open");
  const plans = [
    await createPlan({ playbook: "brand-launch", anchor: p.brand, storeId: null, by: p.by, actor: p.actor }, now),
    await createPlan({ playbook: "shop-launch", anchor: p.shop, storeId: null, by: p.by, actor: p.actor }, now),
  ];
  for (const storeId of p.storeIds) plans.push(await createPlan({ playbook: "store-opening", anchor: p.doors, storeId, by: p.by, actor: p.actor }, now));
  return plans;
}

/** Approves the drafts that pass every check; the rest stay drafts with their flags. */
export async function approveItems(planId: string, ids: string[] | "all", by: string, actor: Actor) {
  const items = await db.studioItem.findMany({ where: { planId, status: "DRAFT", ...(ids !== "all" && { id: { in: ids } }) } });
  const ok = items.filter((it) => !itemFlags(it).length);
  if (ok.length) await db.studioItem.updateMany({ where: { id: { in: ok.map((i) => i.id) }, status: "DRAFT" }, data: { status: "APPROVED", approvedBy: by } });
  if (ok.length) await audit(db, actor, "studio.approve", { entity: "StudioPlan", entityId: planId, data: { items: ok.map((i) => i.key) } });
  return { approved: ok.length, blocked: items.length - ok.length };
}

/** Edits a draft (or an approved or failed one, which goes back to draft for another look). */
export async function saveItem(id: string, patch: { text: string; short: string | null; title: string | null; card: Card | null; at: Date }) {
  const it = await db.studioItem.findUnique({ where: { id }, select: { status: true } });
  if (!it) throw new StudioError("That post isn't there any more");
  if (!["DRAFT", "APPROVED", "FAILED"].includes(it.status)) throw new StudioError("Take it out of the schedule before you change it");
  await db.studioItem.update({ where: { id }, data: { ...patch, card: (patch.card ?? undefined) as Prisma.InputJsonValue | undefined, status: "DRAFT", approvedBy: null, note: null } });
}

/**
 * Hands every approved item due later to its channel: social to Postiz (when it's connected) with its card as a JPEG,
 * email, SMS and push as scheduled Campaigns (moved into the next legal send window when needed). WhatsApp, Google, and
 * social without Postiz stay approved: they're posted by hand.
 */
export async function scheduleApproved(planId: string, by: string, actor: Actor, now = new Date()) {
  const plan = await db.studioPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new StudioError("That campaign isn't there any more");
  const items = await db.studioItem.findMany({ where: { planId, status: "APPROVED", channel: { in: [...OWN_CHANNELS, ...(postizConnected() ? ["SOCIAL" as const] : [])] } }, orderBy: { at: "asc" } });
  const channels = items.some((i) => i.channel === "SOCIAL") ? await socialChannels() : [];
  const done = { campaigns: 0, social: 0, late: 0, failed: 0 };
  for (const it of items) {
    if (it.at.getTime() < now.getTime() + 5 * 60_000) {
      done.late++;
      continue;
    }
    // Claimed first, so a second click schedules nothing twice.
    if (!(await db.studioItem.updateMany({ where: { id: it.id, status: "APPROVED" }, data: { status: "SCHEDULED" } })).count) continue;
    if (OWN_CHANNELS.includes(it.channel as StudioChannel)) {
      const at = marketingWindow(it.at).allowed ? it.at : nextMarketingSlot(it.at);
      const c = await db.campaign.create({
        data: { name: it.title ?? `${plan.name}: ${it.key}`, channel: it.channel as "EMAIL" | "SMS" | "PUSH", segment: "ALL", storeId: plan.storeId, message: it.text, status: "SCHEDULED", scheduledAt: at },
      });
      await db.studioItem.update({ where: { id: it.id }, data: { campaignId: c.id } });
      done.campaigns++;
      continue;
    }
    if (!channels.length) {
      await db.studioItem.update({ where: { id: it.id }, data: { status: "APPROVED" } });
      continue;
    }
    try {
      const data = await cardJpeg(it.card as Card, "portrait");
      const postizIds = await publishSocial({ content: it.text, short: it.short, picture: { file: { data, name: `${it.key}.jpg`, type: "image/jpeg" } }, channels, mode: "schedule", at: it.at });
      const post = await db.socialPost.create({
        data: { content: it.text, image: null, channels: channels.map((c) => `${SOCIAL_NETWORKS[c.identifier].label} · ${c.name}`), mode: "schedule", scheduledAt: it.at, postizIds, createdBy: by },
      });
      await db.studioItem.update({ where: { id: it.id }, data: { socialPostId: post.id } });
      done.social++;
    } catch (e) {
      await db.studioItem.update({ where: { id: it.id }, data: { status: "FAILED", note: e instanceof Error ? e.message.slice(0, 300) : String(e) } });
      done.failed++;
    }
  }
  if (done.campaigns || done.social || done.failed) await audit(db, actor, "studio.schedule", { storeId: plan.storeId, entity: "StudioPlan", entityId: planId, data: done });
  return done;
}

/** Takes a scheduled item back: its Campaign is cancelled, its Postiz post deleted. It returns to draft. */
export async function unschedule(id: string, actor: Actor) {
  const it = await db.studioItem.findUnique({ where: { id }, include: { campaign: { select: { status: true } }, socialPost: { select: { postizIds: true } } } });
  if (!it || it.status !== "SCHEDULED") throw new StudioError("Only a scheduled post can be taken back");
  if (it.campaign?.status === "SENT") throw new StudioError("It has already gone out");
  if (it.campaignId) await db.campaign.update({ where: { id: it.campaignId }, data: { status: "CANCELLED", scheduledAt: null } });
  for (const pid of it.socialPost?.postizIds ?? []) await deletePostiz(pid);
  await db.studioItem.update({ where: { id }, data: { status: "DRAFT", approvedBy: null, campaignId: null, socialPostId: null } });
  await audit(db, actor, "studio.unschedule", { entity: "StudioItem", entityId: id, data: { key: it.key, channel: it.channel } });
}

/** A post made by hand (WhatsApp Channel, Google, or social without Postiz), with its link when there is one. */
export async function markPosted(id: string, by: string, link: string | null, actor: Actor) {
  const r = await db.studioItem.updateMany({ where: { id, status: { in: ["APPROVED", "FAILED"] } }, data: { status: "POSTED", doneBy: by, doneAt: new Date(), link } });
  if (!r.count) throw new StudioError("Approve it first");
  await audit(db, actor, "studio.posted", { entity: "StudioItem", entityId: id, data: { link } });
}

/** Leaves an item out of the campaign (or brings a skipped one back as a draft). */
export async function skipItem(id: string, skip: boolean) {
  const r = await db.studioItem.updateMany({ where: { id, status: skip ? { in: ["DRAFT", "APPROVED", "FAILED"] } : "SKIPPED" }, data: skip ? { status: "SKIPPED" } : { status: "DRAFT", note: null } });
  if (!r.count) throw new StudioError(skip ? "Take it out of the schedule first" : "It isn't skipped");
}

/**
 * The scheduler's step: a Campaign that went out marks its item posted (one that was cancelled, failed), and Postiz says
 * how each social post went (published, with its link, or the error). Idempotent.
 */
export async function syncStudio(now = new Date()) {
  const own = await db.studioItem.findMany({ where: { status: "SCHEDULED", campaign: { status: { in: ["SENT", "CANCELLED"] } } }, select: { id: true, campaign: { select: { status: true, sentAt: true } } } });
  for (const it of own)
    await db.studioItem.update({ where: { id: it.id }, data: it.campaign?.status === "SENT" ? { status: "POSTED", doneAt: it.campaign.sentAt, doneBy: "Campaign" } : { status: "FAILED", note: "Its campaign was cancelled" } });
  if (!postizConnected()) return { campaigns: own.length, social: 0 };
  const due = await db.studioItem.findMany({
    where: { status: "SCHEDULED", channel: "SOCIAL", at: { lte: now }, socialPostId: { not: null } },
    select: { id: true, at: true, socialPost: { select: { postizIds: true } } },
    orderBy: { at: "asc" },
    take: 100,
  });
  if (!due.length) return { campaigns: own.length, social: 0 };
  const posts = new Map((await postizPosts(new Date(due[0].at.getTime() - 86_400_000), new Date(now.getTime() + 3_600_000))).map((p) => [p.id, p]));
  let social = 0;
  for (const it of due) {
    const states = (it.socialPost?.postizIds ?? []).flatMap((id) => posts.get(id) ?? []);
    if (!states.length) continue;
    const failed = states.find((s) => s.state === "ERROR");
    if (failed) await db.studioItem.update({ where: { id: it.id }, data: { status: "FAILED", note: failed.error?.slice(0, 300) ?? "Postiz couldn't publish it" } });
    else if (states.every((s) => s.state === "PUBLISHED")) await db.studioItem.update({ where: { id: it.id }, data: { status: "POSTED", doneAt: now, doneBy: "Postiz", link: states.find((s) => s.releaseURL)?.releaseURL ?? null } });
    else continue;
    social++;
  }
  return { campaigns: own.length, social };
}
