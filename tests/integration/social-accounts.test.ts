// Signed-in social accounts: the code the network sends back becomes a sealed account; a token near expiry is
// refreshed and kept; a signed-in network takes a Studio post with its video; disconnecting forgets the tokens.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { accounts, disconnect, finishConnect, freshToken } from "@/server/social/oauth";
import { open } from "@/server/social/box";
import { publishSocial, socialChannels } from "@/server/social";
import { storeVideo } from "@/server/uploads";
import { approveItems, createPlan, releaseStudio, saveItem, scheduleApproved } from "@/server/studio";
import { firstDayT, type Card } from "@/lib/studio";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { dayKey } from "@/lib/format";
import { buildWorld, resetDb } from "./world";

const actor = { type: "USER" as const, id: "u1", name: "Hanna HQ" };
type Call = { url: string; init?: RequestInit };
const real = globalThis.fetch;
const form = (c: Call) => Object.fromEntries(c.init?.body as URLSearchParams);
const mp4 = () => new File([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, ...new Array(500).fill(0)])], "opening.mp4", { type: "video/mp4" });

beforeAll(async () => {
  await resetDb();
  await buildWorld();
  vi.stubEnv("SESSION_SECRET", "a-session-secret-of-at-least-32-characters");
  vi.stubEnv("APP_URL", "https://shop.example.com");
  vi.stubEnv("TIKTOK_CLIENT_KEY", "ck");
  vi.stubEnv("TIKTOK_CLIENT_SECRET", "cs");
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("signed-in social accounts", () => {
  it("turns the code into a sealed account, refreshes a token near expiry, and forgets it on disconnect", async () => {
    const calls: Call[] = [];
    let tokenNo = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      if (url.endsWith("/v2/oauth/token/")) return Response.json({ access_token: `at-${++tokenNo}`, refresh_token: `rt-${tokenNo}`, expires_in: 86400 });
      if (url.includes("/v2/user/info/")) return Response.json({ data: { user: { open_id: "open-1", display_name: "herbalholland" } } });
      return real(input, init);
    });
    const a = await finishConnect("tiktok", "the-code", "the-verifier", "Hanna HQ");
    expect(form(calls[0])).toMatchObject({ grant_type: "authorization_code", code: "the-code", code_verifier: "the-verifier", client_key: "ck", client_secret: "cs", redirect_uri: "https://shop.example.com/api/social/connect/tiktok" });
    expect(a).toMatchObject({ network: "tiktok", name: "herbalholland", externalId: "open-1", connectedBy: "Hanna HQ" });
    expect(a.accessToken).not.toContain("at-1"); // sealed
    expect(open(a.accessToken)).toBe("at-1");
    expect((await accounts()).map((x) => [x.network, x.name])).toEqual([["tiktok", "herbalholland"]]);
    expect((await socialChannels()).map((c) => c.identifier)).toContain("tiktok");

    // A day of life left: used as is. Four minutes left: refreshed, and the new pair kept.
    expect(await freshToken("tiktok")).toBe("at-1");
    await db.socialAccount.update({ where: { network: "tiktok" }, data: { expiresAt: new Date(Date.now() + 4 * 60_000) } });
    expect(await freshToken("tiktok")).toBe("at-2");
    expect(form(calls.at(-1)!)).toMatchObject({ grant_type: "refresh_token", refresh_token: "rt-1" });
    const kept = await db.socialAccount.findUniqueOrThrow({ where: { network: "tiktok" } });
    expect([open(kept.accessToken), open(kept.refreshToken!)]).toEqual(["at-2", "rt-2"]);
    expect(kept.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    await disconnect("tiktok");
    expect(await accounts()).toEqual([]);
    await expect(freshToken("tiktok")).rejects.toThrow(/isn't connected/);
  });

  it("releases a Studio post with its video to TikTok, and the card to the networks without video", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/v2/oauth/token/")) return Response.json({ access_token: "at-9", refresh_token: "rt-9", expires_in: 86400 });
      if (url.includes("/v2/user/info/")) return Response.json({ data: { user: { open_id: "open-1", display_name: "herbalholland" } } });
      return real(input, init);
    });
    await finishConnect("tiktok", "c", "v", "Hanna HQ");
    const videoId = await storeVideo({ file: mp4(), folder: "studio/videos" });
    expect(await db.upload.findUniqueOrThrow({ where: { id: videoId } })).toMatchObject({ contentType: "video/mp4", fileName: "opening.mp4" });

    const plan = await createPlan({ playbook: "brand-launch", anchor: firstDayT(PLAYBOOKS.find((p) => p.key === "brand-launch")!, dayKey(new Date(Date.now() + 3 * 86_400_000))), storeId: null, by: "Hanna HQ", actor });
    const [it] = await db.studioItem.findMany({ where: { planId: plan.id, channel: "SOCIAL", linkedin: null }, orderBy: { at: "asc" }, take: 1 });
    await saveItem(it.id, { text: it.text, short: it.short, title: it.title, card: it.card as Card, at: it.at, videoUploadId: videoId });
    await approveItems(plan.id, [it.id], "Hanna HQ", actor);
    expect(await scheduleApproved(plan.id, actor)).toMatchObject({ social: 1 });

    const inits: Call[] = [];
    let put: Call | undefined;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/post/publish/video/init/")) {
        inits.push({ url, init });
        return Response.json({ data: { publish_id: "pub7", upload_url: "https://open-upload.tiktokapis.com/7" } });
      }
      if (url.startsWith("https://open-upload.tiktokapis.com/")) {
        put = { url, init };
        return new Response("", { status: 201 });
      }
      if (url.endsWith("/post/publish/status/fetch/")) return Response.json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7777"] } });
      return real(input, init);
    });
    expect(await releaseStudio(new Date(it.at.getTime() + 60_000))).toEqual({ released: 1, failed: 0 });
    expect(JSON.parse(String(inits[0].init?.body))).toMatchObject({ source_info: { source: "FILE_UPLOAD", video_size: 512, chunk_size: 512, total_chunk_count: 1 } });
    expect(put?.init?.headers).toMatchObject({ "Content-Range": "bytes 0-511/512", "Content-Type": "video/mp4" });
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: it.id }, include: { socialPost: true } })).toMatchObject({ status: "POSTED", link: "https://www.tiktok.com/@herbalholland/video/7777", socialPost: { videoUploadId: null, results: [{ network: "tiktok", id: "7777" }] } });

    // The one-off Social page path with a video: YouTube isn't connected, so only TikTok gets it.
    const r = await publishSocial({ content: "Doors open", picture: null, video: { bytes: async () => new Uint8Array(10), type: "video/mp4", size: 10 }, channels: await socialChannels() });
    expect(r.map((x) => [x.network, x.id])).toEqual([["tiktok", "7777"]]);
  });
});
