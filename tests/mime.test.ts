// The MIME builder behind Microsoft Graph sendMail: headers kept, parts nested the standard way, text quoted-printable,
// binaries base64, non-ASCII headers encoded, and nothing a caller passes can smuggle a header in.
import { describe, expect, it } from "vitest";
import { buildMime, encodeAddress, encodeHeaderWord, quotedPrintable } from "@/lib/mime";

const base = { from: "Herbal Holland <invoices@herbalholland.com>", to: "thabo@example.co.za", subject: "Your invoice", date: new Date("2026-10-21T07:01:26Z"), messageId: "<fixed@herbalholland.com>" };

describe("buildMime", () => {
  it("nests alternative inside related inside mixed, with inline images by Content-ID and attachments base64", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const raw = buildMime({ ...base, text: "Hi Thabo", html: '<p>Hi <img src="cid:logo@hh"></p>', headers: { "List-Unsubscribe": "<https://shop.herbalholland.com/api/unsubscribe?t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, attachments: [{ filename: "logo.png", content: png, cid: "logo@hh" }, { filename: "Tax invoice 1.pdf", content: new Uint8Array(100), contentType: "application/pdf" }] });
    expect(raw).toMatch(/^From: Herbal Holland <invoices@herbalholland\.com>\r\nTo: thabo@example\.co\.za\r\nSubject: Your invoice\r\nDate: Wed, 21 Oct 2026 07:01:26 \+0000\r\nMessage-ID: <fixed@herbalholland\.com>\r\nMIME-Version: 1\.0\r\nList-Unsubscribe: <https:\/\/shop\.herbalholland\.com\/api\/unsubscribe\?t=x>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nContent-Type: multipart\/mixed; boundary="[^"]+"\r\n\r\n/);
    expect(raw).not.toMatch(/[^\r]\n/); // CRLF everywhere
    const order = ["multipart/mixed", "multipart/related", "multipart/alternative", "text/plain; charset=utf-8", "text/html; charset=utf-8", "image/png", "Content-ID: <logo@hh>", "application/pdf", 'filename="Tax invoice 1.pdf"'].map((s) => raw.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(raw).toContain("Content-Disposition: inline; filename=\"logo.png\"");
    expect(raw).toContain(`\r\n\r\n${Buffer.from(png).toString("base64")}\r\n`);
    expect(raw).toContain("Hi <img src=3D\"cid:logo@hh\"></p>");
    const boundaries = [...raw.matchAll(/boundary="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(boundaries).size).toBe(3);
    for (const b of boundaries) expect(raw).toContain(`\r\n--${b}--`);
  });

  it("keeps a single text part flat and a text+html pair as multipart/alternative", () => {
    expect(buildMime({ ...base, text: "Hi" })).toMatch(/MIME-Version: 1\.0\r\nContent-Type: text\/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHi\r\n$/);
    const both = buildMime({ ...base, text: "Hi", html: "<p>Hi</p>" });
    expect(both).toContain("Content-Type: multipart/alternative;");
    expect(both).not.toContain("multipart/related");
  });

  it("encodes non-ASCII subjects and names, and refuses header injection", () => {
    expect(encodeHeaderWord("Your invoice")).toBe("Your invoice");
    expect(encodeHeaderWord("Dankie, Thabo – R1 250")).toBe(`=?UTF-8?B?${Buffer.from("Dankie, Thabo – R1 250").toString("base64")}?=`);
    expect(encodeAddress("Herbal Holland <a@b.co.za>")).toBe("Herbal Holland <a@b.co.za>");
    expect(encodeAddress("Mokoena, Thabo <a@b.co.za>")).toBe('"Mokoena, Thabo" <a@b.co.za>');
    expect(encodeAddress("Café Holland <a@b.co.za>")).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b\.co\.za>$/);
    expect(encodeAddress("a@b.co.za")).toBe("a@b.co.za");
    expect(buildMime({ ...base, subject: "Thé facture", text: "x" })).toContain("Subject: =?UTF-8?B?");
    expect(() => buildMime({ ...base, subject: "x\r\nBcc: all@example.com", text: "x" })).toThrow(/Header/);
    expect(() => buildMime({ ...base, to: "a@b.co.za\nBcc: c@d.co.za", text: "x" })).toThrow(/Header/);
  });

  it("writes quoted-printable the way RFC 2045 asks", () => {
    expect(quotedPrintable("plain ascii = equals")).toBe("plain ascii =3D equals");
    expect(quotedPrintable("R1 250 – Thé")).toBe("R1 250 =E2=80=93 Th=C3=A9");
    expect(quotedPrintable("a \nb\t\n")).toBe("a=20\r\nb=09\r\n"); // trailing whitespace protected, newlines CRLF
    const long = quotedPrintable("x".repeat(200));
    for (const l of long.split("\r\n")) expect(l.length).toBeLessThanOrEqual(76);
    expect(long.replace(/=\r\n/g, "")).toBe("x".repeat(200)); // soft breaks only
    expect(quotedPrintable(`${"y".repeat(74)}é`).split("\r\n")[0].length).toBeLessThanOrEqual(76); // a multi-byte char never splits
  });
});
