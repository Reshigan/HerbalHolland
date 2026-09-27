import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ART } from "@/components/merch/art";
import { MERCH, merchFor } from "@/lib/merch";

describe("made-to-order merch", () => {
  it("prints in the other brand ink on each garment colour", () => {
    for (const m of MERCH) for (const p of m.prints) expect(ART[p.art].ink, `${m.slug} ${p.art}`).not.toBe(m.colour);
  });
  it("keeps prints within A3 (297 × 420 mm) and embroidery within a 200 × 120 mm hoop — headwear within 60 mm", () => {
    for (const m of MERCH)
      for (const p of m.prints) {
        const a = ART[p.art];
        if (p.technique === "DTG") expect(a.w <= 297 && a.h <= 420, `${p.art} ${a.w}×${a.h}`).toBe(true);
        else expect(a.w <= 200 && a.h <= 120, `${p.art} ${a.w}×${a.h}`).toBe(true);
        if (["cap", "bucket", "beanie"].includes(m.garment)) expect(Math.max(a.w, a.h)).toBeLessThanOrEqual(60);
      }
  });
  it("embroiders every logo, so the range reads upmarket", () => {
    for (const m of MERCH) if (m.garment !== "tote") expect(m.prints.some((p) => p.technique === "Embroidery"), m.slug).toBe(true);
  });
  it("has print files for every design (npx tsx scripts/merch-export.tsx)", () => {
    for (const m of MERCH) for (const p of m.prints) for (const ext of ["png", "svg"]) expect(existsSync(`public/merch/print/${p.art}.${ext}`), `${p.art}.${ext}`).toBe(true);
  });
  it("looks items up by product slug", () => {
    expect(merchFor("windmill-tee")?.garment).toBe("tee");
    expect(merchFor("calm-cbd-oil-600")).toBeUndefined();
  });
});
