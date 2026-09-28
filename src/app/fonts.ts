// Brand fonts, self-hosted through next/font: the latin variable files from @fontsource-variable, preloaded (so on a
// decent connection text paints in the real font straight away) with metric-matched fallbacks for when it can't
// (no layout shift on the swap). globals.css maps them to --font-display (Outfit) and --font-sans (Inter).
import localFont from "next/font/local";

export const outfit = localFont({
  src: "../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-outfit",
});

export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});
