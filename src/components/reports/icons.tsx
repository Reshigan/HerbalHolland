// Icons for report groups and individual reports (lucide, 1.9 stroke).
import {
  ArrowLeftRight, BadgePercent, Banknote, Boxes, ChartColumn, ChartLine, ChartPie, ClipboardList, CreditCard, Gauge, Grid3x3, HandCoins, Hourglass,
  IdCard, Landmark, Megaphone, PackageSearch, PackageX, PiggyBank, QrCode, Receipt, ReceiptText, Repeat, Route, Scale, ScanSearch, Send, ShieldAlert,
  ShieldCheck, ShoppingBag, Siren, Snowflake, Stethoscope, Tags, TrendingUp, Trophy, Truck, Undo2, UserCheck, Users, UsersRound, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReportGroup } from "@/server/reports/types";

export const GROUP_META: Record<ReportGroup, { icon: LucideIcon; blurb: string }> = {
  Sales: { icon: TrendingUp, blurb: "Trading by day, product, store, hour and staff — plus refunds, tenders and online orders." },
  Inventory: { icon: Boxes, blurb: "What the stock is worth, how it moves, what goes missing, expires or runs low." },
  Purchasing: { icon: Truck, blurb: "What you bought from the distribution centres and other stores, and how it arrived." },
  Finance: { icon: Wallet, blurb: "Profit, VAT, cash-ups, franchise statements and the Rewards points liability." },
  Members: { icon: Users, blurb: "Who your members are, whether they come back, and how many sales carry a member." },
  Marketing: { icon: Megaphone, blurb: "What promotions cost and drove, and what campaigns returned." },
  Compliance: { icon: ShieldCheck, blurb: "Age checks, the dispensing register, blocked sales, recalls and batch traceability." },
};

export const REPORT_ICON: Record<string, LucideIcon> = {
  "sales-overview": ChartLine,
  "sales-by-product": Tags,
  "sales-by-category": ChartPie,
  "sales-by-store": Trophy,
  "sales-by-hour": Grid3x3,
  "sales-by-staff": UserCheck,
  refunds: Undo2,
  payments: CreditCard,
  "online-orders": ShoppingBag,
  "stock-valuation": Landmark,
  "stock-movements": ArrowLeftRight,
  shrinkage: PackageX,
  expiry: Hourglass,
  "dead-stock": Snowflake,
  "sell-through": Gauge,
  "low-stock": PackageSearch,
  "negative-stock": Scale,
  purchases: Truck,
  receiving: ClipboardList,
  pnl: ChartColumn,
  vat: ReceiptText,
  "cash-ups": Banknote,
  "cash-banking": PiggyBank,
  statements: Receipt,
  "loyalty-liability": HandCoins,
  segments: UsersRound,
  "new-vs-returning": Repeat,
  "member-attach": IdCard,
  "rewards-savings": PiggyBank,
  "join-sources": QrCode,
  cohorts: Grid3x3,
  retention: Repeat,
  promotions: BadgePercent,
  campaigns: Send,
  "age-checks": ShieldCheck,
  "dispensing-register": Stethoscope,
  "compliance-events": ShieldAlert,
  recalls: Siren,
  "batch-trace": Route,
};

export function ReportIcon({ reportKey, className }: { reportKey: string; className?: string }) {
  const Icon = REPORT_ICON[reportKey] ?? ScanSearch;
  return <Icon className={className} strokeWidth={1.9} aria-hidden />;
}
