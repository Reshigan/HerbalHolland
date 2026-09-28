// herbalholland.com — every word on the site, in one place. The static site (./build.ts) renders its pages from here,
// and tests/site-copy.test.ts runs every string through screenCopy() (no allow-list) and our voice rules, so edit copy
// here and keep that test green. `{name}` placeholders are filled at build time from ./facts by `fill`.
// What .com may say (docs/MARKETING-PLAN.md §1, docs/COMPLIANCE.md): brand, standards, franchise, press and careers —
// no products, prices, deals or health claims; licensed medicines only as a pharmacist service for registered patients;
// facts only from ./facts (no invented numbers, founders, partners, awards or dates).
// In running text, {email}, {privacy}, {terms}, {press} and {regulator} become links (see Rich in ./src/ui).
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
  idea: "Holland, meet South Africa.",
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
// Counts, dates, places and provinces come from the stores list in ./facts, filled in at build time.
export const HOME = {
  meta: {
    title: "Herbal Holland — Dutch heritage. African soil.",
    description:
      "Herbal Holland is a South African, members-only network of cannabis wellness stores for adults 18+. Our first stores open in {provinces} on {opening}, with more to be announced.",
    descriptionOpen: "Herbal Holland is a South African, members-only network of cannabis wellness stores for adults 18+, in {provinces}, with more stores to be announced.",
  },
  hero: {
    eyebrow: "Herbal Holland · South Africa",
    title: ["Holland, meet", "South Africa."],
    kicker: "Our first stores open in {provinces} on {opening}. More stores to be announced.",
    // Once no store is still waiting to open.
    kickerOpen: "Stores open in {provinces}, with more to be announced.",
    note: "For adults 18+ only.",
    primary: "Be a Founding Member",
    secondary: "Find a store",
    cue: "Scroll",
    art: "An illustration of a Herbal Holland store at dusk: a charcoal and oak front, the round windmill sign lit in orange, an African geometric panel beside the door, warm light on oak shelves inside, and proteas and aloes in terracotta pots.",
  },
  // What we are, in one sentence, lit word by word as it's read.
  statement:
    "A South African, members-only network of cannabis wellness stores for adults 18+: the Amsterdam coffee-shop tradition of a warm welcome and knowing exactly what we offer, rooted in Southern Africa's own growers.",
  brand: {
    eyebrow: "Our brand",
    title: "What Herbal Holland stands for",
    intro: "It's built into the platform every store runs on, so it holds on a busy Saturday as well as a quiet Tuesday.",
    items: [
      { key: "heritage", title: "Dutch heritage", body: "The Amsterdam coffee-shop tradition: a warm welcome, and someone who can tell you exactly what's on offer." },
      { key: "lab", title: "Lab-tested and traceable", body: "An independent lab tests every batch before it's sold, and the code on the pack traces it back to the farm." },
      { key: "members", title: "Members only", body: "We sell to members only, in store and online, and check ID every time. Everything we do is for adults 18+." },
      { key: "rewards", title: "Herbal Holland Rewards", body: "One free membership for every store and our online shop, with a numbered card for each of our first {cap} Founding Members." },
    ] satisfies Item[],
    cta: "Our story and standards",
    // The cards' pictures: a typed example batch code, the member ID, the route and the Rewards card.
    demo: { label: "Batch code", code: "HH-2612-0001", check: "Tested before sale", example: "Example" },
    members: { id: "Members · ID checked" },
    rewards: "Rewards",
  },
  // On the shelf: categories only (no product names, prices or anything a product does).
  shelf: {
    eyebrow: "On the shelf",
    title: "Wellness, tested",
    intro: "CBD wellness, coffee and food, skin care and supplements, all lab-tested and batch-traceable, for members aged 18 and over.",
    items: [
      { key: "cbd", title: "CBD wellness", body: "Every batch lab-tested." },
      { key: "food", title: "CBD coffee & food", body: "Ingredients and allergens on every pack." },
      { key: "skin", title: "CBD skin care", body: "Creams and balms, lab-tested." },
      { key: "supplements", title: "Collagen & protein supplements", body: "Clearly labelled, batch by batch." },
      { key: "accessories", title: "Accessories", body: "Storage, tools and everyday extras." },
      { key: "apparel", title: "Apparel", body: "Wear the windmill." },
      { key: "grow", title: "Grow", body: "Soil, pots and tools." },
    ] satisfies Item[],
    shop: { title: "Shop online", body: "Delivery across South Africa, or click & collect at a store.", soon: "Our online shop opens soon, for members aged 18 and over." },
    go: "Shop {name}",
    note: "Licensed medicines are a separate pharmacist service, only for registered patients with a SAHPRA authorisation.",
  },
  marquee: {
    label: "What we stand for",
    words: ["Lab-tested", "Batch-traceable", "Members only", "Adults 18+", "Pharmacist-led"],
  },
  journey: {
    eyebrow: "Amsterdam to South Africa",
    unit: "km",
    title: "from Amsterdam to our first store",
    sr: "{km} km — from Amsterdam to our first store, in {city}",
    lede: "Holland is famously flat, and our first towns are hill towns. This is how the windmill came to South Africa.",
    readout: { lat: "Latitude", lon: "Longitude", dist: "Distance" },
    caption: "A globe showing the great circle from Amsterdam ({from}) to our first store, in {city} ({to}): {km} km, with a pin for each Herbal Holland store.",
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
        body: "Southern Africa's landraces were shaped over generations on its hillsides, long before Amsterdam knew their names. African soil is the bigger half of who we are.",
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
        body: "Our first stores open in {provinces} on {opening}. More stores to be announced.",
      },
    ],
  },
  // The first chapter: the stores that open on the first day (for now, the two hill towns).
  first: {
    eyebrow: "First stores",
    title: ["Holland, meet", "the Hills."],
    lede: "Holland is flat. KwaZulu-Natal isn't. Our first stores open in the hill towns of {names} on {opening}, each owned and run by a local franchisee.",
    stores: [
      { key: "hillcrest", area: "Upper Highway, eThekwini", line: "From the flatlands to the Valley of a Thousand Hills." },
      { key: "hilton", area: "KZN Midlands", line: "From the polders to the Midlands." },
    ],
    opens: "Opens {opening}",
    open: "Open",
    apart: "{km} km apart",
  },
  national: {
    eyebrow: "Opening nationally",
    title: "South Africa, one town at a time",
    body: "Every Herbal Holland store is owned and run by a local franchisee, on one shared platform and one set of standards.",
    stats: {
      stores: ["store opening", "stores opening"],
      open: ["store open", "stores open"],
      provinces: ["province so far", "provinces so far"],
      day: "{year}: opening day",
    },
    cta: "Open the first one in your town",
    all: "See our stores",
  },
  founding: {
    eyebrow: "Herbal Holland Rewards",
    title: "Be one of the first {cap}",
    body: "The first {cap} members of Herbal Holland Rewards, wherever they are in South Africa, become Founding Members, with a numbered card and our {tier} tier for {months} months. Joining is free, for adults 18+.",
    points: ["A numbered Founding Member card", "The {tier} tier for {months} months", "Free to join, adults 18+"],
    cta: "Join Rewards",
    soon: "Rewards isn't open yet. When it is, you'll be able to join right here.",
    card: { brand: "Rewards", label: "Founding Member", no: "No.", of: "of {cap}" },
  },
  // Organization structured data.
  org: { franchise: "franchise enquiries", press: "media enquiries", careers: "careers", hello: "general enquiries" },
} as const;

// ── The store map (home and /stores) ─────────────────────────────────────────
export const MAP = {
  caption: "A map of South Africa's nine provinces, with a pin for each Herbal Holland store.",
  neighbours: { LS: "Lesotho", SZ: "Eswatini" },
  legend: { opening: "Opening {date}", open: "Open" },
} as const;

// ── Stores ───────────────────────────────────────────────────────────────────
export const STORES = {
  meta: {
    title: "Stores",
    description: "Herbal Holland stores by province. Our first stores open in {provinces} on {opening}, with more to be announced.",
  },
  hero: {
    eyebrow: "Stores",
    title: "Our stores",
    lede: "Our first stores open in {provinces} on {opening}. More stores to be announced.",
    ledeOpen: "Stores in {provinces}, with more to be announced.",
  },
  list: { eyebrow: "By province", title: "Where we're opening", count: ["{n} store", "{n} stores"] },
  card: { opens: "Opening {opening}", open: "Open", owned: "Owned and run by a local franchisee." },
  finder: { title: "Opening hours and directions", body: "Each store's opening hours and directions are on our online shop's store finder.", cta: "Find a store" },
  map: {
    eyebrow: "Opening nationally",
    title: "More stores to be announced",
    body: "Every Herbal Holland store is owned and run by a local franchisee. If you know retail and your community, you could open the first one in your town.",
    cta: "Open the first one in your town",
  },
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
  // The national story, with the hill towns as its first chapter.
  chapters: {
    eyebrow: "Our story so far",
    title: "Holland, meet South Africa",
    intro: "A national network of local stores, opening one town at a time.",
    items: [
      { key: "first", label: "Chapter one", title: "The hill towns", body: "Holland is flat. KwaZulu-Natal isn't. Our first stores open in {names} on {opening}, {km}\u00a0km apart in the {provinces} hills." },
      { key: "next", label: "Next", title: "More towns", body: "Every Herbal Holland store is owned and run by a local franchisee, on one shared platform and one set of standards. More stores are to be announced." },
    ],
    stores: "See our stores",
    own: "Own a store",
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
    soon: "Our stores open on {opening}, and Learn, our plain-English guides to lab results, Schedule 0 and Section 21, is on its way.",
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
      { q: "What happens to my enquiry?", a: "Only our head-office team reads it, and we use it only to reply to you. If it doesn't go ahead, we delete it within 12 months of it arriving. If it moves into our franchise system, we delete the website's copy within 30 days. You can ask us to delete it sooner at any time." },
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
      consent: { label: "Herbal Holland may use these details to reply to my franchise enquiry, as set out in the {privacy}." },
      website: { label: "Website (leave this empty)" },
    },
    privacy: "We keep your enquiry only to reply to you, and we delete enquiries that don't go ahead within 12 months.",
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
    legal: { title: "Legal" },
  },
} as const;

// ── Legal: the Privacy Policy and the Terms of Use ───────────────────────────
/** A paragraph in a legal document: plain text, or [a bold lead-in, the text]. "{company}" alone stands for the
 *  company's registered details from ./facts (or LEGAL.company.pending while they aren't filled in). */
export type LegalPara = string | readonly [lead: string, text: string];
export type LegalSection = { key: string; title: string; body: readonly LegalPara[] };
export type LegalDoc = {
  meta: { title: string; description: string };
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
 * enquiry form and its fields, the ?src tag, the scrambled connection code, Cloudflare's EU region and email routing, how
 * long enquiries are kept, and the 18+ answer kept in the browser. Change how any of that works, and change this too.
 */
export const PRIVACY = {
  meta: {
    title: "Privacy Policy",
    description: "How herbalholland.com collects, uses, stores and protects personal information under POPIA: who sees it, how long we keep it and how to use your rights.",
  },
  version: "1.1",
  updated: "2026-09-28",
  hero: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    lede: "How herbalholland.com handles personal information, under the Protection of Personal Information Act 4 of 2013 (POPIA).",
  },
  summary: {
    title: "In short",
    points: [
      "We collect only what you send us: a franchise enquiry or an email.",
      "We use it to reply to you and to keep the site secure, and for nothing else.",
      "No tracking or advertising cookies, no analytics, and we never sell your details.",
      "Enquiries are stored with Cloudflare in the EU, and deleted within 12 months if they don't go ahead.",
      "You can ask to see, correct or delete your details at any time.",
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
        ["The franchise enquiry form.", "If you send us an enquiry: your name, email address and mobile number, the area and province where you'd like to open, your retail or business experience, the band of capital you could put in, whether you have a pharmacist partner, and any message you add. If you reached the form through a link with a campaign tag (such as ?src=linkedin), we note the tag, so we know where enquiries come from."],
        ["Your connection address.", "When you send the form, we use your connection (IP) address only to stop the same enquiry being sent over and over, and we keep it only as a scrambled code, never the address itself."],
        ["Routine security logs.", "Like any website, our host keeps routine logs of requests to the site, such as the connection address, the browser used and the time, to keep the site secure and working."],
        ["Emails.", "If you email us, we receive your email address, your message and anything you attach."],
        ["Your answer to the 18+ question.", "It stays in your own browser's local storage: for a year if you confirm you're 18 or older, and only until you close the tab if you're younger. It's never sent to us."],
        ["What we don't do.", "This site sets no tracking or advertising cookies, runs no analytics and builds no profiles, and sending an enquiry never signs you up for marketing."],
      ],
    },
    {
      key: "why",
      title: "Why we use it, and on what basis",
      body: [
        ["To reply to you.", "You send us your details so that we can answer your enquiry or email, and you consent to us using them for that (POPIA section 11(1)(a)). If your enquiry goes further, we use them to take your franchise application forward with you, as steps you've asked for before any agreement (section 11(1)(b))."],
        ["To keep the site secure.", "We use the scrambled connection code and the security logs because we have a legitimate interest in protecting the site, and the people who use it, from abuse (section 11(1)(f))."],
        ["It's your choice.", "Giving us your details is voluntary. Without them we can't reply to you, and nothing else happens."],
        "We don't use your details for anything else.",
      ],
    },
    {
      key: "sharing",
      title: "Who sees it",
      body: [
        ["Our head-office team.", "The people at Herbal Holland's head office who answer franchise enquiries and emails."],
        ["Operators who process it for us.", "Cloudflare, which hosts the site, stores enquiries and routes our email, and our email provider. Under POPIA (sections 20 and 21) they may process it only on our instructions, and must keep it secure."],
        ["Our franchise system.", "Once it's live, enquiries that go further move into the system our head office uses to manage franchise applications."],
        ["No one else.", "We never sell your details. We disclose them to anyone else only when the law requires us to."],
      ],
    },
    {
      key: "where",
      title: "Where it's stored",
      body: [
        "Enquiries are stored in Cloudflare's European Union region. That's a transfer outside South Africa, which POPIA allows (section 72) because EU law gives personal information an adequate level of protection.",
        "When you visit the site, your requests pass through Cloudflare's global network, so they may be handled in data centres in South Africa and elsewhere.",
        "Emails are kept by our email provider. If it stores them outside South Africa, it's only where POPIA allows.",
      ],
    },
    {
      key: "keep",
      title: "How long we keep it",
      body: [
        ["Enquiries.", "If an enquiry doesn't go ahead, we delete it within 12 months. Once an enquiry moves into our franchise system, we delete the website's copy within 30 days."],
        ["The scrambled connection code.", "It's deleted together with the enquiry it belongs to."],
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
        ["Withdraw your consent.", "You can withdraw your consent at any time. It doesn't affect what we did before, but we'll stop using your details for your enquiry."],
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
    description: "The terms for using herbalholland.com: who we are, what the site is for, franchise and careers information, our name and content, acceptable use and the law that applies.",
  },
  version: "1.1",
  updated: "2026-09-28",
  hero: { eyebrow: "Legal", title: "Terms of Use", lede: "The terms for using herbalholland.com, in plain English." },
  summary: {
    title: "In short",
    points: [
      "This site is for adults 18 and over, and by using it you accept these terms.",
      "It's information only: nothing is sold here, and nothing on it is medical advice.",
      "Franchise information is general, not an offer: any franchise depends on our disclosure document and a signed agreement.",
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
      body: ["It's information about Herbal Holland: who we are, franchising, press and careers.", "Nothing is sold on this site. Our online shop and Herbal Holland Rewards have their own terms, which apply when you use them."],
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
      key: "franchise",
      title: "Franchise information",
      body: [
        "What we say about franchising on this site is general information. It isn't an offer, a disclosure document or a contract, and we make no representations about earnings.",
        "Any franchise depends on our disclosure document, which you'll receive at least 14 days before you sign anything, as the Consumer Protection Act's franchise regulations require, and on a franchise agreement signed by both sides.",
        "Sending an enquiry creates no obligation for you or for us.",
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
    description: "How to request records held by the company that owns Herbal Holland's online business, under the Promotion of Access to Information Act, and how it handles personal information.",
  },
  version: "1.0",
  updated: "2026-09-28",
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
        ["On this website.", "Information about Herbal Holland, franchising, careers and our stores; press releases and our logos; and our Privacy Policy, Terms of Use and this manual."],
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
        ["Franchising:", "franchise enquiries, disclosure documents and franchise agreements, and the trading and compliance records of franchisee stores."],
        ["Stores and stock:", "stock, purchasing, sales and cash-banking records from the platform our stores use."],
        ["Suppliers and partners:", "contracts, orders, invoices and contact details."],
        ["Marketing and media:", "campaigns, consent records, press releases and media contacts."],
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
        "We process personal information to run membership and Herbal Holland Rewards; to sell, deliver and hand over orders with our franchisee stores; to check age and, for licensed medicines, authorisation; to take payments and issue invoices; to send marketing only to members who agree to it; to answer questions and complaints; to recruit and support franchisees; to employ our people; to work with suppliers; to keep our systems, members and stores secure and stop fraud and theft; and to meet our legal obligations, such as tax, medicine and recall records.",
        ["Members:", "name, mobile number, email address, date of birth or a secure fingerprint of their ID number, home store, orders, payments, delivery addresses, Rewards activity, and communication preferences and consents."],
        ["Registered patients:", "SAHPRA authorisation details, prescriber, and what was supplied; never a diagnosis."],
        ["Franchise applicants and franchisees:", "contact details, where they'd like to open, experience, available capital, what's needed to assess and agree a franchise, and their stores' trading records."],
        ["Our people and job applicants:", "identity and contact details, qualifications, and employment, pay, tax and banking records."],
        ["People who use our systems,", "at head office and in franchisee stores: account details, role, and a record of what they do in the system."],
        ["Suppliers and service providers:", "company details, contact people, banking details and contracts."],
        ["Website visitors and people who contact us:", "what they send us, and routine security logs."],
      ],
    },
    {
      key: "sharing",
      title: "Who we share it with, and where it goes",
      body: [
        ["Recipients.", "Franchisee stores that serve our members; payment, messaging and delivery providers; the hosting and cloud providers that run our systems; professional advisers such as auditors and lawyers; and authorities such as the South African Revenue Service, the South African Health Products Regulatory Authority and the Information Regulator, when the law requires it. Each gets only what it needs, and operators may process it only on our instructions (POPIA sections 20 and 21). We never sell personal information."],
        ["Across borders.", "Some providers store or process information outside South Africa: enquiries from this website, for example, are stored in Cloudflare's European Union region. We send personal information across borders only as POPIA section 72 allows, such as to countries whose laws protect it adequately, or under binding agreements that do."],
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
  meta: { title: "Page not found", description: "This page isn't here. Find your way back to Herbal Holland." },
  eyebrow: "404 · Page not found",
  title: "Lost in the hills",
  body: "This page has blown away on the wind. Let's get you back on the path.",
  home: "Back to the homepage",
  try: "Or try",
} as const;
