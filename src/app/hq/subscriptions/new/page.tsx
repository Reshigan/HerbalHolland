import { redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { can } from "@/server/hq/guard";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { savePlan } from "../actions";
import { PlanForm } from "../plan-form";
import { planOptions } from "../load";

export const metadata = { title: "New plan" };

export default async function NewPlanPage() {
  const user = await requireStaff(HQ_ROLES);
  if (!can(user, "network")) redirect("/hq/subscriptions");
  const { products, stores } = await planOptions();
  return (
    <>
      <BackLink href="/hq/subscriptions">Subscriptions</BackLink>
      <PageHeader overline="Launch programme" title="New plan" description="Write the page, set the allowance and the price, then choose what members can pick. Plans start as drafts; set one live when it's ready." />
      <PlanForm action={savePlan.bind(null, null)} plan={null} products={products} stores={stores} submitLabel="Create plan" />
    </>
  );
}
