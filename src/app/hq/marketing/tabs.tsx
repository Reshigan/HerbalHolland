import { TabLinks } from "@/components/ui/tabs";

const TABS = { campaigns: "/hq/marketing", suppression: "/hq/marketing?tab=suppression", social: "/hq/marketing/social" };

export function MarketingTabs({ current }: { current: keyof typeof TABS }) {
  return (
    <TabLinks
      className="mb-5"
      current={TABS[current]}
      tabs={[
        { href: TABS.campaigns, label: "Campaigns" },
        { href: TABS.social, label: "Social" },
        { href: TABS.suppression, label: "Do-not-contact list" },
      ]}
    />
  );
}
