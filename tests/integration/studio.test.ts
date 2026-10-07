import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { approveItems, createLaunch, createPlan, markPosted, releaseStudio, saveItem, scheduleApproved, setPaused, StudioError, syncStudio, unschedule } from "@/server/studio";
import type { Card } from "@/lib/studio";
import { PLAYBOOKS } from "@/lib/studio-playbooks";
import { dayKey } from "@/lib/format";
import { marketingWindow } from "@/lib/sa";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const actor = { type: "USER" as const, id: "u1", name: "Hanna HQ" };
const inDays = (n: number) => dayKey(new Date(Date.now() + n * 86_400_000));

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db.store.update({ where: { id: w.store.id }, data: { status: "OPENING_SOON", hours: { mon: ["09:00", "19:00"], tue: ["09:00", "19:00"], wed: ["09:00", "19:00"], thu: ["09:00", "19:00"], fri: ["09:00", "19:00"], sat: ["09:00", "17:00"] } } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => db.$disconnect());

describe("Campaign Studio", () => {
  it("lays a store opening out from day T, filled in for the store", async () => {
    const plan = await createPlan({ playbook: "store-opening", anchor: inDays(45), storeId: w.store.id, by: "Hanna HQ", actor });
    const items = await db.studioItem.findMany({ where: { planId: plan.id } });
    expect(items).toHaveLength(PLAYBOOKS.find((p) => p.key === "store-opening")!.items.length);
    expect(items.every((i) => i.status === "DRAFT")).toBe(true);
    expect(JSON.stringify(items)).not.toMatch(/\{(store|town|address|hours|date)\}/);
    expect(items.some((i) => i.text.includes("Test Store"))).toBe(true);
    expect(items.filter((i) => i.channel === "SOCIAL").every((i) => i.card)).toBe(true);
    expect(await db.auditLog.count({ where: { action: "studio.create", entityId: plan.id } })).toBe(1);
  });

  it("won't lay out a day that has passed, or a store opening without its store", async () => {
    await expect(createPlan({ playbook: "brand-launch", anchor: inDays(-1), storeId: null, by: "x", actor })).rejects.toBeInstanceOf(StudioError);
    await expect(createPlan({ playbook: "store-opening", anchor: inDays(10), storeId: null, by: "x", actor })).rejects.toThrow(/store/);
  });

  it("lays the launch out in its order: brand, then shop, then the stores' doors", async () => {
    await expect(createLaunch({ brand: inDays(20), shop: inDays(10), doors: inDays(40), storeIds: [w.store.id], by: "x", actor })).rejects.toThrow(/brand launches first/);
    const plans = await createLaunch({ brand: inDays(5), shop: inDays(25), doors: inDays(50), storeIds: [w.store.id], by: "Hanna HQ", actor });
    expect(plans.map((p) => [p.playbook, p.anchor])).toEqual([["brand-launch", inDays(5)], ["shop-launch", inDays(25)], ["store-opening", inDays(50)]]);
    await db.studioPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } });
  });

  it("approves what passes and queues what goes out on its own; by-hand posts wait for a person", async () => {
    const plan = await db.studioPlan.findFirstOrThrow({ where: { playbook: "store-opening" } });
    const r = await approveItems(plan.id, "all", "Hanna HQ", actor);
    expect(r.blocked).toBe(0);
    const done = await scheduleApproved(plan.id, actor);
    const items = await db.studioItem.findMany({ where: { planId: plan.id } });
    const own = items.filter((i) => ["EMAIL", "SMS", "PUSH"].includes(i.channel));
    expect(own.length).toBeGreaterThan(0);
    expect(done.campaigns).toBe(own.length);
    // Queued, not released: nothing has left the platform yet.
    expect(own.every((i) => i.status === "SCHEDULED" && !i.releasedAt && !i.campaignId)).toBe(true);
    // No Postiz here: social, WhatsApp and Google wait, approved, to be posted by hand.
    expect(items.filter((i) => !["EMAIL", "SMS", "PUSH"].includes(i.channel)).every((i) => i.status === "APPROVED")).toBe(true);
    expect(await db.auditLog.count({ where: { action: "studio.schedule", entityId: plan.id } })).toBe(1);
    expect(await scheduleApproved(plan.id, actor)).toMatchObject({ campaigns: 0, social: 0 });
  });

  it("releases each queued message at its time, holds a paused campaign, and won't send one hours late", async () => {
    const plan = await db.studioPlan.findFirstOrThrow({ where: { playbook: "store-opening" } });
    const queued = await db.studioItem.findMany({ where: { planId: plan.id, status: "SCHEDULED" }, orderBy: { at: "asc" } });
    const [first, second] = queued;
    const at = (i: { at: Date }, min: number) => new Date(i.at.getTime() + min * 60_000);

    // Before its time: nothing. Paused: nothing.
    expect(await releaseStudio(at(first, -1))).toEqual({ released: 0, failed: 0 });
    await setPaused(plan.id, true, actor);
    expect(await releaseStudio(at(first, 1))).toEqual({ released: 0, failed: 0 });
    // Resumed: the first goes as a campaign to the store's members, sent inside its window.
    await setPaused(plan.id, false, actor);
    expect(await releaseStudio(at(first, 1))).toMatchObject({ released: 1 });
    const out = await db.studioItem.findUniqueOrThrow({ where: { id: first.id }, include: { campaign: true } });
    expect(out.releasedAt).not.toBeNull();
    expect(out.campaign).toMatchObject({ channel: first.channel, segment: "ALL", storeId: w.store.id, message: first.text, status: "SENT" });
    expect(marketingWindow(out.campaign!.sentAt!).allowed).toBe(true);
    // Released twice? Never.
    expect(await releaseStudio(at(first, 2))).toMatchObject({ released: 0 });
    await syncStudio();
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "POSTED", doneBy: "Campaign" });
    // Seven hours late (the scheduler stopped): it waits for a new time instead.
    const late = await releaseStudio(at(second, 7 * 60));
    expect(late.failed).toBeGreaterThanOrEqual(1);
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "FAILED", releasedAt: null });
    expect(await db.auditLog.count({ where: { action: { in: ["studio.pause", "studio.resume"] }, entityId: plan.id } })).toBe(2);
  });

  it("records a post made by hand, and takes a queued message back before it goes", async () => {
    const plan = await db.studioPlan.findFirstOrThrow({ where: { playbook: "store-opening" } });
    const hand = await db.studioItem.findFirstOrThrow({ where: { planId: plan.id, channel: { in: ["WHATSAPP", "GOOGLE"] }, status: "APPROVED" } });
    await markPosted(hand.id, "Hanna HQ", "https://whatsapp.com/channel/x", actor);
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: hand.id } })).toMatchObject({ status: "POSTED", doneBy: "Hanna HQ", link: "https://whatsapp.com/channel/x" });

    const waiting = await db.studioItem.findFirstOrThrow({ where: { planId: plan.id, status: "SCHEDULED", releasedAt: null } });
    await unschedule(waiting.id, actor);
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: waiting.id } })).toMatchObject({ status: "DRAFT", campaignId: null });
    const sent = await db.studioItem.findFirstOrThrow({ where: { planId: plan.id, status: "POSTED", campaignId: { not: null } } });
    await expect(unschedule(sent.id, actor)).rejects.toThrow(/scheduled/);
  });

  it("releases social posts to Postiz with their card at their time, and reads back how they went", async () => {
    vi.stubEnv("POSTIZ_URL", "https://social.example.com/api/public/v1");
    vi.stubEnv("POSTIZ_API_KEY", "key-1");
    const uploads: string[] = [];
    const modes: string[] = [];
    let n = 0;
    let state: { id: string; state: string; releaseURL?: string; error?: string }[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://social.example.com/")) return real(input, init); // next/og loads its renderer with fetch
      const path = url.replace("https://social.example.com/api/public/v1", "").split("?")[0];
      if (path === "/integrations") return Response.json([{ id: "ig", name: "herbalholland", identifier: "instagram" }]);
      if (path === "/upload") {
        uploads.push(((init?.body as FormData).get("file") as File).type);
        return Response.json({ id: `f${uploads.length}`, path: `https://uploads/f${uploads.length}.jpg` });
      }
      if (path === "/posts" && init?.method === "POST") {
        modes.push(JSON.parse(String(init.body)).type);
        return Response.json([{ postId: `p${++n}` }]);
      }
      return Response.json({ posts: state });
    });
    const plan = await createPlan({ playbook: "brand-launch", anchor: inDays(3), storeId: null, by: "Hanna HQ", actor });
    const social = await db.studioItem.findMany({ where: { planId: plan.id, channel: "SOCIAL" }, orderBy: { at: "asc" }, take: 2 });
    await approveItems(plan.id, social.map((s) => s.id), "Hanna HQ", actor);
    expect(await scheduleApproved(plan.id, actor)).toMatchObject({ social: 2 });
    expect(uploads).toEqual([]); // queued: nothing sent to Postiz yet

    expect(await releaseStudio(new Date(social[0].at.getTime() + 60_000))).toEqual({ released: 1, failed: 0 });
    expect(await releaseStudio(new Date(social[1].at.getTime() + 60_000))).toEqual({ released: 1, failed: 0 });
    expect(uploads).toEqual(["image/jpeg", "image/jpeg"]);
    expect(modes).toEqual(["now", "now"]);
    const [one, two] = await db.studioItem.findMany({ where: { id: { in: social.map((s) => s.id) } }, include: { socialPost: true }, orderBy: { at: "asc" } });
    expect(one.socialPost?.postizIds).toEqual(["p1"]);

    // Postiz published one and failed the other.
    state = [{ id: "p1", state: "PUBLISHED", releaseURL: "https://instagram.com/p/one" }, { id: "p2", state: "ERROR", error: "Media too small" }];
    await syncStudio(new Date(social[1].at.getTime() + 10 * 60_000));
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: one.id } })).toMatchObject({ status: "POSTED", link: "https://instagram.com/p/one", doneBy: "Postiz" });
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: two.id } })).toMatchObject({ status: "FAILED", note: "Media too small" });

    // Fixed and queued again, it goes out afresh: not stuck as released, not failed again by the old post's state.
    await saveItem(two.id, { text: two.text, short: two.short, title: two.title, card: two.card as Card, at: two.at });
    await approveItems(plan.id, [two.id], "Hanna HQ", actor);
    expect(await scheduleApproved(plan.id, actor)).toMatchObject({ social: 1 });
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: two.id } })).toMatchObject({ status: "SCHEDULED", releasedAt: null, socialPostId: null });
    await syncStudio(new Date(two.at.getTime() + 20 * 60_000));
    expect(await releaseStudio(new Date(two.at.getTime() + 30 * 60_000))).toEqual({ released: 1, failed: 0 });
    expect((await db.studioItem.findUniqueOrThrow({ where: { id: two.id }, include: { socialPost: true } })).socialPost?.postizIds).toEqual(["p3"]);
  });
});
