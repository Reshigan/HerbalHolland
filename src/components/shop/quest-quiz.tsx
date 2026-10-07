"use client";
// Learn quest: a short quiz at the end of an article, one question at a time. Answers are checked on the server.
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Check, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import type { QuestResult } from "@/app/(shop)/learn/[slug]/actions";
import { buttonClass } from "@/components/ui/button";
import { POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { zarWhole } from "@/lib/money";
import { cn } from "@/lib/cn";

type Quest = { key: string; title: string; points: number; questions: { q: string; options: string[] }[] };
type Status = "asking" | "passed" | "failed";

export function QuestQuiz({ quest, signedIn, done, joinHref, action }: { quest: Quest; signedIn: boolean; done: boolean; joinHref: string; action: (answers: number[]) => Promise<QuestResult> }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>("asking");
  const [points, setPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) heading.current?.focus(); // after the first answer, keep keyboard/screen-reader focus with the quiz
  }, [step, status]);

  const total = quest.questions.length;
  const choose = (i: number) => {
    moved.current = true;
    const next = [...answers.slice(0, step), i];
    setAnswers(next);
    setError(null);
    if (step < total - 1) return setStep(step + 1);
    start(async () => {
      const r = await action(next);
      if (r.error) return setError(r.error);
      setPoints(r.points ?? 0);
      setStatus(r.passed ? "passed" : "failed");
    });
  };
  const restart = () => {
    moved.current = true;
    setAnswers([]);
    setStep(0);
    setStatus("asking");
  };

  const frame = (children: React.ReactNode) => (
    <section aria-labelledby="quest-title" className="mt-14 overflow-hidden rounded-3xl border border-brand-500/40 bg-gradient-to-br from-brand-500/[0.1] via-ink-900/80 to-ink-900/80 p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-400" />
        <span className="eyebrow text-brand-400">Learn quest · +{quest.points} points</span>
      </div>
      {children}
    </section>
  );

  if (status === "passed")
    return frame(
      <div role="status">
        <h2 id="quest-title" ref={heading} tabIndex={-1} className="mt-3 flex items-center gap-3 font-display text-3xl font-semibold text-white focus:outline-none">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-leaf-500" /> {points ? `+${points} points` : "Quest complete"}
        </h2>
        <p className="mt-2 text-ink-300">{points ? "All correct, nicely done. Your points are already on your Rewards card." : "All correct, and you've already earned the points for this one."}</p>
        <Link href="/club/points" className={buttonClass("outline-dark", "lg", "mt-5")}>
          See your points
        </Link>
      </div>,
    );
  if (done)
    return frame(
      <>
        <h2 id="quest-title" className="mt-3 flex items-center gap-2.5 font-display text-2xl font-semibold text-white">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-leaf-500" /> Quest complete
        </h2>
        <p className="mt-1.5 text-sm text-ink-300">You&apos;ve earned the {quest.points} points for “{quest.title}”. Try another guide for more.</p>
      </>,
    );
  if (!signedIn)
    return frame(
      <>
        <h2 id="quest-title" className="mt-3 font-display text-2xl font-semibold text-white">
          Quiz yourself on this guide
        </h2>
        <p className="mt-1.5 text-sm text-ink-300">
          {total} quick questions. Herbal Holland Rewards members earn {quest.points} points (worth {zarWhole(quest.points * POINT_VALUE_CENTS)}) for getting them all right (once per guide).
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={joinHref} className={buttonClass("primary", "lg")}>
            Join to earn {quest.points} points
          </Link>
          <Link href={joinHref} className={buttonClass("outline-dark", "lg")}>
            Sign in
          </Link>
        </div>
      </>,
    );
  if (status === "failed")
    return frame(
      <div role="status">
        <h2 id="quest-title" ref={heading} tabIndex={-1} className="mt-3 font-display text-2xl font-semibold text-white focus:outline-none">
          Not quite, try again
        </h2>
        <p className="mt-1.5 text-sm text-ink-300">At least one answer wasn&apos;t right. Have another look at the guide above, then give it another go.</p>
        <button type="button" onClick={restart} className={buttonClass("primary", "lg", "mt-5")}>
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
      </div>,
    );

  const q = quest.questions[step];
  return frame(
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="quest-title" className="font-display text-xl font-semibold text-white">
          Quick quiz: {quest.title}
        </h2>
        <span className="flex items-center gap-1.5" aria-hidden>
          {quest.questions.map((_, i) => (
            <span key={i} className={cn("h-1.5 w-6 rounded-full", i < step ? "bg-brand-500" : i === step ? "bg-brand-300" : "bg-ink-700")} />
          ))}
        </span>
      </div>
      <fieldset className="mt-5" disabled={pending}>
        <legend className="w-full">
          <span className="block text-xs font-semibold uppercase tracking-wider text-ink-400">
            Question {step + 1} of {total}
          </span>
          <span ref={heading} tabIndex={-1} className="mt-1.5 block text-lg font-semibold leading-snug text-white focus:outline-none">
            {q.q}
          </span>
        </legend>
        <div className="mt-4 grid gap-2">
          {q.options.map((o, i) => {
            const picked = pending && answers[step] === i;
            return (
              <button
                key={o}
                type="button"
                onClick={() => choose(i)}
                aria-pressed={answers[step] === i}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[0.95rem] font-medium transition",
                  picked ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 bg-ink-950/50 text-ink-100 hover:border-brand-500/70 hover:bg-ink-900",
                )}
              >
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold", picked ? "border-brand-500 bg-brand-500 text-ink-950" : "border-ink-600 text-ink-400")}>
                  {picked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : String.fromCharCode(65 + i)}
                </span>
                {o}
              </button>
            );
          })}
        </div>
      </fieldset>
      {(step > 0 || pending) && (
        <div className="mt-4 flex min-h-11 items-center justify-between gap-3 text-sm">
          {step > 0 && !pending ? (
            <button type="button" onClick={() => setStep(step - 1)} className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-full px-2 font-medium text-ink-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <span />
          )}
          {pending && <span className="text-ink-400" aria-live="polite">Checking your answers…</span>}
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}
    </>,
  );
}
