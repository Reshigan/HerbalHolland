// The weekly Learn queue: one article goes live each Monday. Every fact here comes from the code or a policy in this
// repo, and anything HQ can change in settings (point values, savings, Founding terms) is left for the app to show.
import type { ReactNode } from "react";
import Link from "next/link";
import { TIERS } from "@/lib/loyalty-rules";
import { zarWhole } from "@/lib/money";
import { H2, P } from "./bodies";
import type { ArticleMeta } from "./articles"; // type-only, avoids a cycle

const week = (slug: string, published: string, minutes: number, kicker: string, regClass: string, title: string, dek: string): ArticleMeta => ({
  slug,
  title,
  dek,
  kicker,
  minutes,
  published,
  updated: published,
  art: { slug, regClass },
});

export const WEEKLY: ArticleMeta[] = [
  week("install-the-app", "2026-11-09", 2, "The app", "ACCESSORY", "How to install the app", "Your card, points and orders, one tap away. Here is how to put the app on an Android phone or an iPhone."),
  week("founding-members-list", "2026-11-16", 1, "Rewards", "APPAREL", "The Founding Members list, explained", "The list closes on 31 December, and the first 2,026 places get a numbered card. Here is how your place works."),
  week("rewards-card-at-the-till", "2026-11-23", 2, "Rewards", "ACCESSORY", "Your Rewards card at the till", "We serve members only, so the till starts with your QR code. What to have ready when you come in."),
  week("how-we-check-age", "2026-11-30", 1, "Responsible use", "GROW", "How we check your age, once", "Every member is an adult 18+. Here are the two ways to confirm it, and what we keep afterwards."),
  week("gift-vouchers", "2026-12-07", 2, "Rewards", "APPAREL", "How gift vouchers work", "Bought in the app, sent by email and good for three years. What to know before you give one."),
  week("tiers-and-moving-up", "2026-12-14", 2, "Rewards", "APPAREL", "Tiers, and how you move up", "Seed, Sprout, Bloom and Harvest: what each one takes, what it adds, and when it changes."),
  week("bringing-a-friend", "2026-12-21", 2, "Rewards", "ACCESSORY", "Bringing a friend", "Your invite link, when a referral counts, and what happens at three friends and at ten."),
  week("storing-products-safely", "2026-12-28", 1, "Care", "ACCESSORY", "Storing your products safely", "Where things should live at home, and which habits keep them in good condition and out of reach."),
  week("batch-number-and-batch-page", "2027-01-04", 2, "Quality", "CBD", "Your batch number and batch page", "Every batch has its own page. How to open yours and what each part of it tells you."),
  week("wishlist-and-reorder-reminders", "2027-01-11", 2, "The app", "HEMP", "Your wishlist and reorder reminders", "Save what you want for later, and get a nudge when the things you use every day are due."),
  week("privacy-and-message-choices", "2027-01-18", 2, "The app", "GROW", "Your privacy and message choices", "How to turn messages off, what stays on, and what we do with your information."),
  week("returns-and-refunds", "2027-01-25", 2, "Rewards", "HEMP", "Returns and refunds, plainly", "What to do when something arrives faulty or you change your mind, and where the money and points go."),
];

function To({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-brand-400 underline decoration-brand-500/40 underline-offset-4 hover:decoration-brand-400">
      {children}
    </Link>
  );
}

const End = () => <p className="mt-10 text-sm text-ink-450">Adults 18+ only. Keep every product locked away and out of reach.</p>;

function InstallApp() {
  return (
    <>
      <P>You install the Herbal Holland app straight from your phone&apos;s browser. Once it&apos;s on your home screen, your Rewards card, points and orders are one tap away.</P>
      <H2>On Android</H2>
      <P>Open Herbal Holland in Chrome, Edge or Samsung Internet. You&apos;ll be offered the browser&apos;s install prompt. Accept it and the app is added to your phone. The same browsers offer it on a computer too.</P>
      <H2>On iPhone or iPad</H2>
      <P>
        Apple only allows this from Safari, so open Herbal Holland there. Tap Share, then Add to Home Screen. On newer iPhones, Share sits under the <strong className="text-white">⋯</strong> button at the bottom of the screen.
      </P>
      <H2>If it won&apos;t install</H2>
      <P>
        The usual reason is that the link opened inside another app. The browsers built into WhatsApp, Instagram and Facebook can&apos;t install anything, so open the link in Chrome or Safari first and try again.
      </P>
      <P>
        New here? <To href="/club/join">Joining</To> takes about a minute: your mobile number, a one-time code, your name and your date of birth. App notifications are optional, and you can switch them on or off in your <To href="/club/settings">profile</To>, behind the person icon at the top. Some pages, such as a batch page or a legal notice, still open in a normal browser. That&apos;s how they&apos;re meant to work.
      </P>
      <End />
    </>
  );
}

function FoundingMembers() {
  return (
    <>
      <P>
        Herbal Holland Rewards is free to join, and no purchase is needed to get on the Founding Members list. Everyone who joins before the list closes on 31 December is on it. Your place is your joining order, and you can see it in the app.
      </P>
      <H2>What the first places get</H2>
      <P>
        When the list closes, the first 2,026 places get a numbered Founding Member card. Those members also hold at least a set tier for a set time, whatever they spend. <To href="/club/join">The join page</To> shows which tier and how long while the list is open.
      </P>
      <H2>Moving up the list</H2>
      <P>
        Each friend who joins with your link before the list closes moves you up. The app shows how many places a friend is worth, and your invite link is on your <To href="/club">Rewards page</To>. Share it only with adults 18+. Fake or duplicate accounts and referrals don&apos;t count, and we may remove them.
      </P>
      <P>
        Joining takes about a minute. The full wording is in the <To href="/legal/terms">membership terms</To>.
      </P>
      <End />
    </>
  );
}

function RewardsCard() {
  return (
    <>
      <P>
        Herbal Holland is members only, and that includes the counter. The till needs your Rewards QR code scanned before a sale can go through, so it helps to have it open by the time you get there.
      </P>
      <H2>Where to find it</H2>
      <P>
        Open the app and go to <To href="/club">Rewards</To>. Your card is there, with your QR code, member number, tier and points. If you see Add to Apple Wallet or Add to Google Wallet under the card, you can keep a copy in your phone&apos;s wallet too. That pass holds your QR code, tier, points and first name, and no other personal data.
      </P>
      <H2>What happens when it&apos;s scanned</H2>
      <P>
        Your tier price comes off, and any My Deals on your card apply automatically. You earn points on the amount you actually pay. If you&apos;d like to spend points, just say so at the till. Some products earn no points and carry no member price, and licensed medicines are among them.
      </P>
      <P>
        If we haven&apos;t confirmed your age yet, bring your ID or passport and we can do that at the counter in the same visit. For the detail on earning and spending, read the <To href="/learn/points">Rewards guide</To>.
      </P>
      <End />
    </>
  );
}

function AgeCheck() {
  return (
    <>
      <P>
        Herbal Holland is for adults 18+. You give your date of birth when you join, and we confirm your age once, before your first order in the app or at your first store visit. After that, it&apos;s on your account.
      </P>
      <H2>Two ways to do it</H2>
      <P>
        In the app, tap the person icon at the top to open your <To href="/club/settings">profile</To>, find Age verification and enter your SA ID number. Or show your ID or passport at any store. Each ID number can be linked to one member only. Your profile shows how you were checked and the date.
      </P>
      <H2>What we keep</H2>
      <P>
        To confirm you&apos;re 18+, we keep your date of birth or a secure fingerprint of your SA ID number, with only the last four digits in readable form. Our <To href="/legal/privacy">privacy notice</To> sets out the rest.
      </P>
      <H2>When you may still be asked</H2>
      <P>
        Confirming your age once doesn&apos;t mean you&apos;ll never see an ID request again. The membership terms ask you to show ID whenever we ask, and a courier may ask for it too. Your membership is for your own use, so please don&apos;t buy for anyone else.
      </P>
      <End />
    </>
  );
}

function GiftVouchers() {
  return (
    <>
      <P>
        A gift voucher pays for anything in the range, in the app or at the counter in any store. It&apos;s worth exactly what you paid: there are no fees, and nothing is added on top.
      </P>
      <H2>Buying one</H2>
      <P>
        Vouchers are bought by members, so the receipt and the code stay in your account. On <To href="/gift">the gift page</To>, choose one of the set amounts, add a message and, if you like, the recipient&apos;s email. Once your payment goes through, the voucher is emailed to you, and to them if you added their address. Keep the code private, because whoever has the whole code can spend the balance.
      </P>
      <H2>Spending one</H2>
      <P>
        In the app, enter the code at checkout under Gift voucher. In a store, give it at the counter. It can be used as many times as it takes to finish the balance. Herbal Holland is for adults 18+ who are members, so anyone you give a voucher to will need to join, which is free.
      </P>
      <H2>How long it lasts</H2>
      <P>
        A voucher is valid for three years from the day it&apos;s issued. You can check the balance and the end date on the gift page or under <To href="/club/vouchers">Gift vouchers</To> in Rewards. If something bought with a voucher is refunded, the money goes back onto the voucher first. A voucher is never paid out in cash.
      </P>
      <End />
    </>
  );
}

function Tiers() {
  return (
    <>
      <P>Every member starts at Seed. Your tier follows what you&apos;ve spent over the last 12 months, and each tier keeps the perks of the ones below it.</P>
      <H2>The four tiers</H2>
      {TIERS.map((t) => (
        <P key={t.key}>
          <strong className="text-white">{t.name}</strong>, {t.minCents ? `from ${zarWhole(t.minCents)} in 12 months` : "from the day you join"}: {t.perks.join("; ")}.
        </P>
      ))}
      <P>
        Each tier also sets your instant saving at the till and in the app. Those percentages can change, so <To href="/learn/points">the Rewards guide</To> and your <To href="/club">Rewards page</To> always show the current ones.
      </P>
      <H2>When your tier changes</H2>
      <P>
        Your spend is reviewed with every purchase, so you go up the moment you qualify. The app shows how far you are from the next tier. Because the 12 months roll forward, older purchases drop out of the total over time, and your tier follows.
      </P>
      <P>
        There are two ways to hold a tier for a while without the spend. Founding and First Year Members keep theirs until the date on their Rewards page, and <To href="/legal/referrals">bringing friends</To> can lift you for 30 days.
      </P>
      <End />
    </>
  );
}

function BringFriend() {
  return (
    <>
      <P>
        Every member has a personal invite link and code on their <To href="/club">Rewards page</To>. Share them only with adults 18+ you know.
      </P>
      <H2>When a referral counts</H2>
      <P>
        A referral counts once your friend has joined with your link and made a first purchase, in a store or in the app. Joining alone doesn&apos;t count. When it does, you each get bonus points, and the app shows how many. Points have no cash value.
      </P>
      <H2>Three friends, then ten</H2>
      <P>
        At three friends, you move to the next tier up for 30 days. After that, your tier goes back to what your spend earns, or to a tier you hold for longer as a Founding or First Year Member. At ten friends, you earn Windmill Crew status, a badge on your Rewards card page. It carries no discount. Each step is given once per member.
      </P>
      <H2>The fair-play rules</H2>
      <P>
        A person can be referred once, by one member, and you can&apos;t refer yourself. Fake or duplicate accounts, or paying people to join, can cost you the rewards or your account. Referral rewards never apply to licensed medicines. The full wording is in the <To href="/legal/referrals">referral rules</To>.
      </P>
      <End />
    </>
  );
}

function Storing() {
  return (
    <>
      <P>A good home for your products is mostly about two things: keeping them in good condition, and keeping them where only you can reach them.</P>
      <H2>Out of reach first</H2>
      <P>
        Keep products locked or on a top shelf, away from children and pets, and clearly labelled. Leave them in their child-resistant packaging where they came in it. Anything that could be mistaken for food or sweets belongs in a separate place from your food, out of sight.
      </P>
      <H2>Cool, dry and steady</H2>
      <P>
        An airtight, opaque container keeps out air, light and moisture. Heat and sunlight age everything faster. Keep things away from windows, stoves and the car&apos;s dashboard. A drawer beats a bathroom shelf, because humidity ruins papers, cones and filters. Keep those flat, sealed and dry, in the original packet or a small tin.
      </P>
      <H2>Keep the packaging</H2>
      <P>
        The printed QR code opens your batch&apos;s own page, which shows the best-before date and the current status. If you ever need to check a product, that&apos;s where to look. For cleaning and looking after your gear, see our <To href="/learn/caring-for-accessories">accessories care guide</To>.
      </P>
      <End />
    </>
  );
}

function BatchPage() {
  return (
    <>
      <P>
        Every batch we sell has its own page, and the printed QR code takes you there. It opens in your phone&apos;s browser. The page comes straight from our quality system, so it always shows the current status.
      </P>
      <H2>The status</H2>
      <P>
        You&apos;ll see one of three words at the top. <strong className="text-white">Released</strong> means the batch can be sold, and it&apos;s the only status we sell. <strong className="text-white">On hold</strong> means keep it sealed and ask at any store. <strong className="text-white">Recalled</strong> means don&apos;t use it, and return it to any store for a refund or replacement. Our tills block held and recalled batches automatically.
      </P>
      <H2>The results</H2>
      <P>
        For tested batches, the page shows the certificate of analysis: THC and CBD percentages, the CBD per pack, the maximum daily serving and the safety screening. ND means not detected, and PASS means below the laboratory&apos;s action limits. Our guide to <To href="/learn/reading-lab-results">reading lab results</To> goes through it line by line. Products that need no laboratory testing show a batch record instead.
      </P>
      <H2>The trail</H2>
      <P>Lower down you&apos;ll find who grew or made it, when it was packed, the best-before date and the laboratory. If the code on your pack doesn&apos;t match what the page shows, tell us in any store.</P>
      <End />
    </>
  );
}

function WishlistReminders() {
  return (
    <>
      <P>Two small tools in the app save you from having to remember things. One is for what you&apos;d like later, and the other is for what you buy again and again.</P>
      <H2>Your wishlist</H2>
      <P>
        Tap the heart on any product to save it to your <To href="/club/wishlist">wishlist</To>. You can add it to your bag from there or remove it with the bin icon. If something on your list has come back into stock, it carries a Back in stock tag. The list itself doesn&apos;t send messages, so if you want one, tap Notify me when it&apos;s back on the product.
      </P>
      <H2>Reorder reminders</H2>
      <P>
        For the things you use daily, such as coffee, collagen or oils, choose Remind me to reorder on a product page or on an order. Pick how often, from every 14 days up to every 90, and whether you&apos;d like an SMS, an email or an app notification. On the day, you get one message with a one-tap link that puts the item in your bag.
      </P>
      <P>
        Nothing is charged, and we keep no card on file, so you still check out yourself. Because you asked for these messages, they arrive on the channel you chose, whatever your marketing preferences are. See or stop them any time under <To href="/club/reminders">Reminders</To>. Reminders aren&apos;t available for medicines.
      </P>
      <End />
    </>
  );
}

function PrivacyChoices() {
  return (
    <>
      <P>
        You decide how we contact you, and you can change your mind whenever you like. Everything below lives in your <To href="/club/settings">profile</To>, behind the person icon at the top.
      </P>
      <H2>Turning messages off</H2>
      <P>
        Under News, drops &amp; offers there is a switch each for SMS, WhatsApp, email and app notifications, and each one shows since when it&apos;s been set. You can also reply STOP to a message. We send marketing only on the channels you&apos;ve opted into, in permitted hours, with an opt-out in every message. Order updates and invoices always go out. Reorder reminders are separate and are managed under <To href="/club/reminders">Reminders</To>.
      </P>
      <H2>My Deals</H2>
      <P>
        My Deals are personal offers chosen from your purchase history: what you buy, where and when. Turn the switch off and new deals stop. A deal already on your card stays until it ends, and your tier price and points don&apos;t change.
      </P>
      <H2>What we do with your information</H2>
      <P>
        We don&apos;t sell personal information. We share only what each party needs, such as the store filling your order, and our payment, messaging and courier providers. We use no advertising or tracking cookies, and we don&apos;t run analytics.
      </P>
      <P>
        You may ask to see, correct or delete your information, or object to how it&apos;s used. Your profile shows the email address for our Information Officer, and the <To href="/legal/privacy">privacy notice</To> has the full detail.
      </P>
      <End />
    </>
  );
}

function Returns() {
  return (
    <>
      <P>Most returns come down to one question: is it faulty, or have you changed your mind? The rules differ, so start there.</P>
      <H2>If it&apos;s faulty</H2>
      <P>
        You have six months to return faulty goods, and you choose a repair, a replacement or a refund. It&apos;s at our risk and cost, and we arrange and pay for the courier. We may check the item first. This doesn&apos;t cover damage after delivery, such as from not following the label. We always take back a recalled product for a full refund.
      </P>
      <H2>If you&apos;ve changed your mind</H2>
      <P>
        You can cancel an order placed in the app within 7 days of receiving it, with no reason and no penalty. You pay only the direct cost of sending it back, and we refund you in full within 30 days of cancelling. Some items can&apos;t go back this way, and the <To href="/legal/returns">returns policy</To> lists them. In a store, bring unopened, non-consumable items back within 7 days with proof of purchase.
      </P>
      <H2>How to start, and where the money goes</H2>
      <P>
        Tell us first by email or phone, with your order number, what you&apos;re returning and why. The number is in your order confirmation and under <To href="/club/orders">Orders</To> in Rewards. For a fault, a photo helps. Refunds go to your original payment method, and your bank may take a few more days. Points you used come back, and points you earned on refunded items are taken back.
      </P>
      <End />
    </>
  );
}

export function WeeklyBody({ slug }: { slug: string }) {
  switch (slug) {
    case "install-the-app":
      return <InstallApp />;
    case "founding-members-list":
      return <FoundingMembers />;
    case "rewards-card-at-the-till":
      return <RewardsCard />;
    case "how-we-check-age":
      return <AgeCheck />;
    case "gift-vouchers":
      return <GiftVouchers />;
    case "tiers-and-moving-up":
      return <Tiers />;
    case "bringing-a-friend":
      return <BringFriend />;
    case "storing-products-safely":
      return <Storing />;
    case "batch-number-and-batch-page":
      return <BatchPage />;
    case "wishlist-and-reorder-reminders":
      return <WishlistReminders />;
    case "privacy-and-message-choices":
      return <PrivacyChoices />;
    case "returns-and-refunds":
      return <Returns />;
    default:
      return null;
  }
}
