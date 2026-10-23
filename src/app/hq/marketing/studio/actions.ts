"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { opt, parseLocal, str } from "@/server/hq/form";
import { approveItems, createLaunch, createPlan, itemFlags, markPosted, saveItem, scheduleApproved, setHand, setPaused, skipItem, StudioError, unschedule } from "@/server/studio";
import { aiReady, suggestRewrite } from "@/server/studio-ai";
import { clearEarlyAccess, importEarlyAccess } from "@/server/early-access";
import { CARD_TEMPLATES, screenDraft, type Card, type CardTemplate, type StudioChannel } from "@/lib/studio";
import { SOCIAL_IMAGES } from "@/lib/social";
import { plural } from "@/lib/plural";
import { filesIn, storeVideo, UploadError } from "@/server/uploads";

const path = (planId: string) => `/hq/marketing/studio/${planId}`;
const failed = (e: unknown) => {
  if (e instanceof StudioError || e instanceof UploadError) return fail(e.message);
  throw e;
};

export async function createStudioPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  let id: string;
  try {
    id = (await createPlan({ playbook: str(fd, "playbook"), anchor: str(fd, "anchor"), storeId: opt(fd, "storeId"), productId: opt(fd, "product"), by: g.user.name, actor: g.actor })).id;
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/hq/marketing/studio");
  flashTo(path(id), "Laid out. Read each post, change what you like, then approve.");
}

export async function createLaunchPlans(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  let n: number;
  try {
    n = (await createLaunch({ brand: str(fd, "brand"), shop: str(fd, "shop"), doors: str(fd, "doors"), storeIds: fd.getAll("storeIds").map(String), by: g.user.name, actor: g.actor })).length;
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/hq/marketing/studio");
  return done(`Laid out: the brand launch, the online shop launch and ${plural(n - 2, "store opening")}. Open each to read, approve and schedule it.`);
}

export async function importFirstAccess(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const raw = str(fd, "list");
  if (!raw) return fail("Paste the export first.", { list: "The export" });
  const r = await importEarlyAccess(raw, g.actor);
  revalidatePath("/hq/marketing/studio");
  if (!r.added && !r.duplicates) return fail(`Nothing to import: ${plural(r.skipped, "row")} without an email address or a South African mobile number.`);
  return done(`${plural(r.added, "person", "people")} added${r.duplicates ? `, ${r.duplicates} already on the list` : ""}${r.skipped ? `, ${plural(r.skipped, "row")} left out (no email or mobile)` : ""}.`);
}

export async function clearFirstAccess(_: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const n = await clearEarlyAccess(g.actor);
  revalidatePath("/hq/marketing/studio");
  return done(`Deleted ${plural(n, "sign-up")}.`);
}

export async function approveStudio(planId: string, itemId: string | null, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const r = await approveItems(planId, itemId ? [itemId] : "all", g.user.name, g.actor);
  revalidatePath(path(planId));
  if (!r.approved && r.blocked) return fail(r.blocked === 1 ? "This post needs changes first (see what's flagged)." : `${r.blocked} posts need changes first (see what's flagged).`);
  return done(`${plural(r.approved, "post")} approved${r.blocked ? `, ${plural(r.blocked, "post")} still need changes` : ""}.`);
}

export async function scheduleStudio(planId: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  let r;
  try {
    r = await scheduleApproved(planId, g.actor);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(path(planId));
  const queued = r.social + r.campaigns;
  const late = r.late ? ` ${plural(r.late, "post")} too soon to queue: give ${r.late === 1 ? "it" : "them"} a later time.` : "";
  if (!queued) return (r.late ? fail : done)(`Nothing new to queue.${late} Posts made by hand stay in the list until you mark them posted.`);
  return done(`${plural(queued, "post")} queued: each is released at its time (the scheduler runs every 15 minutes). Pause the campaign to hold them.${late}`);
}

export async function pauseStudio(planId: string, paused: boolean, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  await setPaused(planId, paused, g.actor);
  revalidatePath(path(planId));
  revalidatePath("/hq/marketing/studio");
  return done(paused ? "Paused: nothing more goes out until you resume it." : "Resumed: queued posts go out at their times.");
}

export async function saveStudioItem(itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const it = await db.studioItem.findUnique({ where: { id: itemId }, select: { planId: true, channel: true, card: true } });
  if (!it) return fail("That post isn't there any more.");
  const at = parseLocal(str(fd, "at"));
  if (!at) return fail("Pick a date and time.", { at: "Date and time" });
  const template = str(fd, "template") as CardTemplate;
  const card: Card | null = Object.hasOwn(CARD_TEMPLATES, template)
    ? {
        template,
        headline: str(fd, "headline"),
        ...(opt(fd, "eyebrow") && { eyebrow: str(fd, "eyebrow") }),
        ...(opt(fd, "sub") && { sub: str(fd, "sub") }),
        ...(template === "promise" && { lines: str(fd, "lines").split("\n").map((l) => l.trim()).filter(Boolean) }),
        ...(template === "merch" && SOCIAL_IMAGES.some((i) => i.key === str(fd, "image")) && { image: str(fd, "image") }),
      }
    : null;
  const patch: Parameters<typeof saveItem>[1] = { text: str(fd, "text"), short: opt(fd, "short"), title: opt(fd, "title"), card, at };
  if (!patch.text) return fail("Write the post.", { text: "The words" });
  try {
    const [video] = filesIn(fd, "video");
    if (video) patch.videoUploadId = await storeVideo({ file: video, folder: "studio/videos", uploadedById: g.user.id });
    else if (str(fd, "dropVideo") === "1") patch.videoUploadId = null;
    await saveItem(itemId, patch);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(path(it.planId));
  const flags = screenDraft({ ...patch, channel: it.channel as StudioChannel });
  return flags.length ? fail(`Saved, but it needs changes before approval: ${flags.map((f) => `“${f.term}”: ${f.reason}`).join(" · ")}`) : done("Saved. Approve it when you're happy.");
}

export async function postedStudioItem(itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const link = opt(fd, "link");
  if (link && !/^https:\/\/\S+$/.test(link)) return fail("Paste the post's https:// link, or leave it empty.", { link: "https://…" });
  const it = await db.studioItem.findUnique({ where: { id: itemId }, select: { planId: true } });
  if (!it) return fail("That post isn't there any more.");
  try {
    await markPosted(itemId, g.user.name, link, g.actor);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(path(it.planId));
  return done("Marked as posted.");
}

export async function skipStudioItem(itemId: string, skip: boolean, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const it = await db.studioItem.findUnique({ where: { id: itemId }, select: { planId: true } });
  if (!it) return fail("That post isn't there any more.");
  try {
    await skipItem(itemId, skip);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(path(it.planId));
  return done(skip ? "Left out of this campaign." : "Back in, as a draft.");
}

export async function handStudioItem(itemId: string, hand: boolean, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const it = await db.studioItem.findUnique({ where: { id: itemId }, select: { planId: true } });
  if (!it) return fail("That post isn't there any more.");
  try {
    await setHand(itemId, hand, g.actor);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(path(it.planId));
  return done(hand ? "Yours to post by hand: copy the words, shoot it, then mark it posted." : "The card goes out on its own when you schedule it.");
}

export async function unscheduleStudioItem(itemId: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const it = await db.studioItem.findUnique({ where: { id: itemId }, select: { planId: true } });
  if (!it) return fail("That post isn't there any more.");
  try {
    await unschedule(itemId, g.actor);
  } catch (e) {
    return failed(e);
  }
  revalidatePath(path(it.planId));
  return done("Taken back: it's a draft again.");
}

/** A rewrite in the brand's voice (Workers AI), screened; the editor decides whether to use it. */
export async function suggestStudioRewrite(itemId: string, text: string, note: string): Promise<{ text?: string; flags?: string[]; error?: string }> {
  const g = await guard("network");
  if (!g) return { error: DENIED.error };
  if (!aiReady()) return { error: "AI drafting isn't set up." };
  const it = await db.studioItem.findUnique({ where: { id: itemId }, select: { channel: true, short: true, title: true, card: true, at: true } });
  if (!it) return { error: "That post isn't there any more." };
  try {
    const out = await suggestRewrite({ channel: it.channel as StudioChannel, text: text.slice(0, 3000) }, note.slice(0, 300));
    return { text: out, flags: itemFlags({ ...it, text: out }).map((f) => `“${f.term}”: ${f.reason}`) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
