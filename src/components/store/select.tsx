// Native select with a visible chevron and a sizing wrapper. (The shared ui/form Select
// draws its arrow with an arbitrary background-image utility Tailwind doesn't emit.)
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string };

export function Select({ className, wrapperClassName, children, ...props }: SelectProps) {
  return (
    <span className={cn("relative block", wrapperClassName)}>
      <select
        className={cn(
          "h-10 w-full cursor-pointer appearance-none truncate rounded-xl border border-ink-200 bg-white pl-3.5 pr-9 text-sm text-ink-900 shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15 disabled:cursor-default disabled:bg-ink-50 disabled:text-ink-400",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden strokeWidth={2.2} />
    </span>
  );
}
