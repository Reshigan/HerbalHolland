// Campaign Studio, the server side: a playbook laid out into dated drafts, approved by HQ, queued, and released by the
// platform at each post's time (the `frequent` job), so HQ holds the release: a campaign can be paused and resumed, and
// a post taken back, until the moment it goes. Social posts go to Postiz then, with their card; email, SMS and push
// become Campaigns (consent, the do-not-contact list and CPA windows as always). WhatsApp Channel and Google posts wait
// as "post by hand" with their text and card.
import { db } from "./db";
import { audit, type Actor } from "./audit";
import { sendCampaign } from "./marketing";
import { sendEarlyAccess } from "./early-access";
import { postizConnected, postizPosts, publishSocial, socialChannels } from "./social";
import { cardJpeg } from "./studio-cards";
import { hoursLine, parseHours } from "./shop/hours";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { interestFor, layout, longDate, OWN_CHANNELS, productFacts, screenDraft, spreadFeed, weekdayOf, WEEKDAYS, type Card, type Draft, type Fields, type StudioChannel } from "@/lib/studio";
import { SOCIAL_NETWORKS, type SocialChannel } from "@/lib/social";
import { isAudience } from "@/lib/rfm";
import { siteUrl } from "@/lib/seo";
import { dayKey } from "@/lib/format";
import { marketingWindow } from "@/lib/sa";
import type { Prisma, StudioItem } from "@/generated/prisma/client";

export class StudioError extends Error {}

/** The audience for the shop-day message to the people who asked herbalholland.com for first access (not members yet). */
export const EARLY_ACCESS = "early-access";

export const playbookOf = (key: string) => PLAYBOOKS.find((p) => p.key === key);

/** The flags that stop an item going out (src/lib/studio.ts screenDraft). */
export const itemFlags = (it: Pick<StudioItem, "channel" | "text" | "short" | "title" | "card" | "at">) =>
  screenDraft({ channel: it.channel as StudioChannel, text: it.text, short: it.short, title: it.title, card: it.card as Card | null, at: it.at });

type PlanOptions = {
  /** Posts from this day (YYYY-MM-DD) on are left out: the next campaign has begun (the shop is open, say). */
  until?: string;
  /** Moves this store's own social posts this many days later, so towns opening together each get their moment. */
  stagger?: number;
  /** Leaves out the shared posts: another store's campaign makes them, naming every town. */
  skipShared?: boolean;
  /** Every town opening that day, for the shared posts ({towns}). */
  towns?: string;
};

/**
 * Lays a playbook out from day T, or the date it's written for. For a store, its name, address and hours fill the copy;
 * for a product, its name, facts and page. Days already gone are skipped, a pinned post that can't go out on its day
 * refuses day T, and the feed keeps to one post a day across every campaign.
 */
export async function createPlan(p: { playbook: string; anchor: string; storeId: string | null; productId?: string | null; by: string; actor: Actor } & PlanOptions, now = new Date()) {
  const pb = playbookOf(p.playbook);
  if (!pb) throw new StudioError("Choose a campaign");
  const anchor = pb.date ?? p.anchor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(Date.parse(anchor))) throw new StudioError("Pick day T");
  if (anchor < dayKey(now)) throw new StudioError(pb.date ? `${pb.name} was written for ${longDate(pb.date)}, which has passed` : "Day T has passed: pick today or a later day");
  if (pb.weekday !== undefined && weekdayOf(anchor) !== pb.weekday)
    throw new StudioError(`${pb.name} starts on a ${WEEKDAYS[pb.weekday]}${pb.why ? `, ${pb.why}` : ""}: pick a ${WEEKDAYS[pb.weekday]}`);
  const store = pb.store && p.storeId ? await db.store.findUnique({ where: { id: p.storeId }, select: { id: true, name: true, addressLine: true, suburb: true, hours: true } }) : null;
  if (pb.store && !store) throw new StudioError("Choose the store");
  const ref = p.productId?.trim();
  const product = pb.product && ref ? await db.product.findFirst({ where: { OR: [{ id: ref }, { slug: ref }, { variants: { some: { sku: ref } } }] }, include: { category: { select: { name: true } } } }) : null;
  if (pb.product && !product) throw new StudioError("Choose the product: its page address (slug) or a SKU");
  const interest = product ? interestFor(product.regClass) : null;
  if (product && !interest) throw new StudioError("Licensed medicines aren't marketed: choose another product");
  const hours = store ? hoursLine(parseHours(store.hours)) : "";
  const fields: Fields = {
    date: longDate(anchor),
    ...(store && { store: store.name.startsWith("Herbal Holland") ? store.name : `Herbal Holland ${store.name}`, town: store.name, towns: p.towns ?? store.name, address: [store.addressLine, store.suburb].filter(Boolean).join(", ") }),
    ...(hours && { hours }),
    ...(product && { product: product.name, facts: productFacts(product), category: product.category.name, link: `${siteUrl()}/p/${product.slug}?src=studio` }),
  };
  const laid = layout(pb, anchor, fields, p.stagger);
  const blocked = laid.filter((d) => d.blocked);
  if (blocked.length) throw new StudioError(`Day T doesn't work: ${blocked.map((d) => `"${d.key}" names its day, and ${d.blocked}`).join("; ")}. Pick another day T`);
  const left = (d: Draft) => (p.until && dayKey(d.at) >= p.until ? "Left out: the next campaign has begun by then" : p.skipShared && d.shared ? "Left out: posted once for every store opening that day" : null);
  const going = laid.filter((d) => !left(d));
  const times = going.filter((d) => d.channel === "SOCIAL").map((d) => d.at.getTime());
  const taken = times.length
    ? await db.studioItem.findMany({ where: { channel: "SOCIAL", OR: [{ linkedin: null }, { linkedin: "also" }], status: { notIn: ["SKIPPED", "FAILED"] }, at: { gte: new Date(Math.min(...times) - 86_400_000), lte: new Date(Math.max(...times) + 4 * 86_400_000) } }, select: { at: true } })
    : [];
  const drafts = [...spreadFeed(going, new Set(taken.map((t) => dayKey(t.at))), dayKey), ...laid.filter(left).map((d) => ({ ...d, moved: left(d)! }))];
  for (const d of drafts) {
    if (d.audience === EARLY_ACCESS ? !["EMAIL", "SMS"].includes(d.channel) : d.audience && !isAudience(d.audience)) throw new StudioError(`"${d.audience}" can't be the audience of ${d.key}`);
  }
  const plan = await db.studioPlan.create({
    data: {
      playbook: pb.key,
      name: store ? `${pb.name}: ${store.name}` : product ? `${pb.name}: ${product.name}` : pb.name,
      anchor,
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
          audience: d.audience ?? (OWN_CHANNELS.includes(d.channel) ? interest : null),
          linkedin: d.linkedin ?? null,
          brief: d.brief ?? null,
          ...(left(d) ? { status: "SKIPPED" as const, note: left(d) } : d.at <= now ? { status: "SKIPPED" as const, note: "Its day had passed when the campaign was laid out" } : d.moved ? { note: d.moved } : {}),
        })),
      },
    },
  });
  await audit(db, p.actor, "studio.create", { storeId: store?.id ?? null, entity: "StudioPlan", entityId: plan.id, data: { playbook: pb.key, anchor, items: drafts.length, product: product?.slug } });
  return plan;
}

/** Shortest runs between the launch's days: two weeks of brand before the shop, and the shop open before any store is revealed. */
export const LAUNCH_GAPS = { shop: 14, doors: 33 } as const;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * The launch in its order: the brand first, then the online shop, then the stores' doors, with room between them (the
 * brand's posts stop when the shop opens; the stores are revealed once it's open). Stores opening on the same day share
 * their big moments (one post naming every town) and take turns with their own, a week apart. Returns the campaigns.
 */
export async function createLaunch(p: { brand: string; shop: string; doors: string; storeIds: string[]; by: string; actor: Actor }, now = new Date()) {
  const days = [p.brand, p.shop, p.doors];
  if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new StudioError("Pick all three days");
  if (!(p.brand < p.shop && p.shop < p.doors)) throw new StudioError("The brand launches first, then the shop, then the stores: each day after the one before");
  if (daysBetween(p.brand, p.shop) < LAUNCH_GAPS.shop) throw new StudioError(`Give the brand ${LAUNCH_GAPS.shop} days before the shop opens`);
  if (daysBetween(p.shop, p.doors) < LAUNCH_GAPS.doors) throw new StudioError(`Open the doors at least ${LAUNCH_GAPS.doors} days after the shop, so the stores are revealed once it's open`);
  if (!p.storeIds.length) throw new StudioError("Choose the stores that open");
  const stores = await db.store.findMany({ where: { id: { in: p.storeIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (stores.length !== p.storeIds.length) throw new StudioError("Choose the stores that open");
  const towns = stores.map((s) => s.name).join(", ").replace(/, ([^,]*)$/, " and $1");
  const base = { by: p.by, actor: p.actor, storeId: null };
  const plans = [
    await createPlan({ ...base, playbook: "brand-launch", anchor: p.brand, until: p.shop }, now),
    await createPlan({ ...base, playbook: "shop-launch", anchor: p.shop }, now),
  ];
  for (const [i, s] of stores.entries()) plans.push(await createPlan({ ...base, playbook: "store-opening", anchor: p.doors, storeId: s.id, towns, stagger: i * 7, skipShared: i > 0 }, now));
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
 * Queues every approved post that's due later and goes out on its own: social (when Postiz is connected), email, SMS and
 * push. Nothing leaves the platform yet: the scheduler releases each one at its time. WhatsApp, Google, and social
 * without Postiz stay approved, to be posted by hand.
 */
export async function scheduleApproved(planId: string, actor: Actor, now = new Date()) {
  const plan = await db.studioPlan.findUnique({ where: { id: planId }, select: { storeId: true } });
  if (!plan) throw new StudioError("That campaign isn't there any more");
  const ready = { planId, status: "APPROVED" as const, hand: false, channel: { in: [...OWN_CHANNELS, ...(postizConnected() ? ["SOCIAL" as const] : [])] } };
  const late = await db.studioItem.count({ where: { ...ready, at: { lt: new Date(now.getTime() + 5 * 60_000) } } });
  const queued = await db.studioItem.findMany({ where: { ...ready, at: { gte: new Date(now.getTime() + 5 * 60_000) } }, select: { id: true, channel: true } });
  // A post that failed at release and was fixed starts again: no release, Postiz post or campaign from the last try.
  if (queued.length) await db.studioItem.updateMany({ where: { id: { in: queued.map((i) => i.id) }, status: "APPROVED" }, data: { status: "SCHEDULED", releasedAt: null, socialPostId: null, campaignId: null } });
  const done = { social: queued.filter((i) => i.channel === "SOCIAL").length, campaigns: queued.filter((i) => i.channel !== "SOCIAL").length, late };
  if (queued.length) await audit(db, actor, "studio.schedule", { storeId: plan.storeId, entity: "StudioPlan", entityId: planId, data: done });
  return done;
}

/** Holds a campaign: nothing more of it is released until it's resumed (what has already gone out stays out). */
export async function setPaused(planId: string, paused: boolean, actor: Actor) {
  const plan = await db.studioPlan.update({ where: { id: planId }, data: { paused } });
  await audit(db, actor, paused ? "studio.pause" : "studio.resume", { storeId: plan.storeId, entity: "StudioPlan", entityId: planId });
}

/** How late a queued post may still go out (its campaign was paused, or the scheduler stopped); later, it waits for a new time. */
const LATE = 6 * 3_600_000;
const SCHEDULER: Actor = { type: "SYSTEM", name: "Studio scheduler" };

/**
 * The scheduler's step: releases each queued post whose time has come, unless its campaign is paused. Social posts go to
 * Postiz to publish now, with their card as a JPEG; members' messages become a Campaign and send (held for the next legal
 * window when needed). A post more than six hours late isn't released: it fails, to be given a new time.
 */
export async function releaseStudio(now = new Date()) {
  const due = await db.studioItem.findMany({
    where: { status: "SCHEDULED", releasedAt: null, at: { lte: now }, plan: { paused: false } },
    include: { plan: { select: { name: true, storeId: true } } },
    orderBy: { at: "asc" },
    take: 50,
  });
  let channels: SocialChannel[] | null = null;
  const done = { released: 0, failed: 0 };
  for (const it of due) {
    const fail = (note: string) => db.studioItem.update({ where: { id: it.id }, data: { status: "FAILED", note: note.slice(0, 300) } });
    if (now.getTime() - it.at.getTime() > LATE) {
      await fail("Its time passed while nothing was released (the campaign was paused, or the scheduler stopped): give it a new time");
      done.failed++;
      continue;
    }
    if (it.audience === EARLY_ACCESS && !marketingWindow(now).allowed) continue; // waits for the legal hours
    // Claimed first, so two scheduler runs never release it twice.
    if (!(await db.studioItem.updateMany({ where: { id: it.id, releasedAt: null }, data: { releasedAt: now } })).count) continue;
    try {
      if (it.audience === EARLY_ACCESS) {
        const r = await sendEarlyAccess(it.channel === "EMAIL" ? "EMAIL" : "SMS", it.title, it.text);
        await db.studioItem.update({ where: { id: it.id }, data: { status: "POSTED", doneBy: "First-access list", doneAt: now, note: `Sent to ${r.sent}${r.suppressed || r.members ? ` (${[r.suppressed && `${r.suppressed} on the do-not-contact list`, r.members && `${r.members} already members`].filter(Boolean).join(", ")})` : ""}; their sign-ups are deleted` } });
      } else if (OWN_CHANNELS.includes(it.channel as StudioChannel)) {
        const c = await db.campaign.create({ data: { name: it.title ?? `${it.plan.name}: ${it.key}`, channel: it.channel as "EMAIL" | "SMS" | "PUSH", segment: it.audience ?? "ALL", storeId: it.audience ? null : it.plan.storeId, message: it.text } });
        await db.studioItem.update({ where: { id: it.id }, data: { campaignId: c.id } });
        await sendCampaign(c.id, SCHEDULER, now);
      } else {
        if (!postizConnected()) throw new StudioError("Postiz isn't connected any more: post it by hand");
        channels ??= await socialChannels();
        const linkedin = (c: SocialChannel) => c.identifier.startsWith("linkedin");
        const to = channels.filter((c) => (it.linkedin === "only" ? linkedin(c) : it.linkedin === "also" || !linkedin(c)));
        if (!to.length) throw new StudioError(it.linkedin === "only" ? "No LinkedIn page is connected in Postiz" : "No social accounts are connected in Postiz");
        const data = await cardJpeg(it.card as Card, "portrait");
        const postizIds = await publishSocial({ content: it.text, short: it.short, picture: { file: { data, name: `${it.key}.jpg`, type: "image/jpeg" } }, channels: to, mode: "now", at: now });
        const post = await db.socialPost.create({
          data: { content: it.text, image: null, channels: to.map((c) => `${SOCIAL_NETWORKS[c.identifier].label} · ${c.name}`), mode: "now", postizIds, createdBy: "Studio" },
        });
        await db.studioItem.update({ where: { id: it.id }, data: { socialPostId: post.id } });
      }
      done.released++;
    } catch (e) {
      await fail(e instanceof Error ? e.message : String(e));
      done.failed++;
    }
  }
  if (done.released || done.failed) await audit(db, SCHEDULER, "studio.release", { data: done });
  return done;
}

/** Takes a queued post back to draft: before its release, or a member message still held for its send window. */
export async function unschedule(id: string, actor: Actor) {
  const it = await db.studioItem.findUnique({ where: { id }, include: { campaign: { select: { status: true } } } });
  if (!it || it.status !== "SCHEDULED") throw new StudioError("Only a scheduled post can be taken back");
  if (it.releasedAt && !(it.campaign && it.campaign.status === "SCHEDULED")) throw new StudioError(it.socialPostId ? "It has gone to Postiz: delete it there" : "It has already gone out");
  if (it.campaignId) await db.campaign.update({ where: { id: it.campaignId }, data: { status: "CANCELLED", scheduledAt: null } });
  await db.studioItem.update({ where: { id }, data: { status: "DRAFT", approvedBy: null, campaignId: null, releasedAt: null } });
  await audit(db, actor, "studio.unschedule", { entity: "StudioItem", entityId: id, data: { key: it.key, channel: it.channel } });
}

/** A social post the team makes by hand, with its own photo or video (the brief), instead of the card through Postiz. */
export async function setHand(id: string, hand: boolean, actor: Actor) {
  const r = await db.studioItem.updateMany({ where: { id, channel: "SOCIAL", status: { in: ["DRAFT", "APPROVED", "FAILED"] } }, data: { hand } });
  if (!r.count) throw new StudioError("Take it out of the schedule first");
  await audit(db, actor, "studio.hand", { entity: "StudioItem", entityId: id, data: { hand } });
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
