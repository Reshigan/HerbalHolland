// Runs in <head> before the first paint (a tiny classic script — the strict CSP allows no inline script). It marks that
// scripts run (html.js: motion styles apply) and settles the 18+ gate before anything is drawn, so a new visitor never
// glimpses the page behind it and a returning adult never sees it flash. The page's module does the rest.
//   localStorage hh_age   = the time "I'm 18 or older" was chosen; valid for 365 days
//   sessionStorage hh_age = "under" after "I'm younger than 18" (for this session), or "ok" where localStorage is blocked
(() => {
  const d = document.documentElement;
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
  d.classList.add("js", ...(age === "ok" ? ["ready"] : []));
  d.setAttribute("data-age", age);
})();

export {};
