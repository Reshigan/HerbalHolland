// Building blocks for the static pages: headings, buttons, doors that aren't open yet, count-up reels and icons.
// Rendered once at build time with renderToStaticMarkup — no client React, no inline styles (the CSP forbids them).
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Building2,
  CalendarDays,
  CalendarHeart,
  Camera,
  ChartColumn,
  Download,
  FileText,
  FlaskConical,
  Frame,
  GraduationCap,
  HandCoins,
  Handshake,
  IdCard,
  KeyRound,
  Mail,
  Menu,
  MessageCircle,
  MonitorSmartphone,
  Newspaper,
  Package,
  PenLine,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment } from "react";
import { CHROME, EMAIL, LEGAL } from "../content";
import { FACTS, shopLink } from "../facts";
import { cx } from "./art";

const ICONS: Record<string, LucideIcon> = {
  arrow: ArrowRight,
  out: ArrowUpRight,
  lab: FlaskConical,
  members: IdCard,
  medicines: ShieldCheck,
  cbd: BadgeCheck,
  neighbours: Handshake,
  shop: ShoppingBag,
  join: IdCard,
  franchise: KeyRound,
  press: Newspaper,
  careers: UsersRound,
  mail: Mail,
  download: Download,
  calendar: CalendarDays,
  operator: Store,
  capital: HandCoins,
  standing: UsersRound,
  pharmacist: ShieldCheck,
  tills: MonitorSmartphone,
  stock: Truck,
  finance: ChartColumn,
  rewards: IdCard,
  online: Package,
  compliance: BadgeCheck,
  brand: Frame,
  range: Boxes,
  playbook: Rocket,
  events: CalendarHeart,
  training: GraduationCap,
  standards: BadgeCheck,
  tools: MonitorSmartphone,
  local: Store,
  advisor: UserRound,
  manager: UsersRound,
  hq: Building2,
  general: MessageCircle,
  pictures: Camera,
  name: PenLine,
  file: FileText,
  menu: Menu,
  close: X,
};

export function Icon({ name, className, size = 20 }: { name: string; className?: string; size?: number }) {
  const I = ICONS[name] ?? BadgeCheck;
  return <I size={size} strokeWidth={1.9} className={cx("ico", className)} aria-hidden="true" focusable="false" />;
}

/**
 * A headline whose words rise in one by one, each behind its own mask. A string wraps freely; an array of lines keeps
 * each line on its own (the last can be picked out in orange with `accent`).
 */
export function Words({ text, accent }: { text: string | readonly string[]; accent?: boolean }) {
  const word = (w: string, k: string) => (
    <span key={k} className="w">
      <span>{w}</span>
    </span>
  );
  const run = (line: string, li: number) => line.split(" ").flatMap((w, i) => (i ? [" ", word(w, `${li}-${i}`)] : [word(w, `${li}-${i}`)]));
  if (typeof text === "string") return <>{run(text, 0)}</>;
  return (
    <>
      {text.map((line, li) => (
        <span key={li} className={cx("line", accent && li === text.length - 1 && "line--accent")}>
          {run(line, li)}
          {li < text.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** Section head: eyebrow, h2 and an optional intro. */
export function Head({ id, eyebrow, title, intro, className, children, big }: { id?: string; eyebrow?: string; title: React.ReactNode; intro?: React.ReactNode; className?: string; children?: React.ReactNode; big?: boolean }) {
  return (
    <div className={cx("head", className)}>
      {eyebrow && (
        <p className="eyebrow" data-r="">
          {eyebrow}
        </p>
      )}
      <h2 id={id} className={big ? "h1" : "h2"} data-r="">
        {title}
      </h2>
      {intro && (
        <p className="lede" data-r="">
          {intro}
        </p>
      )}
      {children}
    </div>
  );
}

type BtnKind = "primary" | "ghost" | "light" | "dark";

/** A pill button link with a fill that sweeps up on hover and an arrow that slides through. */
export function Btn({ href, kind = "primary", children, icon = "arrow", magnetic, className, download, external }: { href: string; kind?: BtnKind; children: React.ReactNode; icon?: string | null; magnetic?: boolean; className?: string; download?: boolean; external?: boolean }) {
  return (
    <a href={href} className={cx("btn", `btn--${kind}`, className)} data-magnetic={magnetic ? "" : undefined} download={download || undefined} rel={external ? "noopener" : undefined}>
      <span className="btn__fill" aria-hidden="true" />
      <span className="btn__label">{children}</span>
      {icon && (
        <span className="btn__icon" aria-hidden="true">
          <Icon name={icon} size={18} />
          <Icon name={icon} size={18} />
        </span>
      )}
    </a>
  );
}

/** A door that isn't open yet: the label, and "Opening soon" with a slow pulse. Not a link, so nothing leads nowhere. */
export function Soon({ label, className, kind = "chip" }: { label: React.ReactNode; className?: string; kind?: "chip" | "btn" | "link" }) {
  return (
    <span className={cx("soon", `soon--${kind}`, className)} data-cursor={CHROME.cursorSoon}>
      <span className="soon__label">{label}</span>
      <span className="sr-only">{CHROME.soonSr}</span>
      <span className="soon__badge" aria-hidden="true">
        <span className="soon__dot" />
        {FACTS.shop.opensLabel}
      </span>
    </span>
  );
}

/** A door to the shop: a link when the shop is live, otherwise the "opening soon" state. */
export function ShopDoor({ path, label, kind = "chip", className, magnetic }: { path: string; label: string; kind?: "chip" | "btn" | "link"; className?: string; magnetic?: boolean }) {
  const href = shopLink(path);
  if (!href) return <Soon label={label} kind={kind} className={className} />;
  if (kind === "btn")
    return (
      <Btn href={href} magnetic={magnetic} icon="out" className={className}>
        {label}
      </Btn>
    );
  return (
    <a href={href} className={cx("link", className)}>
      {label}
    </a>
  );
}

/** An email address as a mailto link, with the underline sweep. */
export function MailTo({ email, className }: { email: string; className?: string }) {
  return (
    <a href={`mailto:${email}`} className={cx("link", "mail", className)}>
      {email}
    </a>
  );
}

/** The links that running text in ../content can carry, as {email}, {privacy}, {terms}, {paia}, {press} and {regulator}. */
const LINKS: Record<string, () => React.ReactNode> = {
  email: () => <MailTo email={EMAIL.hello} />,
  privacy: () => (
    <a className="link" href="/privacy">
      {LEGAL.links.privacy}
    </a>
  ),
  terms: () => (
    <a className="link" href="/terms">
      {LEGAL.links.terms}
    </a>
  ),
  paia: () => (
    <a className="link" href="/paia">
      {LEGAL.links.paia}
    </a>
  ),
  press: () => (
    <a className="link" href="/press">
      {LEGAL.links.press}
    </a>
  ),
  regulator: () => (
    <a className="link" href={LEGAL.regulator.href} rel="noopener noreferrer">
      {LEGAL.regulator.label}
    </a>
  ),
};

/** Text with its {link} placeholders turned into links. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{\w+\})/).map((part, i) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1];
        return <Fragment key={i}>{key && LINKS[key] ? LINKS[key]() : part}</Fragment>;
      })}
    </>
  );
}

/**
 * Rolling digits (an odometer) that settle on `value` when they come into view. Each digit's strip counts up through a
 * full turn to the digit, which sits first, so without the script (or with reduced motion) the number simply shows.
 * Screen readers get the plain value.
 */
export function Reel({ value, className }: { value: string; className?: string }) {
  const strip = (d: number) => Array.from({ length: 11 }, (_, k) => (d - k + 20) % 10).join("\n");
  return (
    <span className={cx("reel", className)}>
      <span className="reel__v" data-reel="" aria-hidden="true">
        {[...value].map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={i} className="reel__d">
              <span className="reel__s">{strip(Number(ch))}</span>
            </span>
          ) : (
            <i key={i} className="reel__sep">
              {ch}
            </i>
          ),
        )}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

/** A numbered index ("01") in the outline display style. */
export const Index = ({ n, className }: { n: number; className?: string }) => (
  <span className={cx("idx", className)} aria-hidden="true">
    {String(n).padStart(2, "0")}
  </span>
);
