import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { completeQuestAction } from "./actions";
import { ProductArt } from "@/components/product/art";
import { Container } from "@/components/shop/ui";
import { JsonLd } from "@/components/shop/json-ld";
import { QuestQuiz } from "@/components/shop/quest-quiz";
import { ARTICLES, resolveArticle } from "@/components/shop/learn/articles";
import { ArticleBody } from "@/components/shop/learn/bodies";
import { fmtDate } from "@/lib/format";
import { publicQuest } from "@/lib/quests";
import { articleJsonLd, breadcrumbJsonLd, LOCALE, metaDescription, pageTitle, parseReviewer, SITE_NAME, siteUrl } from "@/lib/seo";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

/** The article for the URL. An alias slug is sent to the one canonical URL (308), so no guide exists at two addresses. */
function articleFor(slug: string) {
  const r = resolveArticle(slug);
  if (!r) notFound();
  if (r.alias) permanentRedirect(`/learn/${r.article.slug}`);
  return r.article;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = articleFor((await params).slug);
  const path = `/learn/${a.slug}`;
  return {
    title: pageTitle(a.title),
    description: metaDescription(a.dek, `A plain-English guide from ${SITE_NAME}. Adults 18+.`),
    alternates: { canonical: path },
    openGraph: { title: a.title, description: a.dek, type: "article", url: path, siteName: SITE_NAME, locale: LOCALE, publishedTime: a.published, modifiedTime: a.updated, authors: [SITE_NAME] },
  };
}

export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articleFor(slug);
  const [settings, customer] = await Promise.all([getSettings(), getCustomer()]);
  const quest = publicQuest(a.slug);
  const done = quest && customer ? !!(await db.questCompletion.findUnique({ where: { customerId_key: { customerId: customer.id, key: a.slug } } })) : false;
  const i = ARTICLES.indexOf(a);
  const next = ARTICLES[(i + 1) % ARTICLES.length];
  const more = ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 3);
  // Named reviewer (E-E-A-T) only when HQ has set one; shown on the page and in the schema, never invented.
  const reviewer = parseReviewer(process.env.CONTENT_REVIEWER);
  const base = siteUrl();
  const jsonLd = [
    articleJsonLd({ base, slug: a.slug, title: a.title, description: a.dek, published: a.published, updated: a.updated, reviewer }),
    breadcrumbJsonLd(base, [
      { name: "Learn", path: "/learn" },
      { name: a.title, path: `/learn/${a.slug}` },
    ]),
  ];

  return (
    <article>
      <JsonLd data={jsonLd} />
      <div className="relative overflow-hidden border-b border-ink-850">
        <ProductArt slug={a.art.slug} strain={a.art.strain} regClass={a.art.regClass} label="" className="absolute inset-0 h-full w-full opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/80 to-ink-950/30" />
        <Container className="relative pb-14 pt-10 sm:pb-20 sm:pt-16">
          <Link href="/learn" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Learn
          </Link>
          <div className="mt-8 max-w-3xl">
            <div className="eyebrow text-brand-500">{a.kicker}</div>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">{a.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-200">{a.dek}</p>
            <p className="mt-6 text-sm text-ink-400">
              {a.minutes} min read · By {SITE_NAME} · Published <time dateTime={a.published}>{fmtDate(a.published)}</time> · Updated <time dateTime={a.updated}>{fmtDate(a.updated)}</time>
            </p>
            {reviewer && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-300">
                <BadgeCheck className="h-4 w-4 text-leaf-500" aria-hidden />
                <span>
                  Reviewed by <span className="font-semibold text-white">{reviewer.name}</span>
                  {reviewer.jobTitle && `, ${reviewer.jobTitle}`}
                  {reviewer.credential && ` (${reviewer.credential})`}
                </span>
              </p>
            )}
          </div>
        </Container>
      </div>
      <Container>
        <div className="grid grid-cols-1 gap-12 py-8 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)] lg:gap-20">
          <div className="min-w-0">
            {/* The long article body hydrates later, in small slices, after the shell (see ProductGrid). */}
            <Suspense>
              <ArticleBody slug={a.slug} settings={settings} />
            </Suspense>
            {quest && (
              <QuestQuiz
                quest={quest}
                signedIn={!!customer}
                done={done}
                joinHref={`/club/join?next=${encodeURIComponent(`/learn/${a.slug}#quest-title`)}`}
                action={completeQuestAction.bind(null, a.slug)}
              />
            )}
            <Link href={`/learn/${next.slug}`} className="group mt-16 flex items-center justify-between gap-6 rounded-3xl border border-ink-800 bg-ink-900/60 p-6 transition hover:border-brand-500/60">
              <div>
                <div className="eyebrow text-ink-400">Next</div>
                <div className="mt-1 font-display text-xl font-semibold text-white group-hover:text-brand-100">{next.title}</div>
              </div>
              <ArrowRight className="h-6 w-6 shrink-0 text-brand-500 transition group-hover:translate-x-1" />
            </Link>
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-3 pt-14">
              <div className="eyebrow text-ink-400">More guides</div>
              {more.map((m) => (
                <Link key={m.slug} href={`/learn/${m.slug}`} className="group flex items-center gap-3 rounded-2xl border border-ink-800 p-3 transition hover:border-ink-600">
                  <ProductArt slug={m.art.slug} strain={m.art.strain} regClass={m.art.regClass} label="" className="h-14 w-14 shrink-0 rounded-xl" />
                  <span className="text-sm font-semibold leading-snug text-ink-100 group-hover:text-white">{m.title}</span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </Container>
    </article>
  );
}
