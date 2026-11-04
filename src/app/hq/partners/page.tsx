import { requireStaff, HQ_ROLES } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { siteUrl } from "@/lib/seo";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { ViewOnly } from "@/components/hq/ui";
import { QrCode } from "@/components/shop/qr";
import { CopyButton } from "@/components/trade/copy-button";
import { revealPartnerKey, rotatePartnerKey, savePartner, togglePartner } from "./actions";

export const metadata = { title: "Partners" };

function PartnerFields({ p }: { p?: { id: string; name: string; joinUrl: string | null; agreement: string } }) {
  const k = p?.id ?? "new";
  return (
    <>
      <Field label="Name" htmlFor={`pn-${k}`}>
        <Input id={`pn-${k}`} name="name" defaultValue={p?.name} required />
        <FieldError name="name" />
      </Field>
      <Field label="Data-sharing agreement" hint="Reference and date of the signed agreement. Required before any member crosses over" htmlFor={`pa-${k}`}>
        <Textarea id={`pa-${k}`} name="agreement" defaultValue={p?.agreement} rows={2} required />
        <FieldError name="agreement" />
      </Field>
      <Field label="Their join page" hint="Leave empty until they can take our members. Must be https" htmlFor={`pu-${k}`}>
        <Input id={`pu-${k}`} name="joinUrl" type="url" defaultValue={p?.joinUrl ?? ""} placeholder="https://" />
        <FieldError name="joinUrl" />
      </Field>
    </>
  );
}

export default async function HqPartners() {
  const user = await requireStaff(HQ_ROLES);
  const admin = can(user, "admin");
  const [partners, counts] = await Promise.all([
    db.partnerBrand.findMany({ orderBy: { name: "asc" } }),
    db.partnerLink.groupBy({ by: ["partnerId", "direction"], where: { revokedAt: null }, _count: { _all: true } }),
  ]);
  const count = (id: string, direction: "IN" | "OUT") => counts.find((c) => c.partnerId === id && c.direction === direction)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader overline="Members" title="Partners" description="Brands whose members can join us, and ours theirs. Each member crosses over by their own choice: there is no list import." />
      {!admin && <ViewOnly>View only: partners are set by the HQ administrator.</ViewOnly>}

      {partners.map((p) => {
        const link = `${siteUrl()}/club/join?partner=${p.slug}`;
        return (
          <Card key={p.id}>
            <CardHeader title={p.name} description={`${count(p.id, "IN")} joined us · ${count(p.id, "OUT")} shared to them`} action={p.active ? undefined : <Badge>Paused</Badge>} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                <QrCode value={link} label={`Join link for ${p.name}`} className="h-32 w-32" />
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <div className="break-all font-mono text-xs text-ink-700">{link}</div>
                  <CopyButton text={link} label="Copy join link" className="text-ink-700 hover:bg-ink-100 hover:text-ink-900" />
                  <p className="text-ink-500">Agreement: {p.agreement}</p>
                  <p className="text-ink-500">{p.joinUrl ? `Our members go to ${p.joinUrl}` : "No join page yet, so our members can't be offered this partner."}</p>
                </div>
              </div>
              {admin && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButton action={togglePartner} fields={{ id: p.id }}>
                      {p.active ? "Pause" : "Resume"}
                    </ActionButton>
                    <ConfirmAction action={rotatePartnerKey} fields={{ id: p.id }} label="Rotate key" title={`Rotate the key for ${p.name}?`} confirmLabel="Rotate key" triggerVariant="outline" size="sm">
                      Links carrying member details stop working in both directions until {p.name} has the new key. Plain join links and QR codes keep working.
                    </ConfirmAction>
                  </div>
                  <ActionForm action={revealPartnerKey}>
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton variant="outline" size="sm">
                      Show key
                    </SubmitButton>
                  </ActionForm>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Edit</summary>
                    <ActionForm action={savePartner} className="mt-3 max-w-xl space-y-4">
                      <input type="hidden" name="id" value={p.id} />
                      <PartnerFields p={p} />
                      <SubmitButton>Save</SubmitButton>
                    </ActionForm>
                  </details>
                </>
              )}
            </CardBody>
          </Card>
        );
      })}

      {!partners.length && <p className="text-sm text-ink-500">No partners yet. Nothing changes for members until you add one.</p>}

      {admin && (
        <Card>
          <CardHeader title="Add a partner" />
          <CardBody>
            <ActionForm action={savePartner} className="max-w-xl space-y-4" resetOnSuccess>
              <PartnerFields />
              <Field label="Link name" hint="Used in their join link and can't be changed. Defaults to the name" htmlFor="ps-new">
                <Input id="ps-new" name="slug" placeholder="medellin" maxLength={32} />
                <FieldError name="slug" />
              </Field>
              <SubmitButton>Add partner</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
