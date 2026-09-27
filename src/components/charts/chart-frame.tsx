"use client";
// Hover layer for server-rendered charts: any element carrying data-tip gets a tooltip.
// Line 1 of the tip is the heading; following lines are "label: value".
import { useRef, useState } from "react";

export function ChartFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  return (
    <div
      ref={ref}
      className={`relative ${className ?? ""}`}
      onPointerMove={(e) => {
        const el = (e.target as Element).closest?.("[data-tip]");
        const box = ref.current?.getBoundingClientRect();
        if (!el || !box) return setTip(null);
        setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines: (el.getAttribute("data-tip") ?? "").split("\n") });
      }}
      onPointerLeave={() => setTip(null)}
    >
      {children}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 min-w-32 rounded-xl bg-ink-900/95 px-3 py-2 text-xs text-white shadow-lift backdrop-blur"
          style={{ left: tip.x, top: tip.y, transform: `translate(${tip.x > (ref.current?.clientWidth ?? 0) - 160 ? "calc(-100% - 12px)" : "12px"}, -50%)` }}
          role="tooltip"
        >
          <div className="font-semibold">{tip.lines[0]}</div>
          {tip.lines.slice(1).map((l, i) => (
            <div key={i} className="tnum mt-0.5 text-ink-200">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-600 ${className ?? ""}`}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
