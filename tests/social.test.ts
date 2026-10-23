import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captionFor, limitFor, needsImage, screenSocial, SOCIAL_IMAGES } from "@/lib/social";
import { publishSocial, socialChannels, socialConnected } from "@/server/social";

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
    expect(socialConnected()).toBe(false);
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
