// A MIME message (RFC 2045/2046/2047/5322) from an email's parts, as the bytes an SMTP server or Microsoft Graph's
// sendMail takes. Pure: no nodemailer, no streams, so it runs on Workers. Shape (parts left out when empty):
//   multipart/mixed { multipart/related { multipart/alternative { text/plain, text/html }, inline images (cid) }, attachments }
// Text goes quoted-printable, binaries base64, every line CRLF, headers kept as given (List-Unsubscribe and friends).

export type MimeAttachment = { filename: string; content: Uint8Array; /** inline (referenced as cid:… from the HTML) when set */ cid?: string; contentType?: string };
export type MimeMessage = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: MimeAttachment[];
  /** Message-ID and Date are taken from here (tests), else from the clock and a random id. */
  date?: Date;
  messageId?: string;
};

const CRLF = "\r\n";
const utf8 = (s: string) => new TextEncoder().encode(s);

/** A header value in UTF-8 "B" encoded words when it isn't plain ASCII (RFC 2047). */
export function encodeHeaderWord(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (utf8(chunk + ch).length > 45) (words.push(chunk), (chunk = ""));
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(utf8(w))}?=`).join(" ");
}

/** "Name <addr>" with the display name encoded when needed; a bare address stays as is. */
export function encodeAddress(a: string): string {
  const m = a.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!m) return a.trim();
  const name = m[1].replace(/^"|"$/g, "");
  if (!name) return m[2];
  const safe = /^[\x20-\x7e]*$/.test(name) ? (/[^\w .'-]/.test(name) ? `"${name.replace(/(["\\])/g, "\\$1")}"` : name) : encodeHeaderWord(name);
  return `${safe} <${m[2]}>`;
}

export function base64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Base64 in 76-column lines. */
export function base64Lines(b: Uint8Array): string {
  return base64(b).replace(/(.{76})/g, `$1${CRLF}`).replace(/\r\n$/, "");
}

/** Quoted-printable: 7-bit safe, soft breaks at 76 columns, trailing whitespace protected (RFC 2045 §6.7). */
export function quotedPrintable(s: string): string {
  const bytes = utf8(s.replace(/\r?\n/g, "\n"));
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    if (/[ \t]$/.test(line)) line = `${line.slice(0, -1)}=${line.charCodeAt(line.length - 1).toString(16).toUpperCase().padStart(2, "0")}`;
    lines.push(line);
    line = "";
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0a) {
      flush();
      continue;
    }
    const tok = (b >= 0x20 && b <= 0x7e && b !== 0x3d) || b === 0x09 ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
    if (line.length + tok.length > 75) (lines.push(`${line}=`), (line = ""));
    line += tok;
  }
  flush();
  return lines.join(CRLF);
}

const guessType = (filename: string) => {
  const ext = filename.toLowerCase().match(/\.(\w+)$/)?.[1];
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf", csv: "text/csv", txt: "text/plain", ics: "text/calendar", zip: "application/zip" }[ext ?? ""] ?? "application/octet-stream";
};
const quoteParam = (s: string) => `"${s.replace(/[^\x20-\x7e]/g, "_").replace(/(["\\])/g, "\\$1")}"`;

type Part = { headers: Record<string, string>; body: string };
const textPart = (type: string, text: string): Part => ({ headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Transfer-Encoding": "quoted-printable" }, body: quotedPrintable(text) });
const filePart = (a: MimeAttachment): Part => ({
  headers: {
    "Content-Type": `${a.contentType ?? guessType(a.filename)}; name=${quoteParam(a.filename)}`,
    "Content-Transfer-Encoding": "base64",
    "Content-Disposition": `${a.cid ? "inline" : "attachment"}; filename=${quoteParam(a.filename)}`,
    ...(a.cid ? { "Content-ID": `<${a.cid}>` } : {}),
  },
  body: base64Lines(a.content),
});

let counter = 0;
const boundary = (seed: string) => `----=_hh_${seed}_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const render = (p: Part) => `${Object.entries(p.headers).map(([k, v]) => `${k}: ${v}`).join(CRLF)}${CRLF}${CRLF}${p.body}`;
const multipart = (type: string, parts: Part[], seed: string): Part => {
  const b = boundary(seed);
  return { headers: { "Content-Type": `multipart/${type}; boundary="${b}"` }, body: `${parts.map((p) => `--${b}${CRLF}${render(p)}`).join(CRLF)}${CRLF}--${b}--` };
};

/** The whole message as text (CRLF line endings); `utf8()` it for the wire. */
export function buildMime(m: MimeMessage): string {
  for (const v of [m.from, m.subject, ...(Array.isArray(m.to) ? m.to : [m.to]), ...Object.values(m.headers ?? {})]) if (/[\r\n]/.test(v)) throw new Error("Header would break the message: line break in an address, subject or header");
  const date = m.date ?? new Date();
  const domain = m.from.match(/@([^>\s]+)/)?.[1] ?? "herbalholland.com";
  const messageId = m.messageId ?? `<${date.getTime().toString(36)}.${Math.random().toString(36).slice(2, 14)}@${domain}>`;

  const texts: Part[] = [];
  if (m.text != null) texts.push(textPart("text/plain", m.text));
  if (m.html != null) texts.push(textPart("text/html", m.html));
  let body: Part = texts.length === 1 ? texts[0] : texts.length ? multipart("alternative", texts, "alt") : textPart("text/plain", "");
  const inline = (m.attachments ?? []).filter((a) => a.cid);
  const attached = (m.attachments ?? []).filter((a) => !a.cid);
  if (inline.length) body = multipart("related", [body, ...inline.map(filePart)], "rel");
  if (attached.length) body = multipart("mixed", [body, ...attached.map(filePart)], "mix");

  const headers: Record<string, string> = {
    From: encodeAddress(m.from),
    To: (Array.isArray(m.to) ? m.to : [m.to]).map(encodeAddress).join(", "),
    Subject: encodeHeaderWord(m.subject),
    Date: date.toUTCString().replace(/GMT$/, "+0000"),
    "Message-ID": messageId,
    "MIME-Version": "1.0",
    ...m.headers,
    ...body.headers,
  };
  for (const [k, v] of Object.entries(headers)) if (/[\r\n]/.test(v) || /[\r\n:]/.test(k)) throw new Error(`Header ${k} would break the message`);
  return `${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join(CRLF)}${CRLF}${CRLF}${body.body}${CRLF}`;
}
