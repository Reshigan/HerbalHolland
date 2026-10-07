// KwaZulu-Natal's rolling hills, drawn the same way everywhere: herbalholland.com's landscape and the Campaign Studio's
// cards. Seeded, so the art is the same on every build.
const r0 = (n: number) => Math.round(n);

export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Hills ────────────────────────────────────────────────────────────────────
// Rolling hill silhouettes in a 1600 × 1000 scene: overlapping rounded hills (a soft maximum of Gaussian bumps), the
// "Valley of a Thousand Hills" look.
function ridge(seed: number, base: number, [hMin, hMax]: [number, number], [wMin, wMax]: [number, number], count: number) {
  const rand = rng(seed);
  const x0 = -240;
  const x1 = 1840;
  const bumps = Array.from({ length: count }, (_, i) => ({ c: x0 + ((i + 0.15 + rand() * 0.7) * (x1 - x0)) / count, h: hMin + rand() * (hMax - hMin), w: wMin + rand() * (wMax - wMin) }));
  // Each hill is a rounded bump; where two meet, the valley between them.
  const y = (x: number) => base - Math.max(...bumps.map((b) => b.h * Math.exp(-(((x - b.c) / b.w) ** 2))));
  const pts: [number, number][] = [];
  for (let x = x0; x <= x1; x += 40) pts.push([x, y(x)]);
  let d = `M${x0} 1100L${pts[0][0]} ${r0(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${r0(p1[0] + (p2[0] - p0[0]) / 6)} ${r0(p1[1] + (p2[1] - p0[1]) / 6)} ${r0(p2[0] - (p3[0] - p1[0]) / 6)} ${r0(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${r0(p2[1])}`;
  }
  return `${d}L${x1} 1100Z`;
}

export const HILLS = {
  hl1: ridge(7, 706, [60, 125], [150, 250], 11), // far
  hl2: ridge(31, 786, [55, 120], [180, 300], 9), // mid
  hl3: ridge(58, 884, [40, 90], [230, 380], 7), // near
  hl4: ridge(94, 968, [16, 40], [300, 480], 5), // front
};
