import { cn } from "@/lib/cn";

export type Tone = "neutral" | "orange" | "green" | "red" | "amber" | "blue" | "dark" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-600 ring-ink-200",
  orange: "bg-oranje-50 text-oranje-800 ring-oranje-200",
  green: "bg-leaf-50 text-leaf-700 ring-leaf-100",
  red: "bg-rose-50 text-rose-600 ring-rose-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  blue: "bg-sky-50 text-sky-700 ring-sky-50",
  violet: "bg-[#f1effb] text-[#4a3aa7] ring-[#e2dff6]",
  dark: "bg-ink-900 text-ink-100 ring-ink-800",
};
const DOTS: Record<Tone, string> = {
  neutral: "bg-ink-400", orange: "bg-oranje-500", green: "bg-leaf-500", red: "bg-rose-500", amber: "bg-amber-500", blue: "bg-sky-500", dark: "bg-oranje-500", violet: "bg-[#4a3aa7]",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}
