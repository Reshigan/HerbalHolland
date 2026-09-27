import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertOctagon, ArrowRight, BadgeCheck, CalendarDays, Factory, FlaskConical, PauseCircle, ScanLine, Sprout } from "lucide-react";
import { db } from "@/server/db";
import { getClasses, getDispensaryAccess } from "@/server/shop/access";
import { ProductArt } from "@/components/product/art";
import { asLab, SafetyResult, SAFETY_PANELS, TerpeneBars } from "@/components/shop/product-parts";
import { Callout, Container, Panel, Tag } from "@/components/shop/ui";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Lab certificate", robots: { index: false, follow: false } };

export default async function BatchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const batch = await db.batch.findUnique({
    where: { code: decodeURIComponent(code).trim().toUpperCase() },
    include: { variant: { include: { product: { include: { category: { select: { name: true } } } } } } },
  });
  if (!batch) notFound();
  const p = batch.variant.product;
  const [classes, access] = await Promise.all([getClasses(), getDispensaryAccess()]);
  const licensed = classes.licensed.includes(p.regClass);
  const linkable = p.status === "ACTIVE" && (!licensed || access.allowed);
  const lab = asLab(batch.labResults);
  const tested = !!batch.labName;
  const expired = batch.expiresAt ? batch.expiresAt < new Date() : false;

  return (
    <Container className="max-w-5xl pt-10 sm:pt-14">
      <div className="flex items-center gap-2 text-sm text-ink-400">
        <ScanLine className="h-4 w-4 text-oranje-500" /> Batch lookup · {batch.code}
      </div>

      {batch.status === "RECALLED" && (
        <Callout tone="danger" icon={<AlertOctagon className="h-6 w-6" />} title="This batch has been recalled — please don't use it" className="mt-6 text-base">
          {batch.statusReason ? `${batch.statusReason}. ` : ""}Please return it to any Herbal Holland store for a refund or replacement. We&apos;re sorry for the inconvenience.
        </Callout>
      )}
      {batch.status === "QUARANTINE" && (
        <Callout tone="warn" icon={<PauseCircle className="h-6 w-6" />} title="This batch is on hold" className="mt-6 text-base">
          {batch.statusReason ? `${batch.statusReason}. ` : ""}It isn&apos;t being sold while our quality team completes checks. If you have a pack from this batch, keep it sealed and ask any store for advice.
        </Callout>
      )}
      {batch.status === "RELEASED" && expired && (
        <Callout tone="warn" title="Past its best-before date" className="mt-6">
          This batch was best before {fmtDate(batch.expiresAt!)}. Please don&apos;t use it after that date.
        </Callout>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[14rem_1fr] md:items-center">
        <ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} label={p.name} className="aspect-square w-40 rounded-3xl md:w-full" />
        <div>
          <div className="eyebrow text-oranje-500">{tested ? "Certificate of analysis" : "Batch record"}</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">{p.name}</h1>
          <p className="mt-1 text-lg text-ink-300">
            {batch.variant.name} · {p.category.name}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {batch.status === "RELEASED" ? (
              <Tag tone="green" icon={<BadgeCheck className="h-3.5 w-3.5" />}>
                Released
              </Tag>
            ) : batch.status === "RECALLED" ? (
              <Tag tone="red">Recalled</Tag>
            ) : (
              <Tag tone="amber">On hold</Tag>
            )}
            <span className="tnum rounded-full bg-ink-850 px-3 py-1 font-mono text-xs text-ink-200">{batch.code}</span>
          </div>
          {linkable && (
            <Link href={`/p/${p.slug}?v=${batch.variantId}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-oranje-400 hover:underline">
              View product <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {tested ? (
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Panel className="p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <FlaskConical className="h-5 w-5 text-oranje-500" /> Potency
            </h2>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              {[
                ["THC", batch.thc],
                ["CBD", batch.cbd],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-2xl bg-ink-950 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">{k}</dt>
                  <dd className="tnum mt-1 font-display text-3xl font-semibold text-white">{v === 0 ? "ND" : v != null ? `${v}%` : "—"}</dd>
                  {v === 0 && <dd className="text-xs text-ink-400">Not detected</dd>}
                </div>
              ))}
            </dl>
            {(p.cbdMgPerPack != null || p.cbdMgPerDay != null) && (
              <dl className="mt-4 divide-y divide-ink-800 rounded-2xl border border-ink-800 px-4 text-sm">
                {p.cbdMgPerPack != null && (
                  <div className="flex justify-between py-2.5">
                    <dt className="text-ink-400">CBD per pack</dt>
                    <dd className="tnum font-semibold text-white">{p.cbdMgPerPack} mg</dd>
                  </div>
                )}
                {p.cbdMgPerDay != null && (
                  <div className="flex justify-between py-2.5">
                    <dt className="text-ink-400">Maximum daily serving</dt>
                    <dd className="tnum font-semibold text-white">{p.cbdMgPerDay} mg</dd>
                  </div>
                )}
                {p.regClass === "CBD" && (
                  <div className="flex justify-between py-2.5">
                    <dt className="text-ink-400">THC limit (Schedule 0)</dt>
                    <dd className="tnum font-semibold text-white">≤ 0.001%</dd>
                  </div>
                )}
              </dl>
            )}
            {lab?.moisturePct != null && <p className="mt-4 text-sm text-ink-400">Moisture content {lab.moisturePct}% (target 9–12% for cured flower)</p>}
            {!!lab?.terpenes?.length && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ink-200">Terpenes (% by weight)</h3>
                <TerpeneBars terps={lab.terpenes} className="mt-3" />
              </div>
            )}
          </Panel>

          <Panel className="p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <BadgeCheck className="h-5 w-5 text-oranje-500" /> Safety screening
            </h2>
            <p className="mt-1 text-sm text-ink-400">PASS means results were below the laboratory&apos;s action limits.</p>
            <ul className="mt-5 divide-y divide-ink-800">
              {SAFETY_PANELS.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <div className="font-medium text-white">{s.label}</div>
                    <div className="text-xs text-ink-400">{s.what}</div>
                  </div>
                  <SafetyResult value={lab?.[s.key] as string | undefined} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : (
        <Callout tone="info" className="mt-12" title="No laboratory testing required">
          This is a non-consumable product, so there&apos;s no certificate of analysis — but every unit is still traceable to its supplier and packing date below.
        </Callout>
      )}

      <Panel className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-white">Traceability</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [<Sprout key="s" className="h-4 w-4" />, "Grown / made by", batch.supplier],
            [<CalendarDays key="p" className="h-4 w-4" />, "Packed", fmtDate(batch.packedAt)],
            [<CalendarDays key="e" className="h-4 w-4" />, "Best before", batch.expiresAt ? fmtDate(batch.expiresAt) : "No expiry"],
            [<Factory key="l" className="h-4 w-4" />, "Laboratory", tested ? `${batch.labName}${batch.coaRef ? ` · ${batch.coaRef}` : ""}` : "Not applicable"],
          ].map(([icon, k, v]) => (
            <div key={k as string}>
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                <span className="text-oranje-500">{icon}</span> {k}
              </dt>
              <dd className="mt-1 text-sm font-medium text-ink-100">{v}</dd>
            </div>
          ))}
        </dl>
        {p.legalBasis && <p className="mt-6 border-t border-ink-800 pt-4 text-xs text-ink-400">Legal basis: {p.legalBasis}</p>}
      </Panel>

      <p className="mt-6 text-sm leading-relaxed text-ink-400">
        This page comes straight from our quality system, so it always shows the current status of the batch. If the code on your pack doesn&apos;t match, or anything looks wrong, please tell us in any store.{" "}
        <Link href="/learn/reading-lab-results" className="font-semibold text-oranje-400 hover:underline">
          How to read a lab result
        </Link>
      </p>
    </Container>
  );
}
