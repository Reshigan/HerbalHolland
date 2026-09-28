import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { limitFor, needsImage, postizPost, screenSocial, SOCIAL_IMAGES } from "@/lib/social";
import { postizConnected, publishSocial, socialChannels } from "@/server/social";

describe("social copy screening", () => {
  it("passes brand posts", () => {
    expect(screenSocial("The Windmill Tee is back — the mark embroidered in Sunset thread, made to order in Cape Town. Shop the merch.")).toEqual([]);
    expect(screenSocial("New in Learn: what a CBD label tells you, line by line.")).toEqual([]);
  });
  it("stops THC, selling cannabis or CBD, and health claims", () => {
    expect(screenSocial("Fresh THC flower in store")[0].reason).toMatch(/Medicines Act/);
    expect(screenSocial("Buy our CBD gummies — R350 delivered").map((f) => f.reason).join()).toMatch(/Meta and TikTok/);
    expect(screenSocial("20% off pre-rolls this weekend")).toHaveLength(1);
    expect(screenSocial("CBD that cures anxiety")).toHaveLength(2);
  });
});

describe("Postiz posts", () => {
  const channels = [
    { id: "ig", name: "herbalholland", identifier: "instagram" },
    { id: "x1", name: "@herbalholland", identifier: "x" },
    { id: "th", name: "herbalholland", identifier: "threads" },
  ];
  it("limits captions to the strictest network and needs a picture for Instagram", () => {
    expect(limitFor(["instagram", "x"])).toBe(280);
    expect(limitFor(["facebook"])).toBe(2200);
    expect(limitFor([])).toBe(2200);
    expect(needsImage(["facebook", "instagram-standalone"])).toBe(true);
    expect(needsImage(["x"])).toBe(false);
  });
  it("builds one post per channel with the provider settings", () => {
    const body = postizPost({ mode: "schedule", at: new Date("2026-10-02T08:00:00Z"), content: "Hello", image: { id: "u1", path: "https://p/u1.jpg" }, channels });
    expect(body).toMatchObject({ type: "schedule", date: "2026-10-02T08:00:00.000Z", shortLink: false, tags: [] });
    expect(body.posts.map((p) => p.settings)).toEqual([{ __type: "instagram", post_type: "post" }, { __type: "x", who_can_reply_post: "everyone" }, { __type: "threads" }]);
    expect(body.posts[0]).toMatchObject({ integration: { id: "ig" }, value: [{ content: "Hello", image: [{ id: "u1", path: "https://p/u1.jpg" }] }] });
  });
  it("has a picture for every option (npx tsx scripts/merch-export.tsx --social)", () => {
    for (const i of SOCIAL_IMAGES) expect(existsSync(`public/social/${i.key}.jpg`), i.key).toBe(true);
  });
});

describe("Postiz adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("does nothing until it's configured", async () => {
    vi.stubEnv("POSTIZ_URL", "");
    expect(postizConnected()).toBe(false);
    expect(await socialChannels()).toEqual([]);
  });
  it("lists usable channels, uploads the picture by URL, then creates the post", async () => {
    vi.stubEnv("POSTIZ_URL", "https://social.example.com/api/public/v1/");
    vi.stubEnv("POSTIZ_API_KEY", "key-1");
    vi.stubEnv("APP_URL", "https://herbalholland.co.za");
    const calls: { url: string; init?: RequestInit }[] = [];
    const reply: Record<string, unknown> = {
      "/integrations": [
        { id: "ig", name: "herbalholland", identifier: "instagram", picture: "p", disabled: false },
        { id: "tt", name: "herbalholland", identifier: "tiktok", disabled: false },
        { id: "fb", name: "Herbal Holland", identifier: "facebook", disabled: true },
      ],
      "/upload-from-url": { id: "up1", path: "https://uploads/up1.jpg" },
      "/posts": [{ postId: "p1", integration: "ig" }],
    };
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(reply[url.replace("https://social.example.com/api/public/v1", "")]), { status: 200 });
    });
    const channels = await socialChannels();
    expect(channels).toEqual([{ id: "ig", name: "herbalholland", identifier: "instagram", picture: "p" }]);
    expect(await publishSocial({ content: "Hello", image: "windmill-tee", channels, mode: "now", at: new Date() })).toEqual(["p1"]);
    expect(calls.map((c) => c.url.split("/v1")[1])).toEqual(["/integrations", "/upload-from-url", "/posts"]);
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("key-1");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ url: "https://herbalholland.co.za/social/windmill-tee.jpg" });
    expect(JSON.parse(String(calls[2].init?.body)).posts[0].value[0].image).toEqual([{ id: "up1", path: "https://uploads/up1.jpg" }]);
  });
  it("reports Postiz errors", async () => {
    vi.stubEnv("POSTIZ_URL", "https://social.example.com/api/public/v1");
    vi.stubEnv("POSTIZ_API_KEY", "bad");
    vi.stubGlobal("fetch", async () => new Response("Unauthorized", { status: 401 }));
    await expect(socialChannels()).rejects.toThrow(/Postiz said 401/);
  });
});
