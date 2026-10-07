// Photos people send us keep only the picture: a JPEG loses its EXIF (GPS position, camera, time, thumbnail), XMP,
// IPTC and comments (keeping just its orientation, so it still shows upright), and a PNG its text, EXIF and time
// chunks. A file that isn't laid out as expected is returned as it came (its type was already checked by its bytes).

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};

/** The EXIF orientation (1–8) in a JPEG APP1 segment, or null. */
function exifOrientation(seg: Uint8Array): number | null {
  const t = 10; // FF E1, the length, then "Exif\0\0"
  if (seg.length < t + 8 || String.fromCharCode(...seg.subarray(4, 10)) !== "Exif\0\0") return null;
  const le = seg[t] === 0x49; // "II": little-endian
  const u16 = (o: number) => (le ? seg[t + o] | (seg[t + o + 1] << 8) : (seg[t + o] << 8) | seg[t + o + 1]);
  const u32 = (o: number) => (le ? seg[t + o] | (seg[t + o + 1] << 8) | (seg[t + o + 2] << 16) | (seg[t + o + 3] << 24) : (seg[t + o] << 24) | (seg[t + o + 1] << 16) | (seg[t + o + 2] << 8) | seg[t + o + 3]) >>> 0;
  const ifd = u32(4);
  if (t + ifd + 2 > seg.length) return null;
  for (let k = 0, n = u16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (t + e + 12 > seg.length) return null;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** A minimal APP1 segment carrying only the orientation (big-endian TIFF, one IFD entry). */
const orientationSegment = (o: number) =>
  new Uint8Array([0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0]);

function stripJpeg(b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let orientation = 1;
  let i = 2;
  for (;;) {
    while (i < b.length && b[i] === 0xff && b[i + 1] === 0xff) i++; // fill bytes
    if (i + 4 > b.length || b[i] !== 0xff) return b;
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) {
      out.push(b.subarray(i)); // the image data (and the end), as it came
      break;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return b;
    const seg = b.subarray(i, i + 2 + len);
    if (marker === 0xe1) orientation = exifOrientation(seg) ?? orientation; // EXIF or XMP: dropped
    else if (marker !== 0xed && marker !== 0xfe) out.push(seg); // IPTC (APP13) and comments: dropped
    i += 2 + len;
  }
  if (orientation !== 1) out.splice(1, 0, orientationSegment(orientation));
  return concat(out);
}

const DROP_PNG = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);

function stripPng(b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (end > b.length) return b;
    if (!DROP_PNG.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(out);
}

export function stripImageMetadata(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return stripJpeg(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return stripPng(bytes);
  return bytes;
}
