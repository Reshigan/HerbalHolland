/** `keywords`: extra words the command palette matches ("deposit slip" finds Banking). */
export type NavItem = { label: string; href: string; icon: string; exact?: boolean; external?: boolean; roles?: string[] /* only these roles see it */; keywords?: string };
export type NavGroup = { title?: string; items: NavItem[] };

// Grouped by the day's work: what's happening today, selling, stock, buying, money, people, insight; the
// least-used screens wait under "More" at the end.
export const storeNav = (code: string, slug: string, companyId: string): NavGroup[] => [
  {
    title: "Today",
    items: [
      { label: "Overview", href: `/store/${code}`, icon: "LayoutDashboard", exact: true, keywords: "home dashboard today" },
      { label: "Open POS", href: "/pos", icon: "Nfc", keywords: "till sell register" },
      { label: "HQ updates", href: `/store/${code}/updates`, icon: "Bell", keywords: "announcements news acknowledge" },
    ],
  },
  {
    title: "Sell",
    items: [
      { label: "Online orders", href: `/store/${code}/orders`, icon: "ShoppingBag", keywords: "click collect delivery web shop" },
      { label: "Trade orders", href: `/store/${code}/trade`, icon: "Briefcase", keywords: "wholesale business accounts" },
      { label: "Returns", href: `/store/${code}/returns`, icon: "Undo2", keywords: "refund exchange" },
      { label: "Support", href: `/store/${code}/support`, icon: "LifeBuoy", keywords: "tickets help complaints" },
      { label: "Pricing", href: `/store/${code}/pricing`, icon: "Tag", keywords: "prices price list labels" },
    ],
  },
  {
    title: "Stock",
    items: [
      { label: "Stock on hand", href: `/store/${code}/inventory`, icon: "Boxes", keywords: "inventory products levels" },
      { label: "Stock takes", href: `/store/${code}/stock-takes`, icon: "ClipboardCheck", keywords: "count cycle count" },
      { label: "Adjustments", href: `/store/${code}/adjustments`, icon: "Scale", keywords: "write off damaged shrinkage" },
      { label: "Batches & recalls", href: `/store/${code}/batches`, icon: "FlaskConical", keywords: "lots expiry recall quarantine" },
    ],
  },
  {
    title: "Buying",
    items: [
      { label: "Purchasing", href: `/store/${code}/purchasing`, icon: "Truck", keywords: "reorder receive delivery DC stock order" },
      { label: "Supplier invoices", href: `/store/${code}/finance/supplier-invoices`, icon: "FileText", keywords: "bills supplier accounts payable" },
      { label: "Network trading", href: `/store/${code}/network`, icon: "ArrowLeftRight", keywords: "transfer other stores" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Finance", href: `/store/${code}/finance`, icon: "Wallet", keywords: "z report vat profit" },
      { label: "Cash-ups", href: `/store/${code}/cash-ups`, icon: "Banknote", keywords: "shift close till count" },
      { label: "Banking", href: `/store/${code}/banking`, icon: "PiggyBank", keywords: "deposit slip cash bank" },
      { label: "Expenses", href: `/store/${code}/expenses`, icon: "Receipt", keywords: "costs petty cash" },
      { label: "Commission", href: `/store/${code}/commission`, icon: "HandCoins", keywords: "incentive staff pay" },
      { label: "Books", href: `/books/${companyId}`, icon: "BookOpen", roles: ["OWNER", "HQ_ADMIN", "AREA_MANAGER"], keywords: "accounts ledger accounting trial balance balance sheet vat201 journals" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Team", href: `/store/${code}/team`, icon: "UsersRound", keywords: "staff pin people add" },
      { label: "Members", href: `/store/${code}/customers`, icon: "Users", keywords: "customers rewards loyalty" },
      { label: "Patient register", href: `/store/${code}/patients`, icon: "Stethoscope", keywords: "sahpra authorisation prescription dispensing" },
      { label: "Local marketing", href: `/store/${code}/marketing`, icon: "Megaphone", keywords: "campaign sms" },
    ],
  },
  {
    title: "Insight",
    items: [
      { label: "Reports", href: `/store/${code}/reports`, icon: "ChartColumn", keywords: "sales analytics export" },
      { label: "Loss prevention", href: `/store/${code}/loss-prevention`, icon: "ShieldAlert", keywords: "alerts theft" },
    ],
  },
  {
    title: "More",
    items: [
      { label: "Events", href: `/store/${code}/events`, icon: "CalendarDays", keywords: "rsvp check in" },
      { label: "Menu board", href: `/menu/${slug}`, icon: "Tv", external: true, keywords: "tv screen" },
      { label: "Franchise statement", href: `/store/${code}/statement`, icon: "Landmark", keywords: "royalty levy fees" },
      { label: "Settings", href: `/store/${code}/settings`, icon: "Settings", keywords: "hours devices tills" },
    ],
  },
];

// Daily work first (overview, stores, reports), the launch programme last.
export const hqNav: NavGroup[] = [
  {
    items: [
      { label: "Network overview", href: "/hq", icon: "LayoutDashboard", exact: true, keywords: "home dashboard today" },
      { label: "Stores", href: "/hq/stores", icon: "Store", keywords: "franchisees branches" },
      { label: "Reports", href: "/hq/reports", icon: "ChartColumn", keywords: "insight sales analytics export" },
      { label: "Franchise leads", href: "/hq/franchise", icon: "Handshake", roles: ["HQ_ADMIN", "HQ_STAFF"], keywords: "enquiries applications" },
    ],
  },
  {
    title: "Product",
    items: [
      { label: "Catalogue", href: "/hq/catalogue", icon: "Package", keywords: "products sku range" },
      { label: "Batches & recalls", href: "/hq/batches", icon: "FlaskConical", keywords: "lots coa recall quarantine" },
      { label: "Pricing", href: "/hq/pricing", icon: "Tags", keywords: "prices price list" },
      { label: "Promotions", href: "/hq/promotions", icon: "BadgePercent", keywords: "discounts specials deals" },
    ],
  },
  {
    title: "Supply",
    items: [
      { label: "Distribution", href: "/hq/distribution", icon: "Warehouse", keywords: "DC stock order approve replenish" },
      { label: "Online orders", href: "/hq/orders", icon: "ShoppingBag", keywords: "click collect delivery web shop" },
    ],
  },
  {
    title: "Trade",
    items: [
      { label: "Overview", href: "/hq/trade", icon: "Briefcase", exact: true, keywords: "wholesale" },
      { label: "Accounts", href: "/hq/trade/accounts", icon: "Building2", keywords: "trade business customers" },
      { label: "Orders", href: "/hq/trade/orders", icon: "PackageCheck", keywords: "trade wholesale" },
    ],
  },
  {
    title: "Members",
    items: [
      { label: "Members & CRM", href: "/hq/customers", icon: "Users", keywords: "customers segments" },
      { label: "Campaigns", href: "/hq/marketing", icon: "Megaphone", keywords: "sms email push marketing" },
      { label: "Messages", href: "/hq/messages", icon: "MessageSquare", keywords: "sent log sms email" },
      { label: "Rewards", href: "/hq/loyalty", icon: "Crown", keywords: "loyalty points tiers" },
      { label: "Support", href: "/hq/support", icon: "LifeBuoy", keywords: "tickets help complaints" },
      { label: "Returns", href: "/hq/returns", icon: "Undo2", keywords: "refund exchange" },
      { label: "Reviews", href: "/hq/reviews", icon: "Star", keywords: "ratings moderation" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Finance", href: "/hq/finance", icon: "Wallet", keywords: "z report vat profit royalty" },
      { label: "Statements", href: "/hq/statements", icon: "Landmark", keywords: "franchise fees royalty levy" },
      { label: "Books", href: "/books", icon: "BookOpen", roles: ["HQ_ADMIN", "AREA_MANAGER"], keywords: "accounts ledger accounting trial balance balance sheet vat201 journals" },
      { label: "Commission", href: "/hq/commission", icon: "HandCoins", keywords: "incentive staff pay" },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Loss prevention", href: "/hq/loss-prevention", icon: "ShieldAlert", keywords: "alerts theft" },
      { label: "Compliance", href: "/hq/compliance", icon: "ShieldCheck", keywords: "sahpra licence popia" },
      { label: "Audit log", href: "/hq/audit", icon: "History", keywords: "history who changed" },
      { label: "Announcements", href: "/hq/announcements", icon: "Bell", keywords: "updates news stores" },
      { label: "Team", href: "/hq/team", icon: "UsersRound", keywords: "staff users people add" },
      { label: "Settings", href: "/hq/settings", icon: "Settings", roles: ["HQ_ADMIN", "HQ_STAFF"], keywords: "configuration" },
    ],
  },
  {
    title: "Launch programme",
    items: [
      { label: "Founding Members", href: "/hq/launch", icon: "Rocket", keywords: "launch founders" },
      { label: "Drops", href: "/hq/drops", icon: "Sparkles", keywords: "limited release" },
      { label: "Events", href: "/hq/events", icon: "CalendarDays", keywords: "rsvp" },
    ],
  },
];

/** A company's books (/books/[companyId]): record, report, set up. */
export const booksNav = (id: string): NavGroup[] => [
  {
    items: [{ label: "Overview", href: `/books/${id}`, icon: "BookOpen", exact: true, keywords: "books home balances" }],
  },
  {
    title: "Record",
    items: [
      { label: "Journals", href: `/books/${id}/journals`, icon: "NotebookPen", keywords: "entries manual journal post approve" },
      { label: "Banking", href: `/books/${id}/bank`, icon: "PiggyBank", keywords: "bank statement import reconcile match" },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "Trial balance", href: `/books/${id}/reports/trial-balance`, icon: "Scale", keywords: "tb balances" },
      { label: "Income statement", href: `/books/${id}/reports/income`, icon: "ChartColumn", keywords: "profit loss p&l" },
      { label: "Balance sheet", href: `/books/${id}/reports/balance-sheet`, icon: "Layers", keywords: "assets liabilities equity" },
      { label: "Cash flow", href: `/books/${id}/reports/cash-flow`, icon: "Banknote", keywords: "cash movement" },
      { label: "General ledger", href: `/books/${id}/reports/ledger`, icon: "ListTree", keywords: "account detail transactions" },
      { label: "Debtors & creditors", href: `/books/${id}/reports/ageing`, icon: "Users", keywords: "ageing aged owed suppliers trade" },
      { label: "VAT", href: `/books/${id}/vat`, icon: "Percent", keywords: "vat201 sars return" },
      { label: "Management pack", href: `/books/${id}/pack`, icon: "FileSpreadsheet", keywords: "monthly accounts print pdf" },
    ],
  },
  {
    title: "Set-up",
    items: [
      { label: "Chart of accounts", href: `/books/${id}/accounts`, icon: "ListTree", keywords: "accounts codes" },
      { label: "Month end", href: `/books/${id}/close`, icon: "CalendarCheck", keywords: "close lock period year end checks" },
      { label: "Settings", href: `/books/${id}/settings`, icon: "Settings", keywords: "vat category year end accountants opening balances" },
    ],
  },
];
