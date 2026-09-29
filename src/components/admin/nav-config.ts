export type NavItem = { label: string; href: string; icon: string; exact?: boolean; external?: boolean; roles?: string[] /* only these roles see it */ };
export type NavGroup = { title?: string; items: NavItem[] };

export const storeNav = (code: string, slug: string): NavGroup[] => [
  {
    items: [
      { label: "Overview", href: `/store/${code}`, icon: "LayoutDashboard", exact: true },
      { label: "Online orders", href: `/store/${code}/orders`, icon: "ShoppingBag" },
      { label: "Open POS", href: "/pos", icon: "Nfc" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Stock on hand", href: `/store/${code}/inventory`, icon: "Boxes" },
      { label: "Stock takes", href: `/store/${code}/stock-takes`, icon: "ClipboardCheck" },
      { label: "Adjustments", href: `/store/${code}/adjustments`, icon: "Scale" },
      { label: "Batches & recalls", href: `/store/${code}/batches`, icon: "FlaskConical" },
    ],
  },
  {
    title: "Buying",
    items: [
      { label: "Purchasing", href: `/store/${code}/purchasing`, icon: "Truck" },
      { label: "Network trading", href: `/store/${code}/network`, icon: "ArrowLeftRight" },
      { label: "Pricing", href: `/store/${code}/pricing`, icon: "Tag" },
    ],
  },
  {
    title: "Members",
    items: [
      { label: "Members", href: `/store/${code}/customers`, icon: "Users" },
      { label: "Patient register", href: `/store/${code}/patients`, icon: "Stethoscope" },
      { label: "Local marketing", href: `/store/${code}/marketing`, icon: "Megaphone" },
      { label: "Events", href: `/store/${code}/events`, icon: "CalendarDays" },
      { label: "Support", href: `/store/${code}/support`, icon: "LifeBuoy" },
      { label: "Returns", href: `/store/${code}/returns`, icon: "Undo2" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Finance", href: `/store/${code}/finance`, icon: "Wallet" },
      { label: "Cash-ups", href: `/store/${code}/cash-ups`, icon: "Banknote" },
      { label: "Banking", href: `/store/${code}/banking`, icon: "PiggyBank" },
      { label: "Expenses", href: `/store/${code}/expenses`, icon: "Receipt" },
      { label: "Commission", href: `/store/${code}/commission`, icon: "HandCoins" },
      { label: "Franchise statement", href: `/store/${code}/statement`, icon: "Landmark" },
    ],
  },
  {
    title: "Insight",
    items: [
      { label: "Reports", href: `/store/${code}/reports`, icon: "ChartColumn" },
      { label: "Loss prevention", href: `/store/${code}/loss-prevention`, icon: "ShieldAlert" },
    ],
  },
  {
    title: "Store",
    items: [
      { label: "Team", href: `/store/${code}/team`, icon: "UsersRound" },
      { label: "HQ updates", href: `/store/${code}/updates`, icon: "Bell" },
      { label: "Menu board", href: `/menu/${slug}`, icon: "Tv", external: true },
      { label: "Settings", href: `/store/${code}/settings`, icon: "Settings" },
    ],
  },
];

export const hqNav: NavGroup[] = [
  {
    items: [
      { label: "Network overview", href: "/hq", icon: "LayoutDashboard", exact: true },
      { label: "Stores", href: "/hq/stores", icon: "Store" },
      { label: "Franchise leads", href: "/hq/franchise", icon: "Handshake", roles: ["HQ_ADMIN", "HQ_STAFF"] },
    ],
  },
  {
    title: "Product",
    items: [
      { label: "Catalogue", href: "/hq/catalogue", icon: "Package" },
      { label: "Batches & recalls", href: "/hq/batches", icon: "FlaskConical" },
      { label: "Pricing", href: "/hq/pricing", icon: "Tags" },
      { label: "Promotions", href: "/hq/promotions", icon: "BadgePercent" },
    ],
  },
  {
    title: "Supply",
    items: [
      { label: "Distribution", href: "/hq/distribution", icon: "Warehouse" },
      { label: "Online orders", href: "/hq/orders", icon: "ShoppingBag" },
    ],
  },
  {
    title: "Members",
    items: [
      { label: "Members & CRM", href: "/hq/customers", icon: "Users" },
      { label: "Campaigns", href: "/hq/marketing", icon: "Megaphone" },
      { label: "Rewards", href: "/hq/loyalty", icon: "Crown" },
      { label: "Support", href: "/hq/support", icon: "LifeBuoy" },
      { label: "Returns", href: "/hq/returns", icon: "Undo2" },
      { label: "Reviews", href: "/hq/reviews", icon: "Star" },
    ],
  },
  {
    title: "Launch programme",
    items: [
      { label: "Founding Members", href: "/hq/launch", icon: "Rocket" },
      { label: "Drops", href: "/hq/drops", icon: "Sparkles" },
      { label: "Events", href: "/hq/events", icon: "CalendarDays" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Finance", href: "/hq/finance", icon: "Wallet" },
      { label: "Statements", href: "/hq/statements", icon: "Landmark" },
      { label: "Commission", href: "/hq/commission", icon: "HandCoins" },
    ],
  },
  { title: "Insight", items: [{ label: "Reports", href: "/hq/reports", icon: "ChartColumn" }] },
  {
    title: "Governance",
    items: [
      { label: "Loss prevention", href: "/hq/loss-prevention", icon: "ShieldAlert" },
      { label: "Compliance", href: "/hq/compliance", icon: "ShieldCheck" },
      { label: "Audit log", href: "/hq/audit", icon: "History" },
      { label: "Announcements", href: "/hq/announcements", icon: "Bell" },
      { label: "Team", href: "/hq/team", icon: "UsersRound" },
    ],
  },
];
