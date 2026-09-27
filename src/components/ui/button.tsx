import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "dark" | "outline" | "ghost" | "danger" | "outline-dark" | "ghost-dark";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
    {
      primary: "bg-brand-500 text-ink-950 hover:bg-brand-400 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]",
      dark: "bg-ink-900 text-white hover:bg-ink-800",
      outline: "border border-ink-200 bg-white text-ink-850 hover:border-ink-300 hover:bg-ink-50",
      ghost: "text-ink-700 hover:bg-ink-100",
      danger: "bg-rose-500 text-white hover:bg-rose-600",
      "outline-dark": "border border-ink-700 text-ink-100 hover:border-ink-500 hover:bg-ink-800",
      "ghost-dark": "text-ink-200 hover:bg-ink-800",
    }[variant],
    { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[0.95rem]", xl: "h-14 px-8 text-base", icon: "h-10 w-10" }[size],
    className,
  );
}

export function Button({ variant, size, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
