// "What the checks watch": every rule in plain words with today's thresholds.
import { cn } from "@/lib/cn";
import { RULES } from "@/server/loss";
import { RULE_GROUPS, explainRule, type Thresholds } from "./rules";

export function WatchList({ settings, columns = 2, className }: { settings: Thresholds; columns?: 1 | 2; className?: string }) {
  return (
    <div className={cn("grid gap-x-8 gap-y-5 text-left", columns === 2 && "md:grid-cols-2", className)}>
      {RULE_GROUPS.map((g) => (
        <section key={g.title} className="min-w-0">
          <h3 className="eyebrow mb-2 text-brand-700">{g.title}</h3>
          <ul className="space-y-2.5">
            {g.rules.map((r) => (
              <li key={r} className="border-l-2 border-ink-150 pl-3 text-sm">
                <span className="font-medium text-ink-900">{RULES[r]}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">{explainRule(r, settings)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
