// Claude connector: a stateless MCP server (Streamable HTTP, JSON responses only) so Claude can look up products and
// drops and draft member notifications. POST JSON-RPC 2.0 with `Authorization: Bearer $CLAUDE_MCP_TOKEN`; unset secret
// = 404. Drafts only: a campaign is created in DRAFT and staff review and send it in HQ. Nothing here sends or schedules.
// Setup: docs/CLAUDE_CONNECTOR.md.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";
import { audit, type Actor } from "@/server/audit";
import { audienceSize } from "@/server/marketing";
import { APP_URL } from "@/server/invoices";
import { cardsWhere, type StockBadge } from "@/server/shop/catalogue";
import { REG_CLASSES, screenCopy } from "@/lib/compliance";
import { INTERESTS, SEGMENTS, isAudience } from "@/lib/rfm";
import { TIERS } from "@/lib/loyalty-rules";
import type { MsgChannel } from "@/generated/prisma/client";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const ACTOR: Actor = { type: "SYSTEM", name: "claude-mcp" };
const CHANNELS: MsgChannel[] = ["PUSH", "SMS", "EMAIL", "WHATSAPP"];
const AUDIENCES = ["ALL", ...Object.keys(SEGMENTS), ...TIERS.map((t) => `tier:${t.key}`), ...Object.keys(INTERESTS).map((k) => `interest:${k}`)].filter(isAudience);
// Same limits as the HQ composer (saveCampaign in src/app/hq/marketing/actions.ts).
const PUSH_TITLE_MAX = 40;
const PUSH_BODY_MAX = 140;
const SMS_MAX = 480;

class ToolError extends Error {}

const audienceProps = {
  segment: { type: "string", enum: AUDIENCES, description: "ALL, an RFM segment, tier:<TIER> or interest:<KEY>" },
  channel: { type: "string", enum: CHANNELS, default: "PUSH" },
  storeId: { type: "string", description: "Only members whose home store is this store id" },
};

const TOOLS = [
  {
    name: "list_products",
    description: "Active shop products with category, price from (ZAR, VAT incl.), stock state and URL.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } } },
  },
  {
    name: "list_drops",
    description: "Upcoming drops and those from the last 30 days, with start time, members-only flag, whether watchers were notified, and URL.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "preview_audience",
    description: "How many members are in an audience and how many can be reached on a channel (consent given).",
    inputSchema: { type: "object", properties: audienceProps, required: ["segment", "channel"] },
  },
  {
    name: "draft_launch_notification",
    description:
      "Create a DRAFT marketing campaign for staff to review and send in HQ. Never sends. Copy rules: adults 18+, no medical claims. " +
      `Push: name is the title (max ${PUSH_TITLE_MAX}), message max ${PUSH_BODY_MAX}. SMS max ${SMS_MAX}. A product or drop link is appended to SMS, email and WhatsApp messages. ` +
      "scheduledAt (ISO time) is only a suggested time prefilled for staff.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        message: { type: "string" },
        ...audienceProps,
        productSlug: { type: "string" },
        dropSlug: { type: "string" },
        scheduledAt: { type: "string", format: "date-time" },
      },
      required: ["name", "message", "segment"],
    },
  },
];

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const priceFrom = (cents: number) => `R${(cents / 100).toFixed(2)}`;
const stockState = (s: StockBadge) => (s.kind === "out" ? "out of stock" : s.kind === "made" ? "made to order" : "low" in s && s.low ? "low stock" : "in stock");

function audienceArgs(a: Record<string, unknown>) {
  const segment = str(a.segment);
  const channel = (str(a.channel) || "PUSH") as MsgChannel;
  if (!isAudience(segment)) throw new ToolError(`segment must be one of: ${AUDIENCES.join(", ")}`);
  if (!CHANNELS.includes(channel)) throw new ToolError(`channel must be one of: ${CHANNELS.join(", ")}`);
  return { segment, channel, storeId: str(a.storeId) || null };
}

async function callTool(name: string, a: Record<string, unknown>) {
  switch (name) {
    case "list_products": {
      const limit = Math.min(50, Math.max(1, Math.trunc(Number(a.limit) || 20)));
      const q = str(a.query).slice(0, 60);
      const cards = await cardsWhere(q ? { OR: [{ name: { contains: q } }, { tagline: { contains: q } }] } : {}, REG_CLASSES, { tier: null }, limit);
      return cards.map((c) => ({ name: c.name, slug: c.slug, category: c.category.name, priceFrom: priceFrom(c.priceCents), stock: stockState(c.stock), url: `${APP_URL()}/p/${c.slug}` }));
    }
    case "list_drops": {
      const drops = await db.drop.findMany({ where: { startsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { startsAt: "asc" }, take: 50 });
      return drops.map((d) => ({ name: d.name, slug: d.slug, startsAt: d.startsAt.toISOString(), membersOnly: d.membersOnly, notified: !!d.notifiedAt, url: `${APP_URL()}/drops/${d.slug}` }));
    }
    case "preview_audience": {
      const { segment, channel, storeId } = audienceArgs(a);
      return { segment, channel, storeId, ...(await audienceSize(segment, channel, storeId)) };
    }
    case "draft_launch_notification": {
      const { segment, channel, storeId } = audienceArgs(a);
      const name = str(a.name);
      let message = str(a.message);
      if (!name) throw new ToolError("name is required");
      if (channel === "PUSH" && name.length > PUSH_TITLE_MAX) throw new ToolError(`Push titles fit ${PUSH_TITLE_MAX} characters. Shorten the name.`);
      if (storeId && !(await db.store.findUnique({ where: { id: storeId }, select: { id: true } }))) throw new ToolError("storeId not found");
      let link: string | null = null;
      if (str(a.productSlug)) {
        if (!(await db.product.findUnique({ where: { slug: str(a.productSlug) }, select: { id: true } }))) throw new ToolError("productSlug not found");
        link = `${APP_URL()}/p/${str(a.productSlug)}`;
      } else if (str(a.dropSlug)) {
        if (!(await db.drop.findUnique({ where: { slug: str(a.dropSlug) }, select: { id: true } }))) throw new ToolError("dropSlug not found");
        link = `${APP_URL()}/drops/${str(a.dropSlug)}`;
      }
      if (link && channel !== "PUSH" && !message.includes(link)) message = `${message} ${link}`;
      if (message.includes("{{code}}")) throw new ToolError("Promo codes are not supported here. Attach a promotion to the draft in HQ.");
      if (message.length < 10) throw new ToolError("Write the message (10 characters or more)");
      if (channel === "SMS" && message.length > SMS_MAX) throw new ToolError(`Keep SMS to 3 parts (${SMS_MAX} characters) or fewer`);
      if (channel === "PUSH" && message.length > PUSH_BODY_MAX) throw new ToolError(`Push messages fit ${PUSH_BODY_MAX} characters. Say one thing.`);
      const flags = screenCopy(`${name} ${message}`);
      if (flags.length) throw new ToolError(`Copy needs changes: ${flags.map((f) => `"${f.term}": ${f.reason}`).join("; ")}`);
      let scheduledAt: Date | null = null;
      if (str(a.scheduledAt)) {
        scheduledAt = new Date(str(a.scheduledAt));
        if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000) throw new ToolError("scheduledAt must be a future ISO date-time");
      }
      // DRAFT only: runDueCampaigns sends SCHEDULED campaigns, so a draft's scheduledAt is just prefilled in the HQ composer.
      const c = await db.campaign.create({ data: { name, channel, segment, storeId, message, status: "DRAFT", scheduledAt } });
      await audit(db, ACTOR, "campaign.create", { storeId, entity: "Campaign", entityId: c.id, data: { name, channel, segment, via: "claude-mcp" } });
      return { campaignId: c.id, status: "DRAFT", message, reviewUrl: `${APP_URL()}/hq/marketing/${c.id}`, note: "Not sent. Staff review, then send or schedule it in HQ." };
    }
    default:
      throw new ToolError(`Unknown tool: ${name}`);
  }
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const error = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc) {
  const p = m.params ?? {};
  switch (m.method) {
    case "initialize": {
      const asked = str(p.protocolVersion);
      return reply(m.id, { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: "herbal-holland", version: "1.0.0" } });
    }
    case "ping":
      return reply(m.id, {});
    case "tools/list":
      return reply(m.id, { tools: TOOLS });
    case "tools/call": {
      const tool = str(p.name);
      const args = (p.arguments && typeof p.arguments === "object" ? p.arguments : {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === tool)) return error(m.id, -32602, `Unknown tool: ${tool}`);
      try {
        const out = await callTool(tool, args);
        await audit(db, ACTOR, "mcp.tool", { entity: "McpTool", entityId: tool, data: { ok: true } });
        return reply(m.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        await audit(db, ACTOR, "mcp.tool", { entity: "McpTool", entityId: tool, data: { ok: false, error: e.message } });
        return reply(m.id, { content: [{ type: "text", text: e.message }], isError: true });
      }
    }
    default:
      return error(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: Request) {
  const secret = process.env.CLAUDE_MCP_TOKEN;
  if (!secret) return new NextResponse(null, { status: 404 });
  const given = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(`Bearer ${secret}`))))
    return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  let m: Rpc;
  try {
    m = await req.json();
  } catch {
    return NextResponse.json(error(null, -32700, "Parse error"), { status: 400 });
  }
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.method !== "string") return NextResponse.json(error(null, -32600, "Invalid request"), { status: 400 });
  // A notification (no id) gets no answer.
  if (m.id === undefined || m.method.startsWith("notifications/")) return new NextResponse(null, { status: 202 });
  return NextResponse.json(await handle(m));
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
