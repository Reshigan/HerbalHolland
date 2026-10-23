// iOS startup (splash) images for the installed Rewards app. iOS picks the image whose media query matches the
// device, so every size we serve is listed here with its CSS size and pixel ratio; /pwa-splash/[size] renders only
// these (an allowlist, so the route can't be asked for arbitrary bitmaps).
export type SplashSize = { w: number; h: number; dpr: number };

export const SPLASH_SIZES: SplashSize[] = [
  { w: 440, h: 956, dpr: 3 }, // iPhone 16 Pro Max
  { w: 402, h: 874, dpr: 3 }, // iPhone 16 Pro
  { w: 430, h: 932, dpr: 3 }, // iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { w: 393, h: 852, dpr: 3 }, // iPhone 14 Pro, 15/15 Pro, 16
  { w: 390, h: 844, dpr: 3 }, // iPhone 12/13/14
  { w: 375, h: 812, dpr: 3 }, // iPhone X/XS/11 Pro/12 mini/13 mini
  { w: 414, h: 896, dpr: 3 }, // iPhone XS Max/11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // iPhone XR/11
  { w: 375, h: 667, dpr: 2 }, // iPhone SE (2nd/3rd gen), 6/7/8
];

/** The path segment: the bitmap size in pixels, e.g. "1179x2556". */
export const splashKey = (s: SplashSize) => `${s.w * s.dpr}x${s.h * s.dpr}`;

export const splashMedia = (s: SplashSize) =>
  `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`;

export const splashFor = (key: string) => SPLASH_SIZES.find((s) => splashKey(s) === key) ?? null;

/** The `<link rel="apple-touch-startup-image">` entries for Next's `appleWebApp.startupImage`. */
export const splashStartupImages = () => SPLASH_SIZES.map((s) => ({ url: `/pwa-splash/${splashKey(s)}`, media: splashMedia(s) }));
