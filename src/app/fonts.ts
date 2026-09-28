// Brand fonts, self-hosted through next/font: the latin variable files from @fontsource-variable, with metric-matched
// fallbacks so text keeps its size while they load (no layout shift). They aren't preloaded: text paints in the
// fallback first and the ~80 KB of fonts don't compete with the page for a slow connection's bandwidth.
// globals.css maps them to --font-display (Outfit) and --font-sans (Inter).
import localFont from "next/font/local";

export const outfit = localFont({
  src: "../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  variable: "--font-outfit",
});

export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  variable: "--font-inter",
});
