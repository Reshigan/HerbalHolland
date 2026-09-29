// Pure ESC/POS encoder for 58 mm (32 columns) and 80 mm (42 / 48 columns) receipt printers.
// Bytes only — no browser APIs — so the byte layout of a receipt is unit-tested (tests/escpos.test.ts).
// The transports (Web Bluetooth / Web USB) live in print.ts.

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

/** Printable columns: 32 on 58 mm paper, 42 (font A on most 80 mm printers) or 48 (Epson-style 80 mm). */
export type Columns = 32 | 42 | 48;
export const COLUMN_OPTIONS: { cols: Columns; label: string }[] = [
  { cols: 32, label: "58 mm · 32 columns" },
  { cols: 42, label: "80 mm · 42 columns" },
  { cols: 48, label: "80 mm · 48 columns" },
];

/** ESC t n — the printer's character code table. 16 = Windows-1252 on Epson and most compatibles; 0 = PC437 (US). */
export const CODE_PAGE_CP1252 = 16;
export const CODE_PAGE_PC437 = 0;

/** Cash-drawer connector pin (ESC p m): 0 = pin 2 (most drawers), 1 = pin 5. */
export type DrawerPin = 0 | 1;

// ── Text encoding ─────────────────────────────────────────────────────────────
// Receipts use a few typographic characters (−, ·, •, …, ’) that the printer's code page doesn't have or that
// cheap printers render as garbage: transliterate them to ASCII; Latin-1 letters (é, ü) map straight to their
// Windows-1252 byte; anything else prints as "?".
const TRANSLITERATE: Record<string, string> = {
  "−": "-", // minus sign
  "–": "-", // en dash
  "—": "-", // em dash
  "•": "*", // bullet
  "·": "-", // middle dot
  "…": "...",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "×": "x",
  "€": "EUR",
  " ": " ",
  "→": "->",
  "✓": "v",
  "✔": "v",
  "®": "(R)",
  "™": "TM",
};

/** Transliterates a string to the characters the printer can show (1 column per character). */
export function printable(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out += code < 0x20 ? " " : ch;
    else if (TRANSLITERATE[ch]) out += TRANSLITERATE[ch];
    else if (code >= 0xa0 && code <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

/** Windows-1252 bytes for a printable string (see printable()). */
export function encodeText(text: string): number[] {
  const out: number[] = [];
  for (const ch of printable(text)) out.push(ch.codePointAt(0)! & 0xff);
  return out;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

/** Left and right text on one line, the gap padded with spaces; a long left side is cut to keep the amount intact. */
export function row(left: string, right: string, cols: Columns): string {
  const l = printable(left);
  const r = printable(right);
  if (!r) return l.length > cols ? l.slice(0, cols) : l;
  const room = cols - r.length - 1;
  const lt = l.length > room ? l.slice(0, Math.max(0, room)) : l;
  const pad = Math.max(1, cols - lt.length - r.length);
  return `${lt}${" ".repeat(pad)}${r}`;
}

/** Word-wraps text into lines of at most `cols` characters (a word longer than a line is split). */
export function wrap(text: string, cols: Columns): string[] {
  const lines: string[] = [];
  for (const para of printable(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > cols) {
        if (line) (lines.push(line), (line = ""));
        lines.push(w.slice(0, cols));
        w = w.slice(cols);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += ` ${w}`;
      else (lines.push(line), (line = w));
    }
    lines.push(line);
  }
  return lines;
}

export const rule = (cols: Columns, ch = "-") => ch.repeat(cols);

// ── Command builder ───────────────────────────────────────────────────────────

export type Align = "left" | "centre" | "right";
export type Size = { width?: 1 | 2; height?: 1 | 2 };

/** Chainable ESC/POS document builder; `bytes()` returns the finished stream. */
export class EscPos {
  private out: number[] = [];
  constructor(public readonly cols: Columns = 48) {}

  raw(...bytes: number[]) {
    this.out.push(...bytes);
    return this;
  }
  /** ESC @ — reset fonts, alignment and modes to the printer's defaults. */
  init() {
    return this.raw(ESC, 0x40);
  }
  /** ESC t n — select the character code table. */
  codePage(n = CODE_PAGE_CP1252) {
    return this.raw(ESC, 0x74, n & 0xff);
  }
  /** ESC a n — justification. */
  align(a: Align) {
    return this.raw(ESC, 0x61, a === "centre" ? 1 : a === "right" ? 2 : 0);
  }
  /** ESC E n — emphasised (bold). */
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** GS ! n — character size: double width and/or double height (1 = normal). */
  size(s: Size = {}) {
    const w = (s.width ?? 1) - 1;
    const h = (s.height ?? 1) - 1;
    return this.raw(GS, 0x21, ((w & 0x07) << 4) | (h & 0x07));
  }
  /** ESC - n — underline (0 off, 1 thin, 2 thick). */
  underline(n: 0 | 1 | 2) {
    return this.raw(ESC, 0x2d, n);
  }
  /** Prints text and a line feed. */
  line(text = "") {
    return this.raw(...encodeText(text), LF);
  }
  /** Text without a line feed. */
  text(text: string) {
    return this.raw(...encodeText(text));
  }
  /** Word-wrapped paragraph. */
  para(text: string) {
    for (const l of wrap(text, this.cols)) this.line(l);
    return this;
  }
  /** Two-column line: label left, value right. */
  row(left: string, right: string) {
    return this.line(row(left, right, this.cols));
  }
  rule(ch = "-") {
    return this.line(rule(this.cols, ch));
  }
  /** ESC d n — feed n lines. */
  feed(n = 1) {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(255, n)));
  }
  /** GS V 66 n — feed to the cut position and cut (partial cut, which every cutter supports). */
  cut() {
    return this.raw(GS, 0x56, 0x42, 0x00);
  }
  /** ESC p m t1 t2 — pulse the cash-drawer solenoid (pin 2 or 5, 50 ms on / 500 ms off). */
  drawer(pin: DrawerPin = 0) {
    return this.raw(ESC, 0x70, pin, 0x19, 0xfa);
  }
  /**
   * QR code (GS ( k, model 2): module size, error correction M, store the data, then print. The data is stored as
   * UTF-8 so URLs survive; readers decode them fine. Printers without the QR function print nothing here.
   */
  qr(data: string, opts: { size?: number; ec?: "L" | "M" | "Q" | "H" } = {}) {
    const bytes = [...new TextEncoder().encode(data)];
    if (!bytes.length) return this;
    const size = Math.max(1, Math.min(16, opts.size ?? 6));
    const ec = { L: 48, M: 49, Q: 50, H: 51 }[opts.ec ?? "M"];
    const len = bytes.length + 3;
    return this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0) // model 2
      .raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, size) // module size
      .raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, ec) // error correction
      .raw(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes) // store
      .raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // print
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

/** The bytes that open the drawer on their own (no paper moves). */
export const drawerKickBytes = (pin: DrawerPin = 0) => new EscPos().drawer(pin).bytes();

/** Splits a stream into chunks a BLE characteristic or USB endpoint accepts. */
export function chunk(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}
