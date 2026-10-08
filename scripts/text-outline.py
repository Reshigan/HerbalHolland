# Outfit lettering as vector outlines (SVG path data), for artwork that is cut rather than printed: sign letters, routed
# panels. Reads JSON lines from stdin: {"text", "weight", "size" (cap-to-baseline em size, in the artwork's units),
# "tracking" (em)}; writes one JSON line each: {"d", "width"}. The path's origin is the left end of the baseline.
#   echo '{"text":"HOLLAND","weight":800,"size":100,"tracking":0.06}' | python3 scripts/text-outline.py
import io, json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

SRC = "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"
base = open(SRC, "rb").read()
cache = {}

def font(weight):
    if weight not in cache:
        f = TTFont(io.BytesIO(base))
        cache[weight] = instantiateVariableFont(f, {"wght": weight})
    return cache[weight]

for line in sys.stdin:
    if not line.strip():
        continue
    q = json.loads(line)
    f = font(q["weight"])
    upm = f["head"].unitsPerEm
    k = q["size"] / upm
    glyphs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    x = 0.0
    chars = q["text"]
    for i, ch in enumerate(chars):
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        x += hmtx[name][0] * k
        if i < len(chars) - 1:
            x += q.get("tracking", 0) * q["size"]
    print(json.dumps({"d": pen.getCommands(), "width": round(x, 3)}), flush=True)
