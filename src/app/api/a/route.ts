// First-party analytics beacon (@/components/shop/analytics-beacon): one page view or install per POST, written as a
// PageView row (rules in @/lib/analytics). Always answers 204, whatever it was sent: a beacon has nobody to tell, and
// a bad body, a bot or another site's request is simply not counted.
import { readJson } from "@/lib/body";
import { isBot, parseBeacon } from "@/lib/analytics";
import { sameOrigin } from "@/lib/same-origin";
import { db } from "@/server/db";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (isBot(ua) || !sameOrigin(req.headers, req.url)) return done();
    const own = [req.headers.get("host"), new URL(req.url).host, URL.canParse(process.env.APP_URL ?? "") ? new URL(process.env.APP_URL!).host : null].filter((h): h is string => !!h);
    const row = parseBeacon(await readJson(req, 2_000), { ua, ownHosts: own });
    if (row) await db.pageView.create({ data: row, select: { id: true } });
  } catch (e) {
    console.error("analytics beacon", e);
  }
  return done();
}
