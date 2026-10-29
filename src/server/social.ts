// Social posting straight from the platform to the brand's accounts. Facebook Page, Instagram and Threads (Meta's
// Graph APIs), Bluesky (AT Protocol) and Telegram (Bot API) are connected by secrets on the Worker; TikTok, YouTube,
// LinkedIn, X and Pinterest by signing in (./social/oauth.ts). With nothing connected, posts are only recorded
// (development and demos). Instagram, Threads, TikTok and Pinterest fetch the picture by URL, so a Studio card is put
// in R2 first and served at /social/cards/<name>.jpg; the brand pictures are public/social already. A video (MP4) goes
// to TikTok, YouTube Shorts and X; the other networks get the picture. docs/INTEGRATIONS.md → Connecting the networks.
import { APP_URL } from "./invoices";
import { deleteObject, getObject, putObject } from "./storage";
import { db } from "./db";
import { audit, SYSTEM } from "./audit";
import { accounts, freshToken, PROVIDERS, type Account, type OAuthNetwork } from "./social/oauth";
import { captionFor, SOCIAL_NETWORKS, tiktokChunkPlan, type SocialChannel } from "@/lib/social";
import { asList } from "@/lib/json-list";

export class SocialError extends Error {}

export type Picture = { image: string } | { file: { data: Uint8Array; name: string; type: string } };
/** A video for the networks that take one: an Upload (MP4 or MOV in R2), or one of our films (public/brand/video), which
 *  also has a public `url` so Facebook and Instagram can post it as a Reel. */
export type Video = { bytes: () => Promise<Uint8Array>; type: string; size: number; url?: string };
/** How one network took the post: its id and link, or why it refused. */
export type PostResult = { network: string; name: string; id?: string; link?: string; error?: string };

type Image = { url: string; bytes: () => Promise<Uint8Array> };
const body = (b: Uint8Array) => new Uint8Array(b) as Uint8Array<ArrayBuffer>; // a fresh buffer the fetch body types accept
type Media = { text: string; image: Image | null; video: Video | null; account?: Account };
type Network = { connected: () => string | null; publish: (m: Media) => Promise<{ id: string; link?: string }> };

const env = (k: string) => process.env[k]?.trim() || null;
const GRAPH = "https://graph.facebook.com/v21.0";
const THREADS = "https://graph.threads.net/v1.0";
const BSKY = "https://bsky.social/xrpc";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An upload address a network handed us must be the network's own: nothing is sent anywhere else. */
function trusted(who: string, url: string, host: string) {
  const h = new URL(url).hostname;
  if (new URL(url).protocol !== "https:" || !(h === host || h.endsWith(`.${host}`))) throw new SocialError(`${who} gave an upload address outside ${host}`);
  return url;
}

/** One HTTP call to a network: JSON back, or a SocialError saying who refused and why. */
async function call<T>(who: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) }).catch((e) => {
    throw new SocialError(`Couldn't reach ${who} (${e instanceof Error ? e.message : e})`);
  });
  const text = await r.text();
  if (!r.ok) {
    let reason = text.slice(0, 200);
    try {
      const j = JSON.parse(text) as { error?: { message?: string }; description?: string; message?: string };
      reason = j.error?.message ?? j.description ?? j.message ?? reason;
    } catch {}
    throw new SocialError(`${who} said ${r.status}: ${reason}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const form = (fields: Record<string, string | undefined>) => ({ method: "POST", body: new URLSearchParams(Object.entries(fields).filter((e): e is [string, string] => e[1] != null)) });

/** Meta's two-step publish (Instagram, Threads): a media container, ready when its status says so, then published. */
async function metaContainer(who: string, base: string, user: string, token: string, fields: Record<string, string | undefined>, statusField: string, publishPath: string, tries = 15) {
  const c = await call<{ id: string }>(who, `${base}/${user}/${fields.__path ?? "media"}`, form({ ...fields, __path: undefined, access_token: token }));
  const detail = statusField === "status_code" ? "status" : "error_message"; // Instagram explains in `status`, Threads in `error_message`
  for (let i = 0; i < tries; i++) {
    const s = await call<Record<string, string>>(who, `${base}/${c.id}?fields=${statusField},${detail}&access_token=${token}`);
    if (s[statusField] === "FINISHED") break;
    if (s[statusField] === "ERROR" || s[statusField] === "EXPIRED") throw new SocialError(`${who} couldn't take the picture: ${s[detail] ?? s[statusField]}`);
    await sleep(2000);
  }
  const p = await call<{ id: string }>(who, `${base}/${user}/${publishPath}`, form({ creation_id: c.id, access_token: token }));
  const { permalink } = await call<{ permalink?: string }>(who, `${base}/${p.id}?fields=permalink&access_token=${token}`);
  return { id: p.id, link: permalink };
}

/** Facebook posts as the Page only with the Page's own token; a user token that manages the Page is swapped for it. */
async function pageToken(page: string, token: string) {
  const r = await call<{ access_token?: string }>("Facebook", `${GRAPH}/${page}?fields=access_token&access_token=${token}`).catch(() => null);
  return r?.access_token ?? token;
}

const NETWORKS: Record<string, Network> = {
  facebook: {
    connected: () => (env("META_PAGE_ID") && env("META_PAGE_TOKEN") ? "Page" : null),
    async publish({ text, image, video }) {
      const page = env("META_PAGE_ID")!, token = await pageToken(page, env("META_PAGE_TOKEN")!);
      if (video?.url) {
        const r = await call<{ id: string }>("Facebook", `${GRAPH}/${page}/videos`, form({ file_url: video.url, description: text, access_token: token }));
        return { id: r.id, link: `https://www.facebook.com/${page}/videos/${r.id}` };
      }
      if (image) {
        const r = await call<{ id: string; post_id?: string }>("Facebook", `${GRAPH}/${page}/photos`, form({ url: image.url, message: text, access_token: token }));
        return { id: r.post_id ?? r.id, link: `https://www.facebook.com/${r.post_id ?? r.id}` };
      }
      const r = await call<{ id: string }>("Facebook", `${GRAPH}/${page}/feed`, form({ message: text, access_token: token }));
      return { id: r.id, link: `https://www.facebook.com/${r.id}` };
    },
  },
  instagram: {
    connected: () => (env("META_IG_USER_ID") && env("META_PAGE_TOKEN") ? "Professional account" : null),
    async publish({ text, image, video }) {
      // A film goes up as a Reel (shared to the feed too); Instagram takes a minute or two to process a video.
      if (video?.url)
        return metaContainer("Instagram", GRAPH, env("META_IG_USER_ID")!, env("META_PAGE_TOKEN")!, { media_type: "REELS", video_url: video.url, caption: text, share_to_feed: "true" }, "status_code", "media_publish", 90);
      if (!image) throw new SocialError("Instagram needs a picture");
      return metaContainer("Instagram", GRAPH, env("META_IG_USER_ID")!, env("META_PAGE_TOKEN")!, { image_url: image.url, caption: text }, "status_code", "media_publish");
    },
  },
  threads: {
    connected: () => (env("THREADS_USER_ID") && env("THREADS_TOKEN") ? "Profile" : null),
    publish: ({ text, image }) =>
      metaContainer("Threads", THREADS, env("THREADS_USER_ID")!, env("THREADS_TOKEN")!, { __path: "threads", media_type: image ? "IMAGE" : "TEXT", image_url: image?.url, text }, "status", "threads_publish"),
  },
  bluesky: {
    connected: () => (env("BLUESKY_HANDLE") && env("BLUESKY_APP_PASSWORD") ? `@${env("BLUESKY_HANDLE")}` : null),
    async publish({ text, image }) {
      const handle = env("BLUESKY_HANDLE")!;
      const s = await call<{ accessJwt: string; did: string }>("Bluesky", `${BSKY}/com.atproto.server.createSession`, json({ identifier: handle, password: env("BLUESKY_APP_PASSWORD") }));
      const auth = { Authorization: `Bearer ${s.accessJwt}` };
      let embed: unknown;
      if (image) {
        const bytes = await image.bytes();
        const up = await call<{ blob: unknown }>("Bluesky", `${BSKY}/com.atproto.repo.uploadBlob`, { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg" }, body: new Uint8Array(bytes) });
        embed = { $type: "app.bsky.embed.images", images: [{ alt: "Herbal Holland", image: up.blob }] };
      }
      const r = await call<{ uri: string }>("Bluesky", `${BSKY}/com.atproto.repo.createRecord`, {
        ...json({ repo: s.did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), ...(embed ? { embed } : {}) } }),
        headers: { ...auth, "Content-Type": "application/json" },
      });
      return { id: r.uri, link: `https://bsky.app/profile/${handle}/post/${r.uri.split("/").pop()}` };
    },
  },
  telegram: {
    connected: () => (env("TELEGRAM_TOKEN") && env("TELEGRAM_CHAT_ID") ? env("TELEGRAM_CHAT_ID")! : null),
    async publish({ text, image }) {
      const chat = env("TELEGRAM_CHAT_ID")!, api = `https://api.telegram.org/bot${env("TELEGRAM_TOKEN")}`;
      const r = await call<{ result: { message_id: number; chat: { username?: string } } }>("Telegram", image ? `${api}/sendPhoto` : `${api}/sendMessage`, json(image ? { chat_id: chat, photo: image.url, caption: text } : { chat_id: chat, text }));
      const u = r.result.chat.username;
      return { id: String(r.result.message_id), link: u ? `https://t.me/${u}/${r.result.message_id}` : undefined };
    },
  },
};


// ── The signed-in networks (./social/oauth.ts): the account's token is fetched fresh for each post ─────────────────
const TIKTOK = "https://open.tiktokapis.com/v2";
const authed = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

/** TikTok's publish is asynchronous: the status says when the post is live (or why not). */
async function tiktokWait(token: string, publishId: string) {
  for (let i = 0; i < 20; i++) {
    const r = await call<{ data: { status: string; fail_reason?: string; publicaly_available_post_id?: string[] } }>("TikTok", `${TIKTOK}/post/publish/status/fetch/`, { ...json({ publish_id: publishId }), headers: authed(token, { "Content-Type": "application/json" }) });
    if (r.data.status === "PUBLISH_COMPLETE") return r.data.publicaly_available_post_id?.[0];
    if (r.data.status === "FAILED") throw new SocialError(`TikTok couldn't publish it: ${r.data.fail_reason ?? "no reason given"}`);
    await sleep(3000);
  }
  return undefined; // still processing: the post arrives on its own
}

/** Uploads the bytes in the chunks the plan declared to TikTok at init (tiktokChunkPlan), in order. */
async function tiktokUpload(uploadUrl: string, bytes: Uint8Array, type: string, ranges: { start: number; end: number }[]) {
  for (const { start, end } of ranges) {
    const r = await fetch(trusted("TikTok", uploadUrl, "tiktokapis.com"), { method: "PUT", headers: { "Content-Type": type, "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}` }, body: body(bytes.slice(start, end)), signal: AbortSignal.timeout(120_000) });
    if (!r.ok && r.status !== 206) throw new SocialError(`TikTok refused the upload (${r.status})`);
  }
}

const OAUTH_ADAPTERS: Record<OAuthNetwork, (m: Media, token: string, a: Account) => Promise<{ id: string; link?: string }>> = {
  // A video is a direct post; without one, the card goes as a photo post (fetched by URL from our verified domain).
  async tiktok({ text, image, video }, token, a) {
    const post_info = { title: text.slice(0, 2200), privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: false, disable_duet: false, disable_stitch: false };
    let r: { data: { publish_id: string; upload_url?: string } };
    if (video) {
      const bytes = await video.bytes();
      const plan = tiktokChunkPlan(bytes.length);
      r = await call("TikTok", `${TIKTOK}/post/publish/video/init/`, {
        ...json({ post_info: { ...post_info, video_cover_timestamp_ms: 1000 }, source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: plan.chunk, total_chunk_count: plan.count } }),
        headers: authed(token, { "Content-Type": "application/json; charset=UTF-8" }),
      });
      await tiktokUpload(r.data.upload_url!, bytes, video.type, plan.ranges);
    } else {
      if (!image) throw new SocialError("TikTok needs a video or a picture");
      r = await call("TikTok", `${TIKTOK}/post/publish/content/init/`, {
        ...json({ post_info: { ...post_info, description: text.slice(0, 4000) }, source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: [image.url] }, post_mode: "DIRECT_POST", media_type: "PHOTO" }),
        headers: authed(token, { "Content-Type": "application/json; charset=UTF-8" }),
      });
    }
    const id = await tiktokWait(token, r.data.publish_id);
    return { id: id ?? r.data.publish_id, link: id ? `https://www.tiktok.com/@${a.name}/video/${id}` : undefined };
  },
  // A Short: a vertical video under three minutes; the first line of the words is the title.
  async youtube({ text, video }, token) {
    if (!video) throw new SocialError("YouTube Shorts needs a video");
    const bytes = await video.bytes();
    const title = text.split("\n")[0].slice(0, 90) || "Herbal Holland";
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: authed(token, { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": video.type, "X-Upload-Content-Length": String(bytes.length) }),
      body: JSON.stringify({ snippet: { title: `${title} #Shorts`, description: text, categoryId: "22" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }),
      signal: AbortSignal.timeout(30_000),
    });
    const session = start.headers.get("location");
    if (!start.ok || !session) throw new SocialError(`YouTube said ${start.status}: ${(await start.text()).slice(0, 200)}`);
    const r = await call<{ id: string }>("YouTube", trusted("YouTube", session, "googleapis.com"), { method: "PUT", headers: { "Content-Type": video.type, "Content-Length": String(bytes.length) }, body: body(bytes), signal: AbortSignal.timeout(300_000) });
    return { id: r.id, link: `https://youtube.com/shorts/${r.id}` };
  },
  // The owner's own profile (Share on LinkedIn needs no approval); the picture is uploaded first.
  async linkedin({ text, image }, token, a) {
    const author = `urn:li:person:${a.externalId}`;
    const h = authed(token, { "Content-Type": "application/json", "LinkedIn-Version": "202510", "X-Restli-Protocol-Version": "2.0.0" });
    let media: unknown;
    if (image) {
      const init = await call<{ value: { uploadUrl: string; image: string } }>("LinkedIn", "https://api.linkedin.com/rest/images?action=initializeUpload", { ...json({ initializeUploadRequest: { owner: author } }), headers: h });
      const up = await fetch(trusted("LinkedIn", init.value.uploadUrl, "linkedin.com"), { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: body(await image.bytes()), signal: AbortSignal.timeout(60_000) });
      if (!up.ok) throw new SocialError(`LinkedIn refused the picture (${up.status})`);
      media = { id: init.value.image, altText: "Herbal Holland" };
    }
    const r = await fetch("https://api.linkedin.com/rest/posts", {
      ...json({ author, commentary: text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false, ...(media ? { content: { media } } : {}) }),
      headers: h,
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new SocialError(`LinkedIn said ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const id = r.headers.get("x-restli-id") ?? "";
    return { id, link: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
  },
  // A post with the picture or the video (uploaded in 4 MB pieces, then finalised). Every API post is charged by X.
  async x({ text, image, video }, token) {
    const h = authed(token);
    let mediaId: string | undefined;
    if (video) {
      const bytes = await video.bytes();
      const init = await call<{ data: { id: string } }>("X", "https://api.x.com/2/media/upload", { ...json({ command: "INIT", total_bytes: bytes.length, media_type: video.type, media_category: "tweet_video" }), headers: { ...h, "Content-Type": "application/json" } });
      mediaId = init.data.id;
      const piece = 4 * 1024 * 1024;
      for (let i = 0, seg = 0; i < bytes.length; i += piece, seg++) {
        const fd = new FormData();
        fd.append("command", "APPEND");
        fd.append("media_id", mediaId);
        fd.append("segment_index", String(seg));
        fd.append("media", new Blob([body(bytes.slice(i, i + piece))]));
        await call("X", "https://api.x.com/2/media/upload", { method: "POST", headers: h, body: fd });
      }
      let s = await call<{ data: { processing_info?: { state: string; check_after_secs?: number; error?: { message: string } } } }>("X", "https://api.x.com/2/media/upload", { ...json({ command: "FINALIZE", media_id: mediaId }), headers: { ...h, "Content-Type": "application/json" } });
      for (let i = 0; i < 20 && s.data.processing_info && !["succeeded", "failed"].includes(s.data.processing_info.state); i++) {
        await sleep((s.data.processing_info.check_after_secs ?? 3) * 1000);
        s = await call("X", `https://api.x.com/2/media/upload?command=STATUS&media_id=${mediaId}`, { headers: h });
      }
      if (s.data.processing_info?.state === "failed") throw new SocialError(`X couldn't process the video: ${s.data.processing_info.error?.message ?? ""}`);
    } else if (image) {
      const fd = new FormData();
      fd.append("media", new Blob([body(await image.bytes())], { type: "image/jpeg" }), "card.jpg");
      fd.append("media_category", "tweet_image");
      mediaId = (await call<{ data: { id: string } }>("X", "https://api.x.com/2/media/upload", { method: "POST", headers: h, body: fd })).data.id;
    }
    const r = await call<{ data: { id: string } }>("X", "https://api.x.com/2/tweets", { ...json({ text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }), headers: { ...h, "Content-Type": "application/json" } });
    return { id: r.data.id, link: `https://x.com/i/status/${r.data.id}` };
  },
  // A pin on the account's first board, the picture by URL, linking to the shop.
  async pinterest({ text, image }, token, a) {
    if (!image) throw new SocialError("Pinterest needs a picture");
    const [title, ...rest] = text.split("\n");
    const r = await call<{ id: string }>("Pinterest", "https://api.pinterest.com/v5/pins", {
      ...json({ board_id: a.extra.boardId, title: title.slice(0, 100), description: (rest.join("\n") || text).slice(0, 800), link: APP_URL(), media_source: { source_type: "image_url", url: image.url } }),
      headers: authed(token, { "Content-Type": "application/json" }),
    });
    return { id: r.id, link: `https://www.pinterest.com/pin/${r.id}/` };
  },
};

/** The networks that are connected, by secrets or by signing in. */
export async function socialConnected() {
  return Object.values(NETWORKS).some((n) => n.connected()) || (await db.socialAccount.count()) > 0;
}


/** The connected networks, as channels to post to (the id is the network's identifier). */
export async function socialChannels(): Promise<SocialChannel[]> {
  const bySecret = Object.entries(NETWORKS).flatMap(([identifier, n]) => {
    const name = n.connected();
    return name ? [{ id: identifier, name, identifier }] : [];
  });
  const signedIn = (await accounts()).map((a) => ({ id: a.network, name: a.name, identifier: a.network }));
  return [...bySecret, ...signedIn];
}

/** Forgets a video no post refers to any more: its Upload row and its file. */
export async function dropVideo(uploadId: string | null | undefined) {
  if (!uploadId) return;
  const used = (await db.studioItem.count({ where: { videoUploadId: uploadId } })) + (await db.socialPost.count({ where: { videoUploadId: uploadId } }));
  if (used) return;
  const u = await db.upload.findUnique({ where: { id: uploadId }, select: { key: true } });
  if (!u) return;
  await deleteObject(u.key).catch((e) => console.error("[social] video delete failed", u.key, e));
  await db.upload.delete({ where: { id: uploadId } });
}

/** A stored video as the networks take it. */
export async function videoOf(uploadId: string | null | undefined): Promise<Video | null> {
  if (!uploadId) return null;
  // One of our films by its public path ("/brand/video/launch-30-9x16.mp4") instead of an Upload.
  if (/^\/brand\/video\/[a-z0-9-]+\.mp4$/.test(uploadId)) {
    const url = `${APP_URL()}${uploadId}`;
    return { url, type: "video/mp4", size: 0, bytes: async () => new Uint8Array(await (await fetch(url)).arrayBuffer()) };
  }
  const u = await db.upload.findUnique({ where: { id: uploadId }, select: { key: true, contentType: true, sizeBytes: true } });
  if (!u) return null;
  let cached: Uint8Array | null = null;
  return { type: u.contentType, size: u.sizeBytes, bytes: async () => (cached ??= await getObject(u.key)) };
}

async function imageOf(p: Picture | null): Promise<Image | null> {
  if (!p) return null;
  if ("image" in p) {
    const url = `${APP_URL()}/social/${p.image}.jpg`;
    return { url, bytes: async () => new Uint8Array(await (await fetch(url)).arrayBuffer()) };
  }
  const name = p.file.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
  await putObject(`social/cards/${name}`, new Uint8Array(p.file.data) as Uint8Array<ArrayBuffer>, p.file.type);
  return { url: `${APP_URL()}/social/cards/${name}`, bytes: async () => p.file.data };
}

/**
 * Posts to each channel now and says how each one went; one network refusing never stops the others. The picture is
 * one of public/social (by name) or a file (a Studio card).
 */
export async function publishSocial(p: { content: string; short?: string | null; picture: Picture | null; video?: Video | null; channels: SocialChannel[] }): Promise<PostResult[]> {
  if (!p.channels.length) throw new SocialError("No social network is connected");
  const image = await imageOf(p.picture);
  const video = p.video ?? null;
  const signedIn = p.channels.some((c) => c.identifier in OAUTH_ADAPTERS) ? await accounts() : [];
  const out: PostResult[] = [];
  for (const c of p.channels) {
    const text = captionFor(c.identifier, p.content, p.short);
    try {
      if (c.identifier in OAUTH_ADAPTERS) {
        const n = c.identifier as OAuthNetwork;
        const account = signedIn.find((a) => a.network === n);
        if (!account) throw new SocialError(`${PROVIDERS[n].label} isn't connected`);
        if (SOCIAL_NETWORKS[n]?.video === "required" && !video) throw new SocialError(`${SOCIAL_NETWORKS[n].label} needs a video`);
        out.push({ network: n, name: c.name, ...(await OAUTH_ADAPTERS[n]({ text, image, video, account }, await freshToken(n), account)) });
        continue;
      }
      const n = NETWORKS[c.identifier];
      if (!n) continue;
      out.push({ network: c.identifier, name: c.name, ...(await n.publish({ text, image, video })) });
    } catch (e) {
      out.push({ network: c.identifier, name: c.name, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }
  return out;
}

/**
 * The scheduler's step: posts from HQ → Social whose time has come go out. Each is claimed first (postedAt), so two runs
 * never post it twice; a run that stops between the claim and the networks' answers leaves the post without results,
 * which the Social page shows as unconfirmed for HQ to check, rather than posting it again blind.
 */
export async function releaseSocialPosts(now = new Date()) {
  const due = await db.socialPost.findMany({ where: { mode: "schedule", postedAt: null, scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, take: 20 });
  let posted = 0;
  const channels = await socialChannels();
  for (const post of due) {
    if (!(await db.socialPost.updateMany({ where: { id: post.id, postedAt: null }, data: { postedAt: now } })).count) continue;
    const to = channels.filter((c) => asList<string>(post.channels).includes(c.identifier));
    let results: PostResult[];
    try {
      results = await publishSocial({ content: post.content, picture: post.image ? { image: post.image } : null, video: await videoOf(post.videoUploadId), channels: to });
    } catch (e) {
      results = asList<string>(post.channels).map((network) => ({ network, name: SOCIAL_NETWORKS[network]?.label ?? network, error: e instanceof Error ? e.message : String(e) }));
    }
    await db.socialPost.update({ where: { id: post.id }, data: { results } });
    posted++;
  }
  return posted;
}

/** The daily check: a Meta Page token that is about to expire is reported before posts start failing (audit social.token). */
export async function checkSocialTokens(now = new Date()) {
  const token = env("META_PAGE_TOKEN");
  if (!token) return { checked: 0 };
  const { data } = await call<{ data: { expires_at?: number; is_valid?: boolean } }>("Meta", `${GRAPH}/debug_token?input_token=${token}&access_token=${token}`);
  const days = data.expires_at ? Math.floor((data.expires_at * 1000 - now.getTime()) / 86_400_000) : null;
  if (data.is_valid === false || (days != null && days <= 14)) {
    await audit(db, SYSTEM, "social.token", { entity: "Settings", entityId: "META_PAGE_TOKEN", data: { valid: data.is_valid, days } });
    console.error(`[social] the Meta Page token ${data.is_valid === false ? "is no longer valid" : `expires in ${days} days`}: set a new META_PAGE_TOKEN`);
  }
  return { checked: 1, days };
}
