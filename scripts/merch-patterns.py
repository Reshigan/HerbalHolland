#!/usr/bin/env python3
# Usage: python3 scripts/merch-patterns.py public/merch/print
# The owners' shirt all-over print (a seamless 300 mm repeat) and the Harrington's Sunset-check lining.
import random, math, sys
OUT = sys.argv[1]
INK, SUN, SHADE, RUST, CREAM = "#0C0A09", "#F5913C", "#E27623", "#C05F18", "#FBF7F3"
PETAL = "M5 0 C 11 -9.5, 23 -9.5, 29 -1.5 C 23 4.5, 13 6.5, 5 0 Z"
T = 300  # tile, mm

def mark(x, y, s, rot, col, heavy=True):
    lw = 7.5 if heavy else 5.5
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f}) scale({s/100:.3f}) translate(-50 -50)" fill="none" stroke="{col}" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="M 36.2 82.6 A 40 40 0 1 1 63.8 82.6" stroke-width="{lw}"/><path d="M 33 91 L 50 44.5 L 67 91" stroke-width="{lw}"/>'
            f'<g transform="translate(50 40)">' + "".join(f'<path d="{PETAL}" transform="rotate({r-90})" stroke-width="5.2"/>' for r in (45,135,225,315)) +
            f'<circle r="4.6" fill="{col}" stroke="none"/></g></g>')

def flower(x, y, s, rot, fill, edge):
    # The windmill flower on its own, filled: the print's "blooms".
    k = s / 60
    return (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.0f}) scale({k:.3f})">' +
            "".join(f'<path d="{PETAL}" transform="rotate({r}) scale(1.9)" fill="{fill}" stroke="{edge}" stroke-width="1.6"/>' for r in (0,90,180,270)) +
            f'<circle r="7" fill="{edge}"/><circle r="3" fill="{fill}"/></g>')

def sun(x, y, r, col):
    # A setting sun in retro bands, cut by the horizon.
    parts = [f'<clipPath id="c{int(x)}{int(y)}"><rect x="{x-r}" y="{y-r}" width="{2*r}" height="{r}"/></clipPath><g clip-path="url(#c{int(x)}{int(y)})">']
    yy, i = y - r, 0
    while yy < y:
        h = r * (0.22 - i * 0.035); gap = r * (0.02 + i * 0.03)
        parts.append(f'<rect x="{x-r}" y="{yy:.1f}" width="{2*r}" height="{max(h, r*0.05):.1f}" fill="{col}" clip-path="url(#s{int(x)}{int(y)})"/>')
        yy += max(h, r*0.05) + gap; i += 1
    parts.append('</g>')
    return f'<clipPath id="s{int(x)}{int(y)}"><circle cx="{x}" cy="{y}" r="{r}"/></clipPath>' + "".join(parts)

def hills(y, amp, col, phase):
    pts = " ".join(f"L{xx} {y - amp*(0.55+0.45*math.sin(xx/300*2*math.pi*2+phase))*(0.7+0.3*math.sin(xx/300*2*math.pi*3+phase*2)):.1f}" for xx in range(0, T+1, 5))
    return f'<path d="M0 {y+60} {pts} L{T} {y+60} Z" fill="{col}"/>'

random.seed(1652)  # the year Van Riebeeck's windmill-and-garden Cape began; any fixed seed keeps the tile stable
els = []
# Bands of rolling hills under setting suns.
els += [sun(70, 118, 46, SUN), sun(230, 268, 38, SHADE)]
els += [hills(122, 18, RUST, 0.3), hills(272, 14, RUST, 1.7)]
# Blooms: big Sunset and cream windmill flowers, the shirt's "hibiscus".
blooms = [(180, 60, 74, SUN, INK), (38, 222, 66, CREAM, INK), (262, 150, 58, SUN, INK), (128, 196, 46, SHADE, INK), (300 - 6, 300 - 20, 40, CREAM, INK)]
for x, y, s, f, e in blooms: els.append(("F", x, y, s, random.uniform(0, 90), f, e))
# Windmill marks tumbling across, at all angles.
for x, y, s, r, c in [(112, 40, 38, -18, CREAM), (240, 228, 44, 22, SUN), (24, 72, 30, 35, SUN), (160, 290, 34, -40, CREAM), (290, 98, 26, 60, CREAM), (82, 268, 24, -8, SUN)]:
    els.append(("M", x, y, s, r, c, None))
# Confetti petals.
for _ in range(26):
    els.append(("P", random.uniform(0, T), random.uniform(0, T), random.uniform(7, 13), random.uniform(0, 360), random.choice([SUN, CREAM, SHADE]), None))

def draw(e, dx=0, dy=0):
    if isinstance(e, str): return e
    k, x, y, s, r, c, e2 = e
    x += dx; y += dy
    if k == "F": return flower(x, y, s, r, c, e2)
    if k == "M": return mark(x, y, s, r, c)
    return f'<path d="{PETAL}" transform="translate({x:.1f} {y:.1f}) rotate({r:.0f}) scale({s/12:.2f})" fill="{c}"/>'

body = []
for e in els:
    if isinstance(e, str): body.append(e); continue
    # Wrap anything near an edge so the repeat is seamless.
    reach = e[3] * 0.9
    for dx in (-T, 0, T):
        for dy in (-T, 0, T):
            x, y = e[1] + dx, e[2] + dy
            if -reach < x < T + reach and -reach < y < T + reach: body.append(draw(e, dx, dy))
tile = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {T} {T}" width="{T}mm" height="{T}mm">'
        f'<!-- Herbal Holland owners\' shirt: seamless {T} mm repeat. Ground {INK}; Sunset {SUN}; shade {SHADE}; rust {RUST}; cream {CREAM}. -->'
        f'<rect width="{T}" height="{T}" fill="{INK}"/><g>{"".join(body)}</g></svg>')
open(f"{OUT}/owners-shirt-repeat.svg", "w").write(tile)

# Sunset check: a tartan-style sett for the Harrington lining, 96 mm repeat.
S = 96
stripes = [(0, 26, SUN, 1), (26, 4, INK, 1), (30, 2, CREAM, 1), (32, 4, INK, 1), (36, 12, RUST, 1), (48, 26, SUN, 1), (74, 6, INK, 1), (80, 3, CREAM, 1), (83, 13, INK, 1)]
v = "".join(f'<rect x="{a}" y="0" width="{w}" height="{S}" fill="{c}" opacity="0.62"/>' for a, w, c, _ in stripes)
h = "".join(f'<rect x="0" y="{a}" width="{S}" height="{w}" fill="{c}" opacity="0.62"/>' for a, w, c, _ in stripes)
check = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}mm" height="{S}mm">'
         f'<!-- Herbal Holland Sunset check: Harrington lining, {S} mm sett, woven or printed on cotton. -->'
         f'<rect width="{S}" height="{S}" fill="{INK}"/>{v}{h}</svg>')
open(f"{OUT}/sunset-check-lining.svg", "w").write(check)
print("ok")
