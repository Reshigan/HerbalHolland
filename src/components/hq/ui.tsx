// Small presentational helpers shared by HQ console pages (server-safe).
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/** ▲ 12.3% / ▼ 4.0% with colour AND arrow (never colour alone). */
export function DeltaText({ value, upIsGood = true, className }: { value: number | null | undefined; upIsGood?: boolean; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cn("text-ink-500", className)}>—</span>;
  const good = value >= 0 === upIsGood;
  return (
    <span className={cn("tnum inline-flex items-center gap-0.5 text-xs font-semibold", good ? "text-leaf-600" : "text-rose-600", className)}>
      <span aria-hidden>{value >= 0 ? "▲" : "▼"}</span>
      {Math.abs(value * 100).toFixed(1)}%
      <span className="sr-only">{value >= 0 ? "up" : "down"}</span>
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

export function ViewOnly({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border border-ink-150 bg-white px-4 py-3 text-sm text-ink-600", className)} role="note">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <span>{children ?? "View only — changes are made by the HQ team."}</span>
    </div>
  );
}

export function Section({ title, description, action, children, className, bodyClassName }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} action={action} />
      <CardBody className={bodyClassName}>{children}</CardBody>
    </Card>
  );
}

export function MiniStat({ label, value, sub, className, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string; tone?: "dark" }) {
  return (
    <div className={cn("rounded-xl p-3", tone === "dark" ? "bg-ink-950 text-white" : "bg-ink-50", className)}>
      <div className={cn("text-xs", tone === "dark" ? "text-ink-300" : "text-ink-500")}>{label}</div>
      <div className={cn("font-display text-lg font-semibold leading-tight tnum", tone === "dark" ? "text-white" : "text-ink-950")}>{value}</div>
      {sub && <div className={cn("mt-0.5 text-xs", tone === "dark" ? "text-ink-400" : "text-ink-500")}>{sub}</div>}
    </div>
  );
}

/** A table row that spans every column — for empty states inside tables (see also TableEmpty in @/components/ui/table). */
export function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-10 text-center text-sm text-ink-500" role="status">
        {children}
      </td>
    </tr>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[0.7rem] font-medium text-ink-600", className)}>{children}</span>;
}
