// Connecting a social account by signing in (OAuth 2.0 with PKCE): TikTok, YouTube, LinkedIn, X and Pinterest. HQ →
// Marketing → Social → Connect sends the person to the network; the network sends them back to
// /api/social/connect/<network> with a code, which becomes the account's tokens, sealed in SocialAccount. A token
// about to expire is refreshed before each post. Each network's app keys are secrets on the Worker (docs/INTEGRATIONS.md).
import { createHmac, randomBytes, createHash } from "node:crypto";
import { db } from "../db";
import { appSecret } from "../secret";
import { APP_URL } from "../invoices";
import { open, seal } from "./box";
import type { Prisma } from "@/generated/prisma/client";

export type OAuthNetwork = "tiktok" | "youtube" | "linkedin" | "x" | "pinterest";
export const OAUTH_NETWORKS: OAuthNetwork[] = ["tiktok", "youtube", "linkedin", "x", "pinterest"];

type Provider = {
  label: string;
  id: string; // the client id's env name
  secret: string; // the client secret's env name
  auth: string;
  token: string;
  scope: string;
  /** TikTok calls the client id client_key. */
  idParam?: string;
  /** The token endpoint wants the client as HTTP Basic (X, Pinterest). */
  basic?: true;
  /** Who the account is: name and id, read with a fresh access token. */
  whoami: (token: string) => Promise<{ name: string; externalId: string; extra?: Record<string, string> }>;
};

const env = (k: string) => process.env[k]?.trim() || null;
const j = async <T>(r: Response): Promise<T> => {
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
};
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const PROVIDERS: Record<OAuthNetwork, Provider> = {
  tiktok: {
    label: "TikTok", id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET", idParam: "client_key",
    auth: "https://www.tiktok.com/v2/auth/authorize/", token: "https://open.tiktokapis.com/v2/oauth/token/",
    scope: "user.info.basic,video.publish,video.upload",
    whoami: async (t) => {
      const r = await j<{ data: { user: { open_id: string; display_name: string } } }>(await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: bearer(t) }));
      return { name: r.data.user.display_name, externalId: r.data.user.open_id };
    },
  },
  youtube: {
    label: "YouTube", id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET",
    auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    whoami: async (t) => {
      const r = await j<{ items?: { id: string; snippet: { title: string } }[] }>(await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: bearer(t) }));
      const c = r.items?.[0];
      if (!c) throw new Error("That Google account has no YouTube channel");
      return { name: c.snippet.title, externalId: c.id };
    },
  },
  linkedin: {
    label: "LinkedIn", id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET",
    auth: "https://www.linkedin.com/oauth/v2/authorization", token: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile w_member_social",
    whoami: async (t) => {
      const r = await j<{ sub: string; name: string }>(await fetch("https://api.linkedin.com/v2/userinfo", { headers: bearer(t) }));
      return { name: r.name, externalId: r.sub };
    },
  },
  x: {
    label: "X", id: "X_CLIENT_ID", secret: "X_CLIENT_SECRET", basic: true,
    auth: "https://x.com/i/oauth2/authorize", token: "https://api.x.com/2/oauth2/token",
    scope: "tweet.read tweet.write users.read media.write offline.access",
    whoami: async (t) => {
      const r = await j<{ data: { id: string; username: string } }>(await fetch("https://api.x.com/2/users/me", { headers: bearer(t) }));
      return { name: `@${r.data.username}`, externalId: r.data.id };
    },
  },
  pinterest: {
    label: "Pinterest", id: "PINTEREST_APP_ID", secret: "PINTEREST_APP_SECRET", basic: true,
    auth: "https://www.pinterest.com/oauth/", token: "https://api.pinterest.com/v5/oauth/token",
    scope: "boards:read,pins:read,pins:write,user_accounts:read",
    whoami: async (t) => {
      const me = await j<{ username: string; id: string }>(await fetch("https://api.pinterest.com/v5/user_account", { headers: bearer(t) }));
      const boards = await j<{ items: { id: string; name: string }[] }>(await fetch("https://api.pinterest.com/v5/boards?page_size=1", { headers: bearer(t) }));
      const board = boards.items[0];
      if (!board) throw new Error("Make a board on Pinterest first: pins go to the first board");
      return { name: `@${me.username} · ${board.name}`, externalId: me.id, extra: { boardId: board.id } };
    },
  },
};

/** The networks whose app keys are set, so HQ can connect an account. */
export const connectable = () => OAUTH_NETWORKS.filter((n) => env(PROVIDERS[n].id) && env(PROVIDERS[n].secret));
export const redirectUri = (n: OAuthNetwork) => `${APP_URL()}/api/social/connect/${n}`;

const sign = (s: string) => createHmac("sha256", appSecret()).update(`social-oauth:${s}`).digest("base64url");
const b64 = (b: Buffer) => b.toString("base64url");

/** Where to send the person, and the state to keep in a cookie until they're back (PKCE verifier + signed nonce). */
export function startConnect(n: OAuthNetwork) {
  const p = PROVIDERS[n];
  const verifier = b64(randomBytes(32));
  const nonce = b64(randomBytes(16));
  const state = `${n}.${nonce}.${sign(`${n}.${nonce}`)}`;
  const q = new URLSearchParams({
    response_type: "code",
    [p.idParam ?? "client_id"]: env(p.id)!,
    redirect_uri: redirectUri(n),
    scope: p.scope,
    state,
    code_challenge: b64(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    ...(n === "youtube" ? { access_type: "offline", prompt: "consent" } : {}),
  });
  return { url: `${p.auth}?${q}`, cookie: `${state}.${verifier}` };
}

/** Checks the state the network sent back against the cookie; the PKCE verifier when it matches. */
export function checkState(n: OAuthNetwork, state: string | null, cookie: string | undefined) {
  if (!state || !cookie || !cookie.startsWith(`${state}.`)) return null;
  const [net, nonce, sig] = state.split(".");
  if (net !== n || sign(`${net}.${nonce}`) !== sig) return null;
  return cookie.slice(state.length + 1);
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenCall(n: OAuthNetwork, body: Record<string, string>): Promise<Tokens> {
  const p = PROVIDERS[n];
  const id = env(p.id)!, secret = env(p.secret)!;
  const form = new URLSearchParams(p.basic ? body : { ...body, [p.idParam ?? "client_id"]: id, client_secret: secret });
  const r = await fetch(p.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(p.basic ? { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } : {}) },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const t = await j<Tokens & { error?: string; error_description?: string }>(r);
  if (!t.access_token) throw new Error(t.error_description ?? t.error ?? "No token came back");
  return t;
}

const expiry = (t: Tokens) => (t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null);

/** The code the network sent back becomes the account: tokens sealed, name and id read from the network. */
export async function finishConnect(n: OAuthNetwork, code: string, verifier: string, by: string | null) {
  const t = await tokenCall(n, { grant_type: "authorization_code", code, redirect_uri: redirectUri(n), code_verifier: verifier });
  const who = await PROVIDERS[n].whoami(t.access_token);
  const data = { name: who.name, externalId: who.externalId, accessToken: seal(t.access_token), refreshToken: t.refresh_token ? seal(t.refresh_token) : null, expiresAt: expiry(t), extra: (who.extra ?? {}) as Prisma.InputJsonValue, connectedBy: by };
  return db.socialAccount.upsert({ where: { network: n }, create: { network: n, ...data }, update: data });
}

export type Account = { network: string; name: string; externalId: string; extra: Record<string, string> };

/** The connected accounts, as channels to post to. */
export async function accounts(): Promise<Account[]> {
  const rows = await db.socialAccount.findMany({ select: { network: true, name: true, externalId: true, extra: true } });
  return rows.map((r) => ({ ...r, extra: (r.extra ?? {}) as Record<string, string> }));
}

/** A usable access token for the account: refreshed (and kept) when it's within five minutes of expiry. */
export async function freshToken(n: OAuthNetwork) {
  const a = await db.socialAccount.findUnique({ where: { network: n } });
  if (!a) throw new Error(`${PROVIDERS[n].label} isn't connected`);
  if (!a.expiresAt || a.expiresAt.getTime() - Date.now() > 5 * 60_000) return open(a.accessToken);
  if (!a.refreshToken) throw new Error(`${PROVIDERS[n].label}'s sign-in has expired: connect it again in HQ → Marketing → Social`);
  const t = await tokenCall(n, { grant_type: "refresh_token", refresh_token: open(a.refreshToken) });
  await db.socialAccount.update({ where: { network: n }, data: { accessToken: seal(t.access_token), ...(t.refresh_token ? { refreshToken: seal(t.refresh_token) } : {}), expiresAt: expiry(t) } });
  return t.access_token;
}

export const disconnect = (n: OAuthNetwork) => db.socialAccount.deleteMany({ where: { network: n } });
