import type { SubscriptionPlan } from "@/generated/prisma/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { MultiPick, type PickOption } from "@/components/hq/multi-pick";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";
import { centsToInput } from "@/lib/money";
import { asList } from "@/lib/json-list";

/** The plan editor: page copy and image, the allowance, the price, what members may choose and where. */
export function PlanForm({ action, plan, products, stores, readOnly, submitLabel = "Save plan" }: {
  action: FormAction;
  plan: SubscriptionPlan | null;
  products: PickOption[];
  stores: PickOption[];
  readOnly?: boolean;
  submitLabel?: string;
}) {
  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-2">
      <fieldset disabled={readOnly} className="contents">
        <Card>
          <CardHeader title="Page" description="What members see on the Club plans page. Plain, warm and factual: no health claims." />
          <CardBody className="grid gap-4">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={plan?.name ?? ""} maxLength={80} required />
              <FieldError name="name" />
            </Field>
            <Field label="Web address" htmlFor="slug" hint="Lowercase letters, digits and dashes, e.g. weekly-pre-rolls">
              <Input id="slug" name="slug" defaultValue={plan?.slug ?? ""} maxLength={80} required />
              <FieldError name="slug" />
            </Field>
            <Field label="Tagline" htmlFor="tagline">
              <Input id="tagline" name="tagline" defaultValue={plan?.tagline ?? ""} maxLength={120} />
              <FieldError name="tagline" />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" rows={5} defaultValue={plan?.description ?? ""} maxLength={1000} />
              <FieldError name="description" />
            </Field>
            <Field label="Image" htmlFor="imageUrl" hint="An https:// address or a path on this site. Leave empty for the brand artwork.">
              <Input id="imageUrl" name="imageUrl" defaultValue={plan?.imageUrl ?? ""} />
              <FieldError name="imageUrl" />
            </Field>
            <Field label="Order on the page" htmlFor="sortOrder" hint="Lower numbers show first">
              <Input id="sortOrder" name="sortOrder" type="number" step={1} defaultValue={plan?.sortOrder ?? 0} className="w-28" />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Allowance and price" description="Each period is paid as its own order; the allowance opens once it's paid." />
          <CardBody className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Counted in" htmlFor="unit">
                <Select id="unit" name="unit" defaultValue={plan?.unit ?? "GRAMS"}>
                  <option value="GRAMS">Grams</option>
                  <option value="UNITS">Items</option>
                </Select>
                <FieldError name="unit" />
              </Field>
              <Field label="Allowance each period" htmlFor="allowance">
                <Input id="allowance" name="allowance" inputMode="decimal" defaultValue={plan?.allowance ?? 3} required />
              </Field>
            </div>
            <Field label="Item word" htmlFor="itemWord" hint="For plans counted in items, e.g. pre-rolls">
              <Input id="itemWord" name="itemWord" defaultValue={plan?.itemWord ?? "items"} maxLength={30} />
              <FieldError name="itemWord" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bills" htmlFor="period">
                <Select id="period" name="period" defaultValue={plan?.period ?? "WEEKLY"}>
                  <option value="WEEKLY">Weekly</option>
                  <option value="FOUR_WEEKLY">Every 4 weeks</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
                <FieldError name="period" />
              </Field>
              <Field label="Price per period (R, VAT incl.)" htmlFor="price">
                <Input id="price" name="price" inputMode="decimal" defaultValue={plan ? centsToInput(plan.priceCents) : ""} required />
              </Field>
            </div>
            <Checkbox name="rollover" defaultChecked={plan?.rollover ?? false} label="Unclaimed allowance carries over once" description="A paid period that isn't collected adds to the next period. A carried allowance never carries again." />
            <Field label="Status" htmlFor="status" hint="Draft plans are hidden from members. Archiving stops new joins; current members carry on until they cancel.">
              <Select id="status" name="status" defaultValue={plan?.status ?? "DRAFT"}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Live</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
              <FieldError name="status" />
            </Field>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Choice and stores" description="Licensed products and medicines can't be on a plan. Leave stores empty to offer it everywhere." />
          <CardBody className="grid gap-4 lg:grid-cols-2">
            <Field label="Products members can choose">
              <MultiPick name="eligible" options={products} defaultValue={asList<string>(plan?.eligible)} placeholder="Search products" emptyLabel="None chosen" />
              <FieldError name="eligible" />
            </Field>
            <Field label="Stores">
              <MultiPick name="storeIds" options={stores} defaultValue={asList<string>(plan?.storeIds)} placeholder="Search stores" emptyLabel="Every store" />
              <FieldError name="storeIds" />
            </Field>
          </CardBody>
        </Card>
        {!readOnly && (
          <div className="lg:col-span-2">
            <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
          </div>
        )}
      </fieldset>
    </ActionForm>
  );
}
