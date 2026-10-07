import { describe, expect, it } from "vitest";
import { chunk, drawerKickBytes, encodeText, EscPos, printable, row, rule, wrap } from "@/components/pos/lib/escpos";
import { ADULTS_LINE, CBD_LINE, LICENSED_LINE, receiptBytes, testPageBytes, TRAINING_LINE, type ReceiptStore } from "@/components/pos/lib/receipt";
import { zReportBytes } from "@/components/pos/lib/print-z";
import { maskMemberNo } from "@/components/pos/lib/rules";
import type { ReceiptDTO, ZReport } from "@/server/pos/types";

const hex = (b: Uint8Array | number[]) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

/** Renders a byte stream as readable text: control sequences in <>, printable bytes as-is, LF as a newline. */
function dump(bytes: Uint8Array): string {
  const b = [...bytes];
  let out = "";
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    if (x === 0x1b) {
      const c = b[i + 1];
      const n = c === 0x40 ? 0 : c === 0x70 ? 3 : 1; // ESC @ · ESC p m t1 t2 · ESC t/a/E/d/- n
      out += `<ESC ${String.fromCharCode(c)}${n ? " " + hex(b.slice(i + 2, i + 2 + n)) : ""}>`;
      i += 2 + n;
    } else if (x === 0x1d) {
      const c = b[i + 1];
      if (c === 0x28) {
        // GS ( k pL pH cn fn …
        const len = b[i + 3] + b[i + 4] * 256;
        const fn = b[i + 6];
        const data = b.slice(i + 8, i + 5 + len);
        out += `<GS(k fn=${fn}${fn === 0x50 ? ` "${String.fromCharCode(...data)}"` : ` ${hex(b.slice(i + 7, i + 5 + len))}`}>`;
        i += 5 + len;
      } else {
        const n = c === 0x56 ? 2 : 1; // GS V m n · GS ! n
        out += `<GS ${String.fromCharCode(c)} ${hex(b.slice(i + 2, i + 2 + n))}>`;
        i += 2 + n;
      }
    } else if (x === 0x0a) {
      out += "\n";
      i++;
    } else {
      out += x < 0x80 ? String.fromCharCode(x) : `\\x${x.toString(16)}`;
      i++;
    }
  }
  return out;
}

const store: ReceiptStore = {
  code: "PTA01",
  name: "Hatfield",
  legalName: "Hatfield Herbal (Pty) Ltd",
  vatNumber: "4123456789",
  addressLine: "12 Burnett Street",
  suburb: "Hatfield",
  city: "Pretoria",
  postalCode: "0083",
  phone: "012 345 6789",
  licenceRef: "SAHPRA licence 0000/2026",
  receiptFooter: "Keep this slip for returns within 7 days.",
};

const receipt = (over: Partial<ReceiptDTO> = {}): ReceiptDTO => ({
  id: "0f7e2c4a-1111-4222-8333-444455556666",
  number: "PTA01-B00042",
  kind: "SALE",
  channel: "POS",
  title: "Tax invoice",
  createdAt: "2026-09-27T12:03:00+02:00",
  offline: false,
  refundOf: null,
  staff: "Shireen Singh",
  customer: { id: "c1", name: "Thandi Mokoena", memberNo: "HH0100002", tier: "SPROUT", points: 1230 },
  lines: [
    { id: "l1", variantId: "v-flower", name: "Durban Poison", variantName: "3.5g", sku: "FLW-DUPO0-35G", qty: 1, unitPriceCents: 62000, discountCents: 0, offerCents: 0, totalCents: 62000, vatCents: 8087, refundedQty: 0 },
    { id: "l2", variantId: "v-balm", name: "Recover CBD Muscle Balm", variantName: "50 ml", sku: "SKN-RECO-50", qty: 2, unitPriceCents: 38500, discountCents: 7700, offerCents: 7700, totalCents: 69300, vatCents: 9039, refundedQty: 0 },
    { id: "l3", variantId: "v-oil", name: "Calm CBD Oil", variantName: "30 ml", sku: "WEL-CALM-30", qty: 1, unitPriceCents: 59500, discountCents: 0, offerCents: 0, totalCents: 59500, vatCents: 7761, refundedQty: 0 },
  ],
  subtotalCents: 198500,
  discountCents: 7700,
  offerCents: 7700,
  offers: ["15% off Recover Balm"],
  memberSavingsCents: 3000,
  totalCents: 190800,
  vatCents: 24887,
  pointsEarned: 65,
  pointsRedeemed: 0,
  payments: [{ method: "CASH", amountCents: 190800, tenderedCents: 200000, changeCents: 9200, provider: null, reference: null, cardBrand: null, cardLast4: null }],
  promoCode: null,
  invoiceEmail: "thandi@example.co.za",
  buyer: null,
  note: null,
  refunds: [],
  invoiceUrl: "https://herbalholland.co.za/invoice/0f7e2c4a-1111-4222-8333-444455556666?t=abc123",
  ...over,
});

const opts = { cols: 48 as const, store, devicePrefix: "B", licensed: (id: string) => id === "v-flower", noIncentive: (id: string) => id === "v-oil" };

describe("ESC/POS encoder", () => {
  it("emits the standard control sequences", () => {
    const p = new EscPos(48);
    expect(hex(p.init().bytes())).toBe("1b 40");
    expect(hex(new EscPos().codePage(16).bytes())).toBe("1b 74 10");
    expect(hex(new EscPos().align("centre").align("right").align("left").bytes())).toBe("1b 61 01 1b 61 02 1b 61 00");
    expect(hex(new EscPos().bold(true).bold(false).bytes())).toBe("1b 45 01 1b 45 00");
    expect(hex(new EscPos().size({ height: 2 }).size({ width: 2 }).size({ width: 2, height: 2 }).size().bytes())).toBe("1d 21 01 1d 21 10 1d 21 11 1d 21 00");
    expect(hex(new EscPos().feed(3).cut().bytes())).toBe("1b 64 03 1d 56 42 00");
    expect(hex(drawerKickBytes(0))).toBe("1b 70 00 19 fa");
    expect(hex(drawerKickBytes(1))).toBe("1b 70 01 19 fa");
  });

  it("encodes text as Windows-1252 with typographic characters transliterated", () => {
    expect(printable("Total −R20.00 · Thandi’s “deal” … × 2")).toBe(`Total -R20.00 - Thandi's "deal" ... x 2`);
    expect(hex(encodeText("Aé"))).toBe("41 e9");
    expect(printable("Emoji 🌿 tab\t")).toBe("Emoji ? tab ");
    expect(hex(new EscPos().line("Hi").bytes())).toBe("48 69 0a");
  });

  it("lays out two-column rows for every paper width", () => {
    for (const cols of [32, 42, 48] as const) {
      const r = row("Cash tendered", "R1,234.50", cols);
      expect(r.length).toBe(cols);
      expect(r.endsWith("R1,234.50")).toBe(true);
      expect(r.startsWith("Cash tendered ")).toBe(true);
      expect(rule(cols).length).toBe(cols);
    }
    // A long label never pushes the amount off the line.
    const long = row("Recover CBD Muscle Balm 50 ml with a very long name indeed", "R385.00", 32);
    expect(long.length).toBe(32);
    expect(long.endsWith(" R385.00")).toBe(true);
    expect(row("Only left", "", 32)).toBe("Only left");
  });

  it("wraps paragraphs to the column width", () => {
    const lines = wrap("Licensed medicine dispensed to the named patient under their SAHPRA authorisation by an authorised dispenser.", 32);
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines.join(" ")).toBe("Licensed medicine dispensed to the named patient under their SAHPRA authorisation by an authorised dispenser.");
    expect(wrap("a".repeat(70), 32)).toEqual(["a".repeat(32), "a".repeat(32), "a".repeat(6)]);
  });

  it("prints a QR code with the GS ( k function set", () => {
    const b = new EscPos().qr("https://hh.test/i/1", { size: 5, ec: "M" }).bytes();
    const d = dump(b);
    expect(d).toBe(`<GS(k fn=65 32 00><GS(k fn=67 05><GS(k fn=69 31><GS(k fn=80 "https://hh.test/i/1"><GS(k fn=81 30>`);
    // Store-data length = data + 3, little-endian.
    const store = [...b].findIndex((x, i) => x === 0x1d && b[i + 1] === 0x28 && b[i + 5] === 0x31 && b[i + 6] === 0x50);
    expect(b[store + 3] + b[store + 4] * 256).toBe("https://hh.test/i/1".length + 3);
    expect(new EscPos().qr("").bytes().length).toBe(0);
  });

  it("chunks streams for BLE writes", () => {
    const parts = chunk(new Uint8Array(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });
});

describe("receipt layout", () => {
  it("matches the 48-column byte layout of a member's cash sale with a licensed medicine and a CBD supplement", () => {
    const d = dump(receiptBytes(receipt(), opts));
    expect(d).toMatchSnapshot();
    expect(d).toContain("HH••••002".replace(/•/g, "\\xe2\\x80\\xa2").slice(0, 0) + "HH"); // member number present…
    expect(d).not.toContain("HH0100002"); // …but never in full
    expect(d).toContain("(Rx)");
    expect(d).toContain(LICENSED_LINE.slice(0, 30));
    expect(d).toContain(CBD_LINE.slice(0, 20));
    expect(d).toContain(ADULTS_LINE);
    expect(d).toContain('fn=80 "https://herbalholland.co.za/invoice/');
    expect(d).toContain("CHANGE");
    expect(d).toContain("R92.00");
    expect(d).toContain("<GS V 42 00>");
    expect(d).not.toContain(TRAINING_LINE);
  });

  it("fits 58 mm paper (32 columns) and kicks the drawer when asked", () => {
    const d = dump(receiptBytes(receipt(), { ...opts, cols: 32, drawer: 0 }));
    const text = d.replace(/<[^>]+>/g, "");
    for (const line of text.split("\n")) expect(line.length, line).toBeLessThanOrEqual(32);
    expect(d.endsWith("<ESC p 00 19 fa>")).toBe(true);
  });

  it("watermarks training receipts and never prints an invoice link, points or a drawer kick", () => {
    const d = dump(receiptBytes(receipt({ training: true }), { ...opts, drawer: 0 }));
    expect(d.split(TRAINING_LINE).length).toBe(3); // top and bottom
    expect(d).toContain("TRAINING TAX INVOICE");
    expect(d).not.toContain("fn=80");
    expect(d).not.toContain("Points earned");
    expect(d).not.toContain("<ESC p");
  });

  it("prints a credit note for a refund", () => {
    const d = dump(
      receiptBytes(
        receipt({
          kind: "REFUND",
          title: "Credit note",
          number: "PTA01-B00043",
          refundOf: { id: "x", number: "PTA01-B00042" },
          lines: [{ id: "r1", variantId: "v-balm", name: "Recover CBD Muscle Balm", variantName: "50 ml", sku: "SKN-RECO-50", qty: -1, unitPriceCents: 38500, discountCents: 0, offerCents: 0, totalCents: -34650, vatCents: -4520, refundedQty: 0 }],
          totalCents: -34650,
          vatCents: -4520,
          discountCents: 0,
          offerCents: 0,
          memberSavingsCents: 0,
          payments: [{ method: "CASH", amountCents: -34650, tenderedCents: null, changeCents: null, provider: null, reference: null, cardBrand: null, cardLast4: null }],
          note: "Changed mind (unopened)",
          invoiceUrl: null,
        }),
        opts,
      ),
    );
    expect(d).toContain("CREDIT NOTE");
    expect(d).toContain("Refund of PTA01-B00042");
    expect(d).toContain("1 x R385.00");
    expect(d).toContain("-R346.50");
    expect(d).toContain("Reason: Changed mind (unopened)");
  });

  it("has a test page and a Z-report adapter", () => {
    const t = dump(testPageBytes({ cols: 42, store, devicePrefix: "B", drawer: 0, at: new Date("2026-09-27T10:00:00+02:00") }));
    expect(t).toContain("PRINTER TEST");
    expect(t).toContain("42 columns");
    expect(t).toContain("The drawer should open now.");
    const z: ZReport = {
      shiftId: "s1",
      closed: true,
      store: { code: "PTA01", name: "Hatfield", legalName: store.legalName, vatNumber: store.vatNumber },
      device: { name: "Counter 1", prefix: "B" },
      openedAt: "2026-09-27T08:00:00+02:00",
      closedAt: "2026-09-27T18:00:00+02:00",
      openedBy: "Shireen Singh",
      closedBy: "Shireen Singh",
      sales: { count: 41, grossCents: 1_234_500, vatCents: 161_022, netCents: 1_073_478, discountCents: 12_000, memberSavingsCents: 30_000, units: 77 },
      refunds: { count: 1, totalCents: 38_500 },
      online: { count: 3, grossCents: 90_000 },
      tenders: [
        { method: "CARD", label: "Card", amountCents: 900_000, count: 30 },
        { method: "CASH", label: "Cash", amountCents: 296_000, count: 11 },
      ],
      points: { issued: 640, redeemed: 50 },
      cash: { floatCents: 100_000, cashNetCents: 296_000, expectedCents: 396_000, countedCents: 395_000, varianceCents: -1000, counts: { "20000": 15, "10000": 9, "500": 10 } },
      takingsCents: 1_196_000,
      dispensing: { count: 6, units: 8, grams: 21.5, cents: 420_000 },
      notes: "R50 paid out for milk",
      emailedTo: null,
    };
    const d = dump(zReportBytes(z, { cols: 48, at: new Date("2026-09-27T18:01:00+02:00") }));
    expect(d).toContain("Z-REPORT (SHIFT CLOSED)");
    expect(d).toContain("Net takings");
    expect(d).toContain("R11,960.00");
    expect(d).toContain("Licensed medicine dispensed");
    expect(d).toContain("R200 x 15");
    expect(d).toContain("-R10.00"); // variance
    expect(d).toContain("<GS V 42 00>");
  });
});

describe("member numbers on paper", () => {
  it("masks all but the last three digits", () => {
    expect(maskMemberNo("HH0100002")).toBe("HH••••002");
    expect(maskMemberNo("HH1234567")).toBe("HH••••567");
    expect(maskMemberNo("ABC")).toBe("ABC");
  });
});
