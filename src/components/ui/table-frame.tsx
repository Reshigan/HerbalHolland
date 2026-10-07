"use client";
// The scrolling frame around an admin table. Measures whether the table overflows (then it scrolls sideways and the
// first column can pin), remembers when it has been scrolled (for the pinned column's shadow) and turns rows that
// carry data-href into links: a click anywhere on the row (not on a control, not while selecting text) opens it.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function TableFrame({ className, density, stickyFirst, children }: { className?: string; density: "compact" | "comfortable"; stickyFirst?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const table = el.querySelector("table");
    if (!table) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const over = table.offsetWidth > el.clientWidth + 1;
        if (over) el.setAttribute("data-overflow", "");
        else el.removeAttribute("data-overflow");
      });
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    ro?.observe(table);
    const onScroll = () => (el.scrollLeft > 0 ? el.setAttribute("data-scrolled", "") : el.removeAttribute("data-scrolled"));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`hh-table relative ${className ?? ""}`}
      data-overflow=""
      data-density={density}
      data-sticky-first={stickyFirst ? "" : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const t = e.target as HTMLElement;
        if (t.closest("a, button, input, select, textarea, label, summary, details, [role=button], [data-no-row-link]")) return;
        if (window.getSelection()?.toString()) return;
        const row = t.closest<HTMLElement>("tr[data-href]");
        const href = row?.dataset.href;
        if (!href || !e.currentTarget.contains(row)) return;
        window.dispatchEvent(new Event("hh:navigate")); // the shell's progress bar
        router.push(href);
      }}
    >
      {children}
    </div>
  );
}
