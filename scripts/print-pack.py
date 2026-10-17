# The print pack: every artwork as an outlined, cut-ready SVG (scripts/print-svg.py), sorted by what it's for, with a
# README per folder giving each file's size and how it's made. Run the artwork scripts first (merch-export,
# accessory-art, signage-art, shelf-art); they write the actual-size PDFs this reads.
#   python3 scripts/print-pack.py <out dir>      (then zip it)
import glob, json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from importlib import import_module

convert = import_module("print-svg").convert
OUT = sys.argv[1] if len(sys.argv) > 1 else "public/brand/print"

SIGN_GROUPS = [
    ("1-shopfront", ("fascia-", "blade-", "window-poster", "door-vinyl")),
    ("2-window-stickers", ("window-manifestation", "window-mark", "window-members", "window-town-")),
    ("3-in-store-signs", ("feature-mark", "counter-", "dispensary", "fitting-room")),
    ("4-shelves/bay-headers", ("bay-",)),
    ("5-wall-art", ("mural-", "print-")),
]


def specs(path):
    try:
        return {d["key"]: d for d in json.load(open(path))}
    except FileNotFoundError:
        return {}


def run(pdfs, folder, notes=None, title=""):
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    lines = [title, ""]
    for pdf in sorted(pdfs):
        key = os.path.basename(pdf)[:-4]
        w, h, n = convert(pdf, os.path.join(OUT, folder, key + ".svg"))
        d = (notes or {}).get(key)
        lines.append(f"{key}.svg  {w:.1f} × {h:.1f} mm, {n} colour{'s' if n != 1 else ''}" + (f"\n    {d['name']}\n    {d['how']}" if d else ""))
    open(os.path.join(OUT, folder, "README.txt"), "w").write("\n".join(lines) + "\n")
    print(f"{folder}: {len(pdfs)}", flush=True)


# Merch: the embroidery and print masters (logos as they go on the garments).
run(glob.glob("public/merch/print/*.pdf"), "6-merch", title="Merch: embroidery and print masters, actual size. Embroidery is digitised from these outlines; DTF and screen print use them as they are.")
acc = specs("public/merch/print/accessories/designs.json")
run([p for p in glob.glob("public/merch/print/accessories/*.pdf")], "7-accessories", acc, "Accessories: the artwork on each product, actual size.")
sig = specs("public/brand/signage/designs.json")
pdfs = glob.glob("public/brand/signage/*.pdf")
for folder, prefixes in SIGN_GROUPS:
    pick = [p for p in pdfs if os.path.basename(p).startswith(prefixes)]
    run(pick, folder, sig, f"{folder.split('-', 1)[1].replace('-', ' ').capitalize()}: actual size, every letter and line outlined.")
run(glob.glob("public/brand/shelf/*.pdf"), "4-shelves/labels", title="Shelf-edge labels (63.5 × 38.1 mm, Avery L7160 / Tower W221) per variant and A6 talkers per product, at the national suggested retail price. Stores print their own live prices from the back office (Labels); these are the masters and the blank templates.")
open(os.path.join(OUT, "README.txt"), "w").write(
    "Herbal Holland print files\n\nEvery file is an SVG at actual size in millimetres, with every letter and every line turned into filled outlines and\n"
    "merged into one shape per colour: no fonts, no strokes, nothing to install. Vinyl cutters, routers, embroidery digitisers\n"
    "and printers use them as they are. Dashed lines on printed items (the papers booklet) are fold lines.\n\n"
    "Colours: Sunset #F5913C (Pantone 1575 C), warm black #0C0A09, cream #FBF7F3. Wall art uses its own flat browns (in the file).\n\n"
    "1-shopfront        fascia (two sizes), blade sign, window poster, door vinyl\n"
    "2-window-stickers  glass manifestation band, window Mark, members-only notice, store names\n"
    "3-in-store-signs   feature-wall Mark, counter signs, dispensary, fitting room\n"
    "4-shelves          bay headers per category, shelf-edge labels and talkers\n"
    "5-wall-art         the Holland, meet the Hills mural and three framed prints\n"
    "6-merch            embroidery and print masters for the clothing\n"
    "7-accessories      the artwork on every accessory\n\n"
    "Each folder's README gives every file's size and how it is made and fitted.\n"
)
