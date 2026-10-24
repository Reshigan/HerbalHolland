// Every word on herbalholland.com, in one place. The static site (./build.ts) renders its pages from here,
// and tests/site-copy.test.ts runs every string through screenCopy() (no allow-list) and our voice rules, so edit copy
// here and keep that test green. `{name}` placeholders are filled at build time from ./facts by `fill`.
// What .com may say (docs/MARKETING-PLAN.md §1, docs/COMPLIANCE.md): brand, standards, the categories we sell (never
// products), stores, press and careers, and the way into the online shop. No product names, prices, amounts,
// deals or health claims; licensed medicines only as a pharmacist service for registered patients; facts only from
// ./facts (no invented numbers, founders, partners, awards or dates).
// In running text, {email}, {privacy}, {terms}, {press} and {regulator} become links (see Rich in ./src/ui).
// Every page's `meta.updated` (YYYY-MM-DD) is the day its copy last changed: set it by hand when you edit a page's words.
// It becomes the sitemap's lastmod, and the build refuses a date in the future.
import { num } from "@/lib/format";
import { FACTS } from "./facts";

export type Item = { key: string; title: string; body: string };
/** A press release: its own page at /press/{slug} from its date (YYYY-MM-DD, SAST). `pageTitle` is the browser/search title (60 characters with the brand); the headline stays whole. */
export type Release = { slug: string; date: string; title: string; pageTitle: string; description: string; summary: string; body: readonly string[] };
/** A release as written: `date: null` holds it back (a draft) until the day it goes out is known. Never guess a date. */
export type ReleaseDraft = Omit<Release, "date"> & { date: string | null };
/** A page's title (the build checks it's 60 characters or fewer with " · Herbal Holland"), its description (120–160) and the day its copy last changed. */
export type PageMeta = { title: string; description: string; updated: string };

/** Fills `{name}` placeholders with live values; unknown names are left as they are. */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** "1 store trading" / "12 stores trading": picks the form and fills `{n}`. */
export const plural = (n: number, [one, other]: readonly [string, string]) => fill(n === 1 ? one : other, { n: num(n) });

export const EMAIL = FACTS.email;

export const BRAND = {
  name: "Herbal Holland",
  line: "Dutch heritage. African soil.",
  lines: ["Dutch heritage.", "African soil."],
  idea: "Holland, meet South Africa.",
  adults: "Adults 18+",
  // Share image (og.png).
  og: { alt: "Herbal Holland: Dutch heritage. African soil.", sub: "Our story · Stores · Press · Careers", age: "Adults 18+ only" },
} as const;

// ── The 18+ gate: the first scene ────────────────────────────────────────────
export const GATE = {
  title: "Are you 18 or older?",
  body: "Herbal Holland is for adults only. Please confirm your age to continue.",
  yes: "I'm 18 or older",
  no: "I'm younger than 18",
  remember: "We remember your answer on this device for a year.",
  accept: "By entering you accept our {terms} and {privacy}.",
  under: {
    title: "Sorry, this site is for adults",
    body: "You need to be 18 or older to visit Herbal Holland. Thanks for being honest.",
    help: "Looking for support, or someone to talk to? Visit",
    or: "or",
    sadag: "SADAG",
    childline: "Childline South Africa",
  },
  noscript: "Herbal Holland is for adults 18+ only.",
} as const;

// ── Header, menu and footer ──────────────────────────────────────────────────
export const CHROME = {
  skip: "Skip to content",
  home: "Herbal Holland home",
  nav: [
    { key: "about", label: "About" },
    { key: "stores", label: "Stores" },
    { key: "press", label: "Press" },
    { key: "careers", label: "Careers" },
    { key: "contact", label: "Contact" },
  ],
  navLabel: "Main",
  menu: { open: "Menu", close: "Close", label: "Menu", home: "Home" },
  // The header's button reads "Get first access" until the online shop is live, then "Shop online".
  cta: { access: "Get first access", join: "Join Rewards", shop: "Shop online", finder: "Find a store", learn: "Learn" },
  /** Read out after a door that isn't open yet ("Shop online, opening soon"). */
  soonSr: ", opening soon",
  /** The desktop cursor's label over a door that isn't open yet. */
  cursorSoon: "Soon",
  /** The breadcrumb trail on every page below the home page. */
  crumbs: { label: "You are here", home: "Home" },
  footer: {
    line: ["Dutch heritage.", "African soil."],
    cols: { company: "Herbal Holland", members: "Members", contact: "Talk to us" },
    contact: { hello: "General", press: "Press", careers: "Careers" },
    age: "For adults 18 and older only. Licensed medicines are supplied only to registered patients with a valid SAHPRA authorisation, by an authorised dispenser. Nothing on this site is medical advice.",
    owned: "Herbal Holland stores are independently owned and operated by franchisees.",
    copy: "© {year} Herbal Holland",
    top: "Back to top",
  },
} as const;

// ── Home: one journey, from a Dutch polder to the KwaZulu-Natal hills at night ─
// Counts, dates, places and provinces come from the stores list in ./facts, filled in at build time. Every way to shop
// leads to the online shop once FACTS.shop.url is set, and to the early-access sign-up (ACCESS, below) until then.
export const HOME = {
  meta: {
    title: "Herbal Holland: Dutch heritage. African soil.",
    updated: "2026-10-07",
    // The page description, in the same three states as the hero's line (below); {opening} is the day without its weekday.
    description: {
      soon: "Herbal Holland: members-only cannabis wellness stores for adults 18+. Opening {opening} in {next}, with more towns to come.",
      both: "Herbal Holland: members-only cannabis wellness stores for adults 18+. Open now in {open}; opening {opening}: {next}.",
      open: "Herbal Holland: members-only cannabis wellness stores for adults 18+. Open in {open}, with more towns to come.",
    },
  },
  // Scene 1: a Dutch polder at golden hour, one windmill in the wind.
  hero: {
    eyebrow: "Herbal Holland · South Africa",
    title: ["Holland,", "meet", "South Africa."],
    // Where we are, from the stores list: before any store is open, with stores open and more opening, and once every
    // store is open. {open} and {next} are towns ("Pietermaritzburg and Durban"), {opening} the next opening day.
    line: {
      soon: "Opening in {next} on {opening}. More stores to be announced.",
      both: "Open now in {open}, and opening in {next} on {opening}. More stores to be announced.",
      open: "Open in {open}, with more stores to be announced.",
    },
    cue: "Scroll",
  },
  // Towns in running text: listed by name up to four, then counted ("12 towns in Gauteng and KwaZulu-Natal").
  towns: "{n} towns in {provinces}",
  // Scene 2: across the sea. The windmill flies the great circle from Amsterdam to the hills.
  journey: {
    eyebrow: "Amsterdam to the hills",
    unit: "km",
    title: "from Amsterdam to the hills",
    sr: "{km} km from Amsterdam to {city}, one of our new stores in the hills",
    readout: { lat: "Latitude", lon: "Longitude", dist: "Distance" },
    caption: "A globe showing the great circle from Amsterdam ({from}) to {city} ({to}), one of our new stores: {km} km, with a pin for each Herbal Holland store.",
    chapters: [
      { key: "tradition", label: "The tradition", title: "A warm welcome, and knowing what we offer", body: "Amsterdam's coffee shops made one idea famous: a warm welcome at the door, and someone who can tell you exactly what's on offer." },
      { key: "soil", label: "The soil", title: "Rooted in Southern Africa", body: "Southern Africa's landraces were shaped on its hillsides over generations, long before Amsterdam knew their names. African soil is the bigger half of who we are." },
      // The hero's line, as it stands.
      { key: "welcome", label: "The welcome", title: "Welkom. Sawubona.", body: "" },
    ],
  },
  // Scene 3: the hills. The new stores (the next opening day's: for now Hillcrest and Hilton), then every store.
  hills: {
    eyebrow: "New stores",
    title: ["Holland, meet", "the Hills."],
    lede: "Holland is famously flat. Our {count} new stores are in hill towns: {names}, opening on {opening}.",
    ledeOpen: "Holland is famously flat. Our {count} newest stores are in hill towns: {names}.",
    // How the lede says how many.
    count: ["no", "one", "two", "three", "four", "five", "six"],
  },
  stores: {
    eyebrow: "Our stores",
    open: "Open now",
    opening: "Opening {date}",
    all: "All our stores",
    // Read after a store's name by screen readers.
    page: "store page",
    // Beneath the stores: the shop, for everyone not near one.
    shop: "Not near a store? Our online shop delivers nationwide.",
  },
  // Scene 4: what's in store, as dusk deepens. Categories only (no product names, prices or anything a product does).
  range: {
    eyebrow: "What's in store",
    title: "Wellness, tested",
    intro: "CBD wellness, coffee and food, skin care and supplements, every batch lab-tested and traceable to the farm, for members aged 18 and over.",
    items: [
      { key: "cbd", title: "CBD wellness", body: "Every batch lab-tested." },
      { key: "food", title: "CBD coffee & food", body: "Ingredients and allergens on every pack." },
      { key: "skin", title: "CBD skin care", body: "Creams and balms." },
      { key: "supplements", title: "Collagen & protein", body: "Clearly labelled, batch by batch." },
      { key: "accessories", title: "Accessories", body: "Storage, tools and everyday extras." },
      { key: "apparel", title: "Apparel", body: "Wear the windmill." },
      { key: "grow", title: "Grow", body: "Soil, pots and tools." },
    ] satisfies Item[],
    // Each frame's link ("Shop", then the category's name for screen readers).
    shop: "Shop",
    note: "Licensed medicines are a separate pharmacist service, only for registered patients with a SAHPRA authorisation.",
  },
  // Between dusk and night: what we stand for, in five words.
  marquee: {
    label: "What we stand for",
    words: ["Lab-tested", "Batch-traceable", "Members only", "Adults 18+", "Good neighbours"],
  },
  // Scene 5: night under the Southern Cross. Founding Members, and the one early-access sign-up.
  founding: {
    eyebrow: "Herbal Holland Rewards",
    title: "Be one of the first {cap}",
    body: "The first {cap} members of Herbal Holland Rewards become Founding Members, with a numbered card and our {tier} tier for {months} months. Joining is free, for adults 18+, and opens with our online shop.",
    // Until Rewards opens: the early-access list is first in line.
    soon: "The early-access list is first in line.",
    cta: "Join Rewards",
    card: { brand: "Rewards", label: "Founding Member", no: "No.", of: "of {cap}" },
    sky: "The Southern Cross",
  },
  // Organization structured data.
  org: { press: "media enquiries", careers: "careers", hello: "general enquiries" },
} as const;

// ── Early access: "Get first access" (the home page's last scene, and /stores) ─
// Until the online shop opens, every "Shop online" leads here. The form posts JSON to /api/early-access (the Worker):
// first name, email and/or mobile, province (a code from src/lib/sa), the 18+ and consent ticks, the ?src tag and the
// "website" honeypot. What happens to the details is in the Privacy Policy (PRIVACY): change both together.
export const ACCESS = {
  eyebrow: "Early access",
  title: "Get first access",
  intro: "Leave your email or mobile number and we'll tell you the day our online shop opens, nationwide, for members aged 18 and over.",
  label: "Get first access to our online shop",
  fields: {
    firstName: { label: "First name", optional: "(optional)" },
    email: { label: "Email" },
    mobile: { label: "Mobile", hint: "A South African mobile number, like 082 123 4567." },
    contact: "An email address, a mobile number or both: we'll use whichever you give us.",
    province: { label: "Province", optional: "(optional)", placeholder: "Choose your province" },
    adult: "I'm 18 or older",
    consent: "Tell me when the online shop opens and about the launch. I can unsubscribe any time.",
    website: "Leave this empty",
  },
  submit: "Get first access",
  sending: "Adding you to the list…",
  privacy: "We use your details only to tell you when our online shop opens and about the launch, and keep them until it opens, for 12 months at most. Read our {privacy}.",
  noscript: "This form needs JavaScript. You can also ask for first access by email:",
  errors: {
    firstName: "Enter your first name in letters.",
    email: "Enter an email address like name@example.co.za.",
    mobile: "Enter a South African mobile number, like 082 123 4567.",
    contact: "Give us an email address or a mobile number, so we can tell you.",
    province: "Choose a province from the list.",
    adult: "Please confirm that you're 18 or older.",
    consent: "Please tick this, so we may tell you when the shop opens.",
    summary: "Please check the highlighted fields.",
    busy: "You've tried a few times in a short while. Please wait a little, then try again.",
    server: "Something went wrong on our side. Please try again in a moment, or email us at {email}.",
    network: "We couldn't reach our server. Check your connection and try again.",
  },
  done: {
    title: "You're on the list. We'll tell you first.",
    body: "We'll let you know the day our online shop opens. Every message we send has a link to unsubscribe.",
  },
} as const;

// ── The store map (home, /stores and each store's page) ──────────────────────
export const MAP = {
  // Until stores are in three or more provinces, the map shows only the provinces with a store.
  caption: {
    national: "A map of South Africa's nine provinces, with a pin for each Herbal Holland store: a solid pin where a store is open, a ring where one is still to open.",
    provinces: "A map of {provinces}, with a pin for each Herbal Holland store: a solid pin where a store is open, a ring where one is still to open.",
  },
  neighbours: { LS: "Lesotho", SZ: "Eswatini" },
  // The key names the stores, so the pins' shape and colour are never the only way to tell them apart.
  legend: { open: "Open now", opening: "Opening {date}", here: "This store" },
} as const;

// ── Stores ───────────────────────────────────────────────────────────────────
export const STORES = {
  meta: {
    title: "Stores",
    updated: "2026-10-07",
    // In the same three states as the home page's line; {opening} is the day without its weekday.
    description: {
      soon: "Every Herbal Holland store: opening in {next} on {opening}, with more towns to come. Members only, adults 18+.",
      both: "Every Herbal Holland store: open now in {open}, opening in {next} on {opening}, with more towns to come. Adults 18+.",
      open: "Every Herbal Holland store: open in {open}, with more towns to come. Members only, for adults 18 and over.",
    },
  },
  hero: {
    eyebrow: "Stores",
    title: "Our stores",
    // Beside "Shop online": the shop delivers wherever the stores aren't yet.
    shopNote: "Not near a store yet? Our online shop delivers nationwide.",
  },
  // Open stores first, then each opening day's.
  list: { open: "Open now", opening: "Opening {date}", count: ["{n} store", "{n} stores"] },
  card: { open: "Open now", opens: "Opening {opening}", page: "store page" },
  finder: { title: "Opening hours and directions", body: "Each store's opening hours and directions are on our online shop's store finder.", cta: "Find a store" },
  concept: {
    eyebrow: "Store concept",
    title: "How a Herbal Holland store looks",
    body: "A charcoal front with warm oak and stone, the round windmill sign and an African geometric panel at the door. Inside, oak shelves under warm track lights, and leather chairs to take your time in.",
    label: "Store concept",
    note: "Concept renders: our stores may differ.",
    items: [
      "Store concept render: the round Herbal Holland sign lit above a mosaic panel in an African geometric pattern, proteas and aloes in terracotta pots, and through the open front, dark oak shelves, a glass counter and cognac leather armchairs.",
      "Store concept render: the round Herbal Holland sign above a panel of orange, cream and charcoal geometric bands, with light oak shelves under track lights, a leather chair and a glass display counter inside.",
    ],
  },
  // Each store's own page, /stores/{key}. Only what ./facts knows: the town, the province, its status and, once we have
  // them, its address, phone and hours.
  store: {
    meta: {
      title: "{name}",
      description: "Herbal Holland {name}, {province}: {status}. A members-only cannabis wellness store for adults 18+, owned and run by a local franchisee.",
    },
    eyebrow: "Herbal Holland · {province}",
    status: { open: "open now", opens: "opening {opening}" },
    lede: { open: "Open now in {town}, {province}.", opens: "Opening in {town}, {province}, on {opening}." },
    details: { title: "Visiting", address: "Address", phone: "Phone", hours: "Hours" },
    // While we have no address or hours for an open store.
    pending: "This store's address and hours will appear here as soon as we have them.",
    pendingOpening: "This store's address and hours will appear here before it opens.",
    art: "The Herbal Holland storefront, drawn: a charcoal front, the round windmill sign lit above the door and a beadwork panel beside it.",
    photo: "Herbal Holland {name}",
    nearby: { title: "Our other stores", all: "All our stores" },
    shop: { title: "Not near {town}?", body: "Our online shop delivers nationwide, to members aged 18 and over." },
  },
} as const;

// ── About ────────────────────────────────────────────────────────────────────
export const ABOUT = {
  meta: {
    title: "Our story and standards",
    updated: "2026-10-07",
    description: "Where Herbal Holland comes from and the standards we keep: every batch lab-tested, members only, adults 18+, and licensed medicines only through a pharmacist.",
  },
  hero: {
    eyebrow: "About Herbal Holland",
    title: "Our story, and the standards we keep",
    lede: "The Amsterdam coffee-shop tradition of a warm welcome and knowing exactly what you're offering, rooted in Southern Africa's own landraces and growers.",
  },
  story: {
    eyebrow: "Our story",
    title: "Dutch heritage. African soil.",
    paragraphs: [
      "Our name nods to Amsterdam, where many of Southern Africa's landraces became famous. Our roots, and our growers, are here.",
      "Dutch heritage is the coffee-shop tradition of hospitality: a warm welcome, and knowing exactly what you're offering. African soil is the bigger half: South African growers, makers and places.",
      "In store and online, that means CBD wellness, functional coffee and protein, skin care and collagen, all lab-tested and batch-traceable, for members aged 18 and over.",
    ],
    windmill: {
      label: "The Herbal Holland windmill",
      title: "Why a windmill?",
      body: "It's two things at once: a Dutch windmill and a four-petal flower. The ring is open at the bottom, where the tower stands. We drew it from our first store-window poster.",
    },
  },
  heritage: {
    eyebrow: "Our heritage",
    title: "Shaped by hillsides, kept by growers",
    paragraphs: [
      "Long before Amsterdam's coffee shops made them famous, Southern Africa's landraces were shaped by generations of growers on the hillsides of KwaZulu-Natal, Eswatini, Malawi and the Wild Coast.",
      "A landrace is a local variety that has adapted to its place over generations: the soil, the sun, the rain and the hands that kept its seed. That's what we mean by African soil.",
    ],
    landraces: [
      { name: "Durban Poison", origin: "Hills behind Durban, KwaZulu-Natal", note: "The one that travelled: its seeds left South Africa in the 1970s for the United States and Amsterdam's seed banks, and it became a global benchmark." },
      { name: "Swazi Gold", origin: "Eswatini highlands", note: "Traditionally dried in the sun on the mountain slopes, which gives it the golden colour in its name." },
      { name: "Malawi Gold", origin: "Salima, Malawi", note: "Famously patient: it can take around 120 days to flower, and was traditionally wrapped in maize leaves." },
      { name: "Mpondo Gold", origin: "Pondoland, Wild Coast", note: "From one of the country's oldest growing traditions. Some growers believe Durban Poison partly descends from Mpondo lines." },
    ],
    quote: "A landrace is a library. Every seed carries a season's worth of decisions made by the people who grew it.",
    law: "Licensed cannabis is supplied only through lawful channels. Today that means registered patients, through a pharmacist.",
  },
  standards: {
    eyebrow: "How we work",
    title: "Standards you can check",
    intro: "The same rules in every store and online, written into the platform our stores run on rather than left to memory.",
    items: [
      {
        key: "lab",
        title: "Every batch lab-tested, with a public result",
        paragraphs: [
          "Before a batch goes on sale, an independent laboratory tests what's in it and runs safety panels for microbes, pesticides, heavy metals, mycotoxins and, for extracts, left-over solvents.",
          "Every pack carries a batch code and a QR code that open the certificate for that exact batch: what the lab measured, who grew it and when it was packed. Only batches released after testing can be sold. If one is put on hold or recalled, its page says so in plain language and our tills block it.",
        ],
      },
      {
        key: "members",
        title: "Members only, and ID every time",
        paragraphs: [
          "We sell to members only, online and at the till. Joining Herbal Holland Rewards is free, and the key terms are shown in plain language before anyone accepts them.",
          "Every member is an adult: we check ID at the till and again at every collection and delivery. Membership keeps our records straight and lets us trace a batch to the people who bought it if we ever need to recall it. It never makes anything lawful that isn't.",
        ],
      },
      {
        key: "cbd",
        title: "CBD wellness, within Schedule 0",
        paragraphs: [
          "Our CBD wellness range is sold under Schedule 0 (Government Notice 586 of 2020): there are limits on strength per pack and per day, and only a short list of modest, approved claims.",
          "We use approved wording only and never make medical claims, and our marketing is screened against the advertising code before it's published. We sell CBD to adults 18+ only: our own policy, stricter than Schedule 0 requires.",
        ],
      },
      {
        key: "medicines",
        title: "Licensed medicines, through a pharmacist",
        paragraphs: [
          "Cannabis medicines that contain THC are supplied only to registered patients whose doctor has obtained a Section 21 authorisation from SAHPRA, and only through our pharmacists, after an ID check.",
          "They're never advertised, never discounted and never earn points: the Medicines Act prohibits incentives on medicines. We record what the law needs to dispense lawfully, and deliberately never a diagnosis.",
        ],
      },
      {
        key: "neighbours",
        title: "Good neighbours",
        paragraphs: [
          "Nothing is consumed on or outside our premises. We keep the pavement clear, the lights on and security at the door, and every store gives its neighbours a direct line to the manager, with a reply within one working day.",
          "We meet the neighbours before we open: the businesses and homes around us, the local police station and Community Policing Forum, and the ward councillor.",
          "We choose poster and board sites with care: none within 500 m of a place where young people learn, and no events at or with one. That's our own rule, and it's stricter than the law. We don't sponsor sport or link our name to it, the only thing we say about driving is never drive impaired, and we stay out of politics and religion.",
        ],
      },
    ],
  },
  visit: {
    eyebrow: "See for yourself",
    title: "Come in, or shop from anywhere",
    body: "Shop online, or find a store near you. Every Herbal Holland store is owned and run by a local franchisee.",
    // Until the online shop is live: where the stores are open, and first access to the shop.
    soon: "Our stores in {open} are open now, and our online shop opens soon: get first access, and we'll tell you the day it does.",
    stores: "Find a store",
  },
} as const;

// ── Press ────────────────────────────────────────────────────────────────────
export const PRESS = {
  meta: {
    title: "Press",
    updated: "2026-10-07",
    description: "Herbal Holland's press room: releases, the fact sheet, logo downloads, notes on how to write about us, and the media contact for interviews and pictures.",
  },
  hero: {
    eyebrow: "Press",
    title: "News and media",
    lede: "Releases, facts and brand assets for journalists and editors. For interviews, store visits, pictures and questions, email us.",
  },
  releases: {
    eyebrow: "Press releases",
    title: "Latest news",
    empty: "No releases yet: our first one is on its way. For news in the meantime, email",
    read: "Read the release",
    items: [
      // The first release: the KZN stores. Held back until the owner approves it and sets the day it goes out.
      {
        slug: "kwazulu-natal-stores-open",
        date: null,
        title: "Herbal Holland opens in KwaZulu-Natal, with stores in Pietermaritzburg and on the Bluff",
        pageTitle: "Herbal Holland opens in KwaZulu-Natal",
        description: "Herbal Holland's first stores are open in Pietermaritzburg and on the Bluff in Durban, for members aged 18+; Hillcrest and Hilton follow on 1 December 2026.",
        summary:
          "Herbal Holland, a South African network of members-only cannabis wellness stores for adults 18+, has opened its first two stores in KwaZulu-Natal, in Pietermaritzburg and on the Bluff in Durban. Two more, in Hillcrest and Hilton, open on Tuesday 1 December 2026.",
        body: [
          "Herbal Holland's stores in Pietermaritzburg and on the Bluff in Durban are open, for members aged 18 and over. Joining Herbal Holland Rewards is free, takes about a minute in store or on a phone, and gives members their member price from the first visit.",
          "Two more stores, in Hillcrest and Hilton, open on Tuesday 1 December 2026. Every Herbal Holland store is owned and run by a local franchisee, on one shared platform for the till, stock and membership.",
          "The name nods to Amsterdam, where many of Southern Africa's landraces became famous; the roots are here. The stores carry CBD wellness, accessories, grow gear and Herbal Holland apparel.",
          "Every batch is tested by an independent laboratory before it's sold, and the code on each pack opens that batch's result. ID is checked at the till. Licensed medicines are supplied only to registered patients with a SAHPRA authorisation, through a pharmacist, and are never advertised.",
        ],
      },
      // Held back until the online shop is live (FACTS.shop.url): set its date to that day, and check every line then.
      {
        slug: "online-shop-opens",
        date: null,
        title: "Herbal Holland opens online for adults 18+ across South Africa",
        pageTitle: "Online shop opens for adults 18+",
        description: "Herbal Holland's online shop opens nationwide for adults 18+, with its Founding Members list; two new stores open in Hillcrest and Hilton on 1 December 2026.",
        summary:
          "Herbal Holland's online shop opens nationwide today, and so does its Founding Members list: joining Herbal Holland Rewards is free, and the first {cap} people on the list get a numbered Founding Member card. Two new stores, in Hillcrest and Hilton in KwaZulu-Natal, open on Tuesday 1 December 2026, joining its stores already open in Pietermaritzburg and on the Bluff in Durban.",
        body: [
          "Herbal Holland's online shop opens across South Africa today, delivering nationwide to members aged 18 and over, with ID checked at every delivery.",
          "Joining Herbal Holland Rewards is free. The first {cap} members become Founding Members, with a numbered card and the {tier} tier for {months} months.",
          "Two new stores, in Hillcrest and Hilton in KwaZulu-Natal, open on Tuesday 1 December 2026, joining the stores already open in Pietermaritzburg and on the Bluff in Durban. Every Herbal Holland store is owned and run by a local franchisee.",
          "Every batch is tested by an independent laboratory before it's sold, and the code on each pack opens that batch's result. Licensed medicines are supplied only to registered patients with a SAHPRA authorisation, through a pharmacist, and are never advertised.",
        ],
      },
    ] satisfies ReleaseDraft[],
  },
  // A release's own page.
  release: { eyebrow: "Press release", back: "All releases", contact: "Media contact", about: "About Herbal Holland", facts: "Fact sheet", published: "Published" },
  facts: {
    eyebrow: "Fact sheet",
    title: "Herbal Holland at a glance",
    rows: {
      company: "Company",
      what: "What we are",
      range: "What's in store",
      line: "Brand line",
      stores: "Stores",
      provinces: "Provinces",
      model: "Model",
      membership: "Membership",
      founding: "Founding Members",
      age: "Age",
      quality: "Quality",
      medicines: "Licensed medicines",
      online: "Online shop",
      office: "Head office",
      media: "Media contact",
    },
    values: {
      what: "A South African network of cannabis wellness stores and an online shop, for members aged 18 and over.",
      range: "CBD wellness, functional coffee and protein, skin care and collagen, all lab-tested and batch-traceable.",
      model: "Franchise: each store is independently owned and run by a local franchisee, on one shared platform.",
      membership: "Members only. Herbal Holland Rewards is free to join and works in every store and online.",
      founding: "The first {cap} members of Herbal Holland Rewards get a numbered Founding Member card.",
      age: "Adults 18+ only, with ID checked at the till and at every collection and delivery.",
      quality: "Every batch tested by an independent lab, with a public result behind the code on every pack.",
      medicines: "Only for registered patients with a SAHPRA authorisation, through a pharmacist. Never advertised.",
      storesNone: "Our stores are on their way.",
      trading: "{n} trading: {names}",
      opening: "{n} opening on {opening}: {names}, in {provinces}. More to be announced.",
    },
  },
  media: {
    eyebrow: "Media contact",
    title: "Talk to us",
    body: "For interviews, store visits, pictures and questions, email our press team.",
  },
  assets: {
    eyebrow: "Brand assets",
    title: "Our logo",
    body: "Use the logo in one colour on a plain background: Sunset orange on dark, warm black on light or orange. Keep clear space of one windmill petal's length on every side, and please don't stretch, recolour, rotate or add effects.",
    files: [
      { file: "herbal-holland-logo.svg", title: "Sunset orange", format: "SVG", note: "For dark backgrounds", tone: "dark" },
      { file: "herbal-holland-logo-dark.svg", title: "Warm black", format: "SVG", note: "For light and orange backgrounds", tone: "orange" },
      { file: "herbal-holland-logo.png", preview: "herbal-holland-logo.svg", title: "Sunset orange", format: "PNG, 1200 px wide", note: "Transparent background", tone: "dark" },
    ],
    download: "Download",
    alt: "Herbal Holland logo in {colour}",
    more: "Need pictures of our stores or team? Ask us at",
  },
  style: {
    eyebrow: "How to write about us",
    title: "A few notes for your story",
    items: [
      { key: "members", title: "Members", body: "We sell to members only, and joining Herbal Holland Rewards is free. Please call the people who buy from us members." },
      { key: "adults", title: "Adults 18+", body: "Everything we do is for adults 18 and older. We check ID at the till and at every collection and delivery." },
      { key: "cbd", title: "CBD wellness", body: "Our CBD wellness range is sold under Schedule 0, with approved wording only. Please don't describe it as medicine or attach health claims to it." },
      { key: "medicines", title: "Licensed medicines", body: "Licensed medicines are only for registered patients with a SAHPRA authorisation, supplied through a pharmacist. They aren't for sale to the public." },
      { key: "pictures", title: "Pictures", body: "No consumption imagery, please: no smoking, no smoke and no cannabis leaves. Our brand is the windmill and the orange frame, and everyone in our pictures is over 25." },
      { key: "name", title: "Our name", body: "Herbal Holland, two words. Our membership is Herbal Holland Rewards, and our stores are independently owned and run by franchisees." },
    ] satisfies Item[],
  },
} as const;

const RELEASES: readonly ReleaseDraft[] = PRESS.releases.items;

/** Releases dated `day` (YYYY-MM-DD, SAST) or earlier, newest first: a planned release appears on its date, a draft never. */
export const releasesOn = (day: string): Release[] =>
  RELEASES.filter((r): r is Release => r.date != null && r.date <= day).sort((a, b) => b.date.localeCompare(a.date));

/**
 * The first sentence of `text` that says the online shop is open, or null: one that mentions "online" with "open(s)",
 * "live", "now", "today" or "deliver(s/ing)", and doesn't say "soon". The build refuses a live release with one while
 * FACTS.shop.url is null.
 */
export const shopOpenClaim = (text: string) =>
  text.split(/(?<=[.!?])\s+/).find((s) => /\bonline\b/i.test(s) && /\b(opens?|live|now|today|deliver(s|ing)?)\b/i.test(s) && !/\bsoon\b/i.test(s)) ?? null;

// ── Careers ──────────────────────────────────────────────────────────────────
export const CAREERS = {
  meta: {
    title: "Careers",
    updated: "2026-10-07",
    description: "Work with Herbal Holland: member advisors and store managers in our stores, and teams at HQ. What we look for and how to apply.",
  },
  hero: {
    eyebrow: "Careers",
    title: "Work with us",
    lede: "We're looking for warm people who like explaining things simply, in our stores and at HQ.",
  },
  why: {
    eyebrow: "Why Herbal Holland",
    title: "A place to do things properly",
    items: [
      { key: "standards", title: "Standards to be proud of", body: "Every batch lab-tested, members only, ID every time. Doing it properly is the job, not an extra." },
      { key: "training", title: "Training from day one", body: "Learn the platform, ID checks and how to explain what we do in plain English before you serve your first member." },
      { key: "tools", title: "Tools that work", body: "Tills that keep going through load-shedding, and one system for stock, orders and members." },
      { key: "local", title: "Local, with a national brand", body: "Our stores are owned by local franchisees, so the job is close to home, with the whole network behind it." },
    ] satisfies Item[],
  },
  roles: {
    eyebrow: "Roles we hire",
    title: "In our stores, and at HQ",
    stores: {
      title: "In our stores",
      note: "Store roles are with the franchisee who owns that store.",
      items: [
        { key: "advisor", title: "Member advisors", aka: "Sometimes called budtenders", body: "The first person a member meets: a warm welcome, an ID check, and clear, plain-English answers to their questions." },
        { key: "manager", title: "Store managers", aka: "", body: "Run the store and the team: rosters, stock, cash-ups, the neighbours and the standards." },
      ],
    },
    hq: {
      title: "At HQ",
      note: "HQ roles are with Herbal Holland itself.",
      items: [{ key: "hq", title: "HQ teams", aka: "", body: "Buying and supply, distribution, marketing, finance, technology, compliance and franchise support." }],
    },
  },
  apply: {
    eyebrow: "How to apply",
    title: "Send us your CV",
    steps: [
      { key: "email", title: "Email us", body: "Send your CV and tell us the store or the role you're interested in:" },
      { key: "read", title: "We read every application", body: "If there's a fit, we'll be in touch to arrange an interview." },
    ] satisfies Item[],
    cta: "Email your CV",
    fee: {
      title: "We never charge to apply",
      body: "If anyone asks you for money for a job with Herbal Holland, it isn't us. Please tell us at",
    },
    popia: {
      title: "Your application and POPIA",
      body: "We use your application only to consider you for work with Herbal Holland and, for store roles, with the franchisee who owns the store. We keep applications for 12 months and then delete them, sooner if you ask.",
      ask: "To see what we hold about you, or to have it deleted sooner, write to us at",
      link: "Privacy notice",
    },
  },
} as const;

// ── Contact ──────────────────────────────────────────────────────────────────
export const CONTACT = {
  meta: {
    title: "Contact",
    updated: "2026-10-07",
    description: "How to reach Herbal Holland: the right inbox for general questions, press, careers and membership, and our company details.",
  },
  hero: {
    eyebrow: "Contact",
    title: "Get in touch",
    lede: "Tell us what it's about, and it'll reach the right team.",
  },
  who: {
    eyebrow: "Who to contact",
    title: "The right inbox for each question",
    general: { title: "General", body: "Anything about Herbal Holland that isn't covered below." },
    press: { title: "Press", body: "Interviews, store visits, pictures and questions from journalists.", link: "Press room" },
    careers: { title: "Careers", body: "Jobs in our stores and at HQ.", link: "Careers" },
    members: {
      title: "Members",
      body: "Orders, Herbal Holland Rewards and your membership. Sign in on the shop to see your orders and your card, or email us.",
      soon: "Herbal Holland Rewards opens soon. Questions about membership in the meantime? Email us.",
      link: "Sign in to Rewards",
    },
  },
  company: {
    eyebrow: "Company details",
    title: "Who we are",
    intro: "Our details, as section 43 of the Electronic Communications and Transactions Act requires.",
    rows: { legalName: "Registered name", regNumber: "Registration number", vatNumber: "VAT number", address: "Address", phone: "Telephone", email: "Email", name: "Name" },
    franchisees: "Herbal Holland stores are independently owned and operated by franchisees. Each store's own details are on the store finder.",
    franchiseesSoon: "Herbal Holland stores are independently owned and operated by franchisees. Each store's own details are on its store page.",
    stores: "Store finder",
    legal: { title: "Legal" },
  },
} as const;

// ── Legal: the Privacy Policy and the Terms of Use ───────────────────────────
/** A paragraph in a legal document: plain text, or [a bold lead-in, the text]. "{company}" alone stands for the
 *  company's registered details from ./facts (or LEGAL.company.pending while they aren't filled in). */
export type LegalPara = string | readonly [lead: string, text: string];
export type LegalSection = { key: string; title: string; body: readonly LegalPara[] };
export type LegalDoc = {
  meta: PageMeta;
  version: string;
  /** YYYY-MM-DD: shown as "Last updated …". Change it, and the version, whenever the text changes. */
  updated: string;
  hero: { eyebrow: string; title: string; lede: string };
  summary: { title: string; points: readonly string[]; scope?: string };
  sections: readonly LegalSection[];
};

export const LEGAL = {
  version: "Version {version} · Last updated {date}",
  contents: "Contents",
  links: { privacy: "Privacy Policy", terms: "Terms of Use", paia: "PAIA manual", press: "press page" },
  regulator: { label: "inforegulator.org.za", href: "https://inforegulator.org.za" },
  company: {
    // Shown while the registration number or address isn't filled in ./facts. Never invent them.
    pending: "Our registration number and registered address aren't published yet. Until they are, you can reach us at {email}.",
  },
} as const;

/**
 * The Privacy Policy for herbalholland.com (POPIA, Act 4 of 2013). It describes what the pages and ./worker.ts do: the
 * early-access sign-up and its fields, the franchise enquiries sent before that form closed (kept until the Worker's
 * daily clean-up deletes them), the ?src tag, the scrambled connection code, Cloudflare's EU region and email routing,
 * how long enquiries and sign-ups are kept, and the 18+ answer kept in the browser. Change how any of that works, and
 * change this too.
 */
export const PRIVACY = {
  meta: {
    title: "Privacy Policy",
    description: "How herbalholland.com collects, uses, stores and protects personal information under POPIA: who sees it, how long we keep it and how to use your rights.",
    updated: "2026-10-07",
  },
  version: "1.3",
  updated: "2026-10-07",
  hero: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    lede: "How herbalholland.com handles personal information, under the Protection of Personal Information Act 4 of 2013 (POPIA).",
  },
  summary: {
    title: "In short",
    points: [
      "We collect only what you send us: an early-access sign-up or an email.",
      "We use it to reply to you, to tell you when our online shop opens if you've asked us to, and to keep the site secure, and for nothing else.",
      "No tracking or advertising cookies, no analytics, and we never sell your details.",
      "Sign-ups are stored with Cloudflare in the EU and kept until the shop opens, and 12 months at most. Franchise enquiries sent before our enquiry form closed are stored there too, and deleted within 12 months if they don't go ahead.",
      "You can ask to see, correct or delete your details at any time, and every launch message lets you unsubscribe.",
    ],
    scope: "This policy covers herbalholland.com only. Our online shop and Herbal Holland Rewards have their own privacy policy, which applies when you use them.",
  },
  sections: [
    {
      key: "who",
      title: "Who we are and how to reach us",
      body: [
        "Herbal Holland's online business, including this website, is owned by {legalName}, the responsible party for the personal information collected here: we decide why and how it's used.",
        "{company}",
        ["Information Officer.", "Our Information Officer, {officer}, looks after privacy and access to information. You can reach them at {email}."],
      ],
    },
    {
      key: "collect",
      title: "What this site collects",
      body: [
        ["The early-access sign-up.", "If you ask for first access to our online shop: your first name if you give it, your email address or mobile number (or both), your province if you choose one, and your consent to hear from us, with the date you gave it. You also confirm that you're 18 or older. If you reached the sign-up through a link with a campaign tag (such as ?src=instagram), we note the tag."],
        ["Franchise enquiries.", "This site no longer takes franchise enquiries. If you sent one before the form closed, we hold what it asked for: your name, email address and mobile number, the area and province where you'd like to open, your retail or business experience, the band of capital you could put in, whether you have a pharmacist partner, any message you added and, if you came through a link with a campaign tag (such as ?src=linkedin), the tag."],
        ["Your connection address.", "When you send the sign-up form, we use your connection (IP) address only to stop the same form being sent over and over, and we keep it only as a scrambled code, never the address itself."],
        ["Routine security logs.", "Like any website, our host keeps routine logs of requests to the site, such as the connection address, the browser used and the time, to keep the site secure and working."],
        ["Emails.", "If you email us, we receive your email address, your message and anything you attach."],
        ["Your answer to the 18+ question.", "It stays in your own browser's local storage: for a year if you confirm you're 18 or older, and only until you close the tab if you're younger. It's never sent to us."],
        ["What we don't do.", "This site sets no tracking or advertising cookies, runs no analytics and builds no profiles. Emailing us never signs you up for marketing: we send launch news only if you ask for first access and tick the box to hear from us."],
      ],
    },
    {
      key: "why",
      title: "Why we use it, and on what basis",
      body: [
        ["To reply to you.", "You send us your details so that we can answer your enquiry or email, and you consent to us using them for that (POPIA section 11(1)(a)). If your enquiry goes further, we use them to take your franchise application forward with you, as steps you've asked for before any agreement (section 11(1)(b))."],
        ["To tell you when our online shop opens.", "If you ask for first access, we use your details to tell you when our online shop opens and about its launch, because you've consented to that (section 11(1)(a)). Those messages are electronic direct marketing, which POPIA allows only with your consent (section 69), so we send them only because you ticked the box, and every one of them lets you unsubscribe."],
        ["To keep the site secure.", "We use the scrambled connection code and the security logs because we have a legitimate interest in protecting the site, and the people who use it, from abuse (section 11(1)(f))."],
        ["It's your choice.", "Giving us your details is voluntary. Without them we can't reply to you or tell you about the launch, and nothing else happens."],
        "We don't use your details for anything else.",
      ],
    },
    {
      key: "sharing",
      title: "Who sees it",
      body: [
        ["Our head-office team.", "The people at Herbal Holland's head office who answer franchise enquiries and emails, and who send launch news to people who've asked for first access."],
        ["Operators who process it for us.", "Cloudflare, which hosts the site, stores enquiries and sign-ups and routes our email; our email provider; and the messaging service that sends launch messages, if you gave us a mobile number. Under POPIA (sections 20 and 21) they may process it only on our instructions, and must keep it secure."],
        ["Our franchise system.", "Once it's live, enquiries that go further move into the system our head office uses to manage franchise applications."],
        ["No one else.", "Early-access sign-ups are never shared beyond us and our operators. We never sell your details, and we disclose them to anyone else only when the law requires us to."],
      ],
    },
    {
      key: "where",
      title: "Where it's stored",
      body: [
        "Enquiries and early-access sign-ups are stored in Cloudflare's European Union region. That's a transfer outside South Africa, which POPIA allows (section 72) because EU law gives personal information an adequate level of protection.",
        "When you visit the site, your requests pass through Cloudflare's global network, so they may be handled in data centres in South Africa and elsewhere.",
        "Emails are kept by our email provider. If it stores them outside South Africa, it's only where POPIA allows.",
      ],
    },
    {
      key: "keep",
      title: "How long we keep it",
      body: [
        ["Enquiries.", "If an enquiry doesn't go ahead, we delete it within 12 months. Once an enquiry moves into our franchise system, we delete the website's copy within 30 days."],
        ["Early-access sign-ups.", "We keep them until our online shop opens, and for 12 months at most, then delete them. If you ask us to remove you sooner, we do."],
        ["The scrambled connection code.", "It's deleted together with the enquiry or sign-up it belongs to."],
        ["Emails.", "We keep emails only as long as we need them for the reason you wrote to us."],
        ["Security logs.", "Our host keeps them only as long as it needs to protect the site."],
      ],
    },
    {
      key: "security",
      title: "How we protect it",
      body: [
        "Everything between your browser and this site is encrypted (HTTPS), and the site tells browsers to connect to it only that way.",
        "Only the people who need your details for their work can see them, and connection addresses are kept only as scrambled codes.",
        "If your details are ever accessed by someone who shouldn't have them, we'll tell you and the Information Regulator as soon as reasonably possible, as POPIA requires (section 22).",
      ],
    },
    {
      key: "rights",
      title: "Your rights",
      body: [
        ["See your details.", "Ask us whether we hold details about you, and for a copy. Our {paia} explains how to request records."],
        ["Correct or delete them.", "Ask us to correct details that are wrong, out of date or incomplete, or to delete them."],
        ["Object.", "Object to us using your details, for example to keep the site secure."],
        ["Withdraw your consent.", "You can withdraw your consent at any time. It doesn't affect what we did before, but we'll stop using your details for your enquiry or sign-up. To stop launch messages, use the unsubscribe link in any of them, or email us."],
        ["Complain.", "Complain to the Information Regulator at {regulator}. You don't have to come to us first, but we'd welcome the chance to put things right."],
        ["How to ask.", "Email {email} and tell us what you'd like. We'll check it's you, then answer within 30 days."],
      ],
    },
    {
      key: "adults",
      title: "This site is for adults",
      body: ["Herbal Holland is for adults aged 18 and over. We don't knowingly collect information from anyone younger than 18, and if we find we have, we delete it."],
    },
    {
      key: "changes",
      title: "Changes to this policy",
      body: ["When we change this policy, we'll publish the new version on this page, with a new version number and date at the top."],
    },
    {
      key: "contact",
      title: "Contact",
      body: ["Questions about this policy or your details: email {email}, for the attention of our Information Officer, {officer}.", "The Information Regulator: {regulator}."],
    },
  ],
} as const satisfies LegalDoc;

/** The Terms of Use for herbalholland.com. The company's details (ECT Act s43) come from ./facts: never invent them. */
export const TERMS = {
  meta: {
    title: "Terms of Use",
    description: "The terms for using herbalholland.com: who we are, what the site is for, careers information, our content, and the law that applies.",
    updated: "2026-10-07",
  },
  version: "1.2",
  updated: "2026-10-07",
  hero: { eyebrow: "Legal", title: "Terms of Use", lede: "The terms for using herbalholland.com, in plain English." },
  summary: {
    title: "In short",
    points: [
      "This site is for adults 18 and over, and by using it you accept these terms.",
      "It's information only: nothing is sold here, and nothing on it is medical advice.",
      "Our name, windmill and content are ours. Press may use our logos, unaltered, to refer to us.",
      "South African law applies.",
    ],
  },
  sections: [
    {
      key: "about",
      title: "About these terms",
      body: ["These terms apply when you use herbalholland.com. By using the site you accept them; if you don't, please don't use it.", "The site is for adults aged 18 and over only."],
    },
    {
      key: "who",
      title: "Who we are",
      body: ["This website is run by {legalName}, which owns Herbal Holland's online business. Section 43 of the Electronic Communications and Transactions Act asks us to publish these details:", "{company}", ["Email:", "{email}"], ["Website:", "herbalholland.com"]],
    },
    {
      key: "what",
      title: "What this site is",
      body: ["It's information about Herbal Holland: who we are, our stores, press and careers.", "Nothing is sold on this site. Our online shop and Herbal Holland Rewards have their own terms, which apply when you use them."],
    },
    {
      key: "medical",
      title: "No medical advice",
      body: [
        "Nothing on this site is medical advice. For advice about your health, speak to a doctor or pharmacist.",
        "Licensed medicines are supplied only by our pharmacists, to registered patients with a SAHPRA authorisation.",
        "Nothing on this site is an offer to supply any product.",
      ],
    },
    {
      key: "careers",
      title: "Careers",
      body: ["The roles on our careers page show the kind of people we hire. They don't mean a position is open.", "Applying doesn't create employment or a promise of it. Store roles are with the franchisee who owns the store."],
    },
    {
      key: "ip",
      title: "Our name, marks and content",
      body: [
        "The Herbal Holland name, the windmill mark and the content of this site (its words, pictures and design) belong to Herbal Holland or are used with permission.",
        "Journalists and publishers may use the logos on our {press} to refer to Herbal Holland accurately, as long as they're not altered.",
        "Anything else needs our written permission first: ask us at {email}.",
      ],
    },
    {
      key: "use",
      title: "Using the site properly",
      body: ["Please use the site lawfully. Don't scrape it or collect contact details from it to send unsolicited messages, don't try to get around its security or interfere with how it works, and don't send false or automated enquiries."],
    },
    {
      key: "links",
      title: "Links to other sites",
      body: ["We link to a few other sites, such as the Information Regulator and support services. We don't control them, and we aren't responsible for their content or how they handle your information."],
    },
    {
      key: "accuracy",
      title: "Accuracy and changes to the site",
      body: ["We work to keep the site accurate and up to date, but information on it, including opening dates, may change without notice.", "We may change, suspend or remove any part of the site at any time."],
    },
    {
      key: "liability",
      title: "Liability",
      body: [
        "To the extent the law allows, Herbal Holland isn't liable for any loss that comes from using this site or relying on its information.",
        "Nothing in these terms limits any right you have under the Consumer Protection Act or any other law that can't be excluded, or our liability for gross negligence.",
      ],
    },
    {
      key: "privacy",
      title: "Privacy",
      body: ["How we handle personal information is set out in our {privacy}, and how to request records we hold in our {paia}."],
    },
    {
      key: "law",
      title: "Governing law",
      body: ["These terms are governed by the law of the Republic of South Africa, and South African courts have jurisdiction."],
    },
    {
      key: "changes",
      title: "Changes to these terms",
      body: ["We may update these terms. The version and date at the top show when they last changed, and using the site after a change means you accept the new version."],
    },
    {
      key: "contact",
      title: "Contact",
      body: ["Questions about these terms: email {email}."],
    },
  ],
} as const satisfies LegalDoc;

/**
 * The PAIA manual: what section 51 of the Promotion of Access to Information Act asks a private body to publish, with
 * the personal-information details POPIA added to it (s51(1)(c)). It covers the company in ./facts (company.legalName)
 * and names its Information Officer (officer). The forms and fees are the ones the PAIA and POPIA Regulations prescribe,
 * so no amounts are quoted. Change what the business holds, or who it shares with, and change this too.
 */
export const PAIA = {
  meta: {
    title: "PAIA manual",
    description: "How to request the records we hold under the Promotion of Access to Information Act (PAIA), the fees and timelines, and how we handle personal information.",
    updated: "2026-10-07",
  },
  version: "1.2",
  updated: "2026-10-07",
  hero: {
    eyebrow: "Legal",
    title: "PAIA manual",
    lede: "How to request the records we hold, under the Promotion of Access to Information Act 2 of 2000 (PAIA), and how we handle personal information.",
  },
  summary: {
    title: "In short",
    points: [
      "This manual covers {legalName}, which owns Herbal Holland's online business: this website, the online shop and Herbal Holland Rewards.",
      "Some records are open to everyone. For the rest, send the prescribed form to our Information Officer, {officer}, at {email}.",
      "There's no request fee when you ask for your own personal information.",
      "We decide within 30 days. If we refuse, we tell you why, and you can complain to the Information Regulator.",
      "Stores are owned by franchisees, who keep their own records: ask the store.",
    ],
  },
  sections: [
    {
      key: "about",
      title: "About this manual",
      body: [
        "Section 51 of the Promotion of Access to Information Act 2 of 2000 (PAIA) asks every private body to publish a manual like this one. It explains what records we hold, which of them anyone can see without asking, and how to request the rest.",
        "It also sets out how we handle personal information, as the Protection of Personal Information Act 4 of 2013 (POPIA) requires, and how to use your rights under it.",
        ["Who it covers.", "{legalName}, which owns and runs Herbal Holland's online business: this website, the online shop and Herbal Holland Rewards."],
        ["Stores.", "Herbal Holland stores are owned and run by franchisees: separate businesses that keep their own records. To request a store's records, contact the store. If you're not sure who holds a record, write to us and we'll point you to the right place."],
      ],
    },
    {
      key: "contact",
      title: "Contact details",
      body: [["Information Officer:", "{officer}"], ["Email:", "{email}, for the attention of the Information Officer"], "{company}", ["Website:", "herbalholland.com"]],
    },
    {
      key: "guide",
      title: "The Information Regulator's guide",
      body: [
        "The Information Regulator publishes a guide to using PAIA and POPIA, as section 10 of PAIA requires. It explains your rights, how to make a request, and the help available to you.",
        "You'll find it on the Regulator's website, {regulator}. You can also ask us for a copy.",
      ],
    },
    {
      key: "open",
      title: "Records anyone can see",
      body: [
        "These records are available without a PAIA request (section 52):",
        ["On this website.", "Information about Herbal Holland, careers and our stores; press releases and our logos; and our Privacy Policy, Terms of Use and this manual."],
        ["In the online shop, once it opens.", "Product information and labels, laboratory results for each product batch, store locations and trading hours, our articles, and the membership terms and privacy notice."],
      ],
    },
    {
      key: "laws",
      title: "Records we keep under other laws",
      body: [
        "We keep records under these laws, among others. Where one of them gives you a right to see a record, you can use it; otherwise, ask under PAIA.",
        ["Companies Act 71 of 2008:", "our memorandum of incorporation, registers of shareholders and directors, minutes, and annual financial statements."],
        ["Income Tax Act 58 of 1962, Value-Added Tax Act 89 of 1991 and Tax Administration Act 28 of 2011:", "tax and VAT returns, invoices, and the records behind them."],
        ["Basic Conditions of Employment Act 75 of 1997, Labour Relations Act 66 of 1995 and Employment Equity Act 55 of 1998:", "employment contracts, pay, working time and leave, and employment equity records."],
        ["Unemployment Insurance Act 63 of 2001, Skills Development Levies Act 9 of 1999 and Compensation for Occupational Injuries and Diseases Act 130 of 1993:", "contributions, levies and claims."],
        ["Occupational Health and Safety Act 85 of 1993:", "health and safety records."],
        ["Consumer Protection Act 68 of 2008:", "membership terms, franchise disclosure documents and agreements, and records of returns and complaints."],
        ["Electronic Communications and Transactions Act 25 of 2002:", "records of online transactions."],
        ["Medicines and Related Substances Act 101 of 1965:", "records of the CBD supplements and licensed medicines supplied, with their batches and suppliers and, for licensed medicines, patients' authorisations."],
        ["Foodstuffs, Cosmetics and Disinfectants Act 54 of 1972:", "labelling and ingredient records for food, drink and skin care."],
        ["Protection of Personal Information Act 4 of 2013:", "records of consent, of requests about personal information, and of security compromises."],
        ["Promotion of Access to Information Act 2 of 2000:", "this manual, and records of requests made under it."],
      ],
    },
    {
      key: "records",
      title: "What we keep records about",
      body: [
        "These are the subjects we hold records on, and the kinds of record in each. A listed record isn't automatically released: every request is weighed against the grounds for refusal below.",
        ["The company:", "incorporation documents, statutory registers, minutes and resolutions, shareholding, and licences and permits."],
        ["Finance and tax:", "financial statements, accounting records, budgets, banking records, invoices, and tax and VAT records."],
        ["Our people:", "employment contracts, pay and benefits, leave, performance and conduct, training, health and safety, and job applications."],
        ["Members:", "membership and age checks, the membership terms each member accepted, orders and invoices, payments, deliveries and collections, Rewards points and tiers, referrals, communication preferences and marketing consents, and messages with us."],
        ["Registered patients:", "for licensed medicines, SAHPRA authorisation details, prescribers, and what was supplied and when."],
        ["Products:", "product details and labels, suppliers' certificates, batches and laboratory results, and recalls."],
        ["Franchisees:", "franchise enquiries, disclosure documents and franchise agreements, and the trading and compliance records of franchisee stores."],
        ["Stores and stock:", "stock, purchasing, sales and cash-banking records from the platform our stores use."],
        ["Suppliers and partners:", "contracts, orders, invoices and contact details."],
        ["Marketing and media:", "campaigns, early-access sign-ups and their consents, other consent records, press releases and media contacts."],
        ["Systems and security:", "user accounts, access and activity logs, backups, and records of security incidents."],
        ["Legal:", "contracts, disputes and legal advice."],
      ],
    },
    {
      key: "request",
      title: "How to request a record",
      body: [
        ["Use the prescribed form.", "Fill in Form 2 of the PAIA Regulations (Request for access to record). It's on the Information Regulator's website, {regulator}, or we can send it to you."],
        ["Send it to our Information Officer.", "Email it to {email}, for the attention of the Information Officer."],
        ["Describe what you want.", "Give enough detail for us to find the record, say how you'd like to receive it (a copy by email or on paper, or to view it), and tell us how to reach you."],
        ["Say which right it serves.", "PAIA gives access to a private body's records that you need to exercise or protect a right (section 50). Tell us which right, and why you need the record for it."],
        ["Show who you are.", "We'll ask for proof of identity and, if you're asking on someone else's behalf, proof that you may act for them."],
        ["Your own personal information.", "To ask what personal information we hold about you, and for a copy (POPIA section 23), use the same form."],
      ],
    },
    {
      key: "fees",
      title: "Fees",
      body: [
        "The PAIA Regulations set the fees a private body may charge, and we charge no more than those.",
        ["A request fee,", "payable when you send your request, unless you're asking for your own personal information."],
        ["An access fee,", "if we give you access: for copies or transcriptions, by the page or the item, and for the time it takes to search for and prepare the record beyond the first hour, up to a set maximum."],
        ["A deposit,", "if the search and preparation will take more than six hours: a third of the access fee, paid before we start. If we then refuse your request, we refund it."],
        "We tell you what applies, in writing, before we do the work.",
      ],
    },
    {
      key: "decision",
      title: "Our decision, and how long it takes",
      body: [
        "We decide within 30 days of receiving your request, and tell you in writing (Form 3 of the PAIA Regulations): whether you'll get access, any fee, and the form access will take.",
        "We may extend that once, by up to 30 days, if your request covers many records, needs a search of records held elsewhere, or needs us to consult others. If we do, we'll tell you why before the first 30 days are up.",
        "If a record holds information about someone else, we tell them about your request and consider what they say before we decide (section 71).",
        "If we can't find a record, or it doesn't exist, we tell you so in an affidavit (section 55).",
        "If you don't hear from us in time, your request counts as refused (section 58), and you can complain to the Information Regulator.",
      ],
    },
    {
      key: "refusal",
      title: "When we may refuse",
      body: [
        "We may refuse access, in full or in part, only on the grounds PAIA sets out. They include:",
        ["Someone else's privacy.", "The record holds personal information about another person (section 63)."],
        ["Others' business information.", "It holds a third party's trade secrets, or financial, commercial or technical information that could harm them (section 64), or information a third party gave us in confidence (section 65)."],
        ["Safety.", "Releasing it could put someone's life or physical safety, or the security of property, at risk (section 66)."],
        ["Legal privilege.", "It's privileged from production in legal proceedings (section 67)."],
        ["Our business information.", "It holds our trade secrets, or financial, commercial or technical information that could harm our business if released (section 68)."],
        ["Research.", "It holds research by us or a third party that releasing it would seriously disadvantage (section 69)."],
        "Even then, we must release a record if it would reveal a substantial breach of the law, or a serious and imminent risk to public safety or the environment, and the public interest in releasing it clearly outweighs the harm (section 70).",
      ],
    },
    {
      key: "disagree",
      title: "If you disagree with our decision",
      body: [
        "There's no internal appeal against a private body's decision. If you're unhappy with our decision, including a refusal, the fees or the time we take, you can complain to the Information Regulator within 180 days, on its prescribed form (Part 4A of PAIA). After that, you can apply to court (section 78).",
        "The Information Regulator: {regulator}.",
      ],
    },
    {
      key: "personal",
      title: "The personal information we process, and why",
      body: [
        "We process personal information to run membership and Herbal Holland Rewards; to sell, deliver and hand over orders with our franchisee stores; to check age and, for licensed medicines, authorisation; to take payments and issue invoices; to send marketing only to members who agree to it; to tell people who've asked for first access when our online shop opens; to answer questions and complaints; to recruit and support franchisees; to employ our people; to work with suppliers; to keep our systems, members and stores secure and stop fraud and theft; and to meet our legal obligations, such as tax, medicine and recall records.",
        ["Members:", "name, mobile number, email address, date of birth or a secure fingerprint of their ID number, home store, orders, payments, delivery addresses, Rewards activity, and communication preferences and consents."],
        ["Registered patients:", "SAHPRA authorisation details, prescriber, and what was supplied; never a diagnosis."],
        ["Franchise applicants and franchisees:", "contact details, where they'd like to open, experience, available capital, what's needed to assess and agree a franchise, and their stores' trading records."],
        ["Our people and job applicants:", "identity and contact details, qualifications, and employment, pay, tax and banking records."],
        ["People who use our systems,", "at head office and in franchisee stores: account details, role, and a record of what they do in the system."],
        ["Suppliers and service providers:", "company details, contact people, banking details and contracts."],
        ["Early-access sign-ups:", "first name (if given), email address and/or mobile number, province (if given), the campaign tag of the link they came from, and their consent, with its date."],
        ["Website visitors and people who contact us:", "what they send us, and routine security logs."],
      ],
    },
    {
      key: "sharing",
      title: "Who we share it with, and where it goes",
      body: [
        ["Recipients.", "Franchisee stores that serve our members; payment, messaging and delivery providers; the hosting and cloud providers that run our systems; professional advisers such as auditors and lawyers; and authorities such as the South African Revenue Service, the South African Health Products Regulatory Authority and the Information Regulator, when the law requires it. Each gets only what it needs, and operators may process it only on our instructions (POPIA sections 20 and 21). We never sell personal information."],
        ["Across borders.", "Some providers store or process information outside South Africa: enquiries and early-access sign-ups from this website, for example, are stored in Cloudflare's European Union region. We send personal information across borders only as POPIA section 72 allows, such as to countries whose laws protect it adequately, or under binding agreements that do."],
      ],
    },
    {
      key: "security",
      title: "How we protect it",
      body: [
        "Encryption between your browser or app and our systems (HTTPS); access limited by role and by store, with a record of sensitive actions; ID numbers kept only as keyed fingerprints, with the last four digits readable; passwords and PINs stored only in scrambled form; backups; and agreements that hold our operators to the same standards.",
        "If personal information is ever accessed by someone who shouldn't have it, we tell the Information Regulator and the people affected as soon as reasonably possible (POPIA section 22).",
      ],
    },
    {
      key: "rights",
      title: "Your rights over your personal information",
      body: [
        "You can ask whether we hold personal information about you, and for a copy (POPIA section 23); ask us to correct or delete it (section 24); and object to our processing it (section 11(3)).",
        "For a copy, use Form 2 of the PAIA Regulations. To object, use Form 1 of the POPIA Regulations; to ask for a correction or deletion, Form 2 of the POPIA Regulations. Send them to {email}.",
        "You can also complain to the Information Regulator, at {regulator}.",
      ],
    },
    {
      key: "manual",
      title: "Where to find this manual",
      body: [
        "This manual is published on this website. It's also available at our head office, and from our Information Officer on request.",
        "We review it at least once a year, and whenever what we hold, or how we handle it, changes. The version and date at the top show when it last changed.",
      ],
    },
  ],
} as const satisfies LegalDoc;

// ── 404 ──────────────────────────────────────────────────────────────────────
export const NOT_FOUND = {
  meta: { title: "Page not found", description: "This page isn't here. Find your way back to Herbal Holland.", updated: "2026-09-28" },
  eyebrow: "404 · Page not found",
  title: "Lost in the hills",
  body: "This page has blown away on the wind. Let's get you back on the path.",
  home: "Back to the homepage",
  try: "Or try",
} as const;
