# Studio product renders in Blender (Cycles): every product modelled from simple parts at real size, its label or
# merch artwork mapped on, on a warm stone backdrop with soft studio light. Also one group shot per category.
#   npx tsx scripts/render/labels.tsx <products.json> <dir>        (labels + <dir>/products.json)
#   blender -b -P scripts/render/products.py -- <dir> <out> [slug|category:<slug> ...]
# Writes <out>/<slug>.jpg (1000 × 1000) and <out>/category-<slug>.jpg (1440 × 900); SCALE=2 doubles both, SMOKE=1 is a quick check.
import bpy, bmesh, json, math, os, sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
DIR, OUT, ONLY = ARGS[0], ARGS[1], ARGS[2:]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ACC = os.path.join(ROOT, "public/merch/print/accessories")
MERCH = os.path.join(ROOT, "public/merch/print")
SPECS = json.load(open(os.path.join(DIR, "products.json")))
os.makedirs(OUT, exist_ok=True)


def lin(hexs):
    h = hexs.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


SUNSET, INK, CREAM = "#f5913c", "#141110", "#f4ede4"

# ── Scene ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def reset(w, h):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1 if os.environ.get("SMOKE") else 48
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.cycles.max_bounces = 8
    sc.cycles.transmission_bounces = 8
    k = float(os.environ.get("SCALE", "1"))  # SCALE=2 for print-size renders (2000 × 2000)
    sc.render.resolution_x, sc.render.resolution_y = (w // 6, h // 6) if os.environ.get("SMOKE") else (int(w * k), int(h * k))
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 90
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = lin("#3b342e")
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
    # Backdrop: a floor curving up into a wall (a "cyc"), warm stone.
    bpy.ops.mesh.primitive_plane_add(size=1)
    cyc = bpy.context.object
    me = cyc.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.clear()
    pts = []
    for i in range(25):
        a = math.pi / 2 * i / 24
        pts.append((0, -3 + (0 if i == 0 else 0), 0))
    prof = [(-6, 0)]  # (y, z): floor from the front, curve, wall at the back
    for i in range(1, 25):
        a = math.pi / 2 * i / 24
        prof.append((2 - 2 * math.cos(a) + 0, 2 - 2 * math.cos(math.pi / 2 - a) if False else 2 * (1 - math.cos(a)) * 0 + (2 - 2 * math.sin(math.pi / 2 - a))))
    prof = [(-6, 0)] + [(2 * math.sin(math.pi / 2 * i / 24), 2 - 2 * math.cos(math.pi / 2 * i / 24)) for i in range(25)] + [(2, 6)]
    rows = []
    for x in (-8, 8):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for j in range(len(prof) - 1):
        bm.faces.new((rows[0][j], rows[1][j], rows[1][j + 1], rows[0][j + 1]))
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    cyc.data.materials.append(mat_simple("#bcae9e", 0.8))
    return sc


def light(name, loc, size, energy, color="#ffffff", rot=None):
    l = bpy.data.lights.new(name, "AREA")
    l.size = size
    l.energy = energy
    l.color = lin(color)[:3]
    o = bpy.data.objects.new(name, l)
    bpy.context.collection.objects.link(o)
    o.location = loc
    return o


def aim(o, target):
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def studio(objs, elev=22, azim=-28, margin=1.18, aspect=1.0):
    """Lights and a camera fitted to the objects' bounds, looking from the front-left and slightly above."""
    bpy.context.view_layer.update()  # moved objects' world matrices
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    r = max((hi - lo).length / 2, 0.02)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 70
    co = bpy.data.objects.new("cam", cam)
    bpy.context.collection.objects.link(co)
    bpy.context.scene.camera = co
    fov = 2 * math.atan(36 / 2 / cam.lens) if aspect >= 1 else 2 * math.atan(36 * aspect / 2 / cam.lens)
    dist = r * margin / math.sin(fov / 2) / (1 if aspect >= 1 else 1)
    if aspect > 1:  # wide group shots: fit the group's width and its apparent height, not a bounding sphere
        ext = hi - lo
        half_w = ext.x / 2 + ext.y * 0.25
        half_h = (ext.z * math.cos(math.radians(elev)) + ext.y * math.sin(math.radians(elev))) / 2
        tan_h = math.tan(fov / 2)
        dist = max(half_w * margin / tan_h, half_h * 1.5 / (tan_h / aspect)) + ext.y / 2
    e, a = math.radians(elev), math.radians(azim)
    co.location = c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    aim(co, c)
    s = r * 6
    key = light("key", c + Vector((-1.3, -1.4, 1.6)) * s, 1.6 * s, 120 * s * s, "#fff4e8")
    aim(key, c)
    fill = light("fill", c + Vector((1.6, -1.0, 0.7)) * s, 2.2 * s, 40 * s * s, "#eef2ff")
    aim(fill, c)
    rim = light("rim", c + Vector((0.6, 1.6, 1.4)) * s, 1.2 * s, 90 * s * s, "#ffd2a8")
    aim(rim, c)
    top = light("top", c + Vector((0, 0, 2.2)) * s, 2.0 * s, 30 * s * s)
    aim(top, c)


# ── Materials ────────────────────────────────────────────────────────────────────────────────────────────────────────
def _mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes["Principled BSDF"]


def mat_simple(color, rough=0.5, metal=0.0, coat=0.0, sheen=0.0):
    m, n, l, b = _mat("m")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
    return m


def mat_glass(color="#ffffff", rough=0.02, ior=1.48):
    m, n, l, b = _mat("glass")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["IOR"].default_value = ior
    b.inputs["Transmission Weight"].default_value = 1.0
    return m


def mat_fabric(color, bump=0.25):
    m, n, l, b = _mat("fabric")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = 0.92
    b.inputs["Sheen Weight"].default_value = 0.4
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 900
    bp = n.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    l.new(noise.outputs["Fac"], bp.inputs["Height"])
    l.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def _coords(n, l, kind, a, b, c, d):
    """UV from object coordinates: 'wrap' (around Z, front = -Y; a=z0, b=height, c=u span) or a planar projection
    ('front' x/z, 'top' x/y) over the box a..b (x) and c..d (y or z)."""
    tc = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    l.new(tc.outputs["Object"], sep.inputs[0])
    comb = n.new("ShaderNodeCombineXYZ")
    def math_(op, x, y=None, v=None):
        m = n.new("ShaderNodeMath")
        m.operation = op
        l.new(x, m.inputs[0]) if not isinstance(x, (int, float)) else setattr(m.inputs[0], "default_value", x)
        if y is not None:
            l.new(y, m.inputs[1]) if not isinstance(y, (int, float)) else setattr(m.inputs[1], "default_value", y)
        return m.outputs[0]
    if kind == "wrap":
        negy = math_("MULTIPLY", sep.outputs["Y"], -1)
        ang = math_("ARCTAN2", sep.outputs["X"], negy)
        u = math_("ADD", math_("DIVIDE", ang, 2 * math.pi * c), 0.5)
        v = math_("DIVIDE", math_("SUBTRACT", sep.outputs["Z"], a), b)
    else:
        second = sep.outputs["Z"] if kind == "front" else sep.outputs["Y"]
        u = math_("DIVIDE", math_("SUBTRACT", sep.outputs["X"], a), b - a)
        v = math_("DIVIDE", math_("SUBTRACT", second, c), d - c)
    l.new(u, comb.inputs["X"])
    l.new(v, comb.inputs["Y"])
    return comb.outputs[0]


def mat_print(base, image, kind, a, b, c=1.0, d=None, rough=0.45, metal=0.0, decal_rough=0.5, crop=None):
    """A base material with an image printed on it, mapped by _coords. Transparent parts of the image show the base."""
    m, n, l, bsdf = _mat("print")
    for k, v in base.items():
        bsdf.inputs[k].default_value = v
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = n.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image, check_existing=True)
    tex.extension = "CLIP"
    uv = _coords(n, l, kind, a, b, c, d)
    if crop:  # use only part of the image: (u0, v0, u1, v1)
        mp = n.new("ShaderNodeMapping")
        mp.inputs["Location"].default_value = (crop[0], crop[1], 0)
        mp.inputs["Scale"].default_value = (crop[2] - crop[0], crop[3] - crop[1], 1)
        l.new(uv, mp.inputs[0])
        uv = mp.outputs[0]
    l.new(uv, tex.inputs[0])
    deco = n.new("ShaderNodeBsdfPrincipled")
    deco.inputs["Roughness"].default_value = decal_rough
    l.new(tex.outputs["Color"], deco.inputs["Base Color"])
    mix = n.new("ShaderNodeMixShader")
    l.new(tex.outputs["Alpha"], mix.inputs[0])
    l.new(bsdf.outputs[0], mix.inputs[1])
    l.new(deco.outputs[0], mix.inputs[2])
    l.new(mix.outputs[0], n["Material Output"].inputs["Surface"])
    return m


# ── Parts ────────────────────────────────────────────────────────────────────────────────────────────────────────────
MADE = []


def obj(o, mat=None, smooth=True, bevel=0.0, segs=3):
    # Origin at the world origin, so object coordinates (used by the label mapping) are scene coordinates.
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    o.select_set(False)
    if mat:
        o.data.materials.append(mat)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    if bevel:
        m = o.modifiers.new("b", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "ANGLE"
    MADE.append(o)
    return o


def cyl(r, h, z=0.0, x=0.0, y=0.0, mat=None, bevel=0.0, verts=96, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=(x, y, z + h / 2))
    return obj(bpy.context.object, mat, bevel=bevel)


def box(w, d, h, x=0.0, y=0.0, z=0.0, mat=None, bevel=0.0, segs=3, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + h / 2))
    o = bpy.context.object
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    if rot:
        o.rotation_euler = rot
    return obj(o, mat, smooth=bevel > 0, bevel=bevel, segs=segs)


def sphere(r, x=0, y=0, z=0, mat=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, z), segments=64, ring_count=32)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return obj(o, mat)


def label_wrap(spec, r, z0, h, span=1.0):
    """The product's label round a cylinder of radius r, from z0, h tall."""
    ground = lin(spec["ground"])
    return cyl(r, h, z0, mat=mat_print({"Base Color": ground}, spec["label"], "wrap", z0, h, span, rough=0.55))


def label_front(spec, w, d, h, x=0, y=0, z=0, bevel=0.004, rough=0.55):
    ground = lin(spec["ground"])
    return box(w, d, h, x, y, z, mat=mat_print({"Base Color": ground}, spec["label"], "front", -w / 2 + x, w / 2 + x, z, z + h, rough=rough), bevel=bevel)


def acc(name):
    return os.path.join(ACC, name + ".png")


# ── Models ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def m_jar(s, x=0):
    cyl(0.034, 0.075, x=x, mat=mat_simple("#0d0b0a", 0.12, coat=1.0), bevel=0.004)
    label_wrap(s, 0.0346, 0.014, 0.05)
    cyl(0.0362, 0.02, 0.075, x=x, mat=mat_simple(INK, 0.35), bevel=0.003)


def m_minijar(s, x=0):
    cyl(0.022, 0.03, x=x, mat=mat_glass(), bevel=0.002)
    cyl(0.019, 0.016, 0.003, x=x, mat=mat_simple("#8a5a22", 0.35))
    label_wrap(s, 0.0225, 0.006, 0.018)
    cyl(0.0232, 0.012, 0.03, x=x, mat=mat_simple(INK, 0.35), bevel=0.002)


def m_tubes(s, x=0):
    n = 3 if s["slug"] != "windmill-haze-pre-roll" else 1
    for i in range(n):
        dx = (i - (n - 1) / 2) * 0.03
        cyl(0.011, 0.11, x=x + dx, mat=mat_simple(INK, 0.4), bevel=0.0015)
        label_wrap(s, 0.0113, 0.02, 0.07)
        cyl(0.0118, 0.022, 0.11, x=x + dx, mat=mat_simple("#0a0908", 0.3), bevel=0.0015)
    c = cyl(0.0055, 0.095, 0, mat=mat_simple("#ece2d2", 0.85), r2=0.0042)
    c.rotation_euler = (math.radians(90), 0, math.radians(70))
    c.location = (x + 0.02, -0.06, 0.0055)


def m_box(s, x=0, w=0.09, d=0.03, h=0.12):
    label_front(s, w, d, h, x=x, bevel=0.0015)


def m_pouch(s, x=0, w=0.12, d=0.05, h=0.18):
    label_front(s, w, d, h, x=x, bevel=0.012, rough=0.6)
    box(w * 0.98, d * 0.25, 0.012, x=x, z=h - 0.004, mat=mat_simple(s["ground"], 0.5), bevel=0.002)


def m_dropper(s, x=0):
    amber = mat_glass("#9b4f12", 0.04)
    cyl(0.016, 0.06, x=x, mat=amber, bevel=0.003)
    label_wrap(s, 0.0163, 0.008, 0.045)
    cyl(0.016, 0.01, 0.06, x=x, mat=amber, r2=0.008)
    cyl(0.0095, 0.012, 0.068, x=x, mat=mat_simple(INK, 0.3), bevel=0.001)
    sphere(0.008, x, 0, 0.089, mat_simple("#1d1a18", 0.6), (1, 1, 1.5))


def m_bottle(s, x=0):
    cyl(0.022, 0.07, x=x, mat=mat_simple(INK, 0.3), bevel=0.004)
    label_wrap(s, 0.0224, 0.01, 0.052)
    cyl(0.0175, 0.016, 0.07, x=x, mat=mat_simple("#0a0908", 0.45), bevel=0.0015)


def m_vapepen(s, x=0):
    m_box(s, x=x - 0.03, w=0.05, d=0.022, h=0.12)
    pen = cyl(0.0065, 0.11, mat=mat_simple(SUNSET if s["style"] != "cream" else INK, 0.3, metal=0.6), bevel=0.001)
    pen.rotation_euler = (math.radians(90), 0, math.radians(60))
    pen.location = (x + 0.04, -0.06, 0.0065)
    tip = cyl(0.0045, 0.018, mat=mat_simple(INK, 0.4), r2=0.003)
    tip.rotation_euler = pen.rotation_euler
    tip.location = (x + 0.04 + 0.064 * math.cos(math.radians(-30)), -0.06 + 0.064 * math.sin(math.radians(-30)), 0.0065)


def m_cartridge(s, x=0):
    m_box(s, x=x - 0.03, w=0.05, d=0.022, h=0.1)
    cyl(0.0055, 0.008, x=x + 0.035, y=-0.04, mat=mat_simple("#b8b2aa", 0.25, metal=1))
    cyl(0.0055, 0.045, 0.008, x=x + 0.035, y=-0.04, mat=mat_glass())
    cyl(0.0045, 0.03, 0.01, x=x + 0.035, y=-0.04, mat=mat_simple("#c07a1a", 0.15, coat=1))
    cyl(0.0058, 0.016, 0.053, x=x + 0.035, y=-0.04, mat=mat_simple(INK, 0.35), r2=0.004)


def m_tub(s, x=0):
    cyl(0.055, 0.13, x=x, mat=mat_simple(s["ground"], 0.4), bevel=0.004)
    label_wrap(s, 0.0553, 0.012, 0.11)
    cyl(0.057, 0.025, 0.13, x=x, mat=mat_simple(INK, 0.35), bevel=0.003)


def m_creamjar(s, x=0):
    cyl(0.032, 0.032, x=x, mat=mat_simple(s["ground"], 0.25, coat=0.6), bevel=0.003)
    label_wrap(s, 0.0323, 0.004, 0.024)
    cyl(0.0335, 0.014, 0.032, x=x, mat=mat_simple(SUNSET if s["style"] == "cream" else INK, 0.3, metal=0.3), bevel=0.002)


def m_creamtube(s, x=0):
    cyl(0.012, 0.016, x=x, mat=mat_simple(INK, 0.35), bevel=0.001)
    t = cyl(0.018, 0.11, 0.016, x=x, mat=None, bevel=0.003)
    t.data.materials.append(mat_print({"Base Color": lin(s["ground"])}, s["label"], "wrap", 0.03, 0.085, 1.0, rough=0.5))
    t.scale = (1, 0.72, 1)
    box(0.034, 0.006, 0.012, x=x, z=0.124, mat=mat_simple(s["ground"], 0.5), bevel=0.001)


def m_grinder(s, x=0):
    sunset = s["slug"] == "sunset-grinder"
    body = mat_simple(SUNSET if sunset else "#1a1716", 0.42 if sunset else 0.32, metal=0.55 if sunset else 1.0)
    for z, h in ((0, 0.012), (0.0125, 0.012), (0.025, 0.012)):
        cyl(0.0315, h - 0.0005, z, x=x, mat=body, bevel=0.0008)
    lidbase = {"Base Color": lin(SUNSET if sunset else "#1a1716")}
    lid = cyl(0.0315, 0.012, 0.0375, x=x, mat=mat_print(lidbase, acc("grinder-lid-sunset" if sunset else "grinder-lid"), "top", x - 0.0315, x + 0.0315, -0.0315, 0.0315, rough=0.42 if sunset else 0.3, metal=0.55 if sunset else 1.0, decal_rough=0.6 if sunset else 0.25), bevel=0.0012)


def m_ashtray(s, x=0):
    dish = cyl(0.07, 0.026, x=x, mat=mat_simple("#0e0c0b", 0.18, coat=1.0), bevel=0.004)
    cut = cyl(0.058, 0.03, 0.008, x=x)
    MADE.remove(cut)
    b = dish.modifiers.new("cut", "BOOLEAN")
    b.object = cut
    b.operation = "DIFFERENCE"
    dish.modifiers.move(1, 0)
    cut.hide_render = True
    cut.hide_viewport = True
    for k in range(4):
        a = math.pi / 2 * k
        n = box(0.016, 0.03, 0.02, x=x + math.cos(a) * 0.064, y=math.sin(a) * 0.064, z=0.016, rot=(0, 0, a + math.pi / 2))
        MADE.remove(n)
        n.hide_render = True
        bb = dish.modifiers.new(f"n{k}", "BOOLEAN")
        bb.object = n
        bb.operation = "DIFFERENCE"
    floor = cyl(0.057, 0.001, 0.0082, x=x, mat=mat_print({"Base Color": lin("#0e0c0b")}, acc("ashtray-centre"), "top", x - 0.025, x + 0.025, -0.025, 0.025, rough=0.18, decal_rough=0.3))


def m_booklet(s, x=0):
    sunset = s["slug"] == "sunset-papers"
    ground = SUNSET if sunset else INK
    art = acc("papers-sunset" if sunset else "papers-cover")
    for i in range(3):
        box(0.105, 0.044, 0.0006, x=x - 0.004 + i * 0.006, y=0.012 + i * 0.006, z=0.003, mat=mat_simple("#f7a463" if sunset else "#ebe0cf", 0.85), rot=(0, 0, math.radians(4 - i * 3)))
    box(0.11, 0.046, 0.005, x=x, mat=mat_print({"Base Color": lin(ground)}, art, "top", x - 0.055, x + 0.055, -0.023, 0.023, rough=0.6, crop=(0, 0.5, 1, 1)), bevel=0.0006)


def m_waterpipe(s, x=0):
    g = mat_glass("#cfe0ff", 0.02)
    cyl(0.05, 0.05, x=x, mat=g, r2=0.03, bevel=0.004)
    cyl(0.017, 0.22, 0.045, x=x, mat=g, bevel=0.002)
    cyl(0.017, 0.03, 0.265, x=x, mat=g, r2=0.024)
    band = cyl(0.0172, 0.12, 0.08, x=x, mat=mat_print({"Base Color": lin("#cfe0ff"), "Transmission Weight": 1.0}, s["label"], "wrap", 0.08, 0.12, 1.0, rough=0.05))
    stem = cyl(0.005, 0.08, mat=mat_glass(), bevel=0.001)
    stem.rotation_euler = (0, math.radians(45), 0)
    stem.location = (x + 0.045, 0, 0.06)


def m_spool(s, x=0):
    wood = mat_simple("#b07b47", 0.6)
    cyl(0.026, 0.004, x=x, mat=wood, bevel=0.001)
    cyl(0.026, 0.004, 0.036, x=x, mat=wood, bevel=0.001)
    core = cyl(0.02, 0.032, 0.004, x=x, mat=mat_fabric("#c9a66b", 0.6))
    label_wrap(s, 0.0205, 0.012, 0.016, span=0.5)


def m_vaporiser(s, x=0):
    box(0.034, 0.022, 0.1, x=x, mat=mat_print({"Base Color": lin("#2a2624")}, acc("tips-cover"), "front", x - 0.017, x + 0.017, 0.06, 0.077, rough=0.35, metal=0.4), bevel=0.006)
    box(0.012, 0.004, 0.02, x=x, y=-0.011, z=0.03, mat=mat_simple("#0a0908", 0.05, coat=1))


def m_tray(s, x=0):
    w, d = 0.18, 0.28
    t = box(w, d, 0.016, x=x, mat=mat_simple("#121010", 0.45, metal=0.3), bevel=0.006)
    inner = box(w - 0.016, d - 0.016, 0.02, x=x, z=0.004)
    MADE.remove(inner)
    inner.hide_render = True
    b = t.modifiers.new("in", "BOOLEAN")
    b.object = inner
    b.operation = "DIFFERENCE"
    t.modifiers.move(1, 0)
    box(w - 0.017, d - 0.017, 0.0008, x=x, z=0.004, mat=mat_print({"Base Color": lin("#121010"), "Metallic": 0.3}, acc("tray-large"), "top", x - w / 2, x + w / 2, -d / 2, d / 2, rough=0.4, decal_rough=0.45))


def m_softpouch(s, x=0):
    box(0.15, 0.035, 0.2, x=x, mat=mat_print({"Base Color": lin("#121010")}, acc("pouch-front"), "front", x - 0.075, x + 0.075, 0, 0.2, rough=0.85), bevel=0.012, segs=6)
    box(0.012, 0.006, 0.022, x=x + 0.06, y=-0.02, z=0.17, mat=mat_simple(SUNSET, 0.35), bevel=0.002)


def m_mylar(s, x=0):
    """Two stand-up mylar bags side by side, black and Sunset, the small or the large size by slug."""
    w, h = (0.07, 0.10) if s["slug"].endswith("small") else (0.10, 0.15)
    size = f"{round(w * 100)}x{round(h * 100)}"
    for i, (tone, base, seal) in enumerate((("black", "#121010", "#2a2421"), ("sunset", SUNSET, "#d9772c"))):
        bx = x + (i - 0.5) * (w + 0.015)
        # The print covers the front below the seal; the seal strip and the tear notch sit above it.
        bag = box(w, 0.016, h, x=bx, mat=mat_print({"Base Color": lin(base)}, acc(f"mylar-{size}-{tone}"), "front", bx - w / 2, bx + w / 2, 0, h * 0.88, rough=0.7), bevel=0.005, segs=5)
        bag.rotation_euler = (0, 0, math.radians(-5 + 10 * i))
        strip = box(w * 0.92, 0.0175, 0.003, x=bx, z=h * 0.93, mat=mat_simple(seal, 0.6), bevel=0.0008)
        strip.rotation_euler = bag.rotation_euler


def m_pen(s, x=0):
    """A 510 battery pen in matte black with the Sunset wrap, lying across the stage, a cartridge beside it."""
    yaw = math.radians(65)  # lying mostly left to right, angled a little towards the camera
    axis = (math.sin(yaw), -math.cos(yaw))  # a cylinder's +Z after rotating it (90°, 0, yaw): where its length runs
    base = (x - 0.045, 0.02)

    def along(part, off):
        part.rotation_euler = (math.radians(90), 0, yaw)
        part.location = (base[0] + axis[0] * off, base[1] + axis[1] * off, part.dimensions.x / 2 if False else 0.00525)

    along(cyl(0.00525, 0.085, mat=mat_print({"Base Color": lin("#121010")}, acc("pen-wrap"), "wrap", 0, 0.085, 1.0, rough=0.35, metal=0.1), bevel=0.0012), 0)
    along(cyl(0.0053, 0.004, mat=mat_simple(SUNSET, 0.3)), 0.085)
    along(cyl(0.004, 0.006, mat=mat_simple("#b8b2aa", 0.3, metal=1)), 0.089)
    along(cyl(0.0053, 0.0025, mat=mat_simple("#2a2421", 0.5)), -0.0025)
    cart = cyl(0.0053, 0.045, mat=mat_glass(), bevel=0.001)
    cart.rotation_euler = (math.radians(90), 0, yaw)
    cart.location = (base[0] + axis[0] * 0.02 - 0.012, base[1] + axis[1] * 0.02 - 0.03, 0.0053)
    tip = cyl(0.0045, 0.014, mat=mat_simple(INK, 0.4), r2=0.003)
    tip.rotation_euler = cart.rotation_euler
    tip.location = (cart.location.x + axis[0] * 0.045, cart.location.y + axis[1] * 0.045, 0.0053)


def m_uvjar(s, x=0):
    cyl(0.032, 0.085, x=x, mat=mat_glass("#3b2160", 0.03), bevel=0.004)
    cyl(0.0335, 0.022, 0.085, x=x, mat=mat_simple(INK, 0.35), bevel=0.002)
    sticker = cyl(0.0322, 0.05, 0.016, x=x, mat=mat_print({"Base Color": (0, 0, 0, 1), "Alpha": 0.0}, acc("jar-lid"), "wrap", 0.016, 0.05, 0.36, rough=0.5))
    sticker.data.materials[0].blend_method = "BLEND"


def m_conetube(s, x=0):
    cyl(0.013, 0.13, x=x, mat=mat_print({"Base Color": lin(INK)}, acc("cones-tube"), "wrap", 0.03, 0.06, 0.62, rough=0.45), bevel=0.0015)
    cyl(0.0135, 0.02, 0.13, x=x, mat=mat_simple("#0a0908", 0.35), bevel=0.0015)
    for i in range(2):
        c = cyl(0.0065, 0.1, 0, mat=mat_simple("#f7a463", 0.8), r2=0.0035)
        c.rotation_euler = (math.radians(90), 0, math.radians(55 + i * 22))
        c.location = (x + 0.035 + i * 0.012, -0.05 - i * 0.02, 0.0065)


def m_lighter(s, x=0):
    box(0.025, 0.013, 0.07, x=x, mat=mat_print({"Base Color": lin(SUNSET)}, acc("lighter-wrap"), "front", x - 0.0125, x + 0.0125, 0.004, 0.064, rough=0.3), bevel=0.003)
    box(0.024, 0.012, 0.012, x=x, z=0.07, mat=mat_simple("#c9c3bb", 0.25, metal=1), bevel=0.001)
    w = cyl(0.004, 0.008, mat=mat_simple("#8a847d", 0.4, metal=1))
    w.rotation_euler = (0, math.radians(90), 0)
    w.location = (x + 0.004 - 0.004, 0, 0.083)


def m_tips(s, x=0):
    box(0.06, 0.03, 0.006, x=x, mat=mat_print({"Base Color": lin(SUNSET)}, acc("tips-sunset"), "top", x - 0.03, x + 0.03, -0.015, 0.015, rough=0.6), bevel=0.0008)
    for i in range(3):
        box(0.02, 0.016, 0.0005, x=x + 0.045 + i * 0.004, y=-0.03 - i * 0.008, z=0.0003 + i * 0.0006, mat=mat_simple("#f3a465", 0.85), rot=(0, 0, math.radians(20 + i * 15)))


def m_giftbox(s, x=0):
    box(0.24, 0.17, 0.06, x=x, mat=mat_simple("#0e0c0b", 0.6), bevel=0.002)
    box(0.244, 0.174, 0.03, x=x, z=0.035, mat=mat_print({"Base Color": lin("#0e0c0b")}, acc("kit-lid"), "top", x - 0.122, x + 0.122, -0.087, 0.087, rough=0.55), bevel=0.002)


def m_seedpack(s, x=0):
    label_front(s, 0.07, 0.008, 0.1, x=x, bevel=0.002)


def m_ledpanel(s, x=0):
    p = box(0.3, 0.3, 0.035, x=x, mat=mat_simple("#2a2827", 0.4, metal=0.6), bevel=0.003)
    p.rotation_euler = (math.radians(70), 0, 0)
    p.location.z = 0.15
    for i in range(6):
        for j in range(6):
            d = sphere(0.004, x - 0.1 + i * 0.04, -0.012 - 0.1 * 0 , 0, mat_simple("#f6f1ea", 0.2))
            d.location = p.matrix_world @ Vector((-0.1 + i * 0.04, -0.1 + j * 0.04, -0.0175 + 0.0))
    label_front(s, 0.08, 0.004, 0.1, x=x + 0.2, bevel=0.001)


def m_tent(s, x=0):
    box(0.8, 0.8, 1.6, x=x, mat=mat_fabric("#151312", 0.4), bevel=0.02, segs=4)
    for zz in (0.2, 1.4):
        box(0.6, 0.004, 0.006, x=x, y=-0.401, z=zz, mat=mat_simple("#3a3532", 0.4))
    label_front(s, 0.24, 0.004, 0.3, x=x, y=-0.401, z=0.9, bevel=0.002)


def m_soilbag(s, x=0):
    m_pouch(s, x=x, w=0.34, d=0.12, h=0.5)


def m_nutrients(s, x=0):
    for i in range(3):
        dx = (i - 1) * 0.065
        cyl(0.028, 0.12, x=x + dx, mat=mat_simple(INK, 0.35), bevel=0.004)
        label_wrap(s, 0.0283, 0.018, 0.085)
        cyl(0.017, 0.022, 0.12, x=x + dx, mat=mat_simple(SUNSET, 0.4), bevel=0.002)


GARMENT = {
    "windmill-tee": ("#141211", "mark-stitch", 0.07),
    "heritage-crewneck": ("#141211", "heritage-stitch", 0.16),
    "sunset-hoodie": (SUNSET, "lockup-stitch", 0.11),
    "harrington-jacket": ("#141211", "mark-stitch", 0.06),
}


def m_folded(s, x=0):
    color, art, size = GARMENT[s["slug"]]
    w, d, h = 0.28, 0.32, 0.045
    img = os.path.join(MERCH, art + ".png")
    import_ = bpy.data.images.load(img, check_existing=True)
    aspect = import_.size[1] / max(import_.size[0], 1)
    cx, cy = x, 0.02
    m = mat_print({"Base Color": lin(color), "Sheen Weight": 0.4}, img, "top", cx - size / 2, cx + size / 2, cy - size * aspect / 2, cy + size * aspect / 2, rough=0.9, decal_rough=0.7)
    box(w, d, h, x=x, mat=m, bevel=0.014, segs=6)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.007, location=(x, 0.13, h - 0.003))
    t = bpy.context.object
    t.scale = (1, 0.6, 0.35)
    obj(t, mat_fabric(color))
    if s["slug"] == "sunset-hoodie":
        sphere(0.07, x, 0.16, h, mat_fabric(color), (1.4, 0.7, 0.35))
    if s["slug"] == "harrington-jacket":
        box(0.004, d * 0.9, 0.002, x=x, y=-0.01, z=h, mat=mat_simple("#b08a3c", 0.3, metal=1))


def m_cap(s, x=0):
    fab = mat_print({"Base Color": lin("#141211"), "Sheen Weight": 0.4}, os.path.join(MERCH, "mark-stitch.png"), "front", x - 0.025, x + 0.025, 0.035, 0.085, rough=0.9, decal_rough=0.6)
    sphere(0.095, x, 0, 0, fab, (1, 1.1, 0.75))
    brim = cyl(0.09, 0.006, mat=mat_fabric("#141211"))
    brim.scale = (1, 0.8, 1)
    brim.location = (x, -0.09, 0.002)
    cut = box(0.4, 0.4, 0.2, x=x, z=-0.2)
    MADE.remove(cut)
    cut.hide_render = True


def m_buckethat(s, x=0):
    fab = mat_print({"Base Color": lin("#141211"), "Sheen Weight": 0.4}, os.path.join(MERCH, "mark-stitch.png"), "front", x - 0.022, x + 0.022, 0.03, 0.074, rough=0.9, decal_rough=0.6)
    cyl(0.095, 0.075, 0.008, x=x, mat=fab, r2=0.08, bevel=0.01)
    cyl(0.15, 0.008, x=x, mat=mat_fabric("#141211"), r2=0.11, bevel=0.003)


def m_beanie(s, x=0):
    sphere(0.085, x, 0, 0.07, mat_fabric("#141211", 0.6), (1, 1, 1.25))
    cyl(0.088, 0.07, x=x, mat=mat_print({"Base Color": lin("#141211"), "Sheen Weight": 0.4}, os.path.join(MERCH, "mark-stitch-cuff.png"), "front", x - 0.02, x + 0.02, 0.015, 0.055, rough=0.9, decal_rough=0.6), bevel=0.01)


def m_tote(s, x=0):
    box(0.38, 0.02, 0.4, x=x, mat=mat_print({"Base Color": lin("#141211"), "Sheen Weight": 0.3}, os.path.join(MERCH, "tote-front.png"), "front", x - 0.13, x + 0.13, 0.12, 0.24, rough=0.92, decal_rough=0.7), bevel=0.006)
    for dx in (-0.08, 0.08):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.006, location=(x + dx * 0, 0, 0.4), rotation=(math.radians(90), 0, 0))
        t = bpy.context.object
        t.location = (x, -0.004 if dx < 0 else 0.004, 0.4)
        t.scale = (1, 1, 1.2)
        obj(t, mat_fabric("#141211"))


MODELS = {k[2:]: v for k, v in globals().items() if k.startswith("m_")}


def finish(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path, flush=True)


def product(s):
    MADE.clear()
    reset(1000, 1000)
    MODELS[s["model"]](s)
    elev = 55 if s["model"] in ("tray", "giftbox", "booklet", "tips", "ashtray", "folded") else 22
    studio(list(MADE), elev=elev)
    finish(os.path.join(OUT, s["slug"] + ".jpg"))


# The products each category's group shot shows (the first four of the category otherwise).
CAT_PICK = {
    "accessories": ["sunset-papers", "sunset-grinder", "starter-kit", "sunset-lighter"],
    "apparel": ["windmill-cap", "windmill-tee", "sunset-hoodie"],
    "grow": ["bloom-nutrient-kit", "heritage-seed-pack"],
    "wellness": ["cbd-softgels", "calm-cbd-oil-600", "rest-cbd-oil-300"],
    "flower": ["durban-poison", "swazi-gold", "reserve-gelato-cake"],
    "vapes": ["windmill-haze-cartridge", "durban-poison-disposable"],
}


def category(cat, items):
    MADE.clear()
    reset(1440, 900)
    by = {s["slug"]: s for s in items}
    pick = [by[k] for k in CAT_PICK.get(cat, []) if k in by] or items[:4]
    cursor = 0.0
    for i, s in enumerate(pick):  # side by side, left to right, with a gap
        before = len(MADE)
        MODELS[s["model"]](s)
        made = MADE[before:]
        pts = [o.matrix_world @ Vector(c) for o in made for c in o.bound_box]
        lo, hi = min(p.x for p in pts), max(p.x for p in pts)
        gap = max(hi - lo, 0.04) * 0.18
        for o in made:
            o.location.x += cursor - lo
            o.location.y += 0.02 * (i % 2)
        cursor += hi - lo + gap
    studio(list(MADE), elev=20, aspect=1.6, margin=0.95)
    finish(os.path.join(OUT, "category-" + cat + ".jpg"))


cats = {}
for s in SPECS:
    cats.setdefault(s["cat"], []).append(s)
for s in SPECS:
    if not ONLY or s["slug"] in ONLY:
        product(s)
for c, items in cats.items():
    if not ONLY or ("category:" + c) in ONLY:
        category(c, items)
