// Runs in <head> before the first paint (a tiny classic script: the strict CSP allows no other inline script). It marks
// that scripts run (html.js), decides whether the page moves (html.motion: not with reduced motion, Save-Data, 2 GB of
// memory or less, or a device that couldn't keep up earlier in the visit; they get the still pictures instead. Not by
// core count: Safari reports 4 for anything under 8, every iPhone), and settles the 18+ gate before anything is
// drawn, so a new visitor never glimpses the page behind it and a returning adult never sees it flash. The gate's
// answers are handled here too, so the first screen works before the page's module arrives (or without it); the page
// behind the gate stays in the document, only inert. Once the first screen has painted it adds the rest of the
// stylesheet and the module, so nothing competes with the first paint.
//   localStorage hh_age   = the time "I'm 18 or older" was chosen; valid for 365 days
//   sessionStorage hh_age = "under" after "I'm younger than 18" (for this session), or "ok" where localStorage is blocked
//   sessionStorage hh_lite = "1" once the page's frames kept coming late while scrolling: the rest of the visit is still
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
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lite = false;
  try {
    lite = sessionStorage.getItem("hh_lite") === "1"; // set by the page's module when frames kept coming late
  } catch {
    // Nothing remembered.
  }
  const still = rm || lite || !!n.connection?.saveData || (n.deviceMemory ?? 8) <= 2;
  // A returning adult's opening (html.fast) keeps the headline in view from the first paint: the words lift softly
  // instead of rising from behind the dyke, which is the new visitor's entrance after the gate.
  // html.pre: until the first screen has painted, the scenes below it aren't rendered at all (content-visibility:
  // hidden; "auto" alone still lays them out on the first frame), so the first paint is only the first screen.
  d.classList.add("js", "pre", ...(still ? [] : ["motion"]), ...(age === "ok" ? ["ready", "fast"] : []));
  d.setAttribute("data-age", age);
  // The page behind the gate: in the document as on any page, but inert until the answer (set as soon as it's parsed,
  // before the first render, so it costs no restyle).
  const behind = () => document.querySelectorAll<HTMLElement>("header, main, footer");
  if (age !== "ok") document.addEventListener("DOMContentLoaded", () => d.getAttribute("data-age") !== "ok" && behind().forEach((el) => (el.inert = true)));

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
  // stylesheet is fetched; when it's here the scenes below the first are let through (html.pre off) and the page's
  // module is added, so the page is laid out once more, not twice. After a moment regardless, should it not arrive.
  let added = false;
  const rest = () => {
    if (added) return;
    added = true;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = me.dataset.css!;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      d.classList.remove("pre");
      const s = document.createElement("script");
      s.type = "module";
      s.src = me.dataset.js!;
      document.head.append(s);
    };
    l.onload = l.onerror = show;
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
