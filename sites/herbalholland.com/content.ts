// herbalholland.com — every word on the site, in one place. The static site (./build.ts) renders its pages from here,
// and tests/site-copy.test.ts runs every string through screenCopy() (no allow-list) and our voice rules, so edit copy
// here and keep that test green. `{name}` placeholders are filled at build time from ./facts by `fill`.
// What .com may say (docs/MARKETING-PLAN.md §1, docs/COMPLIANCE.md): brand, standards, franchise, press and careers —
// no products, prices, deals or health claims; licensed medicines only as a pharmacist service for registered patients;
// facts only from ./facts (no invented numbers, founders, partners, awards or dates).
// The retiring React pages in src/app/site still import this module (through src/components/site/content.ts), so keep
// the keys they use; the static site adds its own.
import { num } from "@/lib/format";
import { FACTS } from "./facts";

export type Item = { key: string; title: string; body: string };
export type Faq = { q: string; a: string };
/** A press release. `date` is YYYY-MM-DD (SAST); a release shows from that day on. */
export type Release = { date: string; title: string; summary: string };

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
  idea: "Holland, meet the Hills.",
  adults: "Adults 18+",
  // Share image (og.png).
  og: { alt: "Herbal Holland — Dutch heritage. African soil.", sub: "Our story · Franchise · Press · Careers", age: "Adults 18+ only" },
} as const;

// ── The 18+ gate ─────────────────────────────────────────────────────────────
export const GATE = {
  title: "Are you 18 or older?",
  body: "Herbal Holland is for adults only. Please confirm your age to continue.",
  yes: "I'm 18 or older",
  no: "I'm younger than 18",
  remember: "We remember your answer on this device for a year.",
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
    { key: "franchise", label: "Franchise" },
    { key: "press", label: "Press" },
    { key: "careers", label: "Careers" },
    { key: "contact", label: "Contact" },
  ],
  navLabel: "Main",
  menu: { open: "Menu", close: "Close", label: "Menu", home: "Home" },
  cta: { founding: "Founding Members", join: "Join Rewards", shop: "Shop online", finder: "Find a store", learn: "Learn" },
  /** Read out after a door that isn't open yet ("Shop online, opening soon"). */
  soonSr: ", opening soon",
  /** The desktop cursor's label over a door that isn't open yet. */
  cursorSoon: "Soon",
  footer: {
    line: ["Dutch heritage.", "African soil."],
    cols: { company: "Herbal Holland", members: "Members", contact: "Talk to us" },
    contact: { hello: "General", franchise: "Franchising", press: "Press", careers: "Careers" },
    age: "For adults 18 and older only. Licensed medicines are supplied only to registered patients with a valid SAHPRA authorisation, by an authorised dispenser. Nothing on this site is medical advice.",
    owned: "Herbal Holland stores are independently owned and operated by franchisees.",
    copy: "© {year} Herbal Holland",
    top: "Back to top",
  },
} as const;

// ── Home ─────────────────────────────────────────────────────────────────────
export const HOME = {
  meta: {
    title: "Herbal Holland — Dutch heritage. African soil.",
    description:
      "Herbal Holland is a South African, members-only network of cannabis wellness stores for adults 18+. Our first two stores open in Hillcrest and Hilton, KwaZulu-Natal, on {opening}.",
  },
  hero: {
    eyebrow: "Herbal Holland · South Africa",
    title: ["Holland,", "meet the", "Hills."],
    kicker: "Hillcrest and Hilton, KwaZulu-Natal · Opening {opening}",
    lede: "A South African, members-only network of cannabis wellness stores for adults 18+: the Amsterdam coffee-shop tradition of a warm welcome and knowing exactly what we offer, rooted in Southern Africa's own growers.",
    note: "For adults 18+ only.",
    primary: "Be a Founding Member",
    secondary: "Our story",
    cue: "Scroll",
  },
  // What's in store: categories only (no product names, prices or anything a product does).
  range: {
    eyebrow: "What's in store",
    title: "Wellness, tested",
    intro: "CBD wellness, functional coffee and protein, skin care and collagen: all lab-tested and batch-traceable, for members aged 18 and over.",
    items: ["CBD wellness", "Functional coffee", "Protein", "Skin care", "Collagen"],
    note: "Licensed medicines are a separate pharmacist service, only for registered patients with a SAHPRA authorisation.",
  },
  marquee: {
    label: "What we stand for",
    words: ["Lab-tested", "Batch-traceable", "Members only", "Adults 18+", "Pharmacist-led"],
  },
  journey: {
    eyebrow: "Holland, meet the Hills",
    unit: "km",
    title: "from Amsterdam to the hills",
    sr: "{km}\u00a0km — from Amsterdam to the hills",
    lede: "Holland is famously flat. Both our first towns are hill towns. This is how the windmill came to the hills.",
    from: "Amsterdam",
    to: "Hillcrest",
    toBoth: "Hillcrest · Hilton",
    readout: { lat: "Latitude", lon: "Longitude", dist: "Distance" },
    caption: "A globe showing the great circle from Amsterdam ({from}) to Hillcrest, KwaZulu-Natal ({to}): {km}\u00a0km.",
    chapters: [
      {
        key: "tradition",
        label: "The tradition",
        title: "A warm welcome, and knowing what we offer",
        body: "Amsterdam's coffee shops made one idea famous: a warm welcome at the door, and someone who can tell you exactly what's on offer. That's the Dutch heritage we carry.",
      },
      {
        key: "soil",
        label: "The soil",
        title: "Rooted in Southern Africa",
        body: "Southern Africa's landraces were shaped over generations on hillsides like these, long before Amsterdam knew their names. African soil is the bigger half of who we are.",
      },
      {
        key: "standard",
        label: "The standard",
        title: "Tested, traceable, members only",
        body: "An independent lab tests every batch before it's sold, and the code on the pack traces it back to the farm. We sell to members only, and check ID every time.",
      },
      {
        key: "welcome",
        label: "The welcome",
        title: "Welkom. Sawubona.",
        body: "Our first two stores open in Hillcrest and Hilton on {opening}, {apart}\u00a0km apart in the KwaZulu-Natal hills.",
      },
    ],
  },
  doors: {
    eyebrow: "Three ways in",
    title: "Shop with us, join us, or own a store",
    shop: {
      label: "Shop",
      title: "Shop online",
      body: "Our online shop is at {shop}. Order for delivery across South Africa, or click & collect at a store near you. ID is checked at every handover.",
      // Before the first store trades there is nothing to collect from.
      bodyOnline: "Our online shop is at {shop}, delivering across South Africa. ID is checked at every delivery.",
      cta: "Visit the shop",
      soon: "Our online shop is on its way, delivering across South Africa to adults 18+, with ID checked at every handover.",
    },
    join: {
      label: "Rewards",
      title: "Join Herbal Holland Rewards",
      body: "One free membership for every Herbal Holland store and our online shop. We sell to members only, and joining takes about a minute.",
      cta: "Join free",
      soon: "One free membership for every Herbal Holland store and our online shop. We sell to members only. Joining opens soon.",
    },
    founding: {
      tag: "List now open",
      title: "Be a Founding Member",
      body: "Join Herbal Holland Rewards free before the list closes on {closes}. The first {cap} members on the list get a numbered Founding Member card.",
      cta: "Join the list",
    },
    franchise: {
      label: "Franchise",
      title: "Own a store",
      body: "Every Herbal Holland store is owned and run by a local franchisee. If you know retail and your community, we'd like to hear from you.",
      cta: "About franchising",
    },
  },
  standards: {
    eyebrow: "Our standards",
    title: "The same standards in every store",
    intro: "They're built into the software every store runs on, so they hold on a busy Saturday as well as a quiet Tuesday.",
    items: [
      { key: "lab", title: "Lab-tested and batch-traceable", body: "An independent lab tests every batch before it's sold. The code on the pack opens that batch's result and traces it back to the farm." },
      { key: "members", title: "Members only", body: "We sell to members only, in store and online. Joining Herbal Holland Rewards is free, and the key terms are shown in plain language first." },
      { key: "adults", title: "Adults 18+", body: "We check ID at the till and at every collection and delivery. Everything we do is for adults." },
      { key: "medicines", title: "A pharmacist-led medical route", body: "Licensed medicines are supplied only to registered patients with a SAHPRA authorisation, through our pharmacists. They're never advertised or discounted." },
    ] satisfies Item[],
    cta: "Our story and standards",
    // The lab card types an example batch code, then ticks it.
    demo: { label: "Batch code", code: "HH-2612-0001", check: "Tested before sale", example: "Example" },
    members: { id: "Members · ID checked" },
    pharmacist: "Pharmacist",
  },
  numbers: {
    eyebrow: "The first chapter",
    title: "Two stores, one opening day",
    items: [
      { key: "stores", label: "stores opening in KwaZulu-Natal" },
      { key: "date", label: "{year}: both doors open" },
      { key: "founding", label: "Founding Members places" },
      { key: "km", label: "km between Hillcrest and Hilton" },
    ],
  },
  stores: {
    eyebrow: "Where we're opening",
    title: "Holland is flat. KwaZulu-Natal isn't.",
    intro: "Both our first towns are hill towns, and each store is owned and run by a local franchisee.",
    items: [
      { key: "hillcrest", area: "Upper Highway, eThekwini", line: "From the flatlands to the Valley of a Thousand Hills." },
      { key: "hilton", area: "KZN Midlands", line: "From the polders to the Midlands." },
    ],
    opens: "Opens {opening}",
    apart: "{km}\u00a0km apart",
    finder: "Find a store",
    finderSoon: "Store pages, with directions and opening hours, are on their way.",
  },
  founding: {
    eyebrow: "Herbal Holland Rewards",
    title: "Be one of the first {cap}",
    body: "The first {cap} members of Herbal Holland Rewards become Founding Members, with a numbered card and our {tier} tier for {months} months. Joining is free, for adults 18+.",
    points: ["A numbered Founding Member card", "The {tier} tier for {months} months", "Free to join, adults 18+"],
    cta: "Join Rewards",
    soon: "Rewards isn't open yet. When it is, you'll be able to join right here.",
    card: { brand: "Rewards", label: "Founding Member", no: "No.", of: "of {cap}" },
  },
  footprint: {
    eyebrow: "Where we are",
    title: "Local stores. One windmill.",
    body: "Each store is independently owned and run by a local franchisee. Opening hours, directions and events for every store are on the store finder.",
    empty: "Our first stores are on their way.",
    trading: ["store trading", "stores trading"],
    soon: ["store opening soon", "stores opening soon"],
    provinces: ["province", "provinces"],
    chips: "Trading stores by province",
    cta: "Find a store",
  },
  more: {
    eyebrow: "More from Herbal Holland",
    title: "Owners, press and careers",
    items: [
      { key: "franchise", title: "Own a Herbal Holland store", body: "We're looking for owner-operators who know retail and their community." },
      { key: "press", title: "News and media", body: "Releases, our fact sheet, brand assets and how to write about us." },
      { key: "careers", title: "Work with us", body: "Warm people who like explaining things simply, in our stores and at HQ." },
    ] satisfies Item[],
    cta: { franchise: "Franchising", press: "Press room", careers: "Careers" },
  },
  // Organization structured data.
  org: { franchise: "franchise enquiries", press: "media enquiries", careers: "careers", hello: "general enquiries" },
} as const;

// ── About ────────────────────────────────────────────────────────────────────
export const ABOUT = {
  meta: {
    title: "Our story and standards",
    description:
      "Where Herbal Holland comes from and the standards we keep: lab-tested batches with public results, members only, adults 18+, CBD wellness under Schedule 0, and licensed medicines only through a pharmacist.",
  },
  hero: {
    eyebrow: "About Herbal Holland",
    title: "Our story, and the standards we keep",
    lede: "We bring the Amsterdam coffee-shop tradition of a warm welcome and knowing exactly what you're offering to South Africa, and root it in Southern Africa's own landraces and growers.",
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
    promises: ["Southern African growers, makers and places first", "Every batch lab-tested and traceable to the farm", "Licensed products only through lawful channels"],
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
  owners: {
    eyebrow: "Owned locally",
    title: "Every store is run by someone local",
    body: "Each Herbal Holland store is independently owned and run by a local franchisee, on one shared platform and one set of standards.",
    cta: "Own a store",
  },
  visit: {
    title: "See for yourself",
    body: "Find a store near you, or read our plain-English guides to lab results, Schedule 0 and Section 21 on Learn.",
    soon: "Our store finder and Learn, our plain-English guides to lab results, Schedule 0 and Section 21, are on their way. Our first two stores open on {opening}.",
    stores: "Find a store",
    learn: "Read Learn",
  },
} as const;

// ── Franchise ────────────────────────────────────────────────────────────────
export const FRANCHISE = {
  meta: {
    title: "Own a store",
    description:
      "Own a Herbal Holland store: who we're looking for, what owners get, how it works from enquiry to opening day, and how to register your interest.",
  },
  hero: {
    eyebrow: "Franchise with Herbal Holland",
    title: "Own a Herbal Holland store",
    lede: "Every Herbal Holland store is owned and run by a local franchisee. We're growing carefully, with owner-operators who know retail and their community, and who want to do this properly.",
    timing: "Our first stores open first, and franchising opens once they have traded. Register your interest now and we'll be in touch when it does.",
    enquire: "Register your interest",
    how: "How it works",
  },
  who: {
    eyebrow: "Who we're looking for",
    title: "Owner-operators, rooted locally",
    items: [
      { key: "operator", title: "An owner-operator with retail experience", body: "You'll run the store yourself: leading the team, looking after members and keeping the standards. You've run a store or led a team in retail before." },
      { key: "capital", title: "Capital", body: "Opening a store takes investment, and you'll need your own capital. The full investment and fees are set out in our disclosure document." },
      { key: "standing", title: "Standing in your community", body: "People know you and trust you. Our stores are good neighbours, and that starts with the owner." },
      { key: "pharmacist", title: "A pharmacist partner", body: "Licensed medicines go only through a pharmacist, to registered patients, so you'll need access to a pharmacist who is part of the store." },
    ] satisfies Item[],
  },
  offer: {
    eyebrow: "What owners get",
    title: "A platform, a brand and a playbook",
    intro: "One platform runs every store in the network, and it comes with the brand, the opening playbook and the training to use them.",
    groups: [
      {
        title: "The platform",
        items: [
          { key: "tills", title: "Offline-first tills", body: "Tap-on-glass tills that keep trading through load-shedding and dropped connections, and sync when they're back." },
          { key: "stock", title: "Stock and ordering", body: "Suggested orders filled from HQ distribution centres, batch tracking from delivery to sale, and simple stock counts." },
          { key: "finance", title: "Finance and reports", body: "Cash-ups and banking, one monthly statement, and live reports for your store." },
          { key: "rewards", title: "Herbal Holland Rewards", body: "One national membership that works in every store and online, so members can come back to yours." },
          { key: "online", title: "Online orders", body: "Click & collect and delivery orders from the online shop, fulfilled by your store and credited to it." },
          { key: "compliance", title: "Compliance built in", body: "ID checks, the patient register, Schedule 0 limits and screened marketing are part of the software, not an afterthought." },
        ] satisfies Item[],
      },
      {
        title: "The brand and the launch",
        items: [
          { key: "brand", title: "The brand", body: "The windmill, the orange frame and the standards behind them, with artwork for your windows, signs and in-store screens." },
          { key: "range", title: "The range", body: "CBD wellness, functional coffee and protein, skin care and collagen, supplied through HQ, with every batch lab-tested and traceable." },
          { key: "playbook", title: "A launch playbook", body: "A ten-week opening plan: meeting the neighbours, hiring, the reveal, press, the opening evening and Open Day." },
          { key: "events", title: "Drops and events", body: "Members' evenings, open days and limited drops, planned with HQ and announced to members." },
          { key: "training", title: "Training", body: "Training for you and your team before you open: the platform, ID checks, compliance and the dispensary. HQ stays on hand after that." },
        ] satisfies Item[],
      },
    ],
  },
  steps: {
    eyebrow: "How it works",
    title: "From enquiry to opening day",
    intro: "Seven steps, taken at your pace. Nothing is signed until you've had our disclosure document for at least 14 days.",
    step: "Step {n}: ",
    badge: "At least 14 days before signing",
    items: [
      { key: "enquire", title: "Enquire", body: "Tell us about yourself and the area you have in mind. It takes a few minutes." },
      { key: "call", title: "A call", body: "We'll call you to talk about your experience, your area and your questions." },
      { key: "evening", title: "An information evening", body: "Meet the team, see how a store runs and ask us anything." },
      { key: "disclosure", title: "The disclosure document", body: "You receive our disclosure document at least 14 days before anything is signed, as the Consumer Protection Act's franchise regulations require. It sets out the full investment and fees. Take advice, and take your time." },
      { key: "site", title: "Site, licences and permits", body: "We work with you on the right site and on the licences and permits the store needs." },
      { key: "training", title: "Training", body: "You and your team train on the platform, ID checks, compliance and the dispensary." },
      { key: "opening", title: "Opening", body: "The launch playbook takes you from the reveal to opening day, with HQ beside you." },
    ] satisfies Item[],
  },
  faq: {
    eyebrow: "Questions",
    title: "Straight answers",
    intro: "Can't see yours? Ask us at",
    items: [
      { q: "What does it cost to open a store?", a: "The full investment and fees are set out in the disclosure document, which you receive at least 14 days before anything is signed. We're glad to talk them through on the call and at the information evening." },
      { q: "How much will I earn?", a: "We don't publish earnings projections. What a store earns depends on its site, its team and how it's run. Once our first stores have a trading history, we'll share only figures we can back up." },
      { q: "When can I open a store?", a: "Our own first stores open first. Franchising opens once they have traded, so the playbook and the figures are real rather than a forecast. Register your interest now and we'll invite you to an information evening when the time comes." },
      { q: "Do I need to be a pharmacist?", a: "No, but you need a pharmacist partner. Licensed medicines are dispensed only by a pharmacist, to registered patients with a SAHPRA authorisation, so every store needs one." },
      { q: "Where can I open?", a: "Tell us the area you have in mind. Every site is checked against the licences it needs and against our own siting rules, which are stricter than the law." },
      { q: "Can I set my own prices?", a: "Yes. HQ recommends retail prices, and you set your own." },
      { q: "What happens after opening day?", a: "The platform, the reports and HQ stay with you, and so does the calendar of members' evenings, drops and events." },
      { q: "What happens to my enquiry?", a: "Only our HQ team sees it, and we use it only to reply to you. If it doesn't go further, we delete it a year after we last worked on it, and you can ask us to delete it sooner." },
    ] satisfies Faq[],
  },
  enquire: {
    eyebrow: "Register your interest",
    title: "Tell us about yourself",
    body: "It takes a few minutes, and we read every enquiry. If it looks like a fit, we'll be in touch to arrange a call.",
    email: "Prefer email? Write to us at",
  },
  // The enquiry form (posts JSON to /api/enquiry). Field errors normally come back from the server; these mirror its
  // wording for the checks the page makes before sending.
  form: {
    label: "Franchise enquiry",
    fields: {
      name: { label: "Your name" },
      email: { label: "Email address" },
      phone: { label: "Mobile number", hint: "A South African mobile, e.g. 082 123 4567" },
      area: { label: "Where would you like to open?", hint: "A town or area, e.g. Ballito, or Parkhurst in Johannesburg" },
      province: { label: "Province", placeholder: "Choose a province" },
      capital: { placeholder: "Choose a band", hint: "Your own funds you could invest; a rough band is fine. It isn't what a store costs: we'll take you through the full investment." },
      experience: { label: "Your retail or business experience", hint: "A few lines on what you've run or managed, and for how long." },
      pharmacist: { label: "Do you have access to a pharmacist partner?", yes: "Yes", no: "No", hint: "Our stores need a pharmacist for licensed medicines. No partner yet? That's fine: say no." },
      message: { label: "Anything else you'd like us to know?", optional: "(optional)", hint: "Up to {n} characters." },
      consent: { label: "Herbal Holland may use these details to reply to my franchise enquiry." },
      website: { label: "Website (leave this empty)" },
    },
    privacy: "We keep your enquiry only to reply to you, and we delete enquiries that don't go ahead within a year.",
    submit: "Send my enquiry",
    sending: "Sending your enquiry…",
    noscript: "Please enable JavaScript to send this form, or email us at",
    errors: {
      summary: "Please check the highlighted fields.",
      name: "Tell us your name",
      email: "Enter your email address — we reply by email",
      emailShape: "That doesn't look like an email address — check it for typos",
      phone: "Enter a mobile number we can call you on",
      area: "Tell us where you'd like to open — a town or area",
      province: "Choose a province",
      experience: "Tell us about your retail or business experience",
      experienceShort: "A little more, please — at least {n} characters",
      capital: "Choose the band closest to what you could put in",
      pharmacist: "Choose yes or no",
      consent: "Tick the box so we can use your details to reply",
      busy: "You've sent us a few enquiries in a short time. Please try again later, or email us at {email}.",
      server: "Something went wrong sending your enquiry. Please try again in a minute, or email us at {email}.",
      network: "We couldn't reach our server just now. Check your connection and try again, or email us at {email}.",
    },
    done: {
      title: "Thank you: your enquiry is in",
      reference: "Your reference is",
      keep: "Keep it handy if you write to us.",
      next: "What happens next",
      steps: [
        "We read every enquiry and reply by email within a few working days.",
        "If it looks like a fit, we'll invite you to an information evening to meet the team and see how a Herbal Holland store works.",
        "If you'd like to go further, you'll get our disclosure document at least 14 days before anything is signed, as the Consumer Protection Act's franchise regulations require.",
      ],
    },
  },
} as const;

// ── Press ────────────────────────────────────────────────────────────────────
export const PRESS = {
  meta: {
    title: "Press",
    description: "Herbal Holland press releases, fact sheet, brand assets, style notes and media contact.",
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
    items: [
      {
        date: "2026-10-01",
        title: "Herbal Holland opens online for adults 18+ across South Africa",
        summary:
          "Herbal Holland's online shop opens nationwide today, and so does its Founding Members list: joining Herbal Holland Rewards is free, and the first 2,026 people on the list get a numbered Founding Member card. The first two stores, in Hillcrest and Hilton in KwaZulu-Natal, open on Tuesday 1 December 2026.",
      },
    ] satisfies Release[],
  },
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
      storesNone: "Our first stores are on their way.",
      trading: "{n} trading",
      soon: "{n} opening soon",
      opening: "{n} opening on {opening}: {names}, KwaZulu-Natal, about {km}\u00a0km apart",
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

/** Releases dated `day` (YYYY-MM-DD, SAST) or earlier, newest first — a planned release appears on its date. */
export const releasesOn = (day: string): Release[] => PRESS.releases.items.filter((r) => r.date <= day).sort((a, b) => b.date.localeCompare(a.date));

// ── Careers ──────────────────────────────────────────────────────────────────
export const CAREERS = {
  meta: {
    title: "Careers",
    description: "Work with Herbal Holland: member advisors, store managers and pharmacists in our stores, and teams at HQ. What we look for and how to apply.",
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
        { key: "pharmacist", title: "Pharmacists", aka: "For registered pharmacists", body: "Lead the dispensary for registered patients: verifying SAHPRA authorisations, dispensing, and straight answers for anyone who asks." },
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
    description: "Contact Herbal Holland: general enquiries, franchising, press, careers and members.",
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
    franchise: { title: "Franchising", body: "Owning a Herbal Holland store. You can also use the enquiry form.", link: "Franchise enquiry form" },
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
    franchiseesSoon: "Herbal Holland stores are independently owned and operated by franchisees. Each store's own details will be on its store page.",
    stores: "Store finder",
    legal: { title: "Legal", privacy: "Privacy notice (POPIA)", paia: "PAIA manual", terms: "Membership terms" },
  },
} as const;

// ── 404 ──────────────────────────────────────────────────────────────────────
export const NOT_FOUND = {
  meta: { title: "Page not found", description: "This page isn't here. Find your way back to Herbal Holland." },
  eyebrow: "404 · Page not found",
  title: "Lost in the hills",
  body: "This page has blown away on the wind. Let's get you back on the path.",
  home: "Back to the homepage",
  try: "Or try",
} as const;
