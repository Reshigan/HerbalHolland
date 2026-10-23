"use client";
// The foil sheen on the Rewards card: a highlight and a faint foil band that follow the pointer (the card also tilts a
// few degrees) or the phone's orientation (sheen only). Rendered as a child of the card, so the card itself stays a
// server component. Only with html.motion and no reduced-motion preference; otherwise the stylesheet shows nothing and
// this never attaches a listener. Without pointer or orientation events the stylesheet drifts the highlight slowly.
// Each frame writes transforms and a background-position only; the card's box is measured on enter and on resize.
import { useEffect, useRef } from "react";

const MAX_TILT = 6;

export function CardSheen() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const card = el?.parentElement;
    if (!el || !card) return;
    const html = document.documentElement;
    if (!html.classList.contains("motion") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rect = { w: 1, h: 1, left: 0, top: 0 };
    const measure = () => {
      const r = card.getBoundingClientRect();
      rect = { w: r.width || 1, h: r.height || 1, left: r.left, top: r.top };
    };
    // Where the highlight should be (0..1 across the card) and whether the card tilts towards it (pointer only).
    const target = { x: 0.5, y: 0.5, tilt: false };
    const cur = { x: 0.5, y: 0.5, rx: 0, ry: 0 };
    let live = false;
    let raf = 0;

    const draw = () => {
      raf = 0;
      const k = 0.14;
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      const rx = target.tilt ? (0.5 - cur.y) * MAX_TILT * 2 : 0;
      const ry = target.tilt ? (cur.x - 0.5) * MAX_TILT * 2 : 0;
      cur.rx += (rx - cur.rx) * k;
      cur.ry += (ry - cur.ry) * k;
      // The highlight layer is twice the card, centred: shifting it by the offset from the centre puts it under the pointer.
      el.style.setProperty("--hh-sx", `${((cur.x - 0.5) * rect.w).toFixed(1)}px`);
      el.style.setProperty("--hh-sy", `${((cur.y - 0.5) * rect.h).toFixed(1)}px`);
      el.style.setProperty("--hh-fx", `${(cur.x * 100).toFixed(1)}%`);
      card.style.transform = live || Math.abs(cur.rx) + Math.abs(cur.ry) > 0.05 ? `perspective(900px) rotateX(${cur.rx.toFixed(2)}deg) rotateY(${cur.ry.toFixed(2)}deg)` : "";
      const settled = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) < 0.002 && Math.abs(cur.rx - rx) + Math.abs(cur.ry - ry) < 0.02;
      if (!settled) raf = requestAnimationFrame(draw);
      else if (!live) {
        el.removeAttribute("data-live");
        card.style.transform = "";
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const wake = () => {
      live = true;
      el.setAttribute("data-live", "");
    };

    // Desktop: the pointer over the card (touch is left to the gyroscope).
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      measure();
      wake();
      target.tilt = true;
    };
    const onMove = (e: PointerEvent) => {
      if (!live || e.pointerType !== "mouse") return;
      target.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.w));
      target.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.h));
      kick();
    };
    const onLeave = () => {
      if (!target.tilt) return;
      live = false;
      target.x = target.y = 0.5;
      target.tilt = false;
      kick();
    };

    // Phones: orientation moves the sheen only. iOS asks permission, which may only follow a tap on the card.
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      if (!live) {
        measure();
        wake();
      }
      target.tilt = false;
      target.x = Math.min(1, Math.max(0, 0.5 + e.gamma / 60)); // ±30° left-right
      target.y = Math.min(1, Math.max(0, (e.beta - 15) / 60)); // 15°..75° from flat to upright
      kick();
    };
    const Orientation = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> }) | undefined;
    const onTap = () => {
      card.removeEventListener("click", onTap);
      Orientation?.requestPermission?.()
        .then((s) => s === "granted" && addEventListener("deviceorientation", onOrient))
        .catch(() => undefined);
    };
    if (Orientation) {
      if (typeof Orientation.requestPermission === "function") card.addEventListener("click", onTap);
      else addEventListener("deviceorientation", onOrient);
    }

    const onResize = () => live && measure();
    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    addEventListener("resize", onResize, { passive: true });
    return () => {
      card.removeEventListener("pointerenter", onEnter);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
      card.removeEventListener("click", onTap);
      removeEventListener("deviceorientation", onOrient);
      removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      card.style.transform = "";
    };
  }, []);
  return <span ref={ref} aria-hidden className="hh-sheen" />;
}
