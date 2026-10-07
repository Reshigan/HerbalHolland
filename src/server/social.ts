// Social posting through Postiz, which is open source and free when self-hosted (docs/INTEGRATIONS.md). HQ writes the post in
// HQ → Marketing → Social or lays out a campaign in the Studio; Postiz publishes or schedules it on the connected
// Instagram, Facebook, Threads, Bluesky, Telegram, LinkedIn and X accounts.
//   POSTIZ_URL=https://social.herbalholland.co.za/api/public/v1   your Postiz's public API (Postiz cloud: https://api.postiz.com/public/v1)
//   POSTIZ_API_KEY=…                                               Postiz → Settings → Public API
//   unset                                                          posts are only recorded here (development and demos)
import { APP_URL } from "./invoices";
import { postizPost, SOCIAL_NETWORKS, type SocialChannel, type SocialMode } from "@/lib/social";

export class SocialError extends Error {}

const config = () => {
  const url = process.env.POSTIZ_URL, key = process.env.POSTIZ_API_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
};
export const postizConnected = () => config() != null;

async function postiz<T>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const c = config();
  if (!c) throw new SocialError("Postiz isn't connected");
  const r = await fetch(`${c.url}${path}`, {
    method: init.method ?? (init.json || init.form ? "POST" : "GET"),
    headers: { Authorization: c.key, ...(init.json ? { "Content-Type": "application/json" } : {}) },
    body: init.form ?? (init.json ? JSON.stringify(init.json) : undefined),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => {
    throw new SocialError(`Couldn't reach Postiz (${e instanceof Error ? e.message : e})`);
  });
  if (!r.ok) throw new SocialError(`Postiz said ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? null : r.json()) as Promise<T>;
}

/** The connected accounts we can post to; none when Postiz isn't connected. */
export async function socialChannels(): Promise<SocialChannel[]> {
  if (!config()) return [];
  const rows = await postiz<(SocialChannel & { disabled?: boolean })[]>("/integrations");
  return rows.filter((c) => !c.disabled && c.identifier in SOCIAL_NETWORKS).map(({ id, name, identifier, picture }) => ({ id, name, identifier, picture }));
}

type Picture = { image: string } | { file: { data: Buffer; name: string; type: string } };

/**
 * Hands the post to Postiz and returns its post ids. The picture is either one of public/social (by URL, so the app
 * must be public) or a file (a Studio card) uploaded with the post.
 */
export async function publishSocial(p: { content: string; short?: string | null; picture: Picture | null; channels: SocialChannel[]; mode: SocialMode; at: Date }) {
  let img: { id: string; path: string } | null = null;
  if (p.picture && "image" in p.picture) img = await postiz<{ id: string; path: string }>("/upload-from-url", { json: { url: `${APP_URL()}/social/${p.picture.image}.jpg` } });
  else if (p.picture) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(p.picture.file.data)], { type: p.picture.file.type }), p.picture.file.name);
    img = await postiz<{ id: string; path: string }>("/upload", { form });
  }
  const posts = await postiz<{ postId: string }[]>("/posts", { json: postizPost({ ...p, image: img && { id: img.id, path: img.path } }) });
  return posts.map((x) => x.postId);
}

export type PostizState = { id: string; state: "QUEUE" | "PUBLISHED" | "ERROR" | "DRAFT"; releaseURL?: string | null; error?: string | null };

/** Postiz's posts between two times, with how each one went. */
export async function postizPosts(from: Date, to: Date) {
  const q = new URLSearchParams({ startDate: from.toISOString(), endDate: to.toISOString() });
  return (await postiz<{ posts: PostizState[] }>(`/posts?${q}`)).posts;
}

/** Deletes a scheduled post (and the rest of its group, one per channel). */
export const deletePostiz = (id: string) => postiz<unknown>(`/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
