// herbalholland.com — the page's one script: a small ES module, no libraries. What it does:
//   the 18+ gate (a modal card over the opening scene: focus trapped, the page inert), the menu dialog, the FAQ, the
//   two forms; and the motion: one requestAnimationFrame loop drives scroll velocity (the wind that turns every
//   windmill's sails and drifts the marquee), the pinned 9,475 km story, the stage (each scene's entry, --t1 … --t4,
//   where CSS scroll-driven animations aren't supported; and the windmill's flight from scene to scene, always), and
//   scroll-linked --p elsewhere, while IntersectionObserver starts one-shot reveals. Only transform and opacity move;
//   nothing reads layout while it writes. The loop sleeps when nothing moves, drops to 30 fps when the page is idle
//   and stops in a background tab. Without html.motion (reduced motion, Save-Data, four cores or fewer) the page is
//   still, and the content is all there.

const d = document;
const html = d.documentElement;
const mq = (q: string) => matchMedia(q).matches;
const RM = mq("(prefers-reduced-motion: reduce)");
const MOTION = html.classList.contains("motion");
const FINE = mq("(hover: hover) and (pointer: fine)");
const SDA = typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()") && CSS.supports("timeline-scope: --a");
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = d) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = d) => Array.from(r.querySelectorAll<T>(s));
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const on = <K extends keyof HTMLElementEventMap>(el: EventTarget | null | undefined, ev: K | string, fn: (e: never) => void, o?: AddEventListenerOptions) => el?.addEventListener(ev, fn as EventListener, o);
const setVar = (el: HTMLElement | SVGElement, k: string, v: string | number) => el.style.setProperty(k, String(v));
const fmt = (n: number) => n.toLocaleString("en-US");

// ── One loop ────────────────────────────────────────────────────────────────
// Each job runs every frame while the loop is awake and says whether it still needs frames; the loop sleeps when none
// do, and scroll, pointer and visibility events wake it. After a moment without input it runs every other frame.
type Job = (dt: number) => boolean;
const jobs: Job[] = [];
let raf = 0;
let last = 0;
let lastInput = 0;
let tick = 0;
function frame(now: number) {
  tick++;
  if (now - lastInput > 500 && tick % 2) {
    raf = requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  let more = false;
  for (const j of jobs) more = j(dt) || more;
  raf = more ? requestAnimationFrame(frame) : 0;
}
function wake() {
  lastInput = performance.now();
  if (raf || d.hidden) return;
  last = lastInput;
  raf = requestAnimationFrame(frame);
}
on(d, "visibilitychange", () => (d.hidden ? (cancelAnimationFrame(raf), (raf = 0)) : wake()));

// Scroll: position, smoothed velocity (px/s), direction, and "wind" — rises with a fast scroll (or a quick cursor),
// dies away slowly.
let sy = scrollY;
let prevY = sy;
let vel = 0;
let dir = 1;
let wind = 0;
jobs.push((dt) => {
  sy = scrollY;
  const dy = sy - prevY;
  prevY = sy;
  if (dy) dir = dy > 0 ? 1 : -1;
  vel += (dy / dt - vel) * Math.min(1, dt * 14);
  const a = Math.abs(vel);
  wind += (a - wind) * (a > wind ? Math.min(1, dt * 9) : Math.min(1, dt * 1.6));
  if (wind < 0.5) wind = 0;
  return Math.abs(vel) > 1 || wind > 0;
});
on(window, "scroll", wake, { passive: true });

// Geometry, measured once and on resize (never inside the loop).
let vh = innerHeight;
let vw = innerWidth;
const geo = new Map<Element, { top: number; h: number }>();
const measurers: (() => void)[] = [];
const measure = () => {
  vh = innerHeight;
  vw = innerWidth;
  const y = scrollY;
  geo.forEach((_, el) => {
    const r = el.getBoundingClientRect();
    geo.set(el, { top: r.top + y, h: r.height });
  });
  measurers.forEach((m) => m());
  wake();
};

/** Elements that are on screen (IntersectionObserver keeps this current). */
const visible = new Set<Element>();
const seen = new IntersectionObserver(
  (es) => {
    for (const e of es) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    wake();
  },
  { rootMargin: "10% 0px" },
);
const watch = (el: Element) => (geo.set(el, { top: 0, h: 0 }), seen.observe(el));

// ── The 18+ gate ────────────────────────────────────────────────────────────
const ready = () => html.classList.add("ready");

function gate() {
  const g = $<HTMLDialogElement>("#gate");
  const age = html.dataset.age;
  if (!g || age === "ok") return ready();
  const ask = $("[data-gate-ask]", g)!;
  const under = $("[data-gate-under]", g)!;
  const open = () => {
    if (g.open) return;
    try {
      g.showModal();
    } catch {
      g.setAttribute("open", "");
    }
  };
  const showUnder = (focus: boolean) => {
    ask.hidden = true;
    under.hidden = false;
    g.setAttribute("aria-labelledby", "gate-under");
    g.removeAttribute("aria-describedby");
    if (focus) $("#gate-under", g)?.focus();
  };
  open();
  if (age === "under") showUnder(true);
  else $<HTMLButtonElement>("[data-age=yes]", g)?.focus();
  // Esc doesn't dismiss it: an answer does.
  on(g, "cancel", (e: Event) => e.preventDefault());
  on(g, "close", () => html.dataset.age !== "ok" && open());
  on($("[data-age=yes]", g), "click", () => {
    try {
      localStorage.setItem("hh_age", String(Date.now()));
    } catch {
      try {
        sessionStorage.setItem("hh_age", "ok");
      } catch {
        // Nothing to remember with: this page still opens.
      }
    }
    html.dataset.age = "ok";
    const done = () => {
      g.close();
      g.classList.remove("is-leaving");
      $("#main")?.focus({ preventScroll: true });
    };
    // The card leaves, then the scene's entrance plays: the sun rises into place, the headline lifts from the dyke.
    if (RM) return done(), ready();
    g.classList.add("is-leaving");
    setTimeout(ready, 380);
    setTimeout(done, 1300);
  });
  on($("[data-age=no]", g), "click", () => {
    try {
      sessionStorage.setItem("hh_age", "under");
    } catch {
      // The screen still shows for this page.
    }
    html.dataset.age = "under";
    showUnder(true);
  });
}

// ── Header: solid once scrolled, tucked away while reading down, back on the way up ─────────────────────────────
function header() {
  const h = $("[data-hdr]");
  if (!h) return;
  let solid = false;
  let hidden = false;
  let y0 = sy;
  let run = 0; // how far the page has moved in the current direction
  jobs.push(() => {
    const dy = sy - y0;
    y0 = sy;
    if (dy) run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;
    const s = sy > 24;
    if (s !== solid) h.classList.toggle("is-solid", (solid = s));
    let hide = hidden;
    if (sy < 120 || html.classList.contains("menu-open") || h.contains(d.activeElement)) hide = false;
    else if (run > 60) hide = true;
    else if (run < -24) hide = false;
    if (hide !== hidden) h.classList.toggle("is-hidden", (hidden = hide));
    return false;
  });
  on(h, "focusin", () => h.classList.remove("is-hidden"));
}

// ── Sails turn with the wind; the marquee drifts with the scroll ──────────────────────────────────────────────
function motion() {
  const sails = $$<SVGGElement>("[data-sails]");
  sails.forEach((s) => seen.observe(s));
  let angle = 0;
  jobs.push((dt) => {
    if (!wind) return false;
    angle = (angle + Math.min(wind * 0.32, 1100) * dt) % 360;
    const t = `rotate(${angle.toFixed(2)}deg)`;
    for (const s of sails) if (visible.has(s)) s.style.transform = t;
    return false;
  });
  // A quick cursor is a gust too.
  if (FINE) {
    let px = -1;
    let py = -1;
    on(
      window,
      "pointermove",
      (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        if (px >= 0) wind = Math.min(2600, wind + Math.hypot(e.clientX - px, e.clientY - py) * 4);
        px = e.clientX;
        py = e.clientY;
        wake();
      },
      { passive: true },
    );
  }

  const m = $("[data-marquee]");
  const track = m && $(".marquee__track", m);
  const set = m && $(".marquee__set", m);
  if (!m || !track || !set) return;
  let w = set.getBoundingClientRect().width;
  measurers.push(() => (w = set.getBoundingClientRect().width));
  seen.observe(m);
  let x = 0;
  let heading = -1;
  jobs.push((dt) => {
    if (!visible.has(m)) return false;
    heading += (-dir - heading) * Math.min(1, dt * 3);
    x += heading * (46 + Math.min(wind * 0.75, 2600)) * dt;
    if (w) x = ((x % w) - w) % w;
    const skew = clamp(vel * 0.0022, -7, 7);
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${(-skew).toFixed(2)}deg)`;
    return true;
  });
}

// ── Scroll-linked --p, and each scene's entry (--t1 …) for the stage, where CSS scroll-driven animations aren't supported
function progress() {
  if (SDA) return;
  const els = $$("[data-sp]");
  els.forEach(watch);
  const last = new Map<Element, string>();
  jobs.push(() => {
    for (const el of els) {
      if (!visible.has(el)) continue;
      const g = geo.get(el);
      if (!g) continue;
      const { top: T, h: H } = g;
      const mode = el.dataset.sp;
      let a: number;
      let b: number;
      if (mode === "exit") (a = Math.max(T, T + H - vh)), (b = T + H);
      else if (mode === "enter") (a = T - vh), (b = Math.min(T, T + H - vh));
      else if (mode === "cover") (a = T - vh), (b = T + H);
      else (a = T - vh / 2), (b = T + H - vh / 2);
      const p = clamp((sy - a) / (b - a || 1)).toFixed(4);
      if (last.get(el) !== p) last.set(el, p), setVar(el, "--p", p);
    }
    return false;
  });
  // A scene has entered as far as its top has climbed from the bottom of the screen to the top: 0 → 1.
  const stage = $("[data-stage]");
  const scenes = $$("[data-scene]");
  if (!stage || !scenes.length) return;
  scenes.forEach((s) => geo.set(s, { top: 0, h: 0 }));
  const done = new Map<Element, string>();
  jobs.push(() => {
    for (const s of scenes) {
      const g = geo.get(s);
      if (!g) continue;
      const t = clamp((sy - (g.top - vh)) / vh).toFixed(4);
      if (done.get(s) !== t) done.set(s, t), setVar(stage, `--t${s.dataset.scene}`, t);
    }
    return false;
  });
}

// ── The 9,475 km story: pinned while the windmill flies the arc from Amsterdam to the hills ──────────────────────
/** Where the story is, for the stage: its progress, and where the flying marker is on screen. */
const flight = { active: false, x: 0, y: 0, p: 0 };

function story() {
  const s = $("[data-story]");
  const svg = s && $<SVGSVGElement>("[data-globe]", s);
  if (!s || !svg) return;
  const [la, lo, lb, lob] = svg.dataset.route!.split(" ").map(Number);
  const [c0, c1, R, lift] = svg.dataset.view!.split(" ").map(Number);
  const [ex, ey] = svg.dataset.end!.split(" ").map(Number);
  const D = Math.PI / 180;
  const v = (lat: number, lon: number) => [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
  const A = v(la, lo);
  const B = v(lb, lob);
  const W = Math.acos(A[0] * B[0] + A[1] * B[1] + A[2] * B[2]);
  const f0 = c0 * D;
  const l0 = c1 * D;
  const at = (t: number) => {
    const ka = Math.sin((1 - t) * W) / Math.sin(W);
    const kb = Math.sin(t * W) / Math.sin(W);
    const [x, y, z] = [0, 1, 2].map((i) => A[i] * ka + B[i] * kb);
    const lat = Math.asin(clamp(z, -1, 1));
    const dl = Math.atan2(y, x) - l0;
    const k = R * (1 + lift * Math.sin(Math.PI * t));
    return {
      lat: lat / D,
      lon: (Math.atan2(y, x) / D + 540) % 360 - 180,
      x: 300 + k * Math.cos(lat) * Math.sin(dl),
      y: 300 - k * (Math.cos(f0) * Math.sin(lat) - Math.sin(f0) * Math.cos(lat) * Math.cos(dl)),
    };
  };
  const plane = $<SVGGElement>("[data-plane]", svg)!;
  const zooms = $$<SVGGElement>(".globe__zoom", svg);
  const pinA = $<SVGGElement>(".pin--a", svg);
  const dots = $$<SVGCircleElement>(".dot", svg);
  dots.forEach((c) => setVar(c, "--t", c.dataset.t!));
  const chapters = $$("[data-chapter]", s);
  const bars = $$(".story__bar i", s);
  const latEl = $("[data-lat]", s);
  const lonEl = $("[data-lon]", s);
  const kmEls = $$("[data-km], [data-km-big]", s);
  const km = Number(kmEls[0]?.textContent?.replace(/\D/g, "")) || 0;
  const dms = (n: number, p: string, q: string) => `${Math.abs(n).toFixed(4)}° ${n >= 0 ? p : q}`;
  watch(s);
  // The globe's place inside the pinned frame (its own units → pixels), so the flight can be drawn on the stage.
  const pin = s.firstElementChild as HTMLElement;
  let gl = 0;
  let gt = 0;
  let gk = 1;
  measurers.push(() => {
    const r = svg.getBoundingClientRect();
    const q = pin.getBoundingClientRect();
    gl = r.left - q.left;
    gt = r.top - q.top;
    gk = r.width / 600;
  });
  let lastP = -1;
  let lastKm = "";
  const W8 = 0.075;
  // Pinned only on a screen tall enough for it (the CSS decides the same way); otherwise a plain, finished section.
  const tall = matchMedia("(min-height: 600px)");
  const shown = [...kmEls, latEl, lonEl].map((e) => e?.textContent ?? "");
  let flat = false;
  on(tall, "change", () => ((lastP = -1), wake()));
  jobs.push(() => {
    flight.active = false;
    if (!tall.matches) {
      if (!flat) {
        flat = true;
        lastKm = "";
        [...kmEls, latEl, lonEl].forEach((e, i) => e && (e.textContent = shown[i]));
        [s, pinA, ...zooms, ...chapters, ...bars].forEach((e) => e?.removeAttribute("style"));
      }
      return false;
    }
    flat = false;
    const g = geo.get(s);
    if (!g || !g.h) return false;
    const p = clamp((sy - g.top) / (g.h - vh || 1));
    const ap = clamp((p - 0.03) / 0.72);
    // The marker on screen: the pinned frame's top is where the section is until it pins, 0 while pinned, then it leaves.
    const pt = at(ap);
    const z = clamp((p - 0.78) / 0.22);
    const sc = 1 + 0.5 * smooth(z);
    const top = sy < g.top ? g.top - sy : sy > g.top + g.h - vh ? g.top + g.h - vh - sy : 0;
    flight.active = true;
    flight.p = p;
    flight.x = gl + (ex + (pt.x - ex) * sc) * gk;
    flight.y = gt + top + (ey + (pt.y - ey) * sc) * gk;
    if (!visible.has(s) || Math.abs(p - lastP) < 0.0002) return false;
    lastP = p;
    setVar(s, "--p", p.toFixed(4));
    setVar(s, "--ap", ap.toFixed(4));
    plane.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`;
    const zt = `translate(${ex}px,${ey}px) scale(${sc.toFixed(4)}) translate(${-ex}px,${-ey}px)`;
    zooms.forEach((z) => (z.style.transform = zt));
    // Amsterdam leaves the frame as the map closes in on South Africa.
    if (pinA) pinA.style.opacity = clamp(1 - z * 2.5).toFixed(3);
    const k = fmt(Math.round(km * ap));
    if (k !== lastKm) {
      lastKm = k;
      kmEls.forEach((e) => (e.textContent = k));
      if (latEl) latEl.textContent = dms(pt.lat, "N", "S");
      if (lonEl) lonEl.textContent = dms(pt.lon, "E", "W");
    }
    chapters.forEach((c, i) => {
      const a = i / chapters.length;
      const b = (i + 1) / chapters.length;
      // One chapter at a time: the last one leaves before the next arrives.
      const fin = i === 0 ? 1 : clamp((p - a) / W8);
      const fout = i === chapters.length - 1 ? 1 : clamp((b - p) / W8);
      const o = Math.min(fin, fout);
      c.style.opacity = o.toFixed(3);
      c.style.transform = `translate3d(0,${((1 - o) * (fin < 1 ? 26 : -26)).toFixed(1)}px,0)`;
      bars[i]?.style.setProperty("transform", `scaleX(${clamp(p * chapters.length - i).toFixed(3)})`);
    });
    return false;
  });
}

// ── The stage: the windmill's flight from scene to scene ─────────────────────────────────────────────────────────
// Each scene says where the windmill stands while the scene fills the screen (--mill: x y scale, fractions of the
// viewport, in its CSS, so it can differ by screen). Between two scenes the windmill moves as the next one enters; over
// the sea it rides the story's arc, from the Amsterdam pin to the hills.
function stage() {
  const st = $("[data-stage]");
  const mill = st && $("[data-mill-stage]", st);
  if (!st || !mill) return;
  const scenes = $$("[data-mill]");
  if (!scenes.length) return;
  type K = { x: number; y: number; s: number };
  const keys: (K | null)[] = [];
  const sea = scenes.findIndex((s) => s.hasAttribute("data-story"));
  scenes.forEach((s) => geo.set(s, { top: 0, h: 0 }));
  measurers.push(() => {
    scenes.forEach((s, i) => {
      const [x, y, sc] = getComputedStyle(s).getPropertyValue("--mill").trim().split(/\s+/).map(Number);
      keys[i] = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(sc) ? { x, y, s: sc } : null;
    });
  });
  const px = (k: K): K => ({ x: k.x * vw, y: k.y * vh, s: k.s });
  const flying = (): K => ({ x: flight.x, y: flight.y, s: 0.16 });
  const mix = (a: K, b: K, u: number): K => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, s: a.s + (b.s - a.s) * u });
  let lastT = "";
  jobs.push(() => {
    // The scene in charge: the last whose top has reached the top of the screen.
    let i = 0;
    for (let j = 1; j < scenes.length; j++) if ((geo.get(scenes[j])?.top ?? Infinity) <= sy) i = j;
    const from = i === sea && flight.active ? flying() : keys[i] ? px(keys[i]!) : null;
    const next = scenes[i + 1];
    const gn = next && geo.get(next);
    let k = from;
    if (from && gn && gn.h) {
      const to = i + 1 === sea && flight.active ? flying() : keys[i + 1] ? px(keys[i + 1]!) : null;
      if (to) k = mix(from, to, smooth(clamp((sy - (gn.top - vh)) / vh)));
    }
    if (!k) return false;
    const t = `translate3d(${k.x.toFixed(1)}px,${k.y.toFixed(1)}px,0) scale(${k.s.toFixed(3)})`;
    if (t !== lastT) (lastT = t), (mill.style.transform = t), st.classList.add("is-placed");
    // Over the sea the windmill is the marker.
    st.classList.toggle("is-flying", i === sea && flight.active && flight.p < 0.99);
    return false;
  });
}

// ── One-shot reveals and rolling numbers ─────────────────────────────────────────────────────────────────────────
function reveals() {
  $$("[data-rs]").forEach((g) => $$("[data-r]", g).forEach((el, i) => setVar(el, "--i", i % 8)));
  $$(".reel__v").forEach((r) => $$(".reel__d", r).reverse().forEach((dd, i) => setVar(dd, "--i", i)));
  const all = $$("[data-r], .reel__v, .step");
  if (RM || !("IntersectionObserver" in window)) return all.forEach((el) => el.classList.add("in"));
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        e.target.classList.add("in");
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
  );
  all.forEach((el) => io.observe(el));
}

// ── Menu: a full-screen modal dialog ─────────────────────────────────────────────────────────────────────────
function menu() {
  const m = $<HTMLDialogElement>("#menu");
  const btn = $<HTMLButtonElement>("[data-menu-open]");
  if (!m || !btn) return;
  $$(".menu__word", m).forEach((w, i) => setVar(w, "--i", i));
  let closing = 0;
  const open = () => {
    clearTimeout(closing);
    if (!m.open) m.showModal();
    html.classList.add("menu-open");
    btn.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
    $<HTMLButtonElement>("[data-menu-close]", m)?.focus();
  };
  const close = () => {
    m.classList.remove("open");
    html.classList.remove("menu-open");
    btn.setAttribute("aria-expanded", "false");
    closing = window.setTimeout(
      () => {
        m.close();
        btn.focus();
      },
      RM ? 0 : 420,
    );
  };
  on(btn, "click", open);
  on($("[data-menu-close]", m), "click", close);
  on(m, "cancel", (e: Event) => (e.preventDefault(), close()));
  $$<HTMLAnchorElement>("a[href^='#'], a[href^='/#']", m).forEach((a) => on(a, "click", close));
  on(window, "resize", () => m.open && innerWidth >= 1100 && close());
}

// ── FAQ: native <details>, with the answers easing in and the questions below gliding (FLIP, transform only) ──────
function faq() {
  if (RM) return;
  $$<HTMLDetailsElement>("[data-acc] details").forEach((det) => {
    const sum = $("summary", det)!;
    on(sum, "click", (e: Event) => {
      e.preventDefault();
      const items = $$(":scope > details", det.parentElement!);
      const after = items.slice(items.indexOf(det) + 1);
      const flip = (change: () => void) => {
        const before = after.map((el) => el.getBoundingClientRect().top);
        change();
        after.forEach((el, i) => {
          const dy = before[i] - el.getBoundingClientRect().top;
          if (!dy) return;
          el.style.transition = "none";
          el.style.transform = `translate3d(0,${dy}px,0)`;
        });
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            after.forEach((el) => {
              el.style.transition = "transform .6s cubic-bezier(.19,1,.22,1)";
              el.style.transform = "";
            }),
          ),
        );
        setTimeout(measure, 650);
      };
      if (!det.open) return flip(() => (det.open = true));
      det.classList.add("closing");
      setTimeout(() => flip(() => ((det.open = false), det.classList.remove("closing"))), 190);
    });
  });
}

// ── Forms: the franchise enquiry (JSON to /api/enquiry) and the early-access sign-up (JSON to /api/early-access) ──
// One pattern for both: checks before sending, errors under each field and a summary above, a busy button, the server's
// own field errors (422), "too many tries" (429) and anything else, then a thank-you that takes the focus.
type FormCopy = { email: string; sending: string; errors: Record<string, string> };
type Vals = Record<string, string | boolean>;
type FormSpec = {
  /** The fields in the order their errors are read and focused. */
  order: string[];
  /** Errors that stand for more than one control ("contact": an email address or a mobile number). */
  group?: Record<string, string[]>;
  values: (get: (n: string) => string, ticked: (n: string) => boolean) => Vals;
  check: (v: Vals, E: Record<string, string>) => Record<string, string>;
  /** What goes in the request (the ?src tag and the honeypot are added to it). */
  body?: (v: Vals) => Vals;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** A South African mobile number, as the platform reads one (src/lib/sa.ts normalisePhone). */
const saMobile = (raw: string) => {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+27")) d = d.slice(3);
  else if (d.startsWith("27") && d.length === 11) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[6-8]\d{8}$/.test(d);
};
const str = (v: string | boolean | undefined) => (typeof v === "string" ? v.trim() : "");

const FORMS: Record<string, FormSpec> = {
  // The franchise enquiry (/franchise).
  f: {
    order: ["name", "email", "phone", "area", "province", "capital", "experience", "pharmacist", "message", "consent"],
    values: (get, ticked) => ({
      name: get("name"),
      email: get("email"),
      phone: get("phone"),
      area: get("area"),
      province: get("province"),
      experience: get("experience"),
      capital: get("capital"),
      pharmacist: get("pharmacist"),
      message: get("message"),
      consent: ticked("consent") ? "on" : "",
    }),
    check: (v, E) => {
      const e: Record<string, string> = {};
      const min = Number($("#f-experience")?.dataset.min) || 0;
      if (!str(v.name)) e.name = E.name;
      if (!str(v.email)) e.email = E.email;
      else if (!EMAIL_RE.test(str(v.email))) e.email = E.emailShape;
      if (!str(v.phone)) e.phone = E.phone;
      if (str(v.area).length < 2) e.area = E.area;
      if (!v.province) e.province = E.province;
      if (!v.capital) e.capital = E.capital;
      if (!str(v.experience)) e.experience = E.experience;
      else if (str(v.experience).length < min) e.experience = E.experienceShort.replace("{n}", String(min));
      if (!v.pharmacist) e.pharmacist = E.pharmacist;
      if (!v.consent) e.consent = E.consent;
      return e;
    },
  },
  // The early-access sign-up (home, /stores): an email address or a mobile number (or both), 18+, and consent.
  ea: {
    order: ["email", "mobile", "contact", "firstName", "province", "adult", "consent"],
    group: { contact: ["email", "mobile"] },
    values: (get, ticked) => ({ firstName: get("firstName").trim(), email: get("email").trim(), mobile: get("mobile").trim(), province: get("province"), adult: ticked("adult"), consent: ticked("consent") }),
    check: (v, E) => {
      const e: Record<string, string> = {};
      if (str(v.firstName) && !/\p{L}/u.test(str(v.firstName))) e.firstName = E.firstName;
      if (!str(v.email) && !str(v.mobile)) e.contact = E.contact;
      if (str(v.email) && !EMAIL_RE.test(str(v.email))) e.email = E.email;
      if (str(v.mobile) && !saMobile(str(v.mobile))) e.mobile = E.mobile;
      if (!v.adult) e.adult = E.adult;
      if (!v.consent) e.consent = E.consent;
      return e;
    },
    // Only what was given: the optional fields are left out when empty.
    body: (v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")),
  },
};

function forms() {
  $$<HTMLFormElement>("form[data-form]").forEach((f) => {
    const p = f.dataset.form || "";
    if (FORMS[p]) wireForm(f, p, FORMS[p]);
  });
}

function wireForm(f: HTMLFormElement, p: string, spec: FormSpec) {
  const copyEl = $(`#${p}-copy`);
  const done = f.parentElement && $("[data-form-done]", f.parentElement);
  if (!copyEl || !done) return;
  const C = JSON.parse(copyEl.textContent || "{}") as FormCopy;
  const submit = $<HTMLButtonElement>("[data-submit]", f)!;
  const alertBox = $("[data-form-alert]", f)!;
  const live = $("[data-form-live]", f)!;
  const src = (new URLSearchParams(location.search).get("src") || "").trim().slice(0, 64);
  const fill = (s: string) => s.replace("{email}", C.email);
  let busy = false;
  submit.disabled = false;

  const get = (n: string) => {
    const radio = $<HTMLInputElement>(`input[type=radio][name="${n}"]:checked`, f);
    if (radio) return radio.value;
    return ($<HTMLInputElement>(`#${p}-${n}`, f)?.value ?? "") as string;
  };
  const ticked = (n: string) => !!$<HTMLInputElement>(`#${p}-${n}`, f)?.checked;
  // The controls behind an error: a field's own input (or its radios), or every control a group stands for.
  const controls = (n: string): HTMLElement[] => {
    const g = spec.group?.[n];
    if (g) return g.flatMap(controls);
    const radios = $$<HTMLInputElement>(`input[type=radio][name="${n}"]`, f);
    return radios.length ? radios : ([$<HTMLElement>(`#${p}-${n}`, f)].filter(Boolean) as HTMLElement[]);
  };
  // What carries aria-describedby: a radio group's fieldset, otherwise the controls themselves.
  const described = (n: string): HTMLElement[] => {
    const box = $<HTMLElement>(`[data-field="${n}"]`, f);
    return box?.tagName === "FIELDSET" ? [box] : controls(n);
  };
  // Each one's own descriptions (its hints), kept so an error can be put in front and taken away again.
  const base = new Map<HTMLElement, string>();
  $$<HTMLElement>("input, select, textarea, fieldset", f).forEach((c) => base.set(c, c.getAttribute("aria-describedby") || ""));
  const errOf = (n: string) => $(`#${p}-${n}-err`, f);
  const boxes = (n: string) => [n, ...(spec.group?.[n] ?? [])].map((m) => $(`[data-field="${m}"]`, f)).filter(Boolean) as HTMLElement[];
  const showing = (n: string) => !!errOf(n) && !errOf(n)!.hidden;
  const redescribe = (c: HTMLElement) => {
    const errs = spec.order.filter((n) => showing(n) && described(n).includes(c)).map((n) => `${p}-${n}-err`);
    const d = [...errs, base.get(c)].filter(Boolean).join(" ");
    d ? c.setAttribute("aria-describedby", d) : c.removeAttribute("aria-describedby");
    const invalid = spec.order.some((n) => showing(n) && controls(n).includes(c));
    invalid ? c.setAttribute("aria-invalid", "true") : c.removeAttribute("aria-invalid");
  };
  const refresh = (n: string) => {
    boxes(n).forEach((b) => b.classList.toggle("has-err", spec.order.some((m) => showing(m) && boxes(m).includes(b))));
    new Set([...controls(n), ...described(n)]).forEach(redescribe);
  };
  const clearField = (n: string) => {
    const err = errOf(n);
    if (!err || err.hidden) return;
    err.hidden = true;
    refresh(n);
  };
  const clearAll = () => {
    spec.order.forEach(clearField);
    alertBox.hidden = true;
  };
  const showAlert = (msg: string, focus = true) => {
    alertBox.hidden = false;
    $("p", alertBox)!.textContent = msg;
    if (focus) alertBox.focus();
  };
  const showErrors = (fields: Record<string, string>, summary: string) => {
    const bad = spec.order.filter((n) => fields[n]);
    if (!bad.length) return showAlert(summary);
    for (const n of bad) {
      const err = errOf(n);
      if (!err) continue;
      err.hidden = false;
      $("span", err)!.textContent = fields[n];
    }
    bad.forEach(refresh);
    showAlert(summary, false);
    const first = controls(bad[0])[0];
    first?.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" });
    first?.focus({ preventScroll: true });
  };

  spec.order.forEach((n) => controls(n).forEach((c) => (on(c, "input", () => clearField(n)), on(c, "change", () => clearField(n)))));

  on(f, "submit", async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    clearAll();
    const v = spec.values(get, ticked);
    const local = spec.check(v, C.errors);
    if (Object.keys(local).length) return showErrors(local, C.errors.summary);
    busy = true;
    submit.disabled = true;
    submit.classList.add("is-busy");
    f.setAttribute("aria-busy", "true");
    live.textContent = C.sending;
    try {
      const body = { ...(spec.body ? spec.body(v) : v), ...(src || !spec.body ? { source: src } : {}), website: ($<HTMLInputElement>(`#${p}-website`, f)?.value ?? "") as string };
      const res = await fetch(f.dataset.endpoint || "/", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      let data: { ok?: boolean; reference?: string; error?: string; fields?: Record<string, string> } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.ok && data?.ok) return success(data.reference || "");
      if (res.status === 422 && data?.fields) showErrors(data.fields, data.error || C.errors.summary);
      else if (res.status === 429) showAlert(data?.error || fill(C.errors.busy));
      else showAlert(data?.error || fill(C.errors.server));
    } catch {
      showAlert(fill(C.errors.network));
    } finally {
      busy = false;
      submit.disabled = false;
      submit.classList.remove("is-busy");
      f.removeAttribute("aria-busy");
      live.textContent = "";
    }
  });

  function success(ref: string) {
    const refEl = $("[data-ref]", done!);
    if (refEl) {
      refEl.textContent = ref;
      $("[data-ref-line]", done!)!.hidden = !ref;
    }
    f.hidden = true;
    done!.hidden = false;
    const title = $("[data-done-title]", done!)!;
    title.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" });
    title.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(() => done!.classList.add("in")));
  }
}

// ── Pointer niceties on desktop: tilt, magnetic buttons and the cursor ─────────────────────────────────────────
function pointer() {
  if (!FINE || !MOTION) return;
  $$("[data-tilt]").forEach((el) => {
    let r: DOMRect | null = null;
    on(el, "pointerenter", () => ((r = el.getBoundingClientRect()), el.classList.add("tilting")));
    on(el, "pointermove", (e: PointerEvent) => {
      r ??= el.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width);
      const y = clamp((e.clientY - r.top) / r.height);
      setVar(el, "--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      setVar(el, "--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
      setVar(el, "--gx", `${(x * 100).toFixed(1)}%`);
      setVar(el, "--gy", `${(y * 100).toFixed(1)}%`);
    });
    on(el, "pointerleave", () => {
      r = null;
      el.classList.remove("tilting");
      ["--rx", "--ry"].forEach((k) => el.style.removeProperty(k));
    });
  });

  $$("[data-magnetic]").forEach((el) => {
    let r: DOMRect | null = null;
    on(el, "pointerenter", () => (r = el.getBoundingClientRect()));
    on(el, "pointermove", (e: PointerEvent) => {
      r ??= el.getBoundingClientRect();
      setVar(el, "--mx", `${((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px`);
      setVar(el, "--my", `${((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1)}px`);
    });
    on(el, "pointerleave", () => ((r = null), setVar(el, "--mx", "0px"), setVar(el, "--my", "0px")));
  });

  const c = d.createElement("div");
  c.className = "cursor is-off";
  c.setAttribute("aria-hidden", "true");
  c.innerHTML = '<span class="cursor__ring"><i></i></span><span class="cursor__dot"></span>';
  d.body.append(c);
  html.classList.add("has-cursor");
  const ring = c.firstElementChild as HTMLElement;
  const dot = c.lastElementChild as HTMLElement;
  const label = ring.firstElementChild as HTMLElement;
  let mx = -99;
  let my = -99;
  let rx = mx;
  let ry = my;
  on(window, "pointermove", (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
    if (c.classList.contains("is-off")) (rx = mx), (ry = my), c.classList.remove("is-off");
    wake();
  }, { passive: true });
  on(d, "pointerover", (e: PointerEvent) => {
    const t = e.target as Element;
    const field = t.closest("input, textarea, select");
    const soon = t.closest("[data-cursor]");
    const link = t.closest("a, button, summary, label, [data-tilt]");
    c.classList.toggle("is-field", !!field);
    c.classList.toggle("is-off", !!field);
    c.classList.toggle("is-soon", !!soon);
    c.classList.toggle("is-link", !soon && !!link);
    label.textContent = soon?.getAttribute("data-cursor") || "";
  });
  on(d.documentElement, "pointerleave", () => c.classList.add("is-off"));
  on(window, "pointerdown", () => c.classList.add("is-down"));
  on(window, "pointerup", () => c.classList.remove("is-down"));
  jobs.push((dt) => {
    const k = 1 - Math.pow(0.0006, dt);
    rx += (mx - rx) * k;
    ry += (my - ry) * k;
    ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
    return Math.abs(mx - rx) + Math.abs(my - ry) > 0.2;
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────────────────────────────────────
gate();
reveals();
menu();
faq();
forms();
header();
// Without motion, scroll-linked pieces show their finished state (the hero stays as it is at the top).
if (!MOTION) $$("[data-sp]:not([data-sp=exit])").forEach((el) => setVar(el, "--p", 1));
if (MOTION) {
  motion();
  progress();
  story();
  stage();
  pointer();
}
measure();
on(window, "resize", measure);
on(window, "load", measure);
d.fonts?.ready.then(measure);
new ResizeObserver(() => measure()).observe(d.body);
html.classList.add("m");

export {};
