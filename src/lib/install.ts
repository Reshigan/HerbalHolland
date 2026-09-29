// Home-screen install rules for the three installable apps (Rewards, the till, the back office): which platform a
// browser is, whether the app is already installed, and whether an install nudge should show right now. Pure — the
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
  /** Show the nudge — for mode "prompt" only once the browser has fired `beforeinstallprompt`. */
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
