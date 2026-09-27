import { redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { getSettings } from "@/server/settings";
import { can } from "@/server/hq/guard";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { savePromotion } from "../actions";
import { PromotionForm } from "../promotion-form";
import { promoOptions, promoValues } from "../load";

export const metadata = { title: "New promotion" };

export default async function NewPromotionPage() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  await scopedStoreIds(scope);
  if (!can(user, "network")) redirect("/hq/promotions");
  const [opts, settings] = await Promise.all([promoOptions(), getSettings()]);
  return (
    <>
      <BackLink href="/hq/promotions">Promotions</BackLink>
      <PageHeader overline="Network promotion" title="New promotion" description="Deals apply automatically at every till and in the web shop — close-but-not-quite baskets get a nudge to add the complementary item." />
      <PromotionForm action={savePromotion.bind(null, null)} values={promoValues(null)} {...opts} medicalMode={settings.compliance.thcMode === "MEDICAL"} />
    </>
  );
}
