// The Claude connector's protocol layer and auth (src/app/api/mcp/route.ts). Tool calls that touch the database are in
// tests/integration/mcp.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcp/route";

const TOKEN = "test-token-0123456789abcdef";
const rpc = (body: unknown, auth = `Bearer ${TOKEN}`) =>
  POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("mcp endpoint", () => {
  beforeEach(() => vi.stubEnv("CLAUDE_MCP_TOKEN", TOKEN));
  afterEach(() => vi.unstubAllEnvs());

  it("is not there while the secret is unset", async () => {
    vi.stubEnv("CLAUDE_MCP_TOKEN", "");
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(404);
  });

  it("refuses a wrong or missing token", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "Bearer nope")).status).toBe(401);
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "")).status).toBe(401);
  });

  it("initializes, echoing a supported protocol version", async () => {
    const r = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).json();
    expect(r).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "herbal-holland" } } });
    const latest = await (await rpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).json();
    expect(latest.result.protocolVersion).toBe("2025-06-18");
  });

  it("accepts the initialized notification with an empty 202", async () => {
    const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("lists the four tools and none that send", async () => {
    const r = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).json();
    const names = r.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(["list_products", "list_drops", "preview_audience", "draft_launch_notification"]);
    expect(names.some((n: string) => /send|schedule/.test(n))).toBe(false);
  });

  it("answers ping, unknown methods and bad JSON", async () => {
    expect(await (await rpc({ jsonrpc: "2.0", id: 4, method: "ping" })).json()).toEqual({ jsonrpc: "2.0", id: 4, result: {} });
    const unknown = await (await rpc({ jsonrpc: "2.0", id: 5, method: "resources/list" })).json();
    expect(unknown.error.code).toBe(-32601);
    const bad = await POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
  });

  it("refuses GET", () => {
    expect(GET().status).toBe(405);
  });
});
