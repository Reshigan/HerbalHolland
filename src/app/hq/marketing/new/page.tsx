import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { can } from "@/server/hq/guard";
import { SEGMENTS } from "@/lib/rfm";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { estimateReach, findCampaignStores, saveCampaign } from "../actions";
import { Composer } from "../composer";
import { composerOptions } from "../load";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ segment?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const opts = await composerOptions(ids);
  const segment = sp.segment && (sp.segment in SEGMENTS || sp.segment === "ALL" || sp.segment.startsWith("tier:")) ? sp.segment : "ALL";
  return (
    <>
      <BackLink href="/hq/marketing">Campaigns</BackLink>
      <PageHeader overline="Members" title="New campaign" description="Pick who hears from you and how. Only members who opted in to the channel are messaged, and nothing goes out outside the legal contact windows." />
      <Composer
        action={saveCampaign.bind(null, null)}
        estimate={estimateReach}
        findStores={findCampaignStores}
        values={{ name: "", channel: "SMS", segment, storeId: "", message: "", promotionId: "", cost: "", scheduledAt: "" }}
        {...opts}
        canSend={can(user, "network")}
        requireStore={scope.kind !== "HQ"}
      />
    </>
  );
}
