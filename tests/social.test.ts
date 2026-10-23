import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captionFor, limitFor, needsImage, screenSocial, SOCIAL_IMAGES, tiktokChunkPlan } from "@/lib/social";
import { publishSocial, socialChannels, socialConnected } from "@/server/social";
import { checkState, startConnect, type Account } from "@/server/social/oauth";
import { open, seal } from "@/server/social/box";

// The signed-in accounts live in the database: the unit tests hand them in.
const signedIn: Account[] = [];
vi.mock("@/server/social/oauth", async (orig) => ({
  ...(await orig<typeof import("@/server/social/oauth")>()),
  accounts: async () => signedIn,
  freshToken: async (n: string) => `token-${n}`,
}));
vi.mock("@/server/db", () => ({ db: { socialAccount: { count: async () => signedIn.length } } }));

describe("social copy screening", () => {
  it("passes brand posts", () => {
    expect(screenSocial("The Windmill Tee is back: the mark embroidered in Sunset thread on black cotton. Shop the merch.")).toEqual([]);
    expect(screenSocial("New in Learn: what a CBD label tells you, line by line.")).toEqual([]);
  });
  it("stops THC, selling cannabis or CBD, and health claims", () => {
    expect(screenSocial("Fresh THC flower in store")[0].reason).toMatch(/Medicines Act/);
    expect(screenSocial("Buy our CBD gummies, R350 delivered").map((f) => f.reason).join()).toMatch(/Meta and TikTok/);
    expect(screenSocial("20% off pre-rolls this weekend")).toHaveLength(1);
    expect(screenSocial("CBD that cures anxiety")).toHaveLength(2);
  });
});

describe("social posts", () => {
  it("limits captions to the strictest network and needs a picture for Instagram", () => {
    expect(limitFor(["instagram", "x"])).toBe(280);
    expect(limitFor(["facebook"])).toBe(2200);
    expect(limitFor([])).toBe(2200);
    expect(needsImage(["facebook", "instagram"])).toBe(true);
    expect(needsImage(["x"])).toBe(false);
    expect(captionFor("threads", "x".repeat(600), "Short.")).toBe("Short.");
  });
  it("plans TikTok's chunks the way its init fields describe them", () => {
    const MB = 1024 * 1024;
    expect(tiktokChunkPlan(512)).toEqual({ chunk: 512, count: 1, ranges: [{ start: 0, end: 512 }] });
    expect(tiktokChunkPlan(40 * MB)).toEqual({ chunk: 40 * MB, count: 1, ranges: [{ start: 0, end: 40 * MB }] }); // one chunk, as declared
    expect(tiktokChunkPlan(70 * MB)).toEqual({ chunk: 32 * MB, count: 2, ranges: [{ start: 0, end: 32 * MB }, { start: 32 * MB, end: 70 * MB }] }); // the last takes the remainder
    for (const size of [5 * MB, 33 * MB, 90 * MB]) {
      const p = tiktokChunkPlan(size);
      expect(p.count).toBe(Math.floor(size / p.chunk));
      expect(p.ranges.at(-1)!.end).toBe(size);
      expect(p.ranges.every((r, i) => (i ? r.start === p.ranges[i - 1].end : r.start === 0))).toBe(true);
    }
  });
  it("has a picture for every option (npx tsx scripts/merch-export.tsx --social)", () => {
    for (const i of SOCIAL_IMAGES) expect(existsSync(`public/social/${i.key}.jpg`), i.key).toBe(true);
  });
});

type Call = { url: string; init?: RequestInit };
const NONE = ["META_PAGE_ID", "META_PAGE_TOKEN", "META_IG_USER_ID", "THREADS_USER_ID", "THREADS_TOKEN", "BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD", "TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"];
const body = (c: Call) => (c.init?.body instanceof URLSearchParams ? Object.fromEntries(c.init.body) : typeof c.init?.body === "string" ? JSON.parse(c.init.body) : c.init?.body);

describe("the networks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("does nothing until a network is connected", async () => {
    for (const k of NONE) vi.stubEnv(k, "");
    expect(await socialConnected()).toBe(false);
    expect(await socialChannels()).toEqual([]);
    await expect(publishSocial({ content: "Hello", picture: null, channels: [] })).rejects.toThrow(/No social network/);
  });
  it("lists the connected networks as channels", async () => {
    for (const k of NONE) vi.stubEnv(k, "");
    vi.stubEnv("META_PAGE_ID", "123");
    vi.stubEnv("META_PAGE_TOKEN", "tok");
    vi.stubEnv("BLUESKY_HANDLE", "herbalholland.com");
    vi.stubEnv("BLUESKY_APP_PASSWORD", "app-pass");
    expect((await socialChannels()).map((c) => [c.identifier, c.name])).toEqual([["facebook", "Page"], ["bluesky", "@herbalholland.com"]]);
  });
  it("posts a brand picture to Facebook, Instagram (container, then publish), Telegram and Bluesky", async () => {
    for (const k of NONE) vi.stubEnv(k, "");
    vi.stubEnv("APP_URL", "https://shop.herbalholland.com");
    vi.stubEnv("META_PAGE_ID", "123");
    vi.stubEnv("META_PAGE_TOKEN", "tok");
    vi.stubEnv("META_IG_USER_ID", "456");
    vi.stubEnv("TELEGRAM_TOKEN", "bot-tok");
    vi.stubEnv("TELEGRAM_CHAT_ID", "@herbalholland");
    vi.stubEnv("BLUESKY_HANDLE", "herbalholland.com");
    vi.stubEnv("BLUESKY_APP_PASSWORD", "app-pass");
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const reply = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (url.endsWith("/social/windmill-tee.jpg")) return new Response(new Uint8Array([1, 2, 3]));
      if (url.includes("/123/photos")) return reply({ id: "ph1", post_id: "123_777" });
      if (url.includes("/456/media?") || url.endsWith("/456/media")) return reply({ id: "c1" });
      if (url.includes("/c1?fields=status_code")) return reply({ status_code: "FINISHED" });
      if (url.includes("/456/media_publish")) return reply({ id: "ig9" });
      if (url.includes("/ig9?fields=permalink")) return reply({ permalink: "https://www.instagram.com/p/x/" });
      if (url.includes("sendPhoto")) return reply({ ok: true, result: { message_id: 42, chat: { username: "herbalholland" } } });
      if (url.includes("createSession")) return reply({ accessJwt: "jwt", did: "did:plc:abc" });
      if (url.includes("uploadBlob")) return reply({ blob: { $type: "blob", ref: { $link: "b1" } } });
      if (url.includes("createRecord")) return reply({ uri: "at://did:plc:abc/app.bsky.feed.post/3k2" });
      return new Response("nope", { status: 404 });
    });
    const channels = await socialChannels();
    const r = await publishSocial({ content: "Hello", picture: { image: "windmill-tee" }, channels });
    expect(r).toEqual([
      { network: "facebook", name: "Page", id: "123_777", link: "https://www.facebook.com/123_777" },
      { network: "instagram", name: "Professional account", id: "ig9", link: "https://www.instagram.com/p/x/" },
      { network: "bluesky", name: "@herbalholland.com", id: "at://did:plc:abc/app.bsky.feed.post/3k2", link: "https://bsky.app/profile/herbalholland.com/post/3k2" },
      { network: "telegram", name: "@herbalholland", id: "42", link: "https://t.me/herbalholland/42" },
    ]);
    const fb = calls.find((c) => c.url.includes("/123/photos"))!;
    expect(body(fb)).toEqual({ url: "https://shop.herbalholland.com/social/windmill-tee.jpg", message: "Hello", access_token: "tok" });
    expect(body(calls.find((c) => c.url.endsWith("/456/media"))!)).toEqual({ image_url: "https://shop.herbalholland.com/social/windmill-tee.jpg", caption: "Hello", access_token: "tok" });
    expect(body(calls.find((c) => c.url.includes("createRecord"))!).record.embed.images[0].image).toEqual({ $type: "blob", ref: { $link: "b1" } });
    expect(body(calls.find((c) => c.url.includes("sendPhoto"))!)).toEqual({ chat_id: "@herbalholland", photo: "https://shop.herbalholland.com/social/windmill-tee.jpg", caption: "Hello" });
  });
  it("one network refusing never stops the others, and says why", async () => {
    for (const k of NONE) vi.stubEnv(k, "");
    vi.stubEnv("META_PAGE_ID", "123");
    vi.stubEnv("META_PAGE_TOKEN", "old");
    vi.stubEnv("TELEGRAM_TOKEN", "bot-tok");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100");
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("/123/feed")
        ? new Response(JSON.stringify({ error: { message: "Error validating access token: Session has expired" } }), { status: 400 })
        : new Response(JSON.stringify({ ok: true, result: { message_id: 7, chat: {} } }), { status: 200 }),
    );
    const r = await publishSocial({ content: "Hello", picture: null, channels: await socialChannels() });
    expect(r).toEqual([
      { network: "facebook", name: "Page", error: "Facebook said 400: Error validating access token: Session has expired" },
      { network: "telegram", name: "-100", id: "7", link: undefined },
    ]);
  });
});

describe("the signed-in networks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    signedIn.length = 0;
  });
  it("seals tokens at rest and opens them again", () => {
    vi.stubEnv("SESSION_SECRET", "a-session-secret-of-at-least-32-characters");
    const sealed = seal("tok-123");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("tok-123");
    expect(open(sealed)).toBe("tok-123");
    expect(() => open("v1.bad.bad")).toThrow();
  });
  it("sends the person to the network with PKCE, and only takes a code back with the matching state", () => {
    vi.stubEnv("SESSION_SECRET", "a-session-secret-of-at-least-32-characters");
    vi.stubEnv("TIKTOK_CLIENT_KEY", "ck");
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "cs");
    vi.stubEnv("APP_URL", "https://shop.herbalholland.com");
    const s = startConnect("tiktok");
    const u = new URL(s.url);
    expect(u.origin + u.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(u.searchParams.get("client_key")).toBe("ck");
    expect(u.searchParams.get("redirect_uri")).toBe("https://shop.herbalholland.com/api/social/connect/tiktok");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const state = u.searchParams.get("state")!;
    expect(checkState("tiktok", state, s.cookie)).toBe(s.cookie.slice(state.length + 1));
    expect(checkState("youtube", state, s.cookie)).toBeNull();
    expect(checkState("tiktok", state.replace(/.$/, "x"), s.cookie)).toBeNull();
    expect(checkState("tiktok", state, undefined)).toBeNull();
  });
  it("lists signed-in accounts as channels, and posts the card to TikTok (photo), LinkedIn, X and Pinterest", async () => {
    for (const k of NONE) vi.stubEnv(k, "");
    vi.stubEnv("APP_URL", "https://shop.herbalholland.com");
    signedIn.push(
      { network: "tiktok", name: "herbalholland", externalId: "open-1", extra: {} },
      { network: "linkedin", name: "Reshigan Govender", externalId: "AbC", extra: {} },
      { network: "x", name: "@herbalholland", externalId: "9", extra: {} },
      { network: "pinterest", name: "@herbalholland · Windmill", externalId: "p1", extra: { boardId: "b1" } },
      { network: "youtube", name: "Herbal Holland", externalId: "UC1", extra: {} },
    );
    expect(await socialConnected()).toBe(true);
    const channels = await socialChannels();
    expect(channels.map((c) => c.identifier)).toEqual(["tiktok", "linkedin", "x", "pinterest", "youtube"]);
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const reply = (o: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(o), { status: 200, headers });
      if (url.endsWith("/social/windmill-tee.jpg")) return new Response(new Uint8Array([1, 2, 3]));
      if (url.endsWith("/post/publish/content/init/")) return reply({ data: { publish_id: "pub1" } });
      if (url.endsWith("/post/publish/status/fetch/")) return reply({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7001"] } });
      if (url.includes("rest/images?action=initializeUpload")) return reply({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/1", image: "urn:li:image:1" } });
      if (url.startsWith("https://www.linkedin.com/dms-uploads/")) return new Response("", { status: 201 });
      if (url.endsWith("/rest/posts")) return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:55" } });
      if (url.endsWith("/2/media/upload")) return reply({ data: { id: "m1" } });
      if (url.endsWith("/2/tweets")) return reply({ data: { id: "t1" } });
      if (url.endsWith("/v5/pins")) return reply({ id: "pin1" });
      return new Response("nope", { status: 404 });
    });
    const r = await publishSocial({ content: "Hello\nMore", picture: { image: "windmill-tee" }, channels });
    expect(r).toEqual([
      { network: "tiktok", name: "herbalholland", id: "7001", link: "https://www.tiktok.com/@herbalholland/video/7001" },
      { network: "linkedin", name: "Reshigan Govender", id: "urn:li:share:55", link: "https://www.linkedin.com/feed/update/urn:li:share:55" },
      { network: "x", name: "@herbalholland", id: "t1", link: "https://x.com/i/status/t1" },
      { network: "pinterest", name: "@herbalholland · Windmill", id: "pin1", link: "https://www.pinterest.com/pin/pin1/" },
      { network: "youtube", name: "Herbal Holland", error: "YouTube Shorts needs a video" },
    ]);
    const tiktok = body(calls.find((c) => c.url.endsWith("/post/publish/content/init/"))!);
    expect(tiktok).toMatchObject({ post_mode: "DIRECT_POST", media_type: "PHOTO", source_info: { source: "PULL_FROM_URL", photo_images: ["https://shop.herbalholland.com/social/windmill-tee.jpg"] }, post_info: { privacy_level: "PUBLIC_TO_EVERYONE", title: "Hello\nMore" } });
    expect((calls.find((c) => c.url.endsWith("/post/publish/content/init/"))!.init?.headers as Record<string, string>).Authorization).toBe("Bearer token-tiktok");
    expect(body(calls.find((c) => c.url.endsWith("/rest/posts"))!)).toMatchObject({ author: "urn:li:person:AbC", commentary: "Hello\nMore", content: { media: { id: "urn:li:image:1" } } });
    expect(body(calls.find((c) => c.url.endsWith("/2/tweets"))!)).toEqual({ text: "Hello\nMore", media: { media_ids: ["m1"] } });
    expect(body(calls.find((c) => c.url.endsWith("/v5/pins"))!)).toMatchObject({ board_id: "b1", title: "Hello", description: "More", media_source: { source_type: "image_url", url: "https://shop.herbalholland.com/social/windmill-tee.jpg" } });
  });
  it("posts a video to TikTok (one chunk) and YouTube Shorts (resumable)", async () => {
    for (const k of NONE) vi.stubEnv(k, "");
    signedIn.push({ network: "tiktok", name: "hh", externalId: "o", extra: {} }, { network: "youtube", name: "HH", externalId: "UC1", extra: {} });
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const reply = (o: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(o), { status: 200, headers });
      if (url.endsWith("/post/publish/video/init/")) return reply({ data: { publish_id: "pub2", upload_url: "https://open-upload.tiktokapis.com/x?sig=1" } });
      if (url.startsWith("https://open-upload.tiktokapis.com/")) return new Response("", { status: 201 });
      if (url.endsWith("/post/publish/status/fetch/")) return reply({ data: { status: "PROCESSING_UPLOAD" } });
      if (url.includes("upload/youtube/v3/videos?uploadType=resumable")) return new Response("", { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=1" } });
      if (url.includes("upload_id=1")) return reply({ id: "vid1" });
      return new Response("nope", { status: 404 });
    });
    const bytes = new Uint8Array(1000);
    vi.useFakeTimers();
    const pending = publishSocial({ content: "Opening day\nSee you there", picture: null, video: { bytes: async () => bytes, type: "video/mp4", size: bytes.length }, channels: await socialChannels() });
    await vi.runAllTimersAsync(); // TikTok's status polls wait 3 s each
    const r = await pending;
    vi.useRealTimers();
    expect(r[0]).toEqual({ network: "tiktok", name: "hh", id: "pub2", link: undefined }); // still processing: TikTok posts it when it's done
    expect(r[1]).toEqual({ network: "youtube", name: "HH", id: "vid1", link: "https://youtube.com/shorts/vid1" });
    expect(body(calls.find((c) => c.url.endsWith("/post/publish/video/init/"))!)).toMatchObject({ source_info: { source: "FILE_UPLOAD", video_size: 1000, chunk_size: 1000, total_chunk_count: 1 } });
    const put = calls.find((c) => c.url.startsWith("https://open-upload.tiktokapis.com/"))!;
    expect(put.init?.headers).toMatchObject({ "Content-Range": "bytes 0-999/1000", "Content-Type": "video/mp4" });
    expect(JSON.parse(String(calls.find((c) => c.url.includes("uploadType=resumable"))!.init?.body))).toMatchObject({ snippet: { title: "Opening day #Shorts" }, status: { privacyStatus: "public" } });
  });
});

describe("upload addresses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    signedIn.length = 0;
  });
  it("sends a video only to the network's own upload address", async () => {
    signedIn.push({ network: "youtube", name: "HH", externalId: "UC1", extra: {} });
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      sent.push(url);
      if (url.includes("uploadType=resumable")) return new Response("", { status: 200, headers: { location: "https://evil.example.com/upload" } });
      return new Response("{}", { status: 200 });
    });
    const r = await publishSocial({ content: "x", picture: null, video: { bytes: async () => new Uint8Array(3), type: "video/mp4", size: 3 }, channels: await socialChannels() });
    expect(r[0].error).toMatch(/outside googleapis.com/);
    expect(sent.some((u) => u.includes("evil.example.com"))).toBe(false);
  });
});
