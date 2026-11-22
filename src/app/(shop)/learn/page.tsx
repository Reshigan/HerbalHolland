import Link from "next/link";
import { Reveal } from "@/components/shop/motion";
import type { Metadata } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import { Container } from "@/components/shop/ui";
import { liveArticles } from "@/components/shop/learn/articles";
import { ArticlePicture as Picture } from "@/components/shop/learn/picture";
import { Tag } from "@/components/shop/ui";
import { publicQuest } from "@/lib/quests";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Learn: plain-English guides",
  description:
    "Plain-English guides from Herbal Holland: heritage landraces, reading lab results, CBD and Schedule 0, Section 21 for patients, responsible use and Rewards points.",
  alternates: { canonical: "/learn" },
  openGraph: {
    title: "Learn · Herbal Holland",
    description:
      "Straight answers about where our products come from, what the lab found, and what the law says.",
    url: "/learn",
    type: "website",
    images: [{ url: "/catalogue/products/heritage-seed-pack.webp", width: 900, height: 900 }],
  },
};

// A new article goes live each Monday, so the list is read per request.
export const dynamic = "force-dynamic";

export default async function LearnIndex({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const all = liveArticles();
  const topics = [...new Set(all.map((a) => a.kicker))];
  const { topic: t } = await searchParams;
  const topic = t && topics.includes(t) ? t : undefined;
  const list = topic ? all.filter((a) => a.kicker === topic) : all;
  const [lead, ...rest] = list;

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="eyebrow text-brand-500">Learn</div>
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Know what you&apos;re buying.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-300">
            Straight answers about where our products come from, what the lab
            found, and what the law says. No jargon, no hype.
          </p>
        </div>
        <p className="text-sm text-ink-450">
          {all.length} guides · a new one every Monday
        </p>
      </div>

      <nav aria-label="Topics" className="-mx-4 mt-10 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <TopicChip href="/learn" on={!topic}>All</TopicChip>
        {topics.map((k) => (
          <TopicChip key={k} href={`/learn?topic=${encodeURIComponent(k)}`} on={topic === k}>
            {k}
          </TopicChip>
        ))}
      </nav>

      <Link
        href={`/learn/${lead.slug}`}
        className="hh-press group mt-8 grid grid-cols-1 overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900/60 transition hover:border-brand-500/60 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
      >
        <Picture a={lead} eager className="aspect-[16/10] lg:aspect-auto lg:min-h-[26rem]" />
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <div className="eyebrow text-brand-500">{topic ? lead.kicker : `Latest · ${lead.kicker}`}</div>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-white group-hover:text-brand-100 sm:text-4xl">
            {lead.title}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-300">{lead.dek}</p>
          <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-brand-400">
            <span className="flex items-center gap-2">
              Read · {lead.minutes} min{" "}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
            <QuestTag slug={lead.slug} />
          </p>
        </div>
      </Link>

      {rest.length > 0 && (
        <Reveal stagger className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((a) => (
            <Link
              key={a.slug}
              href={`/learn/${a.slug}`}
              className="hh-lift hh-press group flex flex-col overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/60 hover:border-brand-500/60"
            >
              <Picture a={a} className="aspect-[4/3]" />
              <div className="flex flex-1 flex-col p-6">
                <div className="eyebrow text-brand-500">{a.kicker}</div>
                <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-white group-hover:text-brand-100">
                  {a.title}
                </h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-400">
                  {a.dek}
                </p>
                <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-ink-450">
                  {a.minutes} min read <QuestTag slug={a.slug} />
                </p>
              </div>
            </Link>
          ))}
        </Reveal>
      )}
    </Container>
  );
}

function TopicChip({ href, on, children }: { href: string; on: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition",
        on ? "border-brand-500 bg-brand-500 text-ink-950" : "border-ink-800 text-ink-300 hover:border-ink-600 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

/** Guides with a Learn quest: members earn points for passing the quiz at the end. */
function QuestTag({ slug }: { slug: string }) {
  const q = publicQuest(slug);
  return q ? (
    <Tag tone="orange" icon={<Sparkles className="h-3 w-3" />}>
      Quiz · +{q.points} pts
    </Tag>
  ) : null;
}
