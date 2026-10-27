// (Bundled by wrangler, outside tsc.) The Worker: OpenNext serves the app; Cron Triggers (wrangler.jsonc) call the scheduled jobs through their own routes,
// so a job runs exactly as the old host cron ran it (src/app/api/cron/[job]/route.ts, bearer CRON_SECRET).
import app from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const JOB_BY_CRON: Record<string, string> = {
  "*/15 * * * *": "frequent",
  "*/5 * * * *": "staff-push",
  "0 0 * * *": "daily", // 02:00 SAST
  "0 1 * * *": "operations", // 03:00 SAST
  "0 3 * * *": "morning", // 05:00 SAST
};

type Env = { CRON_SECRET?: string; APP_URL?: string };

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const job = JOB_BY_CRON[event.cron];
    if (!job) return;
    const url = `${env.APP_URL ?? "https://shop.herbalholland.com"}/api/cron/${job}`;
    const req = new Request(url, { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` } });
    const res = await app.fetch(req, env, ctx);
    if (!res.ok) console.error(`[cron] ${job}: ${res.status} ${await res.text()}`);
  },
};
