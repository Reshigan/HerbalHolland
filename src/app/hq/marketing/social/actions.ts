"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, parseLocal } from "@/server/hq/form";
import { postizConnected, publishSocial, socialChannels, SocialError } from "@/server/social";
import { limitFor, needsImage, screenSocial, SOCIAL_IMAGES, SOCIAL_NETWORKS, type SocialChannel, type SocialMode } from "@/lib/social";
import { fmtDateTime } from "@/lib/format";

export async function postSocial(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const content = str(fd, "content");
  const image = str(fd, "image") || null;
  const mode: SocialMode = str(fd, "mode") === "schedule" ? "schedule" : str(fd, "mode") === "draft" ? "draft" : "now";
  const picked = fd.getAll("channel").map(String);
  let channels: SocialChannel[];
  try {
    channels = (await socialChannels()).filter((c) => picked.includes(c.id));
  } catch (e) {
    if (e instanceof SocialError) return fail(e.message);
    throw e;
  }
  const ids = channels.map((c) => c.identifier);
  const fields: Record<string, string> = {};
  if (postizConnected() && !channels.length) fields.channel = "Pick at least one channel";
  const flags = screenSocial(content);
  if (content.length < 10) fields.content = "Write the caption";
  else if (content.length > limitFor(ids)) fields.content = `Keep it to ${limitFor(ids).toLocaleString()} characters`;
  else if (flags.length) fields.content = flags.map((f) => `“${f.term}”: ${f.reason}`).join(" · ");
  if (image && !SOCIAL_IMAGES.some((i) => i.key === image)) fields.image = "Choose one of the pictures";
  else if (!image && needsImage(ids)) fields.image = "Instagram needs a picture";
  let at = new Date();
  if (mode === "schedule") {
    const d = parseLocal(str(fd, "at"));
    if (!d) fields.at = "Pick a date and time";
    else if (d.getTime() < Date.now() + 5 * 60_000) fields.at = "At least 5 minutes from now";
    else at = d;
  }
  if (Object.keys(fields).length) return fail(flags.length ? "The post needs changes before it can go out." : "Check the highlighted fields.", fields);

  let postizIds: string[] = [];
  if (postizConnected()) {
    try {
      postizIds = await publishSocial({ content, image, channels, mode, at });
    } catch (e) {
      if (e instanceof SocialError) return fail(e.message);
      throw e;
    }
  }
  const names = channels.map((c) => `${SOCIAL_NETWORKS[c.identifier].label} · ${c.name}`);
  const post = await db.socialPost.create({ data: { content, image, channels: names, mode, scheduledAt: mode === "schedule" ? at : null, postizIds, createdBy: g.user.name } });
  await audit(db, g.actor, "social.post", { entity: "SocialPost", entityId: post.id, data: { mode, channels: names, image } });
  revalidatePath("/hq/marketing/social");
  if (!postizConnected()) return done("Recorded here only. Connect Postiz to publish (docs/INTEGRATIONS.md).");
  return done(
    mode === "now" ? `Posting now to ${names.join(", ")}.` : mode === "schedule" ? `Scheduled for ${fmtDateTime(at)} on ${names.join(", ")}.` : "Saved in Postiz as a draft. Finish and schedule it there.",
  );
}
