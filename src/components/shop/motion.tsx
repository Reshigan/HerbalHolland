"use client";
// Small motion helpers for the storefront (the CSS is the "Motion" section of globals.css). Everything is server-
// rendered in its final state: these only add the attributes that let the stylesheet move things, and only where
// html.motion (the head snippet) says the device can carry it.
import { useEffect, useRef, useState, type ElementType } from "react";
import { cn } from "@/lib/cn";

const canMove = () => typeof document !== "undefined" && document.documentElement.classList.contains("motion");

/**
 * Rises in as it scrolls into view (once). `stagger`: the children rise one after the other instead. Without
 * JavaScript or html.motion the content is simply visible.
 */
export function Reveal({ as: Tag = "div", stagger = false, className, children, ...rest }: { as?: ElementType; stagger?: boolean; className?: string; children?: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.hasAttribute("data-in")) return;
    if (!canMove() || typeof IntersectionObserver === "undefined") return el.setAttribute("data-in", "");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.setAttribute("data-in", "");
        io.disconnect();
      },
      { threshold: 0.15, rootMargin: "-10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={cn("hh-reveal", stagger && "hh-stagger", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Drifts the hero's sky by up to 40px as the page scrolls (one passive listener, one frame at a time): targets `[data-drift]` inside its parent. */
export function Drift() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const layer = ref.current?.parentElement?.querySelector<HTMLElement>("[data-drift]");
    if (!layer || !canMove()) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      layer.style.transform = `translateY(${Math.min(40, window.scrollY * 0.12).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    addEventListener("scroll", onScroll, { passive: true });
    draw();
    return () => {
      removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      layer.style.transform = "";
    };
  }, []);
  return <span ref={ref} hidden />;
}

/**
 * A number that counts up to `value` over 700 ms (from `from`, 0 by default, on arrival, from the last value when it
 * changes), grouped like `num` (@/lib/format). The server renders the final value; with reduced motion or without
 * html.motion it stays. `from` equal to `value` means no count.
 */
export function CountUp({ value, from: start0 = 0, className }: { value: number; from?: number; className?: string }) {
  const format = (n: number) => n.toLocaleString("en-US");
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (!canMove() || matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    const start = from.current ?? start0;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    let at = start;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / 700));
      const e = 1 - Math.pow(1 - p, 3);
      at = Math.round(start + (value - start) * e);
      setShown(at);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // The next run (a new value, or React's development double-run) continues from the number on screen.
    return () => {
      cancelAnimationFrame(raf);
      from.current = at;
    };
  }, [value]);
  return <span className={cn("tnum", className)}>{format(shown)}</span>;
}
