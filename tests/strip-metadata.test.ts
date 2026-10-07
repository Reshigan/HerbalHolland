// Photos people send keep only the picture (and a JPEG its orientation).
import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "@/lib/strip-metadata";

const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, "latin1"));

describe("stripImageMetadata", () => {
  // EXIF (little-endian) with orientation 6 and a GPS marker string; XMP; IPTC; a comment; then real JPEG segments.
  const exif = [...text("Exif\0\0"), 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, ...text("GPS -29.85,30.98")];
  const jpeg = bytes([0xff, 0xd8], seg(0xe0, text("JFIF\0")), seg(0xe1, exif), seg(0xe1, text("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Durban</x:xmpmeta>")), seg(0xed, text("Photoshop 3.0\0IPTC")), seg(0xfe, text("Shot on a Pixel")), seg(0xdb, [0, 1, 2, 3]), [0xff, 0xda, 0, 8, 1, 2, 3, 4, 5, 6, 0x11, 0x22, 0xff, 0xd9]);

  it("drops a JPEG's EXIF, XMP, IPTC and comment, keeps its picture and its orientation", () => {
    const out = stripImageMetadata(jpeg);
    for (const s of ["GPS", "xmpmeta", "IPTC", "Pixel", "Durban"]) expect(has(out, s)).toBe(false);
    expect(has(out, "JFIF")).toBe(true);
    expect(Buffer.from(out.subarray(-14)).equals(Buffer.from(jpeg.subarray(-14)))).toBe(true); // the scan data, untouched
    // The orientation (6) survives in a minimal EXIF segment straight after the start marker.
    expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    expect(has(out, "Exif")).toBe(true);
    expect(out[31]).toBe(6);
  });

  it("drops a PNG's text, EXIF and time chunks", () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...text(type), ...data, 0, 0, 0, 0];
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), chunk("tEXt", text("Comment\0Durban beachfront")), chunk("eXIf", text("GPS")), chunk("IDAT", [1, 2, 3]), chunk("IEND", []));
    const out = stripImageMetadata(png);
    for (const s of ["tEXt", "Durban", "eXIf"]) expect(has(out, s)).toBe(false);
    for (const s of ["IHDR", "IDAT", "IEND"]) expect(has(out, s)).toBe(true);
  });

  it("returns anything it can't read as it came", () => {
    const odd = bytes([0xff, 0xd8, 0x00, 0x01, 0x02]);
    expect(stripImageMetadata(odd)).toBe(odd);
  });
});
