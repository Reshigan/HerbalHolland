#!/usr/bin/env python3
# Usage: python3 scripts/owners-shirt-pattern.py public/merch/print
# Owners' shirt: a tone-on-tone jacquard of the windmill flower, half-drop repeat. Quiet from across a room, detailed up close.
import sys
OUT = sys.argv[1]
INK, TONE, RUST = "#0C0A09", "#2B2420", "#C05F18"
PETAL = "M5 0 C 11 -9.5, 23 -9.5, 29 -1.5 C 23 4.5, 13 6.5, 5 0 Z"
T, G = 120, 40  # repeat and grid, mm
def flower(x, y, rot, col, size=17):
    k = size / 58
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({k:.4f})" fill="none" stroke="{col}" stroke-width="{1.05/k:.2f}" stroke-linejoin="round">' +
            "".join(f'<path d="{PETAL}" transform="rotate({r})"/>' for r in (45, 135, 225, 315)) +
            f'<circle r="{1.3/k:.2f}" fill="{col}" stroke="none"/></g>')
cells = []
for i in range(3):
    for j in range(3):
        x = i * G + G / 2; y = j * G + G / 2 + (G / 2 if i % 2 else 0)
        cells.append((x, y % T, 0 if (i + j) % 2 else 22.5))
els = []
for n, (x, y, r) in enumerate(cells):
    col = TONE
    for dy in (-T, 0, T):
        if -G < y + dy < T + G: els.append(flower(x, y + dy, r, col))
# A pin dot between flowers, like a woven ground.
dots = "".join(f'<circle cx="{i*G}" cy="{j*G + (G/2 if (i//1)%2 else 0)}" r="0.7" fill="{TONE}"/>' for i in range(0, 4) for j in range(-1, 4))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {T} {T}" width="{T}mm" height="{T}mm">'
       f'<!-- Herbal Holland owners\' shirt: tone-on-tone jacquard, {T} mm half-drop repeat. Ground {INK}; figure {TONE};. -->'
       f'<rect width="{T}" height="{T}" fill="{INK}"/>{dots}{"".join(els)}</svg>')
open(f"{OUT}/owners-shirt-repeat.svg", "w").write(svg)
print("ok")
