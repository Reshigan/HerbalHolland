import { Download } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { QR_KINDS } from "@/lib/studio";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { QrCode } from "@/components/shop/qr";
import { CopyButton } from "@/components/trade/copy-button";
import { MarketingTabs } from "../../tabs";
import { qrFor, type QrParams } from "./link";

export const metadata = { title: "QR codes and links" };

export default async function QrPage({ searchParams }: { searchParams: Promise<QrParams> }) {
  await requireStaff(HQ_ROLES);
  const sp = await searchParams;
  const q = await qrFor(sp);
  const qs = new URLSearchParams({ kind: q.kind, ...(q.code && { code: q.code }), ...(q.tag && { tag: q.tag }) });
  return (
    <>
      <PageHeader
        overline="Studio"
        title="QR codes and links"
        description="For window wraps, flyers, posters and the menu board: a store's WhatsApp chat for questions, the Rewards join page or a store's page. Tag each placement so Reports shows which one filled the list."
        actions={
          <ButtonLink href="/hq/marketing/studio" variant="outline" size="sm">
            Back to the Studio
          </ButtonLink>
        }
      />
      <MarketingTabs current="studio" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <form method="get" className="space-y-4">
            <Field label="Points to" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue={q.kind}>
                {Object.entries(QR_KINDS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Store code" hint="For example PTA01. Optional for the join page (it then asks for a home store)." htmlFor="code">
              <Input id="code" name="code" defaultValue={q.code} autoCapitalize="characters" />
            </Field>
            <Field label="Placement tag" hint="Lowercase letters, numbers and dashes, like window-hillcrest or flyer-hilton. Not used for WhatsApp." htmlFor="tag">
              <Input id="tag" name="tag" defaultValue={q.rawTag} pattern="[a-z0-9][a-z0-9-]{0,39}" />
            </Field>
            <Button type="submit">Make the code</Button>
          </form>
          <Notice tone="info" className="mt-5">
            WhatsApp is for the conversations members start (opening hours, directions, Rewards, events), never products or offers: WhatsApp&apos;s rules ban them for a cannabis brand. Roadside boards carry no QR code: nobody should scan while driving.
          </Notice>
        </Card>
        <Card className="p-5">
          {q.problem ? (
            <Notice tone="warn">{q.problem}</Notice>
          ) : q.link ? (
            <div className="flex flex-col items-center gap-4">
              <QrCode value={q.link} label={`QR code for ${q.link}`} className="h-64 w-64" />
              <p className="break-all text-center text-sm text-ink-700">{q.link}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <CopyButton text={q.link} label="Copy the link" className="h-10 border border-ink-200 text-ink-700 hover:bg-ink-100 hover:text-ink-900 sm:h-10" />
                <ButtonLink href={`/hq/marketing/studio/qr/svg?${qs}`} variant="outline" size="sm" prefetch={false}>
                  <Download className="h-4 w-4" aria-hidden /> SVG for print
                </ButtonLink>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
