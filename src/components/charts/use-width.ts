"use client";
import { useEffect, useRef, useState } from "react";

/** The svg's real width, so a chart draws 1:1 and its 11px labels stay 11px on a phone. */
export function useChartWidth() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setWidth(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
