// Social posting through Postiz, which is open source and free when self-hosted (docs/INTEGRATIONS.md). HQ writes the post in
// HQ → Campaigns → Social; Postiz publishes or schedules it on the connected Instagram, Facebook, LinkedIn, X and
// Threads accounts.
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

async function postiz<T>(path: string, body?: unknown): Promise<T> {
  const c = config();
  if (!c) throw new SocialError("Postiz isn't connected");
  const r = await fetch(`${c.url}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: c.key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => {
    throw new SocialError(`Couldn't reach Postiz (${e instanceof Error ? e.message : e})`);
  });
  if (!r.ok) throw new SocialError(`Postiz said ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

/** The connected accounts we can post to; none when Postiz isn't connected. */
export async function socialChannels(): Promise<SocialChannel[]> {
  if (!config()) return [];
  const rows = await postiz<(SocialChannel & { disabled?: boolean })[]>("/integrations");
  return rows.filter((c) => !c.disabled && c.identifier in SOCIAL_NETWORKS).map(({ id, name, identifier, picture }) => ({ id, name, identifier, picture }));
}

/** Hands the post to Postiz (the picture by URL: public/social/<image>.jpg) and returns Postiz's post ids. */
export async function publishSocial(p: { content: string; image: string | null; channels: SocialChannel[]; mode: SocialMode; at: Date }) {
  const img = p.image ? await postiz<{ id: string; path: string }>("/upload-from-url", { url: `${APP_URL()}/social/${p.image}.jpg` }) : null;
  const posts = await postiz<{ postId: string }[]>("/posts", postizPost({ ...p, image: img && { id: img.id, path: img.path } }));
  return posts.map((x) => x.postId);
}
