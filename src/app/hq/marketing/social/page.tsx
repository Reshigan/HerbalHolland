import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { socialChannels, socialConnected, type PostResult } from "@/server/social";
import { fmtDateTime } from "@/lib/format";
import { SOCIAL_NETWORKS, type SocialChannel } from "@/lib/social";
import { Notice, PageHeader } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ViewOnly } from "@/components/hq/ui";
import { MarketingTabs } from "../tabs";
import { SocialComposer } from "./composer";
import { postSocial } from "./actions";
import { asList } from "@/lib/json-list";

export const metadata = { title: "Social" };

/** What became of a post: recorded only (no network connected), scheduled, posted, or refused by a network. */
function stateOf(p: { mode: string; postedAt: Date | null; results: unknown }): [string, "green" | "blue" | "amber" | "red" | "neutral"] {
  const results = asList<PostResult>(p.results);
  if (results.some((r) => r.error)) return [results.every((r) => r.error) ? "Failed" : "Partly posted", "red"];
  if (results.length) return ["Posted", "green"];
  if (p.mode === "schedule" && !p.postedAt) return ["Scheduled", "blue"];
  if (p.mode === "schedule") return ["Unconfirmed: check the networks", "amber"]; // claimed by the scheduler, which stopped before it could record how it went
  return ["Recorded only", "amber"];
}

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
        description="Post to the brand's Instagram, Facebook, Threads, Bluesky and Telegram, straight from here. The platforms remove posts that sell cannabis or CBD, so social is for the brand: merch, stores, events and Learn."
      />
      <MarketingTabs current="social" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          {!socialConnected() ? (
            <Notice title="No social network is connected">Posts are recorded here only. Connect Instagram, Facebook, Threads, Bluesky or Telegram with their secrets. See docs/INTEGRATIONS.md.</Notice>
          ) : (
            problem && <Notice tone="danger" title="Couldn't load your channels">{problem}</Notice>
          )}
          {can(user, "network") ? <SocialComposer action={postSocial} channels={channels} /> : <ViewOnly>Social posts are made by HQ marketing.</ViewOnly>}
        </div>
        <Card className="self-start xl:col-span-2">
          <CardHeader title="Posts" description="Everything sent from here. A scheduled post goes out at its time; take one down on the network itself." />
          <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
            {posts.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-500">Nothing posted yet.</li>}
            {posts.map((p) => {
              const [label, tone] = stateOf(p);
              const results = asList<PostResult>(p.results);
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
                      {asList<string>(p.channels).length > 0 && <span>· {asList<string>(p.channels).map((c) => SOCIAL_NETWORKS[c]?.label ?? c).join(", ")}</span>}
                      {results.filter((r) => r.link).map((r) => (
                        <a key={r.network} href={r.link} target="_blank" rel="noreferrer" className="text-brand-700 underline-offset-2 hover:underline">
                          {SOCIAL_NETWORKS[r.network]?.label ?? r.network} ↗
                        </a>
                      ))}
                      {results.filter((r) => r.error).map((r) => (
                        <span key={r.network} className="text-red-700">{SOCIAL_NETWORKS[r.network]?.label ?? r.network}: {r.error}</span>
                      ))}
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
