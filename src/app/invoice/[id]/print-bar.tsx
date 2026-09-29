"use client";
// The invoice's toolbar: save as PDF (the browser's print dialog on A4), print on A4, or print on 80 mm receipt paper.
// The paper choice is a data attribute on <html> plus a temporary @page rule, both removed once the dialog closes.
import Link from "next/link";
import { FileDown, Printer, Receipt } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

type Paper = "a4" | "receipt";
const PAGE: Record<Paper, string> = { a4: "@page{size:A4;margin:12mm}", receipt: "@page{size:80mm auto;margin:4mm}" };

function printOn(paper: Paper) {
  const html = document.documentElement;
  const style = document.createElement("style");
  style.textContent = PAGE[paper];
  html.dataset.paper = paper;
  document.head.append(style);
  const done = () => {
    style.remove();
    delete html.dataset.paper;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // Browsers that never fire afterprint (some in-app browsers): tidy up once the dialog has had a moment.
  setTimeout(done, 60_000);
}

export function PrintBar({ back }: { back?: { href: string; label: string } | null }) {
  return (
    <div className="no-print mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
      {back ? (
        <Link href={back.href} className="text-sm font-medium text-ink-600 hover:text-ink-900">
          ← {back.label}
        </Link>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => printOn("receipt")} className={buttonClass("outline", "md")} title="80 mm till paper">
          <Receipt className="h-4 w-4" strokeWidth={1.9} /> Print receipt
        </button>
        <button type="button" onClick={() => printOn("a4")} className={buttonClass("outline", "md")} title="A4">
          <Printer className="h-4 w-4" strokeWidth={1.9} /> Print A4
        </button>
        <button type="button" onClick={() => printOn("a4")} className={buttonClass("dark", "md")} title="Choose “Save as PDF” as the printer">
          <FileDown className="h-4 w-4" strokeWidth={1.9} /> Save as PDF
        </button>
      </div>
    </div>
  );
}
