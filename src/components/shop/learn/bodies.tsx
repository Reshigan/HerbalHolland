// Learn article bodies. Plain, factual editorial — general information, not medical
// or legal advice. Copy follows the brand rules: adults 18+, no medical claims.
import Link from "next/link";
import { AlertTriangle, Baby, Car, CheckCircle2, Clock, FileCheck2, FlaskConical, IdCard, Lock, Pill, ScanLine, Stethoscope, Wine } from "lucide-react";
import { TIERS, fmtPoints } from "@/lib/loyalty-rules";
import { zarWhole } from "@/lib/money";
import type { Settings } from "@/server/settings";

// ── Editorial primitives ─────────────────────────────────────────────────────
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-14 font-display text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">{children}</h2>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-[1.07rem] leading-[1.8] text-ink-300">{children}</p>;
}
function Pull({ children, by }: { children: React.ReactNode; by?: string }) {
  return (
    <figure className="my-12 border-l-4 border-brand-500 pl-6">
      <blockquote className="font-display text-2xl font-light leading-snug text-white sm:text-3xl">{children}</blockquote>
      {by && <figcaption className="mt-3 text-sm text-ink-400">— {by}</figcaption>}
    </figure>
  );
}
function Fact({ title, children, tone = "brand" }: { title: string; children: React.ReactNode; tone?: "brand" | "warn" }) {
  return (
    <aside className={`my-10 rounded-3xl border p-6 ${tone === "warn" ? "border-amber-500/35 bg-amber-500/[0.07]" : "border-brand-500/30 bg-brand-500/[0.06]"}`}>
      <div className={`eyebrow ${tone === "warn" ? "text-amber-100" : "text-brand-400"}`}>{title}</div>
      <div className="mt-3 space-y-3 text-[0.98rem] leading-relaxed text-ink-200">{children}</div>
    </aside>
  );
}
function Steps({ items }: { items: { icon: React.ReactNode; title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="my-10 space-y-4">
      {items.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400">{s.icon}</span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Step {i + 1}</div>
            <div className="mt-0.5 font-display text-lg font-semibold text-white">{s.title}</div>
            <div className="mt-1 text-[0.98rem] leading-relaxed text-ink-300">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-10 overflow-x-auto rounded-2xl border border-ink-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-900 text-xs uppercase tracking-wider text-ink-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-3 align-top text-ink-200">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-semibold text-brand-400 underline decoration-brand-500/40 underline-offset-4 hover:decoration-brand-400">
    {children}
  </Link>
);

// ── Articles ─────────────────────────────────────────────────────────────────
function Heritage() {
  return (
    <>
      <P>
        Long before a Dutch coffee-shop menu listed them, Southern Africa&apos;s landraces were being shaped by the people who grew them — selected season after season on the hillsides of KwaZulu-Natal, the highlands of Eswatini, the lakeshore plains of Malawi and the steep valleys of the Wild Coast. A landrace is a local variety that has adapted to its place over generations: the soil, the sun, the rain and the hands that kept its seed.
      </P>
      <P>Herbal Holland exists because of that story. Our name nods to Amsterdam, where many of these cultivars became famous; our roots — and our growers — are here.</P>
      <H2>Durban Poison: the one that travelled</H2>
      <P>
        A pure sativa from the hills behind Durban, Durban Poison left South Africa in the 1970s, when seeds were carried to the United States and on to Amsterdam&apos;s seed banks. It became a global benchmark for its sweet, anise-like aroma and its tall, fast-finishing plants. At home, the KZN Heritage Growers Collective in Eshowe keeps a preserved line from locally held seed.
      </P>
      <H2>Swazi Gold and Malawi Gold</H2>
      <P>
        Swazi Gold comes from the Eswatini highlands, traditionally sun-cured to the golden colour that gives it its name, with a bright, citrus-forward character. Malawi Gold, from around Salima, is famously patient: it can take around 120 days to flower, and was historically cured in maize leaves into dense &ldquo;cobs&rdquo;.
      </P>
      <Pull>A landrace is a library. Every seed carries a season&apos;s worth of decisions made by the people who grew it.</Pull>
      <H2>Mpondo Gold and the Wild Coast</H2>
      <P>
        Pondoland, on the Eastern Cape&apos;s Wild Coast, has one of the country&apos;s oldest growing traditions — some growers believe Durban Poison itself partly descends from Mpondo lines. It has also been one of the hardest places to make a living from the plant. As informal buyers have pushed prices down, growers report earning a fraction of what a harvest fetched a decade ago, and some have been left with crops they couldn&apos;t sell.
      </P>
      <Fact title="Our partnership with the Mpondo Growers Co-operative">
        <p>
          <strong className="text-white">A fair price, agreed before planting.</strong> We agree a price per kilogram with the co-operative in Lusikisiki before the season starts, and pay on delivery — so growers know what a harvest is worth before they put seed in the ground.
        </p>
        <p>
          <strong className="text-white">Formal, tested and traceable.</strong> Every lot is independently lab-tested, and its batch code traces it back to the farm. Scan any pack to see its certificate.
        </p>
        <p>
          <strong className="text-white">Where the law allows.</strong> Licensed cannabis is supplied only through lawful channels — today, that means registered patients through our dispensary. Our heritage partnership is built for the long term, as South Africa&apos;s regulations develop.
        </p>
      </Fact>
      <H2>Taste the heritage today</H2>
      <P>
        Not every heritage product is a medicine. Our <A href="/p/swazi-gold-cbd-vape">Swazi Gold Terpene CBD Vape</A> recreates the landrace&apos;s aroma without THC, and <A href="/p/heritage-seed-pack">Durban Poison Heritage Seeds</A> come from the Collective&apos;s preserved line. Registered patients can find the flower itself in the <A href="/dispensary">dispensary</A>.
      </P>
    </>
  );
}

function LabResults() {
  return (
    <>
      <P>
        Every Herbal Holland pack carries a batch code and a QR code. Scan it and you&apos;ll land on the certificate of analysis — the COA — for that exact batch: what the laboratory measured, what it screened for, who grew it and when it was packed. Here&apos;s how to read one.
      </P>
      <Steps
        items={[
          { icon: <ScanLine className="h-5 w-5" />, title: "Find the batch code", body: "It's printed on the label next to the QR code, like CACB22-30ML-2604A. The last characters tell us when and which lot was packed." },
          { icon: <FlaskConical className="h-5 w-5" />, title: "Check the potency", body: "THC and CBD are shown as a percentage by weight. For dried flower that's the share of the flower's mass; for oils, look at the milligrams per pack and per serving on the product page." },
          { icon: <CheckCircle2 className="h-5 w-5" />, title: "Read the safety panels", body: "Each panel shows PASS, FAIL or Not applicable. PASS means the lab measured the substance below its action limit." },
        ]}
      />
      <H2>The safety panels, one by one</H2>
      <Table
        head={["Panel", "What it looks for", "Why it matters"]}
        rows={[
          ["Microbials", "Moulds, yeasts and bacteria such as E. coli and Salmonella", "Plant material can pick up microbes while growing, drying or storing."],
          ["Pesticides", "Residues from crop protection products", "What's sprayed on a crop can stay on it."],
          ["Heavy metals", "Lead, cadmium, arsenic and mercury", "Plants take up metals from soil and water."],
          ["Mycotoxins", "Toxins from moulds, e.g. aflatoxins and ochratoxin A", "Produced when material is stored in damp conditions."],
          ["Residual solvents", "Left-over extraction solvents", "Only relevant for extracts — flower shows Not applicable."],
        ]}
      />
      <H2>Terpenes: the aroma profile</H2>
      <P>
        Terpenes are the aromatic compounds that give each cultivar its smell — citrusy limonene, peppery caryophyllene, piney pinene, earthy myrcene. The COA shows the main terpenes measured in the batch as a percentage by weight. Two batches of the same product can differ a little; that&apos;s a natural product, measured honestly.
      </P>
      <H2>Status: released, on hold, recalled</H2>
      <P>
        Only batches marked <strong className="text-white">Released</strong> are sold. If a batch is placed <strong className="text-white">on hold</strong> — for example while a result is re-tested — or <strong className="text-white">recalled</strong>, the batch page says so at the top in plain language, and our tills block it automatically.
      </P>
      <Fact title="Red flags anywhere you shop" tone="warn">
        <p>No batch code, no lab name, results that are suspiciously round, or a certificate that can&apos;t be traced back to the product in your hand. If something doesn&apos;t add up, ask — a good retailer will show you.</p>
      </Fact>
    </>
  );
}

function Schedule0() {
  return (
    <>
      <P>
        In South Africa, CBD (cannabidiol) is a scheduled substance under the Medicines and Related Substances Act. A 2020 government notice (GN 586 of 22 May 2020) created a narrow route for everyday CBD products to be sold over the counter as <strong className="text-white">Schedule 0</strong>. That&apos;s the route every CBD wellness product on our shelves follows.
      </P>
      <H2>The Schedule 0 rules, in plain English</H2>
      <Table
        head={["Rule", "The limit", "Where you'll see it"]}
        rows={[
          ["CBD per sales pack", "No more than 600 mg", "“CBD per pack” on every product page"],
          ["Daily serving", "No more than 20 mg of CBD a day", "“Maximum daily serving” on every product page"],
          ["Claims", "Only general health enhancement, health maintenance or relief of minor symptoms", "“Approved claims” — and nothing else"],
          ["THC in consumables", "No more than 0.001%", "The THC line on the product and its lab certificate"],
        ]}
      />
      <P>
        There&apos;s also a separate route for processed products made from cannabis plant material with no more than 0.0075% CBD. Anything outside these limits is a Schedule 4 medicine and can&apos;t be sold over the counter.
      </P>
      <H2>Why our claims are so modest</H2>
      <P>
        Schedule 0 CBD can&apos;t claim to treat, cure or prevent any condition — and we don&apos;t. Each product carries only a short list of approved, low-risk claims such as &ldquo;Supports everyday calm&rdquo;, and our own copy is screened against the advertising code before it&apos;s published. If you see a CBD product anywhere promising to fix a medical condition, treat that as a warning sign.
      </P>
      <Fact title="Good practice">
        <p>Start with less than the maximum daily serving and don&apos;t exceed it. If you&apos;re pregnant, breastfeeding or take other medication, speak to a pharmacist or doctor before using CBD. We sell CBD to adults 18+ only — our policy, even though Schedule 0 sets no minimum age.</p>
      </Fact>
      <H2>And hemp?</H2>
      <P>
        Since the Plant Improvement Act 2018 came into force in December 2025, hemp is defined as plant material with no more than 2% THC. Our hemp range is cosmetic — cold-pressed seed oil and creams for skin — and every product lists its legal basis on the page.
      </P>
      <p className="mt-10 text-sm text-ink-500">This is general information, not legal or medical advice. Regulations change; we update our range and this guide when they do.</p>
    </>
  );
}

function Section21() {
  return (
    <>
      <P>
        Cannabis products containing THC are medicines in South Africa. They can be supplied to a patient on a <strong className="text-white">Section 21 authorisation</strong> from the South African Health Products Regulatory Authority (SAHPRA). This guide explains how that works at Herbal Holland. It&apos;s general information, not medical advice — the decision about treatment is always between you and your doctor.
      </P>
      <H2>What is a Section 21 authorisation?</H2>
      <P>
        Section 21 of the Medicines and Related Substances Act allows SAHPRA to authorise the sale of a medicine that isn&apos;t registered, for a specific patient. The application is made by a registered medical practitioner. The authorisation names the patient, the product (or type of product), the quantity and the period it&apos;s valid for.
      </P>
      <Steps
        items={[
          { icon: <Stethoscope className="h-5 w-5" />, title: "You and your doctor decide", body: "Your doctor assesses whether a cannabis medicine is appropriate for you." },
          { icon: <FileCheck2 className="h-5 w-5" />, title: "Your doctor applies to SAHPRA", body: "The application is patient-specific. SAHPRA issues the authorisation with a scope, a quantity and a validity period." },
          { icon: <IdCard className="h-5 w-5" />, title: "Register it with us, once", body: "Bring the authorisation and your ID to any Herbal Holland store. Our authorised dispenser verifies it and links it to your Rewards profile." },
          { icon: <Pill className="h-5 w-5" />, title: "Order and collect", body: "Sign in to see the dispensary, order within your authorised monthly quantity, and collect in store. Medicines are handed over by an authorised dispenser after an ID check." },
        ]}
      />
      <H2>What we record — and what we don&apos;t</H2>
      <P>
        We keep only what we need to dispense lawfully: the authorisation number, the prescriber and their HPCSA registration number, the authorised scope, the validity period and the monthly quantity. We deliberately <strong className="text-white">don&apos;t</strong> record your diagnosis or condition — health information is special personal information under POPIA, and we don&apos;t need it.
      </P>
      <Fact title="How the dispensary is different">
        <p>• Medicines are never listed publicly, never promoted, never discounted and never earn points — the Medicines Act prohibits incentives on medicines.</p>
        <p>• They&apos;re collect-only: no courier or same-day delivery.</p>
        <p>• Your authorised monthly quantity is tracked across every store and online, on a rolling 30-day basis.</p>
      </Fact>
      <H2>Questions</H2>
      <P>
        Our authorised dispensers are happy to talk you through the process in private. <A href="/stores">Find your nearest store</A>, or if you&apos;re already registered, <A href="/dispensary">open the dispensary</A>.
      </P>
    </>
  );
}

function Responsible() {
  const rules = [
    { icon: <IdCard className="h-5 w-5" />, title: "Adults 18+ only", body: "We check ID at every collection and delivery, and we never sell to anyone under 18 — or on behalf of someone who is." },
    { icon: <Baby className="h-5 w-5" />, title: "Lock it away from children and pets", body: "Keep products in their child-resistant packaging, out of sight and out of reach. Edibles can look like ordinary sweets — store them separately from food." },
    { icon: <Car className="h-5 w-5" />, title: "Never drive or operate machinery", body: "Don't drive, cycle or operate machinery after using cannabis products that contain THC. Plan your journey home first." },
    { icon: <Clock className="h-5 w-5" />, title: "Start low, go slow", body: "Effects can take up to two hours with edibles. Start with a small amount and wait before taking more." },
    { icon: <Wine className="h-5 w-5" />, title: "Don't mix", body: "Combining cannabis with alcohol or other substances increases the risks. Keep it simple." },
    { icon: <Lock className="h-5 w-5" />, title: "Private use, private places", body: "Private adult use is decriminalised in South Africa; public use and supplying others are not. Know the law where you are." },
  ];
  return (
    <>
      <P>We&apos;d rather you enjoyed a small amount responsibly than too much carelessly. These are the basics we ask every member to live by.</P>
      <ul className="my-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rules.map((r) => (
          <li key={r.title} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500/10 text-brand-400">{r.icon}</span>
            <h3 className="mt-4 font-display text-lg font-semibold text-white">{r.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-300">{r.body}</p>
          </li>
        ))}
      </ul>
      <H2>Pregnancy, medication and health</H2>
      <P>If you&apos;re pregnant, breastfeeding, taking medication or managing a health condition, speak to a doctor or pharmacist before using any cannabis or CBD product.</P>
      <Fact title="If you need support" tone="warn">
        <p>
          If cannabis use is causing problems for you or someone close to you, help is available. The South African Depression and Anxiety Group (
          <a href="https://www.sadag.org" rel="noopener noreferrer" className="font-semibold text-white underline">SADAG</a>) supports people with mental health and substance use concerns, and your doctor or clinic can refer you to local treatment services.
        </p>
        <p className="flex items-center gap-2 text-sm text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" /> In an emergency, call 10177 or 112 from a mobile phone.
        </p>
      </Fact>
    </>
  );
}

function Points({ settings }: { settings: Settings }) {
  const l = settings.loyalty;
  return (
    <>
      <P>
        Herbal Holland Rewards is free and works the same in every store and online. You earn points on what you spend, and every point is worth R1 off a future purchase.
      </P>
      <H2>Earning</H2>
      <P>
        Every member gets an instant price — a percentage off at the till and online, set by your tier. On top of that you earn {l.earnPer100} points for every R100 you pay, rounded down, on the amount you actually pay — not on points you spend. Some days, like Double Points Fridays, earn even more.
      </P>
      <Table
        head={["Tier", "Reach it by spending", "Instant saving", "Also"]}
        rows={TIERS.map((t) => [
          <span key="n" className="font-semibold text-white">{t.name}</span>,
          t.minCents ? `${zarWhole(t.minCents)} in 12 months` : "Joining",
          <span key="s" className="font-semibold text-brand-300">{l.tierSavingsPct[t.key]}% off</span>,
          t.perks.join(" · "),
        ])}
      />
      <P>Tiers follow your rolling 12-month spend and are reviewed with every purchase, so they go up the moment you qualify.</P>
      <H2>Spending</H2>
      <P>
        Use points from {fmtPoints(l.minRedeem)}, for up to {l.maxRedeemPct}% of an order — at the till, just say you&apos;d like to use them; online, tick &ldquo;Use my points&rdquo; at checkout.
      </P>
      <H2>Bonuses</H2>
      <ul className="my-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          [fmtPoints(l.signupBonus), "when you join"],
          [fmtPoints(l.birthdayBonus), "on your birthday"],
          [fmtPoints(l.referralBonus), "each, when a friend you invite makes their first purchase"],
        ].map(([v, t]) => (
          <li key={t} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
            <div className="font-display text-3xl font-semibold text-white">{v}</div>
            <div className="mt-1 text-sm text-ink-400">{t}</div>
          </li>
        ))}
      </ul>
      <Fact title="The small print, kept small">
        <p>• Medicines supplied on a SAHPRA authorisation don&apos;t get member prices, earn points or carry discounts — the Medicines Act prohibits incentives on medicines.</p>
        <p>• Points are personal and can&apos;t be exchanged for cash.</p>
        <p>• Returns reverse the points earned on the returned items.</p>
      </Fact>
      <P>
        Ready? <A href="/club/join">Join free</A> — it takes about a minute.
      </P>
    </>
  );
}

export function ArticleBody({ slug, settings }: { slug: string; settings: Settings }) {
  switch (slug) {
    case "heritage-landraces":
      return <Heritage />;
    case "reading-lab-results":
      return <LabResults />;
    case "cbd-schedule-0":
      return <Schedule0 />;
    case "section-21":
      return <Section21 />;
    case "responsible-use":
      return <Responsible />;
    case "points":
      return <Points settings={settings} />;
    default:
      return null;
  }
}
