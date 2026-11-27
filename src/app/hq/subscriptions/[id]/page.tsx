import { notFound } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { asList } from "@/lib/json-list";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/hq/flash";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { savePlan } from "../actions";
import { PlanForm } from "../plan-form";
import { planOptions } from "../load";

export const metadata = { title: "Plan" };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const plan = await db.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) notFound();
  const [{ products, stores }, members] = await Promise.all([
    planOptions(asList<string>(plan.eligible)),
    db.subscription.count({ where: { planId: plan.id, status: { not: "CANCELLED" } } }),
  ]);
  const edit = can(user, "network");
  return (
    <>
      <BackLink href="/hq/subscriptions">Subscriptions</BackLink>
      <PageHeader
        overline={`Plan · ${plan.slug}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {plan.name}
            <Badge tone={plan.status === "ACTIVE" ? "green" : plan.status === "DRAFT" ? "neutral" : "dark"} dot>
              {plan.status === "ACTIVE" ? "Live" : plan.status === "DRAFT" ? "Draft" : "Archived"}
            </Badge>
          </span>
        }
        description={`${num(members)} member${members === 1 ? "" : "s"} on this plan. A price change applies to new members only.`}
      />
      <Flash message={sp.m} />
      {!edit && <ViewOnly className="mb-4" />}
      <PlanForm action={savePlan.bind(null, plan.id)} plan={plan} products={products} stores={stores} readOnly={!edit} />
    </>
  );
}
