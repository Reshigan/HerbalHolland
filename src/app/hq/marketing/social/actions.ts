"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, parseLocal } from "@/server/hq/form";
import { publishSocial, socialChannels, socialConnected, SocialError, videoOf, type PostResult } from "@/server/social";
import { disconnect, OAUTH_NETWORKS, PROVIDERS, type OAuthNetwork } from "@/server/social/oauth";
import { filesIn, storeVideo, UploadError } from "@/server/uploads";
import { limitFor, needsImage, screenSocial, SOCIAL_IMAGES, SOCIAL_NETWORKS, type SocialChannel, type SocialMode } from "@/lib/social";
import { fmtDateTime } from "@/lib/format";

export async function postSocial(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  const content = str(fd, "content");
  const image = str(fd, "image") || null;
  const mode: SocialMode = str(fd, "mode") === "schedule" ? "schedule" : "now";
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
  const connected = await socialConnected();
  if (connected && !channels.length) fields.channel = "Pick at least one channel";
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
  const [videoFile] = filesIn(fd, "video");
  if (!videoFile && ids.some((i) => SOCIAL_NETWORKS[i]?.video === "required")) fields.video = "YouTube Shorts needs a video";
  if (Object.keys(fields).length) return fail(flags.length ? "The post needs changes before it can go out." : "Check the highlighted fields.", fields);

  let videoUploadId: string | null = null;
  let results: PostResult[] = [];
  try {
    if (videoFile) videoUploadId = await storeVideo({ file: videoFile, folder: "social/videos", uploadedById: g.user.id });
    if (connected && mode === "now") results = await publishSocial({ content, picture: image ? { image } : null, video: await videoOf(videoUploadId), channels });
  } catch (e) {
    if (e instanceof SocialError || e instanceof UploadError) return fail(e.message);
    throw e;
  }
  const names = channels.map((c) => SOCIAL_NETWORKS[c.identifier].label);
  const post = await db.socialPost.create({
    data: { content, image, videoUploadId, channels: channels.map((c) => c.identifier), mode, scheduledAt: mode === "schedule" ? at : null, postedAt: connected && mode === "now" ? new Date() : null, results, createdBy: g.user.name },
  });
  await audit(db, g.actor, "social.post", { entity: "SocialPost", entityId: post.id, data: { mode, channels: names, image, failed: results.filter((r) => r.error).map((r) => r.network) } });
  revalidatePath("/hq/marketing/social");
  if (!connected) return done("Recorded here only. Connect the networks to publish (docs/INTEGRATIONS.md).");
  if (mode === "schedule") return done(`Scheduled for ${fmtDateTime(at)} on ${names.join(", ")}.`);
  const failed = results.filter((r) => r.error);
  if (failed.length) return fail(`${failed.map((r) => `${SOCIAL_NETWORKS[r.network].label}: ${r.error}`).join(" · ")}${failed.length < results.length ? " The rest went out." : ""}`);
  return done(`Posted to ${names.join(", ")}.`);
}

/** Forgets a signed-in account (its tokens go with it); posts already made stay where they are. */
export async function disconnectSocial(network: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  if (!(OAUTH_NETWORKS as string[]).includes(network)) return fail("That network isn't one that signs in.");
  await disconnect(network as OAuthNetwork);
  await audit(db, g.actor, "social.disconnect", { entity: "SocialAccount", entityId: network });
  revalidatePath("/hq/marketing/social");
  return done(`${PROVIDERS[network as OAuthNetwork].label} disconnected.`);
}
