#!/usr/bin/env python3
# The Harrington's Sunset-check lining: a tartan-style sett, 96 mm repeat (the owners' shirt jacquard is
# scripts/owners-shirt-pattern.py).
# Usage: python3 scripts/merch-patterns.py public/merch/print
import sys
OUT = sys.argv[1]
INK, SUN, RUST, CREAM = "#0C0A09", "#F5913C", "#C05F18", "#FBF7F3"
S = 96
stripes = [(0, 26, SUN), (26, 4, INK), (30, 2, CREAM), (32, 4, INK), (36, 12, RUST), (48, 26, SUN), (74, 6, INK), (80, 3, CREAM), (83, 13, INK)]
v = "".join(f'<rect x="{a}" y="0" width="{w}" height="{S}" fill="{c}" opacity="0.62"/>' for a, w, c in stripes)
h = "".join(f'<rect x="0" y="{a}" width="{S}" height="{w}" fill="{c}" opacity="0.62"/>' for a, w, c in stripes)
open(f"{OUT}/sunset-check-lining.svg", "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}mm" height="{S}mm">'
    f'<!-- Herbal Holland Sunset check: Harrington lining, {S} mm sett, woven or printed on cotton. -->'
    f'<rect width="{S}" height="{S}" fill="{INK}"/>{v}{h}</svg>')
