"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { audienceSize, sendCampaign, CampaignError } from "@/server/marketing";
import { storeWhere } from "@/server/scope";
import { guard, inScope, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str, opt, parseRand, parseLocal, parseSuppressionList } from "@/server/hq/form";
import { screenCopy } from "@/lib/compliance";
import { isAudience } from "@/lib/rfm";
import { marketingWindow, nextMarketingSlot, normalisePhone } from "@/lib/sa";
import { fmtDateTime } from "@/lib/format";
import type { MsgChannel } from "@/generated/prisma/client";

const CHANNELS: MsgChannel[] = ["SMS", "EMAIL", "PUSH", "WHATSAPP"];
const PUSH_TITLE_MAX = 40;
const PUSH_BODY_MAX = 140;
const validSegment = isAudience;

/** The composer's home-store picker: up to 20 open stores in the person's scope, by name, code or city (and region). */
export async function findCampaignStores(q: string, region: string) {
  const g = await guard("view");
  if (!g) return [];
  const term = q.trim().slice(0, 60);
  return db.store.findMany({
    where: {
      AND: [
        storeWhere(g.scope),
        { kind: "RETAIL", status: { not: "CLOSED" } },
        region ? { region: { code: region } } : {},
        term ? { OR: [{ name: { contains: term } }, { code: { contains: term } }, { city: { contains: term } }] } : {},
      ],
    },
    select: { id: true, name: true, code: true, city: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/** Live audience estimate for the composer. */
export async function estimateReach(segment: string, channel: string, storeId: string | null) {
  const g = await guard("view");
  if (!g || !validSegment(segment) || !CHANNELS.includes(channel as MsgChannel)) return null;
  if (g.scope.kind !== "HQ" && (!storeId || !(await inScope(g.scope, storeId)))) return null;
  const [size, suppressed] = await Promise.all([
    audienceSize(segment, channel as MsgChannel, storeId),
    db.suppression.count({ where: { OR: [{ channel: null }, { channel }] } }),
  ]);
  return { ...size, suppressionList: suppressed };
}

export async function saveCampaign(campaignId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("view");
  if (!g) return DENIED;
  const intent = str(fd, "intent") || "draft";
  const network = g.user.role === "HQ_ADMIN" || g.user.role === "HQ_STAFF";
  if (intent !== "draft" && !network) return fail("Area managers can prepare campaigns, and the HQ marketing team reviews and sends them. Save it as a draft.");
  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  if (!name) fields.name = "Name the campaign";
  const channel = str(fd, "channel") as MsgChannel;
  if (!CHANNELS.includes(channel)) fields.channel = "Choose a channel";
  // Push: the name is the notification's bold title; lock screens cut long text.
  if (channel === "PUSH" && name.length > PUSH_TITLE_MAX) fields.name = `Push titles fit ${PUSH_TITLE_MAX} characters. Shorten the name.`;
  const segment = str(fd, "segment");
  if (!validSegment(segment)) fields.segment = "Choose an audience";
  const storeId = opt(fd, "storeId");
  if (storeId && !(await inScope(g.scope, storeId))) fields.storeId = "Choose one of your stores";
  if (!network && !storeId) fields.storeId = "Pick a home store in your region";
  const message = str(fd, "message");
  if (message.length < 10) fields.message = "Write the message";
  else if (channel === "SMS" && message.length > 480) fields.message = "Keep SMS to 3 parts (480 characters) or fewer";
  else if (channel === "PUSH" && message.length > PUSH_BODY_MAX) fields.message = `Push messages fit ${PUSH_BODY_MAX} characters. Say one thing.`;
  const flags = screenCopy(`${name} ${message}`);
  if (flags.length) fields.message = flags.map((f) => `“${f.term}”: ${f.reason}`).join(" · ");
  const promotionId = opt(fd, "promotionId");
  const promo = promotionId ? await db.promotion.findUnique({ where: { id: promotionId }, select: { id: true, code: true, ownerStoreId: true } }) : null;
  if (promotionId && !promo) fields.promotionId = "Promotion not found";
  // An area manager may link an HQ promotion or one a store in their region runs, never another region's.
  else if (promo?.ownerStoreId && !network && !(await inScope(g.scope, promo.ownerStoreId))) fields.promotionId = "That promotion belongs to another region";
  if (message.includes("{{code}}") && !promo?.code) fields.message = "{{code}} needs a linked promotion with a promo code";
  const costCents = str(fd, "cost") ? parseRand(str(fd, "cost")) : 0;
  if (costCents == null || costCents < 0) fields.cost = "Rand amount";
  let scheduledAt: Date | null = null;
  if (intent === "schedule") {
    scheduledAt = parseLocal(str(fd, "scheduledAt"));
    if (!scheduledAt) fields.scheduledAt = "Pick a date and time";
    else if (scheduledAt.getTime() < Date.now() + 60_000) fields.scheduledAt = "Must be in the future";
  }
  if (Object.keys(fields).length) return fail(fields.message && flags.length ? "The copy needs changes before it can go out." : "Check the highlighted fields.", fields);

  const data = { name, channel, segment, storeId, message, promotionId: promo?.id ?? null, costCents: costCents ?? 0 };
  let id = campaignId;
  if (id) {
    const c = await db.campaign.findUnique({ where: { id }, select: { status: true, storeId: true } });
    if (!c || (network ? c.storeId && !(await inScope(g.scope, c.storeId)) : !c.storeId || !(await inScope(g.scope, c.storeId)))) return DENIED;
    if (c.status !== "DRAFT" && c.status !== "SCHEDULED") return fail("Sent or cancelled campaigns can't be edited.");
    await db.campaign.update({ where: { id }, data: { ...data, status: "DRAFT", scheduledAt: null } });
  } else {
    id = (await db.campaign.create({ data })).id;
    await audit(db, g.actor, "campaign.create", { storeId, entity: "Campaign", entityId: id, data: { name, channel, segment } });
  }

  let msg = "Draft saved.";
  if (intent === "schedule" && scheduledAt) {
    const at = marketingWindow(scheduledAt).allowed ? scheduledAt : nextMarketingSlot(scheduledAt);
    await db.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: at } });
    await audit(db, g.actor, "campaign.schedule", { storeId, entity: "Campaign", entityId: id, data: { at: at.toISOString() } });
    msg = at.getTime() === scheduledAt.getTime() ? `Scheduled for ${fmtDateTime(at)}.` : `Scheduled for ${fmtDateTime(at)}. It moved into the next legal send window (CPA Regulation 4).`;
  } else if (intent === "send") {
    try {
      const r = await sendCampaign(id, g.actor);
      msg = "scheduledAt" in r && r.scheduledAt ? `${r.reason}: held until ${fmtDateTime(r.scheduledAt)}, the next legal send window.` : `Sent to ${r.sent.toLocaleString()} members · ${r.suppressed.toLocaleString()} suppressed (no consent or on the do-not-contact list).`;
    } catch (e) {
      if (e instanceof CampaignError) return fail(e.message);
      throw e;
    }
  }
  revalidatePath("/hq/marketing");
  revalidatePath(`/hq/marketing/${id}`);
  if (!campaignId || intent === "send") flashTo(`/hq/marketing/${id}`, msg);
  return done(msg);
}

export async function sendNow(campaignId: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  let msg: string;
  try {
    const r = await sendCampaign(campaignId, g.actor);
    revalidatePath(`/hq/marketing/${campaignId}`);
    revalidatePath("/hq/marketing");
    msg = "scheduledAt" in r && r.scheduledAt ? `${r.reason}: held until ${fmtDateTime(r.scheduledAt)}.` : `Sent to ${r.sent.toLocaleString()} members · ${r.suppressed.toLocaleString()} suppressed.`;
  } catch (e) {
    if (e instanceof CampaignError) return fail(e.message);
    throw e;
  }
  flashTo(`/hq/marketing/${campaignId}`, msg);
}

export async function cancelCampaign(campaignId: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c) return fail("Campaign not found.");
  if (c.status === "SENT" || c.status === "CANCELLED") return fail("This campaign can't be cancelled.");
  await db.campaign.update({ where: { id: campaignId }, data: { status: "CANCELLED", scheduledAt: null } });
  await audit(db, g.actor, "campaign.cancel", { storeId: c.storeId, entity: "Campaign", entityId: campaignId, data: { name: c.name } });
  revalidatePath(`/hq/marketing/${campaignId}`);
  revalidatePath("/hq/marketing");
  flashTo(`/hq/marketing/${campaignId}`, "Campaign cancelled. Nothing will be sent.");
}

/** NCC opt-out registry import (monthly cleanse) and manual do-not-contact entries. */
export async function importSuppressions(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const source = ["NCC_REGISTRY", "REFUSED", "COMPLAINT"].includes(str(fd, "source")) ? str(fd, "source") : "NCC_REGISTRY";
  const ch = str(fd, "channel");
  const channel = CHANNELS.includes(ch as MsgChannel) ? ch : null;
  const { values, rejected } = parseSuppressionList(str(fd, "values"), normalisePhone);
  if (!values.length) return fail(rejected.length ? `Nothing valid to import. For example, “${rejected[0]}” isn't an SA mobile number or email.` : "Paste the numbers or emails to suppress.", { values: "One per line, or the registry CSV" });
  if (values.length > 50_000) return fail("Import at most 50,000 values at a time.");
  let added = 0;
  for (let i = 0; i < values.length; i += 5_000) {
    const slice = values.slice(i, i + 5_000);
    const known = new Set((await db.suppression.findMany({ where: { source, value: { in: slice } }, select: { value: true } })).map((s) => s.value));
    const fresh = slice.filter((value) => !known.has(value));
    if (fresh.length) added += (await db.suppression.createMany({ data: fresh.map((value) => ({ value, channel, source })) })).count;
  }
  const members = await db.customer.count({ where: { OR: [{ phone: { in: values.slice(0, 10_000) } }, { email: { in: values.slice(0, 10_000) } }] } });
  await audit(db, g.actor, "marketing.suppression_import", { entity: "Suppression", data: { source, channel, submitted: values.length, added, rejected: rejected.length, members } });
  revalidatePath("/hq/marketing");
  return done(
    `${added.toLocaleString()} added to the do-not-contact list${values.length - added ? ` (${(values.length - added).toLocaleString()} already listed)` : ""}. ${members.toLocaleString()} match current members and will be skipped on every send.${rejected.length ? ` ${rejected.length} line${rejected.length === 1 ? "" : "s"} skipped as invalid.` : ""}`,
  );
}
