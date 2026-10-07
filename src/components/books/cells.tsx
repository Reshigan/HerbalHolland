// Amounts in the books' reports: rands with tabular figures, nil as a dash, balances as debit or credit, and links
// that drill down (to the ledger). Server-safe.
import Link from "next/link";
import { Td } from "@/components/ui/table";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

const DRILL = "underline-offset-2 hover:text-brand-700 hover:underline";

/** An amount in rands (nil shows as a dash). With `href`, it opens the detail behind it. */
export function Amount({ cents, href, className }: { cents: number; href?: string; className?: string }) {
  const text = cents ? zar(cents) : "—";
  const cls = cn("tnum whitespace-nowrap", !cents && "text-ink-400", className);
  return href && cents ? (
    <Link href={href} className={cn(cls, DRILL)}>
      {text}
    </Link>
  ) : (
    <span className={cls}>{text}</span>
  );
}

/** A balance as the ledger reads it: "R1,234.00 Dr" (debit, positive) or "R1,234.00 Cr" (credit, negative). */
export function DrCr({ cents, href, className }: { cents: number; href?: string; className?: string }) {
  if (!cents) return <span className={cn("tnum text-ink-400", className)}>—</span>;
  const body = (
    <>
      {zar(Math.abs(cents))}{" "}
      <abbr title={cents > 0 ? "debit" : "credit"} className="text-xs font-normal text-ink-500 no-underline">
        {cents > 0 ? "Dr" : "Cr"}
      </abbr>
    </>
  );
  const cls = cn("tnum whitespace-nowrap", className);
  return href ? (
    <Link href={href} className={cn(cls, DRILL)}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** A right-aligned table cell with an amount, or a balance as debit/credit (`drcr`). */
export function AmountCell({ cents, href, drcr, strong, className }: { cents: number; href?: string; drcr?: boolean; strong?: boolean; className?: string }) {
  return (
    <Td align="right" className={cn(strong && "font-semibold text-ink-950", className)}>
      {drcr ? <DrCr cents={cents} href={href} /> : <Amount cents={cents} href={href} />}
    </Td>
  );
}
