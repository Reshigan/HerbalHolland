// Social posting straight from the platform to the brand's accounts: Facebook Page, Instagram and Threads (Meta's Graph
// APIs), Bluesky (AT Protocol) and Telegram (Bot API). A network is connected by its secrets (docs/INTEGRATIONS.md →
// Connecting the networks); with none set, posts are only recorded (development and demos). LinkedIn and X are posted
// by hand. Instagram and Threads fetch the picture by URL, so a Studio card is put in R2 first and served at
// /social/cards/<name>.jpg; the brand pictures are public/social already.
import { APP_URL } from "./invoices";
import { putObject } from "./storage";
import { db } from "./db";
import { audit, SYSTEM } from "./audit";
import { captionFor, SOCIAL_NETWORKS, type SocialChannel } from "@/lib/social";
import { asList } from "@/lib/json-list";

export class SocialError extends Error {}

export type Picture = { image: string } | { file: { data: Uint8Array; name: string; type: string } };
/** How one network took the post: its id and link, or why it refused. */
export type PostResult = { network: string; name: string; id?: string; link?: string; error?: string };

type Image = { url: string; bytes: () => Promise<Uint8Array> };
type Network = { connected: () => string | null; publish: (text: string, image: Image | null) => Promise<{ id: string; link?: string }> };

const env = (k: string) => process.env[k]?.trim() || null;
const GRAPH = "https://graph.facebook.com/v21.0";
const THREADS = "https://graph.threads.net/v1.0";
const BSKY = "https://bsky.social/xrpc";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One HTTP call to a network: JSON back, or a SocialError saying who refused and why. */
async function call<T>(who: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }).catch((e) => {
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
async function metaContainer(who: string, base: string, user: string, token: string, fields: Record<string, string | undefined>, statusField: string, publishPath: string) {
  const c = await call<{ id: string }>(who, `${base}/${user}/${fields.__path ?? "media"}`, form({ ...fields, __path: undefined, access_token: token }));
  for (let i = 0; i < 15; i++) {
    const s = await call<Record<string, string>>(who, `${base}/${c.id}?fields=${statusField},error_message&access_token=${token}`);
    if (s[statusField] === "FINISHED") break;
    if (s[statusField] === "ERROR" || s[statusField] === "EXPIRED") throw new SocialError(`${who} couldn't take the picture: ${s.error_message ?? s[statusField]}`);
    await sleep(2000);
  }
  const p = await call<{ id: string }>(who, `${base}/${user}/${publishPath}`, form({ creation_id: c.id, access_token: token }));
  const { permalink } = await call<{ permalink?: string }>(who, `${base}/${p.id}?fields=permalink&access_token=${token}`);
  return { id: p.id, link: permalink };
}

const NETWORKS: Record<string, Network> = {
  facebook: {
    connected: () => (env("META_PAGE_ID") && env("META_PAGE_TOKEN") ? "Page" : null),
    async publish(text, image) {
      const page = env("META_PAGE_ID")!, token = env("META_PAGE_TOKEN")!;
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
    async publish(text, image) {
      if (!image) throw new SocialError("Instagram needs a picture");
      return metaContainer("Instagram", GRAPH, env("META_IG_USER_ID")!, env("META_PAGE_TOKEN")!, { image_url: image.url, caption: text }, "status_code", "media_publish");
    },
  },
  threads: {
    connected: () => (env("THREADS_USER_ID") && env("THREADS_TOKEN") ? "Profile" : null),
    publish: (text, image) =>
      metaContainer("Threads", THREADS, env("THREADS_USER_ID")!, env("THREADS_TOKEN")!, { __path: "threads", media_type: image ? "IMAGE" : "TEXT", image_url: image?.url, text }, "status", "threads_publish"),
  },
  bluesky: {
    connected: () => (env("BLUESKY_HANDLE") && env("BLUESKY_APP_PASSWORD") ? `@${env("BLUESKY_HANDLE")}` : null),
    async publish(text, image) {
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
    async publish(text, image) {
      const chat = env("TELEGRAM_CHAT_ID")!, api = `https://api.telegram.org/bot${env("TELEGRAM_TOKEN")}`;
      const r = await call<{ result: { message_id: number; chat: { username?: string } } }>("Telegram", image ? `${api}/sendPhoto` : `${api}/sendMessage`, json(image ? { chat_id: chat, photo: image.url, caption: text } : { chat_id: chat, text }));
      const u = r.result.chat.username;
      return { id: String(r.result.message_id), link: u ? `https://t.me/${u}/${r.result.message_id}` : undefined };
    },
  },
};

export const socialConnected = () => Object.values(NETWORKS).some((n) => n.connected());

/** The networks with their secrets set, as channels to post to (the id is the network's identifier). */
export async function socialChannels(): Promise<SocialChannel[]> {
  return Object.entries(NETWORKS).flatMap(([identifier, n]) => {
    const name = n.connected();
    return name ? [{ id: identifier, name, identifier }] : [];
  });
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
export async function publishSocial(p: { content: string; short?: string | null; picture: Picture | null; channels: SocialChannel[] }): Promise<PostResult[]> {
  if (!p.channels.length) throw new SocialError("No social network is connected");
  const image = await imageOf(p.picture);
  const out: PostResult[] = [];
  for (const c of p.channels) {
    const n = NETWORKS[c.identifier];
    if (!n) continue;
    try {
      out.push({ network: c.identifier, name: c.name, ...(await n.publish(captionFor(c.identifier, p.content, p.short), image)) });
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
      results = await publishSocial({ content: post.content, picture: post.image ? { image: post.image } : null, channels: to });
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
