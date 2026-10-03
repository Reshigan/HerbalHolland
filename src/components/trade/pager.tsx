// Dark pagination for the portal's lists (the shop's Pager greys its disabled links below AA contrast on ink-950).
import Link from "next/link";

export function TradePager({ page, pageSize, total, href, noun = "results" }: { page: number; pageSize: number; total: number; href: (page: number) => string; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return total ? <p className="py-4 text-center text-xs text-ink-400">{total.toLocaleString()} {noun}</p> : null;
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-full px-4 py-2 text-ink-450" aria-disabled="true">
        {label}
      </span>
    ) : (
      <Link href={href(p)} scroll={false} className="rounded-full border border-ink-700 px-4 py-2 font-medium text-ink-100 transition hover:border-brand-500 hover:text-brand-300">
        {label}
      </Link>
    );
  return (
    <nav className="flex items-center justify-between gap-3 py-4 text-sm" aria-label="Pagination">
      {link(page - 1, "← Previous", page <= 1)}
      <span className="tnum text-xs text-ink-400">
        Page {page} of {pages} · {total.toLocaleString()} {noun}
      </span>
      {link(page + 1, "Next →", page >= pages)}
    </nav>
  );
}
