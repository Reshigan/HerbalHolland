// herbalholland.com — the page's one script: a small ES module, no libraries. What it does:
//   the 18+ gate (a modal dialog: focus trapped, the page inert), the menu dialog, the FAQ, the franchise form;
//   and the motion: one requestAnimationFrame loop drives scroll velocity (the windmill's sails and the marquee),
//   the pinned 9,475 km story, and scroll-linked --p where CSS scroll-driven animations aren't supported, while
//   IntersectionObserver starts one-shot reveals. Only transform and opacity move; nothing reads layout while it writes.
//   With prefers-reduced-motion everything is still, and the content is all there.

const d = document;
const html = d.documentElement;
const mq = (q: string) => matchMedia(q).matches;
const RM = mq("(prefers-reduced-motion: reduce)");
const FINE = mq("(hover: hover) and (pointer: fine)");
const SDA = typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()");
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = d) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = d) => Array.from(r.querySelectorAll<T>(s));
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const on = <K extends keyof HTMLElementEventMap>(el: EventTarget | null | undefined, ev: K | string, fn: (e: never) => void, o?: AddEventListenerOptions) => el?.addEventListener(ev, fn as EventListener, o);
const setVar = (el: HTMLElement | SVGElement, k: string, v: string | number) => el.style.setProperty(k, String(v));
const fmt = (n: number) => n.toLocaleString("en-US");

// ── One loop ────────────────────────────────────────────────────────────────
// Each job runs every frame while the loop is awake and says whether it still needs frames; the loop sleeps when none
// do, and scroll, pointer and visibility events wake it.
type Job = (dt: number) => boolean;
const jobs: Job[] = [];
let raf = 0;
let last = 0;
function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  let more = false;
  for (const j of jobs) more = j(dt) || more;
  raf = more ? requestAnimationFrame(frame) : 0;
}
function wake() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// Scroll: position, smoothed velocity (px/s), direction, and "wind" — rises with a fast scroll, dies away slowly.
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
const geo = new Map<Element, { top: number; h: number }>();
const measure = () => {
  vh = innerHeight;
  const y = scrollY;
  geo.forEach((_, el) => {
    const r = el.getBoundingClientRect();
    geo.set(el, { top: r.top + y, h: r.height });
  });
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
function ready() {
  $$(".rise .w").forEach((w, i) => setVar(w as HTMLElement, "--i", i));
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add("ready")));
}

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

  const m = $("[data-marquee]");
  const track = m && $(".marquee__track", m);
  const set = m && $(".marquee__set", m);
  if (!m || !track || !set) return;
  let w = set.getBoundingClientRect().width;
  on(window, "resize", () => (w = set.getBoundingClientRect().width));
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

// ── Scroll-linked --p where CSS scroll-driven animations aren't supported ────────────────────────────────────
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
      else (a = T - vh / 2), (b = T + H - vh / 2);
      const p = clamp((sy - a) / (b - a || 1)).toFixed(4);
      if (last.get(el) !== p) last.set(el, p), setVar(el, "--p", p);
    }
    return false;
  });
}

// ── The 9,475 km story: pinned while an arc draws from Amsterdam to Hillcrest ────────────────────────────────
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
  const dots = $$<SVGCircleElement>(".dot", svg);
  dots.forEach((c) => setVar(c, "--t", c.dataset.t!));
  const chapters = $$("[data-chapter]", s);
  const bars = $$(".story__bar i", s);
  const latEl = $("[data-lat]", s);
  const lonEl = $("[data-lon]", s);
  const kmEls = $$("[data-km], [data-km-big]", s);
  const km = Number(kmEls[0]?.textContent?.replace(/\D/g, "")) || 0;
  const dms = (n: number, p: string, q: string) => `${Math.abs(n).toFixed(4)}° ${n >= 0 ? p : q}`;
  s.classList.add("is-live");
  watch(s);
  let lastP = -1;
  let lastKm = "";
  const W8 = 0.075;
  jobs.push(() => {
    if (!visible.has(s)) return false;
    const g = geo.get(s);
    if (!g || !g.h) return false;
    const p = clamp((sy - g.top) / (g.h - vh || 1));
    if (Math.abs(p - lastP) < 0.0002) return false;
    lastP = p;
    const ap = clamp((p - 0.03) / 0.72);
    setVar(s, "--p", p.toFixed(4));
    setVar(s, "--ap", ap.toFixed(4));
    const pt = at(ap);
    plane.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`;
    const z = clamp((p - 0.78) / 0.22);
    const sc = 1 + 0.5 * z * z * (3 - 2 * z);
    const zt = `translate(${ex}px,${ey}px) scale(${sc.toFixed(4)}) translate(${-ex}px,${-ey}px)`;
    zooms.forEach((z) => (z.style.transform = zt));
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
      const fin = i === 0 ? 1 : clamp((p - a + W8 / 2) / W8);
      const fout = i === chapters.length - 1 ? 1 : clamp((b + W8 / 2 - p) / W8);
      const o = Math.min(fin, fout);
      c.style.opacity = o.toFixed(3);
      c.style.transform = `translate3d(0,${((1 - o) * (fin < 1 ? 26 : -26)).toFixed(1)}px,0)`;
      bars[i]?.style.setProperty("transform", `scaleX(${clamp(p * chapters.length - i).toFixed(3)})`);
    });
    return false;
  });
}

// ── One-shot reveals, rolling numbers and the typed batch code ───────────────────────────────────────────────
function reveals() {
  $$("[data-rs]").forEach((g) => $$("[data-r]", g).forEach((el, i) => setVar(el, "--i", i % 8)));
  $$(".reel__v").forEach((r) => $$(".reel__d", r).reverse().forEach((dd, i) => setVar(dd, "--i", i)));
  const words = $$("[data-words] .sw");
  words.forEach((w, i) => setVar(w, "--i", i));
  const wp = $("[data-words]");
  if (wp) setVar(wp, "--n", words.length);
  const typed = $$("[data-type]");
  const all = $$("[data-r], .reel__v, [data-type], .step");
  if (RM || !("IntersectionObserver" in window)) return all.forEach((el) => el.classList.add("in")), $$(".card--lab").forEach((c) => c.classList.add("typed"));
  typed.forEach((t) => ((t.dataset.full = t.textContent || ""), (t.textContent = "")));
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        el.classList.add("in");
        if (el.dataset.type !== undefined) type(el);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
  );
  all.forEach((el) => io.observe(el));
}

function type(el: HTMLElement) {
  const full = el.dataset.full || "";
  let i = 0;
  const card = el.closest(".card");
  const t = setInterval(() => {
    el.textContent = full.slice(0, ++i);
    if (i >= full.length) clearInterval(t), setTimeout(() => card?.classList.add("typed"), 220);
  }, 75);
}

// ── Menu: a full-screen modal dialog ─────────────────────────────────────────────────────────────────────────
function menu() {
  const m = $<HTMLDialogElement>("#menu");
  const btn = $<HTMLButtonElement>("[data-menu-open]");
  if (!m || !btn) return;
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

// ── The franchise enquiry form: JSON to /api/enquiry ──────────────────────────────────────────────────────────
type FormCopy = { email: string; sending: string; errors: Record<string, string> };
const ORDER = ["name", "email", "phone", "area", "province", "capital", "experience", "pharmacist", "message", "consent"];

function form() {
  const f = $<HTMLFormElement>("[data-form]");
  const copyEl = $("#form-copy");
  if (!f || !copyEl) return;
  const C = JSON.parse(copyEl.textContent || "{}") as FormCopy;
  const submit = $<HTMLButtonElement>("[data-submit]", f)!;
  const alertBox = $("[data-form-alert]", f)!;
  const live = $("[data-form-live]", f)!;
  const done = $("[data-form-done]")!;
  const input = (n: string) => f.elements.namedItem(n) as HTMLInputElement | null;
  const src = (new URLSearchParams(location.search).get("src") || "").trim().slice(0, 64);
  const fill = (s: string) => s.replace("{email}", C.email);
  let busy = false;
  submit.disabled = false;

  const values = () => ({
    name: input("name")?.value ?? "",
    email: input("email")?.value ?? "",
    phone: input("phone")?.value ?? "",
    area: input("area")?.value ?? "",
    province: input("province")?.value ?? "",
    experience: input("experience")?.value ?? "",
    capital: input("capital")?.value ?? "",
    pharmacist: $<HTMLInputElement>("input[name=pharmacist]:checked", f)?.value ?? "",
    message: input("message")?.value ?? "",
    consent: $<HTMLInputElement>("#f-consent", f)?.checked ? "on" : "",
  });

  const controls = (n: string) => (n === "pharmacist" ? $$<HTMLInputElement>("input[name=pharmacist]", f) : [$<HTMLElement>(`#f-${n}`, f)].filter(Boolean)) as HTMLElement[];
  const hintId = (n: string) => ($(`#f-${n}-hint`, f) ? `f-${n}-hint` : "");
  const clearField = (n: string) => {
    const box = $(`[data-field="${n}"]`, f);
    if (!box?.classList.contains("has-err")) return;
    box.classList.remove("has-err");
    $(`#f-${n}-err`, f)!.hidden = true;
    for (const c of controls(n)) {
      c.removeAttribute("aria-invalid");
      const h = hintId(n);
      if (n === "pharmacist") continue;
      h ? c.setAttribute("aria-describedby", h) : c.removeAttribute("aria-describedby");
    }
  };
  const clearAll = () => {
    ORDER.forEach(clearField);
    alertBox.hidden = true;
  };
  const showAlert = (msg: string, focus = true) => {
    alertBox.hidden = false;
    $("p", alertBox)!.textContent = msg;
    if (focus) alertBox.focus();
  };
  const showErrors = (fields: Record<string, string>, summary: string) => {
    const bad = ORDER.filter((n) => fields[n]);
    if (!bad.length) return showAlert(summary);
    for (const n of bad) {
      $(`[data-field="${n}"]`, f)?.classList.add("has-err");
      const err = $(`#f-${n}-err`, f)!;
      err.hidden = false;
      $("span", err)!.textContent = fields[n];
      for (const c of controls(n)) {
        c.setAttribute("aria-invalid", "true");
        if (n !== "pharmacist") c.setAttribute("aria-describedby", [`f-${n}-err`, hintId(n)].filter(Boolean).join(" "));
      }
    }
    showAlert(summary, false);
    const first = controls(bad[0])[0];
    if (bad[0] === "pharmacist") $("[data-field=pharmacist]", f)?.setAttribute("aria-describedby", "f-pharmacist-err f-pharmacist-hint");
    first?.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" });
    first?.focus({ preventScroll: true });
  };

  const check = (v: ReturnType<typeof values>) => {
    const e: Record<string, string> = {};
    const E = C.errors;
    const min = Number($("#f-experience", f)?.dataset.min) || 0;
    if (!v.name.trim()) e.name = E.name;
    if (!v.email.trim()) e.email = E.email;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = E.emailShape;
    if (!v.phone.trim()) e.phone = E.phone;
    if (v.area.trim().length < 2) e.area = E.area;
    if (!v.province) e.province = E.province;
    if (!v.capital) e.capital = E.capital;
    if (!v.experience.trim()) e.experience = E.experience;
    else if (v.experience.trim().length < min) e.experience = E.experienceShort.replace("{n}", String(min));
    if (!v.pharmacist) e.pharmacist = E.pharmacist;
    if (!v.consent) e.consent = E.consent;
    return e;
  };

  ORDER.forEach((n) => controls(n).forEach((c) => (on(c, "input", () => clearField(n)), on(c, "change", () => clearField(n)))));

  on(f, "submit", async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    clearAll();
    const v = values();
    const local = check(v);
    if (Object.keys(local).length) return showErrors(local, C.errors.summary);
    busy = true;
    submit.disabled = true;
    submit.classList.add("is-busy");
    f.setAttribute("aria-busy", "true");
    live.textContent = C.sending;
    try {
      const res = await fetch(f.dataset.endpoint || "/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...v, source: src, website: input("website")?.value ?? "" }),
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
    $("[data-ref]", done)!.textContent = ref;
    f!.hidden = true;
    done.hidden = false;
    const title = $("#done-title", done)!;
    title.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" });
    title.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(() => done.classList.add("in")));
  }
}

// ── Pointer niceties on desktop: tilt, magnetic buttons and the cursor ─────────────────────────────────────────
function pointer() {
  if (!FINE || RM) return;
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
form();
header();
if (!RM) {
  motion();
  progress();
  story();
  pointer();
}
measure();
on(window, "resize", measure);
on(window, "load", measure);
d.fonts?.ready.then(measure);
new ResizeObserver(() => measure()).observe(d.body);
html.classList.add("m");

export {};
