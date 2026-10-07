// A policy from @/lib/policies on the dark legal page: headings, paragraphs, lists, Important boxes (CPA s49), and any
// line counsel must confirm, marked with the question until HQ records counsel's sign-off (settings.legal.reviewed).
import Link from "next/link";
import { Scale } from "lucide-react";
import { H2, P } from "@/components/shop/learn/bodies";
import { Tag } from "@/components/shop/ui";
import { Important, List } from "./membership-terms";
import type { PolicyBlock, PolicyLine } from "@/lib/policies";

/** Text with [label](href) links: pages in the app, mailto: for email. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\]\([^)\s]+\))/).map((part, i) => {
        const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (!m) return part;
        const cls = "text-brand-400 underline hover:text-brand-300";
        return m[2].startsWith("/") ? <Link key={i} href={m[2]} className={cls}>{m[1]}</Link> : <a key={i} href={m[2]} className={cls}>{m[1]}</a>;
      })}
    </>
  );
}

function Line({ line, counsel }: { line: PolicyLine; counsel: boolean }) {
  if (typeof line === "string") return <Rich text={line} />;
  if (!counsel) return <Rich text={line.text} />;
  return (
    <span className="block rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3">
      <Tag tone="amber" icon={<Scale className="h-3 w-3" aria-hidden />}>For counsel</Tag>
      <span className="mt-2 block text-ink-100">
        <Rich text={line.text} />
      </span>
      <span className="mt-1.5 block text-sm leading-relaxed text-amber-100/90">{line.counsel}</span>
    </span>
  );
}

/** `counsel`: show the lines counsel must confirm with their question (until the legal texts are signed off). */
export function PolicyBody({ blocks, counsel }: { blocks: PolicyBlock[]; counsel: boolean }) {
  return (
    <>
      {blocks.map((b, i) =>
        "h" in b ? (
          <H2 key={i}>{b.h}</H2>
        ) : "p" in b ? (
          <P key={i}>
            <Rich text={b.p} />
          </P>
        ) : "important" in b ? (
          <Important key={i}>
            {b.important.map((t, j) => (
              <p key={j}>
                <Rich text={t} />
              </p>
            ))}
          </Important>
        ) : (
          <List key={i} items={b.list.map((l, j) => <Line key={j} line={l} counsel={counsel} />)} />
        ),
      )}
    </>
  );
}
