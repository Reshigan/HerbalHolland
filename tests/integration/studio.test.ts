import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { announced, announceProducts, approveItems, createLaunch, createPlan, EARLY_ACCESS, LAUNCH_GAPS, markPosted, releaseStudio, saveItem, scheduleApproved, setHand, setPaused, StudioError, syncStudio, unschedule } from "@/server/studio";
import { earlyAccessCount, importEarlyAccess } from "@/server/early-access";
import { firstDayT, longDate, type Card } from "@/lib/studio";
import { NEW_ONLINE_DAYS, PLAYBOOKS } from "@/lib/studio-playbooks";
import { dayKey } from "@/lib/format";
import { marketingWindow } from "@/lib/sa";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const actor = { type: "USER" as const, id: "u1", name: "Hanna HQ" };
const inDays = (n: number) => dayKey(new Date(Date.now() + n * 86_400_000));
const after = (ymd: string, n: number) => dayKey(new Date(Date.parse(`${ymd}T10:00:00Z`) + n * 86_400_000));
const daysTo = (ymd: string) => Math.round((Date.parse(`${ymd}T10:00:00Z`) - Date.parse(`${inDays(0)}T10:00:00Z`)) / 86_400_000);
const dayT = (key: string, from: number) => firstDayT(PLAYBOOKS.find((p) => p.key === key)!, inDays(from));

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
    const plan = await createPlan({ playbook: "store-opening", anchor: dayT("store-opening", 45), storeId: w.store.id, by: "Hanna HQ", actor });
    const items = await db.studioItem.findMany({ where: { planId: plan.id } });
    expect(items).toHaveLength(PLAYBOOKS.find((p) => p.key === "store-opening")!.items.length);
    expect(items.every((i) => i.status === "DRAFT")).toBe(true);
    expect(JSON.stringify(items)).not.toMatch(/\{(store|towns|town|address|hours|date)\}/);
    expect(items.some((i) => i.text.includes("Test Store"))).toBe(true);
    expect(items.filter((i) => i.channel === "SOCIAL").every((i) => i.card)).toBe(true);
    expect(await db.auditLog.count({ where: { action: "studio.create", entityId: plan.id } })).toBe(1);
  });

  it("won't lay out a day that has passed, a store opening without its store, or a day T on the wrong weekday", async () => {
    await expect(createPlan({ playbook: "brand-launch", anchor: inDays(-1), storeId: null, by: "x", actor })).rejects.toBeInstanceOf(StudioError);
    const tuesday = dayT("store-opening", 10);
    await expect(createPlan({ playbook: "store-opening", anchor: tuesday, storeId: null, by: "x", actor })).rejects.toThrow(/store/);
    await expect(createPlan({ playbook: "store-opening", anchor: after(tuesday, 1), storeId: w.store.id, by: "x", actor })).rejects.toThrow(/starts on a Tuesday/);
  });

  it("lays the launch out in its order, with room between: brand, then shop, then the stores' doors", async () => {
    const brand = dayT("brand-launch", 5);
    const shop = dayT("shop-launch", daysTo(brand) + LAUNCH_GAPS.shop);
    const doors = dayT("store-opening", daysTo(shop) + LAUNCH_GAPS.doors);
    const launch = (p: { brand: string; shop: string; doors: string }, storeIds = [w.store.id]) => createLaunch({ ...p, storeIds, by: "Hanna HQ", actor });
    await expect(launch({ brand: shop, shop: brand, doors })).rejects.toThrow(/brand launches first/);
    await expect(launch({ brand, shop: after(brand, LAUNCH_GAPS.shop - 7), doors })).rejects.toThrow(/14 days/);
    await expect(launch({ brand, shop, doors: after(shop, LAUNCH_GAPS.doors - 7) })).rejects.toThrow(/33 days after the shop/);

    // Two stores open together: the shared posts go once, naming both towns; the second town's own posts come a week later.
    const hilton = await db.store.create({ data: { code: "TST02", slug: "tst02", name: "Hilton", companyId: w.owner.id, dcId: w.dc.id, addressLine: "2 Main Rd", suburb: "Hilton", city: "Hilton", province: "KZN", postalCode: "3245", regionId: w.region.id, status: "OPENING_SOON" } });
    const plans = await launch({ brand, shop, doors }, [w.store.id, hilton.id]);
    expect(plans.map((p) => [p.playbook, p.anchor, p.storeId])).toEqual([["brand-launch", brand, null], ["shop-launch", shop, null], ["store-opening", doors, hilton.id], ["store-opening", doors, w.store.id]]);
    const items = (planId: string) => db.studioItem.findMany({ where: { planId }, orderBy: { at: "asc" } });
    const pb = PLAYBOOKS.find((p) => p.key === "store-opening")!;
    const shared = new Set(pb.items.filter((i) => i.shared).map((i) => i.key));
    const pinned = new Set(pb.items.filter((i) => i.pinned).map((i) => i.key));
    const [first, second] = [await items(plans[2].id), await items(plans[3].id)];
    expect(shared.size).toBeGreaterThan(0);
    expect(first.filter((i) => shared.has(i.key)).every((i) => i.status === "DRAFT")).toBe(true);
    expect(first.filter((i) => shared.has(i.key) && pb.items.find((x) => x.key === i.key)!.text.includes("{towns}")).every((i) => i.text.includes("Hilton and Test Store"))).toBe(true);
    expect(second.filter((i) => shared.has(i.key)).every((i) => i.status === "SKIPPED" && i.note === "Left out: posted once for every store opening that day")).toBe(true);
    const own = second.filter((i) => i.channel === "SOCIAL" && !shared.has(i.key) && !pinned.has(i.key));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((i) => /each town gets its moment|^Moved from/.test(i.note ?? ""))).toBe(true);
    const at = new Map(first.map((i) => [i.key, i.at.getTime()]));
    expect(second.filter((i) => ["EMAIL", "SMS", "PUSH"].includes(i.channel) && !shared.has(i.key)).every((i) => i.at.getTime() === at.get(i.key))).toBe(true);
    await db.studioPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } });
    await db.store.delete({ where: { id: hilton.id } });
  });

  it("leaves out what falls after the next campaign begins, and spreads the feed across campaigns", async () => {
    const brand = dayT("brand-launch", 5);
    const until = after(brand, 7);
    const plan = await createPlan({ playbook: "brand-launch", anchor: brand, storeId: null, until, by: "Hanna HQ", actor });
    const items = await db.studioItem.findMany({ where: { planId: plan.id } });
    const late = items.filter((i) => dayKey(i.at) >= until);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((i) => i.status === "SKIPPED" && i.note === "Left out: the next campaign has begun by then")).toBe(true);
    // The same campaign again: its feed posts move off the days the first one takes, or say they share one.
    const taken = new Set(items.filter((i) => i.channel === "SOCIAL" && i.linkedin !== "only" && i.status !== "SKIPPED").map((i) => dayKey(i.at)));
    const again = await createPlan({ playbook: "brand-launch", anchor: brand, storeId: null, by: "Hanna HQ", actor });
    const pb = PLAYBOOKS.find((p) => p.key === "brand-launch")!;
    const feed = (await db.studioItem.findMany({ where: { planId: again.id, channel: "SOCIAL", OR: [{ linkedin: null }, { linkedin: "also" }], status: "DRAFT" } })).filter((i) => !pb.items.find((x) => x.key === i.key)?.pinned);
    expect(feed.some((i) => i.note === "Moved so the feed gets one post a day")).toBe(true);
    expect(feed.filter((i) => taken.has(dayKey(i.at))).every((i) => /Shares its day/.test(i.note ?? ""))).toBe(true);
    await db.studioPlan.deleteMany({ where: { id: { in: [plan.id, again.id] } } });
  });

  it("lays a product launch out for the product, to the members who chose its interest; never a licensed medicine", async () => {
    const tuesday = dayT("new-online", 10);
    await expect(createPlan({ playbook: "new-online", anchor: tuesday, storeId: null, productId: "test-haze", by: "x", actor })).rejects.toThrow(/Licensed medicines/);
    await expect(createPlan({ playbook: "new-online", anchor: tuesday, storeId: null, productId: "nope", by: "x", actor })).rejects.toThrow(/Choose the product/);
    const plan = await createPlan({ playbook: "new-online", anchor: tuesday, storeId: null, productId: "WEL-T-30", by: "Hanna HQ", actor });
    expect(plan.name).toMatch(/Calm Oil$/);
    const items = await db.studioItem.findMany({ where: { planId: plan.id } });
    expect(JSON.stringify(items)).not.toMatch(/\{(product|facts|category|link)\}/);
    expect(items.some((i) => i.text.includes("Calm Oil"))).toBe(true);
    expect(items.filter((i) => ["EMAIL", "PUSH"].includes(i.channel)).every((i) => i.audience === "interest:CBD")).toBe(true);
    await db.studioPlan.delete({ where: { id: plan.id } });
  });

  it("announces products as they go live: each on the first free product-launch Tuesday a week or more away, as drafts; never a licensed medicine, never twice", async () => {
    const [first, second] = NEW_ONLINE_DAYS;
    const now = new Date(Date.parse(`${first}T08:00:00Z`) - 8 * 86_400_000);
    const ids = [w.oilV.productId, w.coffeeV.productId, w.flowerV.productId];
    const r = await announceProducts({ productIds: ids, by: "Hanna HQ", actor }, now);
    expect(r).toEqual([{ product: "Calm Oil", day: first }, { product: "Test CBD Coffee", day: second }]); // by name, one a Tuesday; Test Haze passed over
    const plans = await db.studioPlan.findMany({ where: { productId: { in: ids } }, include: { items: true } });
    expect(plans.map((p) => `${p.productId}@${p.anchor}`).sort()).toEqual([`${w.oilV.productId}@${first}`, `${w.coffeeV.productId}@${second}`].sort());
    expect(plans.every((p) => p.playbook === "new-online" && p.items.length && p.items.every((i) => i.status === "DRAFT"))).toBe(true);
    expect(announced(r)).toBe(`“New online” laid out in the Studio for Calm Oil (${longDate(first)}), Test CBD Coffee (${longDate(second)}): approve them there.`);
    expect(await announceProducts({ productIds: ids, by: "Hanna HQ", actor }, now)).toEqual([]);
    // A launch with every post skipped frees its Tuesday.
    await db.studioItem.updateMany({ where: { plan: { productId: w.oilV.productId } }, data: { status: "SKIPPED" } });
    await db.studioPlan.deleteMany({ where: { productId: w.coffeeV.productId } });
    expect(await announceProducts({ productIds: [w.coffeeV.productId], by: "Hanna HQ", actor }, now)).toEqual([{ product: "Test CBD Coffee", day: first }]);
    // Under a week before the plan's last Tuesday, none is left: the notice says so.
    await db.studioPlan.deleteMany({ where: { productId: w.coffeeV.productId } });
    const late = await announceProducts({ productIds: [w.coffeeV.productId], by: "Hanna HQ", actor }, new Date(Date.parse(`${NEW_ONLINE_DAYS.at(-1)}T08:00:00Z`) - 6 * 86_400_000));
    expect(late).toEqual([{ product: "Test CBD Coffee", day: null }]);
    expect(announced(late)).toBe("No product-launch Tuesday is free in the content plan for Test CBD Coffee: lay its launch out in the Studio.");
    expect(announced(["A", "B", "C", "D"].map((product) => ({ product, day: null })))).toMatch(/for A, B and 2 more: lay their launches out/);
    await db.studioPlan.deleteMany({ where: { productId: { in: ids } } });
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
    expect(out.campaign).toMatchObject({ channel: first.channel, segment: first.audience ?? "ALL", storeId: first.audience ? null : w.store.id, message: first.text, status: "SENT" });
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

  it("sends a message with an audience to that audience across the network", async () => {
    const plan = await db.studioPlan.findFirstOrThrow({ where: { playbook: "store-opening" } });
    const next = await db.studioItem.findFirstOrThrow({ where: { planId: plan.id, status: "SCHEDULED", releasedAt: null }, orderBy: { at: "asc" } });
    await db.studioItem.update({ where: { id: next.id }, data: { audience: "interest:CBD" } });
    expect((await releaseStudio(new Date(next.at.getTime() + 60_000))).released).toBeGreaterThanOrEqual(1);
    const out = await db.studioItem.findUniqueOrThrow({ where: { id: next.id }, include: { campaign: true } });
    expect(out.campaign).toMatchObject({ segment: "interest:CBD", storeId: null });
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
      if (path === "/integrations") return Response.json([{ id: "ig", name: "herbalholland", identifier: "instagram" }, { id: "li", name: "Herbal Holland", identifier: "linkedin-page" }]);
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
    const plan = await createPlan({ playbook: "brand-launch", anchor: dayT("brand-launch", 3), storeId: null, by: "Hanna HQ", actor });
    const [byHand, ...social] = await db.studioItem.findMany({ where: { planId: plan.id, channel: "SOCIAL", status: "DRAFT", linkedin: null }, orderBy: { at: "asc" }, take: 3 });
    await db.studioItem.update({ where: { id: social[1].id }, data: { linkedin: "also" } });
    // The team makes this one with its own photo: it waits, approved, for them instead of going to Postiz.
    await setHand(byHand.id, true, actor);
    await approveItems(plan.id, [byHand.id, ...social.map((s) => s.id)], "Hanna HQ", actor);
    expect(await scheduleApproved(plan.id, actor)).toMatchObject({ social: 2 });
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: byHand.id } })).toMatchObject({ status: "APPROVED", hand: true });
    expect(uploads).toEqual([]); // queued: nothing sent to Postiz yet

    expect(await releaseStudio(new Date(social[0].at.getTime() + 60_000))).toEqual({ released: 1, failed: 0 });
    expect(await releaseStudio(new Date(social[1].at.getTime() + 60_000))).toEqual({ released: 1, failed: 0 });
    expect(uploads).toEqual(["image/jpeg", "image/jpeg"]);
    expect(modes).toEqual(["now", "now"]);
    const [one, two] = await db.studioItem.findMany({ where: { id: { in: social.map((s) => s.id) } }, include: { socialPost: true }, orderBy: { at: "asc" } });
    expect(one.socialPost?.postizIds).toEqual(["p1"]);
    // LinkedIn gets only the posts meant for it.
    expect([one.socialPost?.channels, two.socialPost?.channels]).toEqual([["Instagram · herbalholland"], ["Instagram · herbalholland", "LinkedIn · Herbal Holland"]]);

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

  it("tells the first-access list the shop is open, once each, then deletes them", async () => {
    // Pat is a member already (their mobile): the members' message tells them instead.
    const list = [{ first_name: "Ana", email: "ana@example.com" }, { first_name: "Sipho", mobile: "082 555 0101" }, { first_name: "Pat", mobile: "082 000 0001" }, { email: "gone@example.com" }, { email: "ANA@example.com" }];
    expect(await importEarlyAccess(JSON.stringify([{ results: list }]), actor)).toEqual({ added: 4, skipped: 0, duplicates: 1 });
    await db.suppression.create({ data: { value: "gone@example.com", channel: "EMAIL", source: "STOP_REPLY" } });
    const plan = await createPlan({ playbook: "shop-launch", anchor: dayT("shop-launch", 120), storeId: null, by: "Hanna HQ", actor });
    const msgs = await db.studioItem.findMany({ where: { planId: plan.id, audience: EARLY_ACCESS }, orderBy: { at: "asc" } });
    expect(msgs.map((m) => m.channel).sort()).toEqual(["EMAIL", "SMS"]);
    await approveItems(plan.id, msgs.map((m) => m.id), "Hanna HQ", actor);
    await scheduleApproved(plan.id, actor);
    for (const m of msgs) expect((await releaseStudio(new Date(m.at.getTime() + 60_000))).released).toBeGreaterThanOrEqual(1);
    const [email, sms] = ["EMAIL", "SMS"].map((ch) => msgs.find((m) => m.channel === ch)!.id);
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: email } })).toMatchObject({ status: "POSTED", note: "Sent to 1 (1 on the do-not-contact list); their sign-ups are deleted" });
    expect(await db.studioItem.findUniqueOrThrow({ where: { id: sms } })).toMatchObject({ status: "POSTED", note: "Sent to 1 (1 already members); their sign-ups are deleted" });
    expect(await earlyAccessCount()).toBe(0);
    const logged = await db.messageLog.findMany({ where: { to: { in: ["ana@example.com", "+27825550101", "gone@example.com", "+27820000001"] }, campaignId: null }, select: { to: true, body: true } });
    expect(logged.map((l) => l.to).sort()).toEqual(["+27825550101", "ana@example.com"]);
    expect(logged.find((l) => l.to === "ana@example.com")?.body).toMatch(/Hi Ana,/);
  });
});
