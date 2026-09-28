// The page shell for every herbalholland.com page: <head> (title, description, canonical, Open Graph, fonts, one CSS
// file, the tiny boot script and the page's ES module, the structured data), the header and its full-screen menu, the
// stage (the landscape behind the page: ./art Stage), the 18+ gate (the opening scene's question, a modal card over the
// stage), the breadcrumbs on inner pages and the footer with the giant wordmark. build.ts fills `site` (fingerprinted
// asset names, the build date) before rendering.
import { BRAND, CHROME, EMAIL, GATE, LEGAL } from "../content";
import { FACTS, joinLink, shopLink } from "../facts";
import { AgeBadge, Mark, Sprite, Stage, Wordmark, cx, type StageState } from "./art";
import { Btn, Icon, Index, MailTo, Rich, ShopNow, Soon } from "./ui";

export const site = {
  assets: { css: "/assets/site.css", js: "/assets/site.js", outfit: "/assets/outfit.woff2", inter: "/assets/inter.woff2", concept: [] as string[], stores: {} as Record<string, string> },
  /** Placeholders the build fills once every page is rendered: the page's critical CSS (inlined) and the head script. */
  critical: "__CRITICAL__",
  boot: "__BOOT__",
  /** The build day in SAST (YYYY-MM-DD) and its year. */
  day: "2026-01-01",
  year: 2026,
};

export type Crumb = { label: string; path: string };
export type Meta = { path: string; title: string; description: string; absolute?: boolean; noindex?: boolean; crumbs?: readonly Crumb[] };

export const abs = (path: string) => `${FACTS.origin}${path === "/" ? "/" : path}`;
const ld = (o: Record<string, unknown>) => JSON.stringify({ "@context": "https://schema.org", ...o }).replace(/</g, "\\u003c");

/** Join Rewards: a link once Rewards is live, otherwise its "opening soon" state. */
export function JoinDoor({ kind = "chip", className, label = CHROME.cta.join }: { kind?: "chip" | "btn" | "link"; className?: string; label?: string }) {
  const href = joinLink();
  if (!href) return <Soon label={label} kind={kind} className={className} />;
  return kind === "btn" ? (
    <Btn href={href} magnetic icon="out" className={className}>
      {label}
    </Btn>
  ) : (
    <a href={href} className={cx("link", className)}>
      {label}
    </a>
  );
}

function Brand({ className, vt }: { className?: string; vt?: boolean }) {
  return (
    <a href="/" className={cx("brand", vt && "brand--vt", className)} aria-label={CHROME.home}>
      <Mark className="brand__mark" sails={vt ? "wind" : undefined} use={!vt} />
      <Wordmark className="brand__wm" />
    </a>
  );
}

function Header({ page, nav }: { page: string; nav: string }) {
  const shop = shopLink("/");
  return (
    <header className="hdr" data-hdr="">
      <div className="hdr__bg" aria-hidden="true" />
      <div className="wrap hdr__in">
        <Brand vt />
        <nav className="hdr__nav" aria-label={CHROME.navLabel}>
          <ul>
            {CHROME.nav.map((n) => (
              <li key={n.key}>
                <a href={`/${n.key}`} className="hdr__link" aria-current={nav === n.key ? "page" : undefined}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hdr__end">
          {/* "Get first access" until the online shop is live, then "Shop online". */}
          <ShopNow page={page} label={shop ? CHROME.cta.shop : CHROME.cta.access} className="btn--sm hdr__cta" magnetic />
          <button type="button" className="burger burger--js" aria-haspopup="dialog" aria-controls="menu" aria-expanded="false" data-menu-open="">
            <Icon name="menu" size={18} />
            <span>{CHROME.menu.open}</span>
          </button>
          {/* Without scripts there's no menu to open: the same control leads to the links in the footer. */}
          <a className="burger burger--nojs" href="#ftr-co">
            <Icon name="menu" size={18} />
            <span>{CHROME.menu.open}</span>
          </a>
        </div>
      </div>
    </header>
  );
}

/** The full-screen menu, stamped from this template the first time it's opened (it needs script to open at all). */
function Menu({ page, nav }: { page: string; nav: string }) {
  const items = [{ key: "", label: CHROME.menu.home }, ...CHROME.nav];
  return (
    <template id="menu-t">
    <dialog id="menu" className="menu" aria-label={CHROME.menu.label}>
      <div className="menu__in">
        <div className="wrap menu__bar">
          <Brand />
          <button type="button" className="menu__close" data-menu-close="">
            <span>{CHROME.menu.close}</span>
            <Icon name="close" size={16} />
          </button>
        </div>
        <nav className="wrap menu__nav" aria-label={CHROME.menu.label}>
          <ol>
            {items.map((n, i) => (
              <li key={n.key}>
                <a href={`/${n.key}`} className="menu__link" aria-current={nav === (n.key || "home") ? "page" : undefined}>
                  <Index n={i + 1} />
                  <span className="menu__word">{n.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="wrap menu__foot">
          <div className="menu__doors">
            <ShopNow page={page} className="btn--sm" />
            <JoinDoor />
          </div>
          <p className="menu__meta">
            <MailTo email={EMAIL.hello} />
            <span className="menu__age">
              <AgeBadge /> {BRAND.adults}
            </span>
          </p>
        </div>
      </div>
    </dialog>
    </template>
  );
}

/**
 * The 18+ question: the first thing a new visitor meets, as a card framed in beadwork over the opening scene (the stage
 * shows behind it, the sun still below the dyke; on "I'm 18 or older" the card leaves, the sun rises into place and the
 * headline lifts from behind the dyke). A modal dialog, so the page behind is inert until it's answered.
 */
function Gate() {
  return (
    <dialog id="gate" className="gate" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-desc">
      <div className="gate__stage">
        <div className="gate__card" data-gate-ask="">
          <Mark className="gate__mark" sails="gust" />
          <Wordmark className="gate__wm" />
          <h2 id="gate-title" className="gate__title">
            {GATE.title}
          </h2>
          <p id="gate-desc" className="gate__body">
            {GATE.body}
          </p>
          <div className="gate__actions">
            <button type="button" className="btn btn--primary" data-age="yes">
              <span className="btn__fill" aria-hidden="true" />
              <span className="btn__label">{GATE.yes}</span>
            </button>
            <button type="button" className="btn btn--ghost" data-age="no">
              <span className="btn__fill" aria-hidden="true" />
              <span className="btn__label">{GATE.no}</span>
            </button>
          </div>
          <p className="gate__fine">
            {GATE.remember} <Rich text={GATE.accept} />
          </p>
        </div>
        <template id="gate-under-t">
        <div className="gate__card gate__under" data-gate-under="">
          <Mark className="gate__mark" />
          <h2 id="gate-under" className="gate__title" tabIndex={-1}>
            {GATE.under.title}
          </h2>
          <p className="gate__body">{GATE.under.body}</p>
          <p className="gate__fine">
            {GATE.under.help}{" "}
            <a className="link" href="https://www.sadag.org" rel="noopener noreferrer">
              {GATE.under.sadag}
            </a>{" "}
            {GATE.under.or}{" "}
            <a className="link" href="https://www.childline.org.za" rel="noopener noreferrer">
              {GATE.under.childline}
            </a>
            .
          </p>
        </div>
        </template>
      </div>
    </dialog>
  );
}

/** Where a page sits: Home › Stores › Hillcrest. Visible in the page's header, and BreadcrumbList data for search. */
export function Crumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  const all = [{ label: CHROME.crumbs.home, path: "/" }, ...crumbs];
  return (
    <nav className="crumbs" aria-label={CHROME.crumbs.label}>
      <ol>
        {all.map((c, i) => (
          <li key={c.path}>
            {i < all.length - 1 ? (
              <a href={c.path} className="crumbs__link">
                {c.label}
              </a>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const breadcrumbLd = (crumbs: readonly Crumb[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: [{ label: CHROME.crumbs.home, path: "/" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: abs(c.path) })),
});

function Footer({ page }: { page: string }) {
  const f = CHROME.footer;
  const c = FACTS.company;
  const details = [c.legalName, c.regNumber && `Reg. ${c.regNumber}`, c.vatNumber && `VAT ${c.vatNumber}`, c.address, c.phone].filter(Boolean);
  return (
    <footer className="ftr">
      <div className="band" aria-hidden="true" />
      <div className="wrap ftr__top">
        <div className="ftr__brand">
          <a href="/" className="ftr__logo" aria-label={CHROME.home}>
            <Mark className="ftr__mark" use />
            <Wordmark />
          </a>
          <p className="ftr__line">
            {f.line[0]} <b>{f.line[1]}</b>
          </p>
        </div>
        <div className="ftr__cols">
          <nav aria-labelledby="ftr-co">
            <h2 id="ftr-co" className="ftr__h">
              {f.cols.company}
            </h2>
            <ul>
              {CHROME.nav.map((n) => (
                <li key={n.key}>
                  <a className="link" href={`/${n.key}`}>
                    {n.label}
                  </a>
                </li>
              ))}
              {(["privacy", "terms", "paia"] as const).map((k) => (
                <li key={k}>
                  <a className="link" href={`/${k}`}>
                    {LEGAL.links[k]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="ftr__h">{f.cols.members}</h2>
            <ul>
              <li>
                <ShopNow page={page} link />
              </li>
              <li>
                <JoinDoor kind="link" />
              </li>
              <li>
                <a className="link" href="/stores">
                  {CHROME.cta.finder}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="ftr__h">{f.cols.contact}</h2>
            <ul className="ftr__mail">
              {(["hello", "franchise", "press", "careers"] as const).map((k) => (
                <li key={k}>
                  <span className="ftr__k">{f.contact[k]}</span>
                  <MailTo email={EMAIL[k]} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="giant" data-sp="enter" aria-hidden="true">
        {["Herbal", "Holland"].map((w, i) => (
          <div key={w} className={cx("giant__row", `giant__row--${i}`)}>
            <span className="giant__o">{w}</span>
            <span className="giant__f">
              <span>{w}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="wrap ftr__legal">
        <p className="ftr__age">
          <AgeBadge />
          <span>{f.age}</span>
        </p>
        <p className="ftr__copy">
          {f.copy.replace("{year}", String(site.year))}
          {details.length ? ` · ${details.join(" · ")}` : ""}. {f.owned}
        </p>
        <a className="link ftr__top-link" href="#top">
          {f.top}
        </a>
      </div>
    </footer>
  );
}

/**
 * A whole page. `page` names the nav item it belongs to ("home", "about", …); `stage` is the landscape's state behind
 * an inner page (the home page's stage moves with the scroll). A `free` page (the legal documents) opens without the
 * 18+ gate: the gate asks visitors to accept them, so they must be readable first. `jsonLd` is one or more schema.org
 * graphs; a page with `meta.crumbs` gets a BreadcrumbList as well.
 */
export function Page({ page, nav = page, meta, stage, jsonLd, free, children }: { page: string; nav?: string; meta: Meta; stage?: StageState; jsonLd?: Record<string, unknown> | Record<string, unknown>[]; free?: boolean; children: React.ReactNode }) {
  const title = meta.absolute ? meta.title : `${meta.title} · ${BRAND.name}`;
  const url = abs(meta.path);
  const img = `${FACTS.origin}/og.png`;
  const graphs = [...(Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []), ...(meta.crumbs ? [breadcrumbLd(meta.crumbs)] : [])];
  return (
    <html lang="en-ZA" dir="ltr" id="top" data-free={free ? "" : undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="description" content={meta.description} />
        {meta.noindex ? <meta name="robots" content="noindex" /> : <link rel="canonical" href={url} />}
        <meta name="theme-color" content="#0c0a09" />
        <meta name="color-scheme" content="dark" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={BRAND.name} />
        <meta property="og:locale" content="en_ZA" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:image" content={img} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={BRAND.og.alt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={meta.description} />
        <meta name="twitter:image" content={img} />
        <meta name="twitter:image:alt" content={BRAND.og.alt} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* The display font (the headline is the largest paint) is preloaded; Inter loads with the text that needs it. */}
        <link rel="preload" href={site.assets.outfit} as="font" type="font/woff2" crossOrigin="" />
        {/* The first screen's CSS, inline (allowed by its hash in the CSP). The head script adds the rest of the
            stylesheet and the page's module once the page has loaded, so nothing competes with the first paint; without
            script, the noscript link loads the stylesheet the plain way. */}
        <style dangerouslySetInnerHTML={{ __html: site.critical }} />
        <script data-boot="" data-css={site.assets.css} data-js={site.assets.js} dangerouslySetInnerHTML={{ __html: site.boot }} />
        <noscript>
          <link rel="stylesheet" href={site.assets.css} />
        </noscript>
        {graphs.map((g, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(g) }} />
        ))}
      </head>
      <body className={`pg pg--${page}`}>
        <a className="skip" href="#main">
          {CHROME.skip}
        </a>
        <Sprite />
        <noscript>
          <p className="nojs-age">
            <AgeBadge /> {GATE.noscript}
          </p>
        </noscript>
        <Header page={page} nav={nav} />
        <main id="main" tabIndex={-1}>
          <Stage state={stage} />
          {children}
        </main>
        <Footer page={page} />
        <Menu page={page} nav={nav} />
        {!free && <Gate />}
      </body>
    </html>
  );
}
