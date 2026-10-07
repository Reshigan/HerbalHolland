import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { postizConnected, socialChannels } from "@/server/social";
import { fmtDateTime } from "@/lib/format";
import type { SocialChannel } from "@/lib/social";
import { Notice, PageHeader } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ViewOnly } from "@/components/hq/ui";
import { MarketingTabs } from "../tabs";
import { SocialComposer } from "./composer";
import { postSocial } from "./actions";

export const metadata = { title: "Social" };

const MODE = { now: ["Posted", "green"], schedule: ["Scheduled", "blue"], draft: ["Draft in Postiz", "neutral"] } as const;

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireStaff(HQ_ROLES);
  const page = pageParam((await searchParams).page);
  let channels: SocialChannel[] = [];
  let problem = "";
  try {
    channels = await socialChannels();
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  const [total, posts] = await Promise.all([db.socialPost.count(), db.socialPost.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * 10, take: 10 })]);

  return (
    <>
      <PageHeader
        overline="Members"
        title="Social"
        description="Post to the brand's Instagram, Facebook, LinkedIn, X and Threads through Postiz. The platforms remove posts that sell cannabis or CBD, so social is for the brand: merch, stores, events and Learn."
      />
      <MarketingTabs current="social" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          {!postizConnected() ? (
            <Notice title="Postiz isn't connected">Posts are recorded here only. Connect Postiz (free, self-hosted) with POSTIZ_URL and POSTIZ_API_KEY. See docs/INTEGRATIONS.md.</Notice>
          ) : problem ? (
            <Notice tone="danger" title="Couldn't load your channels">{problem}</Notice>
          ) : (
            !channels.length && <Notice tone="warn" title="No channels connected">Connect Instagram, Facebook, LinkedIn, X or Threads in Postiz, then refresh.</Notice>
          )}
          {can(user, "network") ? <SocialComposer action={postSocial} channels={channels} /> : <ViewOnly>Social posts are made by HQ marketing.</ViewOnly>}
        </div>
        <Card className="self-start xl:col-span-2">
          <CardHeader title="Posts" description="Everything sent from here. Edit or delete a scheduled post in Postiz." />
          <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
            {posts.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-500">Nothing posted yet.</li>}
            {posts.map((p) => {
              const [label, tone] = p.postizIds.length ? (MODE[p.mode as keyof typeof MODE] ?? MODE.now) : (["Recorded only", "amber"] as const);
              return (
                <li key={p.id} className="flex gap-3 px-5 py-4">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/social/${p.image}.jpg`} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink-800">{p.content}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                      <Badge tone={tone}>{label}</Badge>
                      <span className="tnum">{fmtDateTime(p.scheduledAt ?? p.createdAt)}</span>
                      {p.channels.length > 0 && <span>· {p.channels.join(", ")}</span>}
                      {p.createdBy && <span>· {p.createdBy}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={10} total={total} href={(n) => `/hq/marketing/social?page=${n}`} />
        </Card>
      </div>
    </>
  );
}
