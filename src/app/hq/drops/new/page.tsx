import { redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { can } from "@/server/hq/guard";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { saveDrop } from "../actions";
import { DropForm } from "../drop-form";
import { dropValues, variantOptions } from "../load";

export const metadata = { title: "New drop" };

export default async function NewDropPage() {
  const user = await requireStaff(HQ_ROLES);
  if (!can(user, "network")) redirect("/hq/drops");
  const options = await variantOptions();
  return (
    <>
      <BackLink href="/hq/drops">Drops</BackLink>
      <PageHeader
        overline="Launch programme"
        title="New drop"
        description="Pick the products, the opening time and who gets in first. Members can tap “notify me” as soon as it's saved; limits apply at every till and online."
      />
      <DropForm action={saveDrop.bind(null, null)} values={dropValues(null)} options={options} submitLabel="Schedule drop" />
    </>
  );
}
