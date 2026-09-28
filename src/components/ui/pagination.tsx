import Link from "next/link";
import { cn } from "@/lib/cn";

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <div className="px-5 py-3 text-xs text-ink-500">{total.toLocaleString()} {total === 1 ? "result" : "results"}</div>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-lg px-3 py-1.5 text-ink-300">{label}</span>
    ) : (
      <Link href={href(p)} className="rounded-lg px-3 py-1.5 font-medium text-ink-700 hover:bg-ink-100">
        {label}
      </Link>
    );
  return (
    <div className={cn("flex items-center justify-between px-5 py-3 text-xs text-ink-500")}>
      <span className="tnum">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        {btn(page - 1, "← Previous", page <= 1)}
        <span className="tnum px-2">
          {page} / {pages}
        </span>
        {btn(page + 1, "Next →", page >= pages)}
      </div>
    </div>
  );
}

/** Parses ?page= safely. */
export const pageParam = (v: string | string[] | undefined) => Math.max(1, Math.min(10_000, Number(Array.isArray(v) ? v[0] : v) || 1));
