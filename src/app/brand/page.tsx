// Herbal Holland brand book: internal reference for the team, franchisees and agencies.
import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { Lockup, Logo, Mark, Wordmark } from "@/components/brand/logo";
import { ProductArt } from "@/components/product/art";
import { MerchArt } from "@/components/merch/mockup";
import { ART, Artwork, INKS } from "@/components/merch/art";
import { MERCH } from "@/lib/merch";
import { ShopSurface } from "@/components/shop/chrome";
import { buttonClass } from "@/components/ui/button";
import { Tag } from "@/components/shop/ui";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Brand book", robots: { index: false, follow: false } };

const SUNSET = [
  ["50", "#fff5ec"], ["100", "#ffe6d1"], ["200", "#fdcba1"], ["300", "#f9ae6d"], ["400", "#f79f52"],
  ["500", "#f5913c"], ["600", "#e27623"], ["700", "#c05f18"], ["800", "#974a15"], ["900", "#6e3712"],
] as const;
const INK = [
  ["50", "#fbf7f3"], ["100", "#f4eee8"], ["150", "#ece5dd"], ["200", "#ddd5cc"], ["300", "#bdb3a9"], ["400", "#968a80"], ["500", "#6b5f57"],
  ["600", "#4a403a"], ["700", "#2f2824"], ["800", "#211c19"], ["850", "#1a1614"], ["900", "#141110"], ["950", "#0c0a09"],
] as const;
const SUPPORT = [
  ["Leaf 500", "#2f9e4f", "Success, in stock, PASS"],
  ["Amber 500", "#e8a10c", "Warnings, low stock, on hold"],
  ["Rose 500", "#d03b3b", "Errors, recalls, destructive"],
  ["Sky 500", "#2a78d6", "Information, demo notices"],
] as const;

// WCAG relative luminance and contrast ratio, to document the pairs we rely on.
function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
// Label colour for a swatch: whichever of ink or cream reads better on it.
const onSwatch = (hex: string) => (ratio("#0c0a09", hex) >= ratio("#fbf7f3", hex) ? "#0c0a09" : "#fbf7f3");
const PAIRS: [string, string, string, string][] = [
  ["Sunset 500 on Ink 950", "#f5913c", "#0c0a09", "Headlines, links, the Mark"],
  ["Ink 950 on Sunset 500", "#0c0a09", "#f5913c", "Primary buttons, announcement bar"],
  ["Ink 100 on Ink 950", "#f4eee8", "#0c0a09", "Body copy on dark"],
  ["Ink 400 on Ink 950", "#968a80", "#0c0a09", "Secondary copy on dark"],
  ["Ink 850 on Ink 50", "#1a1614", "#fbf7f3", "Body copy on light (back office, invoices)"],
  ["Sunset 800 on Ink 50", "#974a15", "#fbf7f3", "Small orange text on light surfaces"],
  ["Sunset 700 on Ink 50", "#c05f18", "#fbf7f3", "Large headings and icons on light only"],
];

const NAV = [
  ["logo", "Logo"],
  ["colour", "Colour"],
  ["type", "Typography"],
  ["shape", "Shape & components"],
  ["art", "Product art"],
  ["voice", "Voice & tone"],
  ["misuse", "Do & don't"],
  ["merch", "Merch"],
];

function Section({ id, n, title, intro, children, light }: { id: string; n: string; title: string; intro: string; children: React.ReactNode; light?: boolean }) {
  return (
    <section id={id} className={cn("scroll-mt-6 border-t py-20", light ? "border-ink-150 bg-ink-50 text-ink-850" : "border-ink-850 bg-ink-950 text-ink-100")}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className={cn("tnum font-display text-sm font-semibold", light ? "text-brand-800" : "text-brand-500")}>{n}</div>
          <div>
            <h2 className={cn("font-display text-4xl font-semibold tracking-tight", light ? "text-ink-950" : "text-white")}>{title}</h2>
            <p className={cn("mt-3 max-w-2xl text-[1.02rem] leading-relaxed", light ? "text-ink-600" : "text-ink-300")}>{intro}</p>
          </div>
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", ok ? "bg-leaf-500 text-ink-950" : "bg-rose-500 text-white")}>{ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}</span>
      <span>{children}</span>
    </li>
  );
}

export default function BrandBook() {
  return (
    <main className="min-h-dvh bg-ink-950 text-ink-100">
      <ShopSurface />
      {/* Cover */}
      <header className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:py-24">
        <div>
          <div className="eyebrow text-brand-500">Brand book · v1.0 · 2026</div>
          <h1 className="mt-4 font-display text-6xl font-semibold leading-[0.95] tracking-tight text-white sm:text-7xl">Herbal Holland</h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-300">
            Dutch heritage. African soil. How the windmill flower looks, sounds and behaves — on shopfronts, packs, screens and in every message we send.
          </p>
          <nav className="mt-10 flex flex-wrap gap-2" aria-label="Sections">
            {NAV.map(([id, label], i) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-ink-700 px-3.5 py-1.5 text-sm text-ink-200 hover:border-brand-500 hover:text-white">
                <span className="tnum mr-1.5 text-ink-500">0{i + 1}</span>
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="hh-frame mx-auto flex aspect-[4/5] w-full max-w-md items-center justify-center p-10 shadow-glow">
          <Lockup spin className="h-full w-full justify-center text-[2.4rem] sm:text-[3rem] [&>svg]:h-[54%]" />
        </div>
      </header>

      <Section id="logo" n="01" title="Logo" intro="A four-petal windmill flower on a tower, inside an open ring: Holland's windmill and the herb in one line drawing. It always draws in a single colour — Sunset orange on black, or black on Sunset orange.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <figure className="rounded-3xl bg-ink-900 p-8">
            <div className="hh-frame flex aspect-[4/5] items-center justify-center p-6">
              <Lockup className="h-full w-full justify-center text-[1.6rem] [&>svg]:h-[54%]" />
            </div>
            <figcaption className="mt-4 text-sm text-ink-300">
              <strong className="text-white">Poster lock-up.</strong> Shopfront windows, packaging, hero moments — always inside the window-poster frame.
            </figcaption>
          </figure>
          <figure className="flex flex-col rounded-3xl bg-ink-900 p-8">
            <div className="flex flex-1 flex-col justify-center gap-6">
              <div className="rounded-2xl bg-ink-950 p-6">
                <Logo markClassName="h-12 w-12" />
              </div>
              <div className="rounded-2xl bg-brand-500 p-6 text-ink-950">
                <span className="inline-flex items-center gap-2.5">
                  <Mark className="h-12 w-12" />
                  <Wordmark className="text-[0.95rem]" />
                </span>
              </div>
            </div>
            <figcaption className="mt-4 text-sm text-ink-300">
              <strong className="text-white">Horizontal lock-up.</strong> Headers, receipts, emails. Minimum width 120 px on screen, 30 mm in print.
            </figcaption>
          </figure>
          <figure className="flex flex-col rounded-3xl bg-ink-900 p-8">
            <div className="flex flex-1 items-center justify-center">
              <div className="flex items-end gap-5 text-brand-500">
                <Mark className="h-28 w-28" />
                <Mark className="h-16 w-16" />
                <Mark className="h-10 w-10" detail={false} />
                <Mark className="h-6 w-6" detail={false} />
              </div>
            </div>
            <figcaption className="mt-6 text-sm text-ink-300">
              <strong className="text-white">The Mark.</strong> App icons, favicons, the till. Below 40 px, drop the inner tower line. Never smaller than 16 px.
            </figcaption>
          </figure>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <figure className="rounded-3xl bg-ink-900 p-8">
            <div className="relative mx-auto aspect-square w-56">
              <div className="absolute inset-0 rounded-xl border-2 border-dashed border-brand-500/50" />
              <div className="absolute inset-[18%] grid place-items-center rounded-lg bg-ink-950 ring-1 ring-ink-700">
                <Mark className="h-full w-full p-2 text-brand-500" />
              </div>
              <span className="absolute left-1/2 top-[4%] -translate-x-1/2 font-mono text-xs text-brand-400">x</span>
              <span className="absolute bottom-[4%] left-1/2 -translate-x-1/2 font-mono text-xs text-brand-400">x</span>
              <span className="absolute left-[4%] top-1/2 -translate-y-1/2 font-mono text-xs text-brand-400">x</span>
              <span className="absolute right-[4%] top-1/2 -translate-y-1/2 font-mono text-xs text-brand-400">x</span>
            </div>
            <figcaption className="mt-6 text-sm text-ink-300">
              <strong className="text-white">Clear space.</strong> Keep a margin of <em>x</em> — the length of one windmill petal — on every side. Nothing else enters that space.
            </figcaption>
          </figure>
          <div className="rounded-3xl bg-ink-900 p-8 text-sm leading-relaxed text-ink-300">
            <h3 className="font-display text-lg font-semibold text-white">Construction</h3>
            <ul className="mt-4 space-y-2.5">
              <li>• One stroke weight for the ring and tower; petals a touch finer; the hub is a ring with a dot.</li>
              <li>• The ring opens at the bottom where the tower stands — never close it.</li>
              <li>• The petals may turn (slowly) in motion: 14 seconds a revolution, and never when a visitor has asked for reduced motion.</li>
              <li>• The wordmark is set in Outfit: HERBAL light with wide tracking over HOLLAND extra-bold.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section id="colour" n="02" title="Colour" intro="Sunset orange on warm black — lifted straight from the store window. Everything else is there to support those two. Cream (Ink 50) is for light working surfaces such as the back office and invoices." light>
        <div className="space-y-10">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-950">Sunset — primary</h3>
            <ol className="mt-4 grid grid-cols-5 overflow-hidden rounded-2xl ring-1 ring-ink-150 sm:grid-cols-10">
              {SUNSET.map(([k, hex]) => (
                <li key={k} className="flex h-28 flex-col justify-end p-2.5 text-[0.7rem] font-semibold" style={{ background: hex, color: onSwatch(hex) }}>
                  <span className={k === "500" ? "font-bold" : undefined}>{k}</span>
                  <span className="font-mono opacity-80">{hex.toUpperCase()}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-ink-600">Sunset 500 is the brand colour. On light backgrounds, use 700 for large headings and icons and 800 for small text.</p>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-950">Ink — warm neutrals</h3>
            <ol className="mt-4 grid grid-cols-5 overflow-hidden rounded-2xl ring-1 ring-ink-150 sm:grid-cols-[repeat(13,minmax(0,1fr))]">
              {INK.map(([k, hex]) => (
                <li key={k} className="flex h-28 flex-col justify-end p-2.5 text-[0.7rem] font-semibold" style={{ background: hex, color: onSwatch(hex) }}>
                  <span>{k}</span>
                  <span className="font-mono opacity-80">{hex.toUpperCase()}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-950">Status colours</h3>
              <ul className="mt-4 space-y-2">
                {SUPPORT.map(([name, hex, use]) => (
                  <li key={name} className="flex items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-ink-150">
                    <span className="h-10 w-10 shrink-0 rounded-xl" style={{ background: hex }} />
                    <span className="text-sm">
                      <span className="font-semibold text-ink-950">{name}</span> <span className="font-mono text-xs text-ink-500">{hex.toUpperCase()}</span>
                      <span className="block text-ink-600">{use}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-600">Status colour is never the only signal — always pair it with a word or an icon.</p>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-950">Contrast pairs we rely on</h3>
              <ul className="mt-4 space-y-2">
                {PAIRS.map(([name, fg, bg, use]) => {
                  const r = ratio(fg, bg);
                  return (
                    <li key={name} className="flex items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-ink-150">
                      <span className="grid h-10 w-14 shrink-0 place-items-center rounded-xl font-display text-lg font-bold" style={{ background: bg, color: fg }}>
                        Aa
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold text-ink-950">{name}</span>
                        <span className="block truncate text-ink-600">{use}</span>
                      </span>
                      <span className={cn("tnum shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", r >= 4.5 ? "bg-leaf-50 text-leaf-700" : "bg-amber-50 text-amber-700")}>
                        {r.toFixed(1)}:1 {r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "large"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section id="type" n="03" title="Typography" intro="Outfit for display — geometric and warm, it echoes the wordmark. Inter for everything you read or tap, with tabular figures wherever numbers line up.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-ink-900 p-8">
            <div className="eyebrow text-brand-500">Outfit · display</div>
            <p className="mt-6 font-display text-7xl font-semibold leading-[0.95] tracking-tight text-white">Dutch heritage.</p>
            <dl className="mt-8 space-y-4">
              {[
                ["Display", "72 / 0.95 · semibold", "text-5xl font-semibold"],
                ["Heading 1", "48 / 1.05 · semibold", "text-4xl font-semibold"],
                ["Heading 2", "30 / 1.2 · semibold", "text-2xl font-semibold"],
                ["Wordmark", "light + extra-bold", "text-xl font-light uppercase tracking-[0.14em]"],
              ].map(([k, spec, cls]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-t border-ink-800 pt-4">
                  <dt className={cn("font-display text-white", cls)}>{k}</dt>
                  <dd className="shrink-0 font-mono text-xs text-ink-400">{spec}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-3xl bg-ink-900 p-8">
            <div className="eyebrow text-brand-500">Inter · interface</div>
            <p className="mt-6 text-lg leading-relaxed text-ink-200">Every batch is lab-tested and traceable to the farm. Scan the QR code on your pack to see its certificate.</p>
            <dl className="mt-8 space-y-4">
              {[
                ["Body", "16 / 1.7 · regular", "text-base"],
                ["UI", "14 / 1.5 · medium", "text-sm font-medium"],
                ["Caption", "12 / 1.5 · regular", "text-xs"],
              ].map(([k, spec, cls]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-t border-ink-800 pt-4">
                  <dt className={cn("text-white", cls)}>{k}</dt>
                  <dd className="shrink-0 font-mono text-xs text-ink-400">{spec}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t border-ink-800 pt-4">
                <dt className="eyebrow text-brand-500">Overline</dt>
                <dd className="shrink-0 font-mono text-xs text-ink-400">11 · caps · 0.18em</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-ink-800 pt-4">
                <dt className="tnum text-white">R1,234.50 · R99.00 · 1,250 pts</dt>
                <dd className="shrink-0 font-mono text-xs text-ink-400">tabular figures</dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      <Section id="shape" n="04" title="Shape & components" intro="Soft, confident geometry. Cards are generously rounded, buttons are pills, inputs sit in between. The window-poster frame is reserved for hero and brand moments — use it sparingly so it keeps its power." light>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl bg-ink-950 p-8">
            <div className="flex flex-wrap gap-3">
              <span className={buttonClass("primary", "lg")}>Primary</span>
              <span className={buttonClass("outline-dark", "lg")}>Secondary</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Tag tone="solid">15% off</Tag>
              <Tag tone="orange">Heritage</Tag>
              <Tag tone="green">In stock</Tag>
              <Tag tone="amber">Low stock</Tag>
              <Tag tone="red">Recalled</Tag>
            </div>
            <p className="mt-6 text-sm text-ink-300">Buttons: pill, 44 px minimum touch target. One primary action per view.</p>
          </div>
          <div className="rounded-3xl bg-ink-950 p-8">
            <div className="rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
              <div className="eyebrow text-[0.62rem] text-ink-400">Card · 20 px radius</div>
              <div className="mt-2 font-display text-lg font-semibold text-white">Calm CBD Oil 600mg</div>
              <div className="mt-3 h-11 rounded-xl border border-ink-700 bg-ink-900 px-3.5 text-sm leading-[2.75rem] text-ink-500">Input · 14 px radius</div>
            </div>
            <p className="mt-6 text-sm text-ink-300">Surfaces step from Ink 950 to 900; borders in Ink 800. No drop shadows on dark — use borders and glow.</p>
          </div>
          <div className="rounded-3xl bg-ink-950 p-8">
            <div className="hh-frame flex aspect-[5/4] items-center justify-center">
              <Mark className="h-24 w-24 text-brand-500" spin />
            </div>
            <p className="mt-6 text-sm text-ink-300">The window-poster frame: a thick Sunset border around black, like the shopfront. Heroes, the age gate, cards for the TV menu.</p>
          </div>
        </div>
      </Section>

      <Section id="art" n="05" title="Product art" intro="We don't use stock photography or pictures of the plant. Every product gets generated artwork built from the windmill petals, coloured by family and unique to its name.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Sativa", "THC", "SATIVA"],
            ["Indica", "THC", "INDICA"],
            ["Hybrid", "THC", "HYBRID"],
            ["CBD", "CBD", "CBD"],
            ["CBD food & drink", "CBD_FOOD", null],
            ["CBD skin care", "CBD_TOPICAL", null],
            ["Supplements", "SUPPLEMENT", null],
            ["Hemp", "HEMP", null],
            ["Accessories", "ACCESSORY", null],
            ["Apparel", "APPAREL", null],
            ["Grow", "GROW", null],
          ].map(([label, reg, strain]) => (
            <figure key={label}>
              <ProductArt slug={`brand-${label}`} regClass={reg as string} strain={strain} label={`${label} artwork`} className="aspect-square w-full rounded-2xl" />
              <figcaption className="mt-2 text-sm font-medium text-ink-200">{label}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section id="voice" n="06" title="Voice & tone" intro="Warm, plain English, confident. We sound like a knowledgeable friend behind the counter — never a salesperson, never a stoner cliché, never a doctor." light>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Warm", "Welcome people in. Thank them. Use their name when we know it."],
            ["Plain", "Short sentences, everyday words. Say what happens next."],
            ["Confident", "Know the product and the rules — and say so without hype."],
            ["Responsible", "Adults 18+, every time. Facts over claims. No glamorising."],
          ].map(([k, v]) => (
            <div key={k} className="rounded-3xl bg-white p-6 ring-1 ring-ink-150">
              <h3 className="font-display text-xl font-semibold text-ink-950">{k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-ink-150">
            <h3 className="font-display text-lg font-semibold text-ink-950">Say this</h3>
            <ul className="mt-4 space-y-3 text-sm text-ink-700">
              <Rule ok>“Supports everyday calm.” (an approved Schedule 0 claim)</Rule>
              <Rule ok>“For adults 18 and older. Keep out of reach of children.”</Rule>
              <Rule ok>“Your order is ready at Hatfield — bring your ID.”</Rule>
              <Rule ok>“Herbal Holland Rewards” · “points” · “1,250 pts”</Rule>
              <Rule ok>“Lab-tested and traceable to the farm.”</Rule>
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-6 ring-1 ring-ink-150">
            <h3 className="font-display text-lg font-semibold text-ink-950">Not this</h3>
            <ul className="mt-4 space-y-3 text-sm text-ink-700">
              <Rule ok={false}>Any claim to treat, cure or prevent a condition — or naming one.</Rule>
              <Rule ok={false}>Slang that glamorises getting high, or copy that could appeal to under-18s.</Rule>
              <Rule ok={false}>Promotions, member prices or points on medicines: licensed products, and CBD supplements (oils, softgels) until counsel clears them.</Rule>
              <Rule ok={false}>Food and supplement health claims: “boosts”, “detox”, “fat-burning”, “anti-ageing”, “immunity”, “weight loss”.</Rule>
              <Rule ok={false}>“Guaranteed”, “100% safe”, “miracle”, “clinically proven”.</Rule>
              <Rule ok={false}>Retired names: the old loyalty and product names, or royal Dutch references.</Rule>
            </ul>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-600">
          All marketing copy runs through the platform&apos;s copy screen before it can be sent, and CBD products may only use claims from their approved list. When in doubt, describe the product — origin, aroma, format, how it&apos;s made — rather than what it does to you.
        </p>
      </Section>

      <Section id="misuse" n="07" title="Do & don't" intro="The Mark only works when it's left alone: one colour, full clear space, upright. These are the right ways to use it, and the mistakes we see most.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ["Sunset on black", "bg-ink-950 text-brand-500", false],
            ["Black on Sunset", "bg-brand-500 text-ink-950", false],
            ["Inside the window-poster frame", "text-brand-500", true],
          ].map(([label, tile, frame]) => (
            <figure key={label as string} className="rounded-3xl bg-ink-900 p-5">
              <div className={cn("relative grid aspect-[16/9] place-items-center overflow-hidden rounded-2xl", frame ? "bg-ink-950" : (tile as string))}>
                {frame ? (
                  <div className="hh-frame grid h-[78%] aspect-[4/5] place-items-center border-[6px] sm:border-[6px]">
                    <Mark className="h-[55%] w-[55%] text-brand-500" />
                  </div>
                ) : (
                  <Mark className="h-20 w-20" />
                )}
                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-leaf-500 text-ink-950">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </div>
              <figcaption className="mt-3 text-sm font-medium text-ink-200">Do: {label as string}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Don't stretch or squash it", "scale-x-150", ""],
            ["Don't recolour it", "text-sky-500", ""],
            ["Don't rotate it", "-rotate-12", ""],
            ["Don't add glows or blur", "drop-shadow-[0_0_12px_rgb(245_145_60)] blur-[0.6px]", ""],
            ["Don't put it on busy backgrounds", "", "bg-[repeating-linear-gradient(45deg,#2f9e4f_0_10px,#e8a10c_10px_20px)]"],
            ["Don't box it in or crowd it", "outline outline-8 outline-offset-0 outline-ink-600", ""],
          ].map(([label, markCls, tileCls]) => (
            <figure key={label} className="rounded-3xl bg-ink-900 p-5">
              <div className={cn("relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-ink-950", tileCls)}>
                <Mark className={cn("h-16 w-16 text-brand-500", markCls)} />
                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white">
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </div>
              <figcaption className="mt-3 text-sm font-medium text-ink-200">{label}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-400">Questions about the brand? Ask the HQ marketing team before anything goes to print.</p>
      </Section>

      <Section
        id="merch"
        n="08"
        title="Merch"
        intro="Made to order in South Africa, one at a time — no stock and no minimums. Upmarket by design: every logo is embroidered, and only the big back graphics and the tote are printed (DTF). Each design is a single colour: Sunset on black garments, black on the Sunset hoodie. The files below are what our partner works from."
        light
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MERCH.map((m) => {
            const sides = (["front", "back"] as const).filter((side) => side === m.hero || m.prints.some((p) => p.side === side));
            return (
              <article key={m.slug} className="flex flex-col rounded-3xl border border-ink-150 bg-white p-4 shadow-card">
                <div className="grid grid-cols-2 gap-2">
                  {sides.map((side) => (
                    <MerchArt key={side} slug={m.slug} side={side} label={`${m.name}, ${side}`} className="aspect-square w-full rounded-2xl" />
                  ))}
                  {sides.length === 1 && (
                    // One-sided pieces: show the print file itself, on the garment colour.
                    <div className="grid aspect-square place-items-center rounded-2xl p-5" style={{ background: m.colour === "black" ? INKS.black : INKS.sunset }}>
                      <Artwork art={m.prints[0].art} className="max-h-full w-full" />
                    </div>
                  )}
                </div>
                <h3 className="mt-4 flex flex-wrap items-center gap-2 font-display text-lg font-semibold text-ink-950">
                  {m.name}
                  {m.pending && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-sans text-[0.7rem] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Held back</span>}
                </h3>
                <p className="text-sm text-ink-500">{m.blank}</p>
                {m.pending && <p className="mt-1 text-xs text-amber-800">{m.pending}.</p>}
                <ul className="mt-3 flex-1 space-y-2.5 text-sm">
                  {m.prints.map((p) => {
                    const a = ART[p.art];
                    const stitched = p.technique === "Embroidery";
                    return (
                      <li key={p.art} className="rounded-xl bg-ink-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize text-ink-850">
                            {p.side} · {p.technique}
                          </span>
                          <span className="tnum text-xs text-ink-500">
                            {a.w} × {a.h} mm
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ink-600">
                          {p.where}. {a.note}. {stitched ? "Thread" : "Ink"}: {a.ink === "sunset" ? "Sunset 500" : "Black"} <span className="tnum">{INKS[a.ink].toUpperCase()}</span>.
                        </p>
                        <div className="mt-2 flex gap-3 text-xs font-semibold">
                          <a href={`/merch/print/${p.art}.pdf`} download className="text-brand-800 hover:underline">
                            {stitched ? "PDF for digitising" : "PDF master"}
                          </a>
                          <a href={`/merch/print/${p.art}.svg`} download className="text-brand-800 hover:underline">
                            SVG
                          </a>
                          <a href={`/merch/print/${p.art}.png`} download className="text-brand-800 hover:underline">
                            PNG · 300 dpi
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 text-sm leading-relaxed text-ink-700 shadow-card">
            <h3 className="font-display text-lg font-semibold text-ink-950">Print rules</h3>
            <ul className="mt-4 space-y-2.5">
              <Rule ok>Two garment colours only: black, and the orange closest to Sunset 500. Thread and ink are always the other colour.</Rule>
              <Rule ok>Embroidery is digitised once per design from the vector PDF, at the size shown: satin stitch, no fill patterns, no outlines.</Rule>
              <Rule ok>Stitched logos use the heavy cut of the Mark (thicker lines, a solid hub) and lettering 7 mm or taller.</Rule>
              <Rule ok>Prints (DTF) come from the vector PDF or the 300 dpi PNG at 100%; keep every placement within ±5 mm, centred on the garment.</Rule>
              <Rule ok>Approve a sample of each piece before it goes on sale, and again whenever the blank, thread or ink changes.</Rule>
              <Rule ok={false}>No other colours, gradients, distressing or effects on the Mark; no cannabis leaves, slogans or claims.</Rule>
              <Rule ok={false}>Don&apos;t scale a design to fill a bigger area — the sizes are set to the garment.</Rule>
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-6 text-sm leading-relaxed text-ink-700 shadow-card">
            <h3 className="font-display text-lg font-semibold text-ink-950">Thread &amp; ink</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["sunset", "black"] as const).map((k) => (
                <div key={k} className="overflow-hidden rounded-2xl ring-1 ring-ink-150">
                  <div className="h-20" style={{ background: INKS[k] }} />
                  <div className="p-3">
                    <div className="font-medium text-ink-950">{k === "sunset" ? "Sunset 500" : "Black"}</div>
                    <div className="tnum text-xs text-ink-500">{INKS[k].toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-500">Thread is matched to the closest shade on the partner&apos;s thread card (Madeira or Isacord), ink to the hex on a printed sample, and the hoodie blank to their closest orange. When in doubt, the sample wins.</p>
          </div>
        </div>
      </Section>
    </main>
  );
}
