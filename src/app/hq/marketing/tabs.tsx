import { TabLinks } from "@/components/ui/tabs";

const TABS = { campaigns: "/hq/marketing", studio: "/hq/marketing/studio", social: "/hq/marketing/social", suppression: "/hq/marketing?tab=suppression" };

export function MarketingTabs({ current }: { current: keyof typeof TABS }) {
  return (
    <TabLinks
      className="mb-5"
      current={TABS[current]}
      tabs={[
        { href: TABS.campaigns, label: "Campaigns" },
        { href: TABS.studio, label: "Studio" },
        { href: TABS.social, label: "Social" },
        { href: TABS.suppression, label: "Do-not-contact list" },
      ]}
    />
  );
}
