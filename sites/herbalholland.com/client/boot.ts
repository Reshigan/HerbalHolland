// Runs in <head> before the first paint (a tiny classic script — the strict CSP allows no other inline script). It marks
// that scripts run (html.js), decides whether the page moves (html.motion: not with reduced motion, Save-Data or a
// device with four cores or fewer, which get the still pictures instead), and settles the 18+ gate before anything is
// drawn, so a new visitor never glimpses the page behind it and a returning adult never sees it flash. The gate's
// answers are handled here too, so the first screen works before the page's module arrives (or without it). Once the
// page has loaded it adds the rest of the stylesheet and the module, so nothing competes with the first paint.
//   localStorage hh_age   = the time "I'm 18 or older" was chosen; valid for 365 days
//   sessionStorage hh_age = "under" after "I'm younger than 18" (for this session), or "ok" where localStorage is blocked
(() => {
  const d = document.documentElement;
  const me = document.currentScript as HTMLScriptElement;
  let age = "new";
  try {
    const at = Number(localStorage.getItem("hh_age"));
    if (at && Date.now() - at < 365 * 864e5) age = "ok";
  } catch {
    // Storage blocked: fall through to the session.
  }
  try {
    const s = sessionStorage.getItem("hh_age");
    if (age !== "ok" && s) age = s === "ok" ? "ok" : "under";
  } catch {
    // Nothing to remember with: the gate asks on each page.
  }
  // A returning adult sees the page's opening straight away (html.ready starts it); a new visitor sees it after the gate.
  // The legal pages (html[data-free]) open without the gate, and remember nothing.
  if (d.hasAttribute("data-free")) age = "ok";
  const n = navigator as Navigator & { connection?: { saveData?: boolean } };
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const still = rm || !!n.connection?.saveData || (n.hardwareConcurrency || 8) <= 4;
  // A returning adult's opening (html.fast) keeps the headline in view from the first paint: the words lift softly
  // instead of rising from behind the dyke, which is the new visitor's entrance after the gate.
  // html.pre: until the first screen has painted, the scenes below it aren't rendered at all (content-visibility:
  // hidden; "auto" alone still lays them out on the first frame), so the first paint is only the first screen.
  d.classList.add("js", "pre", ...(still ? [] : ["motion"]), ...(age === "ok" ? ["ready", "fast"] : []));
  d.setAttribute("data-age", age);
  // The text face: a returning adult's first screen is set in it, so it's fetched at once (a new visitor's first
  // screen, the 18+ card, isn't: for them it's fetched once that has painted, below).
  const inter = () => {
    const l = document.createElement("link");
    l.rel = "preload";
    l.as = "font";
    l.type = "font/woff2";
    l.crossOrigin = "";
    l.href = me.dataset.inter!;
    document.head.append(l);
  };
  if (age === "ok") inter();
  const behind = () => document.querySelectorAll<HTMLElement>("header, main, footer");

  // "I'm younger than 18": the card gives way to the respectful screen (stamped from its template).
  const under = () => {
    const g = document.getElementById("gate");
    const ask = g?.querySelector<HTMLElement>("[data-gate-ask]");
    const t = g?.querySelector("template");
    if (!g || !ask || !t || g.querySelector("[data-gate-under]")) return;
    ask.hidden = true;
    ask.parentElement!.append(t.content.firstElementChild!.cloneNode(true));
    g.setAttribute("aria-labelledby", "gate-under");
    g.removeAttribute("aria-describedby");
    g.querySelector<HTMLElement>("#gate-under")?.focus();
  };
  document.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("#gate [data-age]");
    if (!b) return;
    if (b.dataset.age === "no") {
      try {
        sessionStorage.setItem("hh_age", "under");
      } catch {
        // The screen still shows for this page.
      }
      d.setAttribute("data-age", "under");
      return under();
    }
    try {
      localStorage.setItem("hh_age", String(Date.now()));
    } catch {
      try {
        sessionStorage.setItem("hh_age", "ok");
      } catch {
        // Nothing to remember with: this page still opens.
      }
    }
    d.setAttribute("data-age", "ok");
    const g = b.closest("#gate")!;
    const ready = () => d.classList.add("ready");
    const done = () => {
      g.classList.remove("is-leaving");
      behind().forEach((el) => (el.inert = false));
      document.getElementById("main")?.focus({ preventScroll: true });
    };
    if (rm) return ready(), done();
    // The card leaves, then the scene's entrance plays: the sun rises into place, the headline lifts from the dyke.
    g.classList.add("is-leaving");
    setTimeout(ready, 380);
    setTimeout(done, 1300);
  });
  if (age === "under") document.addEventListener("DOMContentLoaded", under);

  // Once the first screen has painted (a background tab paints nothing, so after a moment regardless): the rest of the
  // stylesheet is fetched, and for a new visitor the text face; when both are here the page behind the gate is drawn
  // (inert) — or, for a returning adult, the scenes below the first — so it's laid out once, with the right font; then
  // the page's module. After a moment regardless, should either not arrive.
  let added = false;
  const rest = () => {
    if (added) return;
    added = true;
    const gated = d.getAttribute("data-age") !== "ok";
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = me.dataset.css!;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      // (The answer may already have been given while the font was on its way.)
      if (d.getAttribute("data-age") !== "ok") behind().forEach((el) => (el.inert = true));
      d.classList.remove("pre");
      const s = document.createElement("script");
      s.type = "module";
      s.src = me.dataset.js!;
      document.head.append(s);
    };
    const sheet = new Promise((r) => (l.onload = l.onerror = r));
    const font = gated && document.fonts ? document.fonts.load('1rem "Inter Variable"').catch(() => 0) : Promise.resolve(0);
    Promise.all([sheet, font]).then(show);
    setTimeout(show, 1500);
    document.head.append(l);
  };
  try {
    new PerformanceObserver((l, o) => l.getEntriesByName("first-contentful-paint").length && (o.disconnect(), setTimeout(rest, 0))).observe({ type: "paint", buffered: true });
  } catch {
    setTimeout(rest, 0);
  }
  setTimeout(rest, 2500);
})();

export {};
