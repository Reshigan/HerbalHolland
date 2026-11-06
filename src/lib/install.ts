// Home-screen install rules for the three installable apps (Rewards, the till, the back office): which platform a
// browser is, whether the app is already installed, and whether an install nudge should show right now. Pure: the
// component (`@/components/ui/install-prompt`) supplies the user agent, display mode and the remembered dismissal.

export type InstallApp = "rewards" | "till" | "staff";
export type InstallPlatform = "android" | "ios" | "desktop" | "other";
/** How the app installs here: the browser's own prompt (Chrome, Edge, Samsung Internet), the two-step iOS Safari route, or not at all. */
export type InstallMode = "prompt" | "ios-steps" | "none";
/** "dismissed" is the X on a banner (30 days); "later" is "Not now" on the till (1 day). */
export type DismissKind = "dismissed" | "later";
export type Dismissal = { at: number; kind: DismissKind };

export type InstallState = {
  platform: InstallPlatform;
  installed: boolean;
  /** Show the nudge (for mode "prompt", only once the browser has fired `beforeinstallprompt`). */
  show: boolean;
  mode: InstallMode;
};

export const DAY_MS = 86_400_000;
export const DISMISS_DAYS: Record<DismissKind, number> = { dismissed: 30, later: 1 };

// Browsers on iOS other than Safari use WebKit too, but "Add to Home Screen" lives in Safari's share sheet.
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|YaBrowser|Brave\//i;
// In-app browsers (Facebook, Instagram, WhatsApp, LinkedIn, TikTok, the Google app, Android WebViews…) can't install
// anything: no `beforeinstallprompt`, no share sheet with "Add to Home Screen".
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Line\/|LinkedInApp|Snapchat|TikTok|BytedanceWebview|musical_ly|Twitter|GSA\/|; ?wv\)|Version\/[\d.]+ Chrome\/[\d.]+ Mobile/i;

/** Classifies a user agent. `touchPoints` (navigator.maxTouchPoints) tells an iPad with a desktop UA from a Mac. */
export function detectPlatform(ua: string, touchPoints = 0): { platform: InstallPlatform; inApp: boolean; iosSafari: boolean } {
  const s = ua ?? "";
  const inApp = IN_APP.test(s);
  if (/iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && touchPoints > 1)) {
    // Safari proper carries "Safari/" without another browser's token; WebViews leave "Safari/" out.
    const iosSafari = !inApp && /Safari\//.test(s) && !IOS_OTHER_BROWSER.test(s);
    return { platform: "ios", inApp, iosSafari };
  }
  if (/Android/.test(s)) return { platform: "android", inApp, iosSafari: false };
  if (/Windows NT|Macintosh|X11|Linux|CrOS/.test(s) && !/Mobile|Tablet/.test(s)) return { platform: "desktop", inApp, iosSafari: false };
  return { platform: "other", inApp, iosSafari: false };
}

/**
 * Where this browser can't install but the phone's own browser can (an in-app browser, or iOS outside Safari): the
 * hand-off. Android gets an intent link that reopens the page in Chrome (falling back to the page itself); iOS can only
 * be told to open it in Safari. Null where the normal nudge applies, or where no hand-off helps (desktop).
 */
export function browserHandoff(ua: string, url: string, touchPoints = 0): { platform: "android"; href: string } | { platform: "ios" } | null {
  const { platform, inApp, iosSafari } = detectPlatform(ua, touchPoints);
  if (platform === "ios") return iosSafari ? null : { platform: "ios" };
  if (platform !== "android" || !inApp) return null;
  const u = new URL(url);
  return { platform: "android", href: `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end` };
}

/** When a remembered dismissal stops hiding the nudge (0 when nothing was dismissed). */
export function dismissedUntil(dismissedAt: number | null | undefined, kind: DismissKind = "dismissed"): number {
  if (!dismissedAt || !Number.isFinite(dismissedAt)) return 0;
  return dismissedAt + DISMISS_DAYS[kind] * DAY_MS;
}

export function installState({
  ua,
  standalone,
  touchPoints = 0,
  dismissedAt = null,
  dismissKind = "dismissed",
  seenAt = null,
  now = Date.now(),
}: {
  ua: string;
  /** `display-mode: standalone` (or fullscreen) matches, or `navigator.standalone` on iOS. */
  standalone: boolean;
  touchPoints?: number;
  dismissedAt?: number | null;
  dismissKind?: DismissKind;
  /** For a nudge that shows only once (the shop home): when it was last shown. */
  seenAt?: number | null;
  now?: number;
}): InstallState {
  const { platform, inApp, iosSafari } = detectPlatform(ua, touchPoints);
  if (standalone) return { platform, installed: true, show: false, mode: "none" };
  const mode: InstallMode = inApp ? "none" : platform === "ios" ? (iosSafari ? "ios-steps" : "none") : "prompt";
  const hidden = mode === "none" || now < dismissedUntil(dismissedAt, dismissKind) || !!seenAt;
  return { platform, installed: false, show: !hidden, mode };
}

/** localStorage keys, per app: the dismissal, and the "shown once" marker. */
export const installKey = (app: InstallApp, part: "dismissed" | "seen" = "dismissed") => `hh-install:${app}:${part}`;

/** Reads a stored dismissal; anything malformed counts as none. */
export function parseDismissal(raw: string | null | undefined): Dismissal | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Dismissal> | null;
    if (!v || typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    return { at: v.at, kind: v.kind === "later" ? "later" : "dismissed" };
  } catch {
    return null;
  }
}

/** Herbal Holland sells only in the installed app and on the till, so with APP_ONLY=true a browser is turned away from everything else. */
export const appOnly = () => process.env.APP_ONLY === "true";

// What a browser may still open when the shop is app only. Anything not listed is closed, so a new route fails closed.
const OPEN_IN_BROWSER = [
  // How people reach the app, and what must never sit behind it: bio link and sign-up, the install page, legal pages,
  // batch certificates (printed QR codes), order pages (card payments return there in the browser), partner brands (a
  // member who joined in a browser lands there after ticking a share), shared Rewards cards, support and unsubscribe.
  "/go", "/app", "/club/join", "/club/partners", "/legal", "/batch", "/orders", "/s", "/support", "/unsubscribe",
  // The till and the back office, which sign in on their own.
  "/pos", "/hq", "/store", "/staff", "/books", "/insights", "/account", "/login", "/logout", "/invoice", "/labels", "/media", "/social", "/menu",
  // Images and icons, including the ones the install page itself shows.
  "/brand", "/pwa-icon", "/pwa-splash", "/apple-icon", "/icon",
];
// Trade buyers order in the app like everyone else; only the pages that explain and start an account stay open.
const OPEN_TRADE = ["/trade", "/trade/apply", "/trade/terms", "/trade/login"];

export const appOnlyOpen = (pathname: string) => OPEN_TRADE.includes(pathname) || OPEN_IN_BROWSER.some((p) => pathname === p || pathname.startsWith(`${p}/`));
