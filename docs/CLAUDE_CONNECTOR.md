# Claude connector (MCP)

`/api/mcp` is a small MCP server (Streamable HTTP, JSON responses, no sessions) that lets Claude look up products and
drops and draft member notifications, such as a new product launch. Claude can only draft: every notification it
writes is saved as a DRAFT campaign, and staff review, send or schedule it in HQ (`/hq/marketing/{id}`), where the
POPIA consent and CPA send-window rules apply as usual. Every tool call is written to the audit log as `claude-mcp`.

## Turn it on

Create a token and store it as a Worker secret. Keep the value somewhere safe (a password manager); you need it again
when you connect Claude.

```bash
openssl rand -hex 32
npx wrangler secret put CLAUDE_MCP_TOKEN      # paste the value from above
```

While `CLAUDE_MCP_TOKEN` is unset the endpoint answers 404. A wrong or missing token gets 401. To revoke access, put a
new value (or delete the secret with `npx wrangler secret delete CLAUDE_MCP_TOKEN`).

## Connect Claude Code

```bash
export CLAUDE_MCP_TOKEN=<the token>
claude mcp add --transport http herbal-holland https://shop.herbalholland.com/api/mcp \
  --header "Authorization: Bearer $CLAUDE_MCP_TOKEN"
```

Then ask, for example: "Draft a push to all members announcing the new grinder, linked to its product page."

## Connect Claude Desktop

Claude Desktop talks to remote servers with a token through `mcp-remote`. Add this to
`claude_desktop_config.json` (Settings, Developer, Edit config) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "herbal-holland": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://shop.herbalholland.com/api/mcp",
        "--header", "Authorization:${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer <the token>" }
    }
  }
}
```

(The header is passed through `env` with no space after the colon because some clients split arguments on spaces.)

## claude.ai on the web

Custom connectors on claude.ai sign in with OAuth. This endpoint only takes a bearer token, so it does not work as a
claude.ai web connector yet; use Claude Code or Claude Desktop.

## Tools

| Tool | What it does |
|---|---|
| `list_products` | Active shop products: name, slug, category, price from, stock state, URL. Optional `query` and `limit` (default 20, max 50). |
| `list_drops` | Upcoming drops and those from the last 30 days: name, slug, start time, members-only, whether watchers were notified, URL. |
| `preview_audience` | `segment` + `channel` (+ optional `storeId`): how many members are in the audience and how many can be reached (consent given). |
| `draft_launch_notification` | Creates a DRAFT campaign: `name`, `message`, `segment`, `channel` (default PUSH), optional `storeId`, `productSlug` or `dropSlug`, `scheduledAt`. Never sends. |

Segments: `ALL`, the RFM segments (`CHAMPION`, `LOYAL`, `PROMISING`, `NEW`, `AT_RISK`, `LAPSED`, `PROSPECT`),
`tier:SEED|SPROUT|BLOOM|HARVEST`, and `interest:CBD|ACCESSORY|APPAREL|GROW|EVENTS`. Channels: `PUSH`, `SMS`, `EMAIL`,
`WHATSAPP`.

Drafts follow the same rules as the HQ composer: a push title (the name) fits 40 characters and its body 140, SMS fits
480, the message is at least 10 characters, and the copy passes `screenCopy` (adults 18+, no medical claims). A product
or drop link is added to SMS, email and WhatsApp messages. `scheduledAt` is only a suggestion: HQ prefills it, and the
campaign is not scheduled until someone schedules it. Promo codes (`{{code}}`) are not supported from Claude; attach a
promotion in HQ.

There is deliberately no tool that sends or schedules.
