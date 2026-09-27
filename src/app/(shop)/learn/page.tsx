import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ProductArt } from "@/components/product/art";
import { Container } from "@/components/shop/ui";
import { ARTICLES } from "@/components/shop/learn/articles";

export const metadata: Metadata = {
  title: "Learn",
  description: "Plain-English guides from Herbal Holland: heritage landraces, reading lab results, CBD and Schedule 0, Section 21 for patients, responsible use and how Rewards points work.",
  alternates: { canonical: "/learn" },
};

export default function LearnIndex() {
  const [lead, ...rest] = ARTICLES;
  return (
    <Container className="pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <div className="eyebrow text-oranje-500">Learn</div>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl">Know what you&apos;re buying.</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-300">Straight answers about where our products come from, what the lab found, and what the law says. No jargon, no hype.</p>
      </div>

      <Link href={`/learn/${lead.slug}`} className="group mt-12 grid grid-cols-1 overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900/60 transition hover:border-oranje-500/60 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ProductArt slug={lead.art.slug} strain={lead.art.strain} regClass={lead.art.regClass} label="" className="aspect-[16/10] h-full w-full lg:aspect-auto" />
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <div className="eyebrow text-oranje-500">{lead.kicker}</div>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-white group-hover:text-oranje-100 sm:text-4xl">{lead.title}</h2>
          <p className="mt-4 leading-relaxed text-ink-300">{lead.dek}</p>
          <p className="mt-8 flex items-center gap-2 text-sm font-semibold text-oranje-400">
            Read · {lead.minutes} min <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </p>
        </div>
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {rest.map((a) => (
          <Link key={a.slug} href={`/learn/${a.slug}`} className="group flex flex-col overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/60 transition hover:border-oranje-500/60">
            <ProductArt slug={a.art.slug} strain={a.art.strain} regClass={a.art.regClass} label="" className="aspect-[16/9] w-full" />
            <div className="flex flex-1 flex-col p-6">
              <div className="eyebrow text-oranje-500">{a.kicker}</div>
              <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-white group-hover:text-oranje-100">{a.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-400">{a.dek}</p>
              <p className="mt-5 text-xs font-medium text-ink-500">{a.minutes} min read</p>
            </div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
