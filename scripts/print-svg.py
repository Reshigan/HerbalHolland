# Print-ready SVG from an actual-size artwork PDF: every letter and every stroke turned into filled outlines, merged into
# one compound shape per colour (per layer, where colours stack), in millimetres. Nothing depends on a font or on stroke settings, so a vinyl cutter, a
# router, an embroidery digitiser or a screen printer gets exactly the shape we drew. Dashed strokes, if any reach the
# PDF as strokes, stay as thin lines in their own "guides" group, so they print but are never cut.
#   python3 scripts/print-svg.py <in.pdf> <out.svg> [<in.pdf> <out.svg> ...]
# Needs pdftocairo (poppler) and shapely.
import math, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET
from shapely.geometry import LineString, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import unary_union
from shapely import affinity

NS = {"svg": "http://www.w3.org/2000/svg", "xlink": "http://www.w3.org/1999/xlink"}
PT = 25.4 / 72  # pdftocairo writes points
STEP = 0.12 / PT  # curve flattening: a point every 0.12 mm
TOL = 0.006 / PT  # simplification tolerance: 6 µm


def parse_d(d):
    """Subpaths of an absolute M/L/C/Z path (what cairo writes), as (points, closed) with curves left as markers."""
    toks = re.findall(r"[MLCZHVmlczhv]|-?\d*\.?\d+(?:e-?\d+)?", d)
    subs, cur, closed, i, cmd = [], [], False, 0, None
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    subs.append((cur, True))
                cur = []
            continue
        nums = lambda n: [float(x) for x in toks[i:i + n]]
        if cmd == "M":
            if cur:
                subs.append((cur, False))
            cur = [("M", tuple(nums(2)))]
            i += 2
            cmd = "L"
        elif cmd == "L":
            cur.append(("L", tuple(nums(2))))
            i += 2
        elif cmd == "C":
            v = nums(6)
            cur.append(("C", ((v[0], v[1]), (v[2], v[3]), (v[4], v[5]))))
            i += 6
        else:
            raise ValueError(f"unexpected path command {cmd}")
    if cur:
        subs.append((cur, False))
    return [(s, c) for s, c in subs if len(s) > 0]


def matrix(t):
    if not t:
        return (1, 0, 0, 1, 0, 0)
    m = re.match(r"matrix\(([^)]*)\)", t)
    if m:
        return tuple(float(x) for x in re.split(r"[ ,]+", m.group(1).strip()))
    m = re.match(r"translate\(([^)]*)\)", t)
    if m:
        v = [float(x) for x in re.split(r"[ ,]+", m.group(1).strip())]
        return (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
    raise ValueError(f"unsupported transform {t}")


def mul(a, b):
    """a then b, as SVG matrices (b applied after a, i.e. b·a)."""
    a1, b1, c1, d1, e1, f1 = a
    a2, b2, c2, d2, e2, f2 = b
    return (a2 * a1 + c2 * b1, b2 * a1 + d2 * b1, a2 * c1 + c2 * d1, b2 * c1 + d2 * d1, a2 * e1 + c2 * f1 + e2, b2 * e1 + d2 * f1 + f2)


def apply(m, p):
    a, b, c, d, e, f = m
    return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)


def flatten(sub, m):
    """A subpath as a polyline in page coordinates (curves sampled every STEP)."""
    pts = []
    for kind, v in sub:
        if kind in "ML":
            pts.append(apply(m, v))
        else:
            p0 = pts[-1]
            p1, p2, p3 = (apply(m, q) for q in v)
            chord = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
            n = max(4, int(math.ceil(chord / STEP)))
            for k in range(1, n + 1):
                t = k / n
                u = 1 - t
                pts.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return pts


def fill_geom(d, m, evenodd=False):
    """A filled path as a polygon, by the nonzero rule (or even-odd when the artwork asks for it). Variable-font glyphs overlap their own strokes at heavy weights,
    so even-odd would punch holes where two strokes cross: rings that wind like the largest one add, the others (the
    counters) cut only from the rings that contain them."""
    rings = []
    for sub, _ in parse_d(d):
        pts = flatten(sub, m)
        if len(pts) < 3:
            continue
        area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) / 2
        poly = Polygon(pts).buffer(0)
        if not poly.is_empty and abs(area) > 1e-9:
            rings.append((area, poly))
    if not rings:
        return None
    if evenodd:
        g = None
        for _, p in rings:
            g = p if g is None else g.symmetric_difference(p)
        return g
    sign = math.copysign(1, max(rings, key=lambda r: abs(r[0]))[0])
    outers = [p for a, p in rings if math.copysign(1, a) == sign]
    holes = [p for a, p in rings if math.copysign(1, a) != sign]
    parts = []
    for o in outers:
        inner = [h for h in holes if o.buffer(1e-6).contains(h)]
        parts.append(o.difference(unary_union(inner)) if inner else o)
    return unary_union(parts)


CAP = {"butt": "flat", "round": "round", "square": "square"}
JOIN = {"miter": "mitre", "round": "round", "bevel": "bevel"}


def stroke_geom(el, d, m):
    w = float(el.get("stroke-width", "1")) * math.sqrt(abs(m[0] * m[3] - m[1] * m[2]))
    cap, join = CAP[el.get("stroke-linecap", "butt")], JOIN[el.get("stroke-linejoin", "miter")]
    limit = float(el.get("stroke-miterlimit", "4"))
    parts = []
    for sub, closed in parse_d(d):
        pts = flatten(sub, m)
        if len(pts) < 2:
            continue
        if closed and pts[0] != pts[-1]:
            pts = pts + [pts[0]]
        if closed:
            ring = Polygon(pts)
            # A closed stroke is the band between the outline grown and shrunk by half the width (joins all the way round).
            parts.append(ring.buffer(w / 2, join_style=join, mitre_limit=limit).difference(ring.buffer(-w / 2, join_style=join, mitre_limit=limit)))
        else:
            parts.append(LineString(pts).buffer(w / 2, cap_style=cap, join_style=join, mitre_limit=limit))
    return unary_union(parts) if parts else None


def colour(v):
    m = re.match(r"rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)", v or "")
    if not m:
        return v
    return "#" + "".join(f"{round(float(x) * 2.55):02x}" for x in m.groups())


def polys(g):
    if g is None or g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        return [p for x in g.geoms for p in polys(x)]
    return []


def path_d(g):
    out = []
    for p in polys(g.simplify(TOL)):
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append("M" + " L".join(f"{x * PT:.3f} {y * PT:.3f}" for x, y in c) + "Z")
    return "".join(out)


def convert(pdf, out):
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, "a.svg")
        subprocess.run(["pdftocairo", "-svg", "-f", "1", "-l", "1", pdf, raw], check=True)
        root = ET.parse(raw).getroot()
    W, H = float(root.get("width")), float(root.get("height"))
    defs = {el.get("id"): el for el in root.iter() if el.get("id")}
    runs, guides = [], []  # [colour, [shapes]] in drawing order; a colour change starts a new run (keeps layering)

    def add(col, g):
        if g is None or g.is_empty:
            return
        if not runs or runs[-1][0] != col:
            runs.append([col, []])
        runs[-1][1].append(g)

    def clip_of(ref):
        cp = defs[ref[5:-1]]
        return unary_union([fill_geom(p.get("d"), matrix(p.get("transform"))) for p in cp.iter("{%s}path" % NS["svg"])])

    def walk(el, m, fill, clip):
        tag = el.tag.split("}")[1]
        if tag in ("defs", "clipPath", "symbol"):
            return
        m = mul(matrix(el.get("transform")), m) if tag == "g" and el.get("transform") else m
        fill = el.get("fill", fill)
        if el.get("clip-path"):
            c = clip_of(el.get("clip-path"))
            clip = c if clip is None else clip.intersection(c)
        cut = (lambda g: g if clip is None or g is None else g.intersection(clip))
        if tag == "path":
            pm = mul(matrix(el.get("transform")), m)
            d = el.get("d")
            if el.get("stroke") and el.get("stroke") != "none":
                if el.get("stroke-dasharray"):
                    guides.append((el, pm))
                else:
                    add(colour(el.get("stroke")), cut(stroke_geom(el, d, pm)))
            if el.get("fill", fill) not in (None, "none"):
                add(colour(el.get("fill", fill)), cut(fill_geom(d, pm, el.get("fill-rule") == "evenodd")))
        elif tag == "use":
            ref = defs[el.get("{%s}href" % NS["xlink"])[1:]]
            um = mul((1, 0, 0, 1, float(el.get("x", 0)), float(el.get("y", 0))), m)
            for p in ref.iter("{%s}path" % NS["svg"]):
                add(colour(fill), cut(fill_geom(p.get("d"), mul(matrix(p.get("transform")), um))))
        for ch in el:
            walk(ch, m, fill, clip)

    for ch in root:
        walk(ch, (1, 0, 0, 1, 0, 0), None, None)
    wmm, hmm = W * PT, H * PT
    body = []
    for col, shapes in runs:
        body.append(f'<path fill="{col}" fill-rule="evenodd" d="{path_d(unary_union(shapes))}"/>')
    if guides:
        lines = []
        for el, pm in guides:
            for sub, closed in parse_d(el.get("d")):
                pts = flatten(sub, pm)
                lines.append("M" + " L".join(f"{x * PT:.3f} {y * PT:.3f}" for x, y in pts) + ("Z" if closed else ""))
            w = float(el.get("stroke-width", "1")) * math.sqrt(abs(pm[0] * pm[3] - pm[1] * pm[2])) * PT
            dash = " ".join(f"{float(x) * math.sqrt(abs(pm[0] * pm[3] - pm[1] * pm[2])) * PT:.2f}" for x in re.split(r"[ ,]+", el.get("stroke-dasharray").strip()))
            body.append(f'<g id="guides"><path fill="none" stroke="{colour(el.get("stroke"))}" stroke-width="{w:.3f}" stroke-dasharray="{dash}" d="{"".join(lines)}"/></g>')
            lines = []
    svg = (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="{wmm:.2f}mm" height="{hmm:.2f}mm" '
           f'viewBox="0 0 {wmm:.3f} {hmm:.3f}">\n' + "\n".join(body) + "\n</svg>\n")
    open(out, "w").write(svg)
    return wmm, hmm, len({c for c, _ in runs})


if __name__ == "__main__":
    a = sys.argv[1:]
    for pdf, out in zip(a[0::2], a[1::2]):
        w, h, n = convert(pdf, out)
        print(f"{out}: {w:.0f} × {h:.0f} mm, {n} colour{'s' if n != 1 else ''}", flush=True)
