// Which IP addresses the server may fetch from when an address comes from a person (catalogue image URLs): public ones
// only — never loopback, private, link-local, carrier-grade NAT, multicast, documentation or reserved ranges, in IPv4,
// IPv6, or IPv4 carried inside IPv6.

function v4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((x) => x <= 255) ? o : null;
}

const publicV4 = ([a, b, c]: number[]) =>
  !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
  );

/** An IPv6 address as eight 16-bit groups (a trailing dotted IPv4 becomes the last two), or null. */
function v6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (tail) {
    const o = v4(tail[1]);
    if (!o) return null;
    s = `${s.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array(Math.max(0, 8 - head.length - rest.length)).fill("0"), ...rest] : head;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

export function isPublicIp(ip: string): boolean {
  const a = v4(ip);
  if (a) return publicV4(a);
  const g = v6(ip);
  if (!g) return false;
  const embedded = (hi: number, lo: number) => publicV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.slice(0, 7).every((x) => x === 0)) return false; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(g[6], g[7]); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return embedded(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) return false; // unique local, link-local, multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // discard-only
  return true;
}
