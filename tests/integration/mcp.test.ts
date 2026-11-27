// The Claude connector drafts campaigns and never sends them.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { POST } from "@/app/api/mcp/route";
import { buildWorld, resetDb } from "./world";

const TOKEN = "integration-token-0123456789";
let w: Awaited<ReturnType<typeof buildWorld>>;

async function call(name: string, args: Record<string, unknown>) {
  vi.stubEnv("CLAUDE_MCP_TOKEN", TOKEN);
  const res = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  const r = await res.json();
  return { isError: !!r.result.isError, text: r.result.content[0].text as string };
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

describe("claude connector", () => {
  it("drafts a launch notification as a DRAFT campaign and sends nothing", async () => {
    const product = await db.product.findFirstOrThrow();
    const r = await call("draft_launch_notification", {
      name: "Something new in store",
      message: `${product.name} has landed. Adults 18+.`,
      channel: "SMS",
      segment: "ALL",
      storeId: w.store.id,
      productSlug: product.slug,
    });
    expect(r.isError, r.text).toBe(false);
    const out = JSON.parse(r.text);
    expect(out.status).toBe("DRAFT");
    expect(out.reviewUrl).toContain(`/hq/marketing/${out.campaignId}`);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: out.campaignId } });
    expect(c.status).toBe("DRAFT");
    expect(c.message).toContain(`/p/${product.slug}`);
    expect(await db.messageLog.count({ where: { campaignId: c.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "campaign.create", entityId: c.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "mcp.tool" } })).toBeGreaterThanOrEqual(1);
  });

  it("refuses copy that fails the HQ composer rules", async () => {
    expect((await call("draft_launch_notification", { name: "x".repeat(41), message: "A message long enough", segment: "ALL" })).isError).toBe(true);
    expect((await call("draft_launch_notification", { name: "Launch", message: "A message long enough", segment: "NOPE" })).isError).toBe(true);
    expect((await call("draft_launch_notification", { name: "Launch", message: "Use {{code}} today", segment: "ALL" })).isError).toBe(true);
  });

  it("lists products and drops and previews an audience", async () => {
    const p = await call("list_products", { limit: 5 });
    expect(p.isError, p.text).toBe(false);
    expect(Array.isArray(JSON.parse(p.text))).toBe(true);
    const a = await call("preview_audience", { segment: "ALL", channel: "PUSH" });
    expect(JSON.parse(a.text)).toHaveProperty("total");
    expect((await call("list_drops", {})).isError).toBe(false);
  });
});
