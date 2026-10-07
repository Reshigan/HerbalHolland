// The trade portal's words, in one place so the marketing screen (screenCopy, tests/trade-cart.test.ts) reads every
// string: plain, warm, confident; adults 18+; no medical claims. Figures (minimum order, fees, hold days) come from
// the settings at render time and are formatted by the pages.

export const HERO = {
  eyebrow: "Herbal Holland Trade",
  title: "Stock the range your customers already ask for.",
  lead: "Trade prices ex VAT, case packs and lab-tested batches with a certificate of analysis for every lot, couriered from our distribution centre or collected at a Herbal Holland store. For pharmacies, independent retailers, cafés and wellness practices. Adults 18+.",
  apply: "Apply for a trade account",
  signIn: "Sign in",
  note: "Licensed medicines are never part of the trade range.",
};

export const WHO = {
  eyebrow: "Who it's for",
  title: "Businesses that sell to adults, properly.",
  lead: "A trade account is for a registered business with a shop floor, a counter or a consulting room, and for a buyer who is 18 or older.",
  cards: [
    { kind: "PHARMACY", title: "Pharmacies", text: "Schedule 0 CBD supplements and skin care with the legal basis, the daily serving and the batch on every pack." },
    { kind: "RETAILER", title: "Independent retailers", text: "Accessories, grow gear, apparel and the wellness range, in case packs sized for a shelf." },
    { kind: "CAFE", title: "Cafés and restaurants", text: "CBD coffee, tea and drinks with only the CBD naturally in their ingredients, plus collagen and protein." },
    { kind: "PRACTICE", title: "Wellness practices", text: "Oils, softgels and balms for the retail shelf in a studio, spa or practice, with the facts to answer questions." },
  ],
};

export const GET = {
  eyebrow: "What you get",
  title: "Everything a wholesale account should come with.",
  items: [
    { key: "prices", title: "Trade prices ex VAT", text: "Every line shows its ex-VAT price with VAT worked out per line, never backed out of a shelf price. Quantity breaks apply by themselves." },
    { key: "cases", title: "Case packs", text: "Order in whole cases from a minimum order value. The range shows the case size and the price per case." },
    { key: "coa", title: "Lab-tested batches", text: "Every lot ships with its batch code and certificate of analysis, so you can show a customer exactly what they are buying." },
    { key: "delivery", title: "Courier or click & collect", text: "Couriered from our distribution centre (free over the threshold), or packed at a participating store for your driver to collect with a code." },
    { key: "terms", title: "EFT or account terms", text: "Pay each order by EFT against a pro forma, or, once approved for credit, buy on account with a monthly statement." },
    { key: "invoices", title: "Tax invoices and statements", text: "A full tax invoice for every order and a statement every month, in the portal and by email." },
  ],
};

export const RANGE = {
  eyebrow: "The range",
  title: "What's on the trade list.",
  lead: "Prices show once you sign in. Here is what each category holds today.",
  products: "products",
};

export const HOW = {
  eyebrow: "How it works",
  title: "Apply, get approved, order.",
  steps: [
    { n: "1", title: "Apply", text: "Tell us about the business, what you'd like to stock and where to deliver, and upload the licences your kind of business holds. It takes about ten minutes." },
    { n: "2", title: "Approved", text: "Our trade team checks the application and each licence with its issuer, and emails you within one business day with your terms." },
    { n: "3", title: "Order", text: "Sign in with a code sent to your email, add cases to your cart and choose courier or collection. Your invoice follows when it ships." },
  ],
};

export const FACTS = {
  eyebrow: "Good to know",
  items: [
    "Buyers are adults, 18 or older, and the business keeps its own records of who collects.",
    "Every account holds the licences its kind of business needs: a pharmacy licence and SAPC recording, a SAHPRA licence to resell CBD supplements, a certificate of acceptability to sell food. We check each one before the first order and ask for the renewal before it lapses.",
    "Licensed (THC) medicines are never traded; everything else is on the list.",
    "Prices are ex VAT with VAT shown per line. No points, member prices or consumer deals apply to trade orders.",
    "A short-shipped line is invoiced for what was supplied.",
    "Resell responsibly: no claims we don't make ourselves, and keep products out of reach of minors and pets.",
  ],
};

export const CTA = {
  title: "Ready to stock Herbal Holland?",
  text: "Apply now and we'll be in touch within one business day.",
};

export const APPLY = {
  title: "Apply for a trade account",
  lead: "It takes about ten minutes. We reply by email within one business day. Fields marked optional can wait.",
  done: "We'll be in touch within one business day.",
  doneText: "Thanks for applying. Our trade team reads every application and emails the buyer's address with the terms once the account is approved. From then on you sign in with a code sent to that address.",
};

export const LOGIN = {
  title: "Sign in to Herbal Holland Trade",
  lead: "Use the email address on your trade account. We send a 6-digit code, no passwords.",
  states: [
    "Applied but not approved yet? You can sign in to follow your application; ordering opens once the account is approved.",
    "Account on hold? You can still sign in, see prices and your statement; the hold reason shows on your account page.",
    "Account closed? Buyers on a closed account can't sign in. Email the trade team if that's a mistake.",
  ],
};

export const FOOTER = {
  adults: "For adults 18+. Trade customers resell responsibly and keep products out of reach of minors and pets.",
};
