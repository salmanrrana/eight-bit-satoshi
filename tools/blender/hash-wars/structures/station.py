"""station.glb: the pieces of a Keeper hash station (a geothermal wellhead).

Blender space: metres, Z up, the piece's front faces -Y (glTF +Z).
"""
import math
from mathutils import Vector
from architecture import engraving
from kit import Part, fine, hazard, bolt_row, railing, ladder, cable_tray, fins, PAINT


def chamfer_rect(w, d, c):
    hw, hd = w / 2, d / 2
    return [(hw - c, -hd), (hw, -hd + c), (hw, hd - c), (hw - c, hd),
            (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c), (-hw + c, -hd)]


def ring(outline, z, s=1.0):
    return [Vector((x * s, y * s, z)) for x, y in outline]


# ------------------------------------------------------------------ spire

SPIRE_H = 31.2  # main body / plume anchor; warning mast reaches 32.74 m
SHAFT = (4.0, 28.0)  # shaft from collar top to crown
W0, W1 = 3.6, 2.5    # shaft width at bottom and top


def shaft_w(z):
    t = (z - SHAFT[0]) / (SHAFT[1] - SHAFT[0])
    return W0 + (W1 - W0) * t


def spire():
    """31 m body: concrete plinth/collar and a dark tapering shaft of segmented
    stone cladding over a graphite core, four graphite ribs carrying
    the emit:team light line, a balcony at 13 m and a louvred
    steam crown with a light band. Empty `spire_steam` marks the plume."""
    p = Part("spire")
    # Plinth with steps on the front.
    p.box((7.0, 7.0, 1.0), at=(0, 0, 0.5), mat="surf:concrete", bevel=0.08, seg=1, taper=(0.97, 0.97))
    p.box((2.6, 0.4, 0.33), at=(0, -3.7 - 0.2, 0.165), mat="surf:concrete", bevel=0.03, seg=1)
    p.box((2.6, 0.4, 0.66), at=(0, -3.5 - 0.2, 0.33), mat="surf:concrete", bevel=0.03, seg=1)
    for y, z in ((-4.09, 0.33), (-3.69, 0.66)):
        p.box((2.6, 0.06, 0.012), at=(0, y, z + 0.006), paint="orange", bevel=0.0)
    for x in (-3.0, 3.0):
        hazard(p, (x, -3.47, 0.55), 0.9, 0.5, "-Y")
    # Collar: two concrete courses over a recessed joint.
    p.box((4.7, 4.7, 3.0), at=(0, 0, 2.5), mat="surf:concrete", paint="iron", bevel=0.0)
    p.box((4.8, 4.8, 1.45), at=(0, 0, 1.0 + 0.725), paint="ivory", bevel=0.08, seg=1)
    p.box((4.8, 4.8, 1.45), at=(0, 0, 2.55 + 0.725), paint="bone", bevel=0.08, seg=1)
    # Block height, raised graphite numerals, and a small line under them.
    p.text("6 929 999", 0.62, at=(0, -2.4, 3.2), depth=0.015, paint="graphite")
    p.text("LAST BLOCK  ·  KEEPER HASH STATION", 0.13, at=(0, -2.4, 2.78), depth=0.006, paint="graphite")
    for x in (-1.9,1.9):
        p.box((.025,.012,2.72),at=(x,-2.405,2.5),paint='iron',bevel=0)
        bolt_row(p,(x,-2.42,1.25),(x,-2.42,3.7),5,r=.018)
    # Door on the +X side of the collar.
    p.box((0.05, 1.3, 2.35), at=(2.42, 0.6, 1.0 + 1.18), paint="graphite", bevel=0.015)
    p.box((0.05, 1.0, 2.1), at=(2.45, 0.6, 1.0 + 1.06), paint="iron", bevel=0.01)
    if fine():
        p.box((0.06, 0.04, 0.3), at=(2.49, 0.25, 2.1), mat="surf:galvanized", paint="white", bevel=0.008)
        hazard(p, (2.455, 0.6, 3.25), 1.3, 0.14, "+X", stripe=0.09)
        bolt_row(p, (2.45, 0.02, 1.15), (2.45, 0.02, 3.2), 6, "+X", r=0.016)
        bolt_row(p, (2.45, 1.18, 1.15), (2.45, 1.18, 3.2), 6, "+X", r=0.016)
    # Graphite core shows through 12 cm joints between bone-white ceramic
    # cladding: two panels per face per course, either side of the rib.
    core = chamfer_rect(1, 1, 0.16)
    p.loft([ring(core, SHAFT[0], W0 - 0.12), ring(core, SHAFT[1], W1 - 0.12)], paint="graphite", caps=(False, False))
    import random
    rng = random.Random(2140)
    segs = 8
    for i in range(segs):
        z0 = SHAFT[0] + (SHAFT[1] - SHAFT[0]) * i / segs + 0.06
        z1 = SHAFT[0] + (SHAFT[1] - SHAFT[0]) * (i + 1) / segs - 0.06
        for side in ("-Y", "+X", "+Y", "-X"):
            rot = {"-Y": 0, "+X": 90, "+Y": 180, "-X": 270}[side]
            rib = 0.38
            for sgn in (-1, 1):
                # Heat staining climbs the top courses; a few repaired panels.
                paint = "warm" if i >= segs - 2 else rng.choice(("bone", "bone", "bone", "ivory"))
                _panel(p, rot, sgn, rib, z0, z1, paint)
        # Course joint: a graphite band proud of the core, below the panels.
        if fine() and i:
            zj = z0 - 0.06
            w = shaft_w(zj) - 0.04
            p.loft([ring(core, zj - 0.035, w), ring(core, zj + 0.035, w)], paint="dark", bevel=0.0)
    # Block numerals engraved up the front, left of the light line.
    for k, digit in enumerate("2140"):
        z = SHAFT[0] + 3.0 * (k + 2) + 1.5
        y = -(shaft_w(z) / 2 - 0.06 + 0.14) - 0.004
        p.text(digit, 1.45, at=(-(0.38 + shaft_w(z) / 2 - 0.18) / 2, y, z), rot=(90 + 1.3, 0, 0), depth=0.012, paint="graphite", font="sans")
    if fine():
        for z in (SHAFT[0] + 1.2, SHAFT[0] + 13.0, SHAFT[0] + 22.6):
            y = -(shaft_w(z) / 2 + 0.08 + 0.004)
            p.text("K-" + str(int(z * 100)), 0.11, at=((0.38 + shaft_w(z) / 2 - 0.18) / 2, -(shaft_w(z) / 2 + 0.084), z), rot=(91.3, 0, 0), paint="graphite")
    # All four faces show the relight, including the face seen from the pylon.
    for k, side in enumerate(("-Y", "+X", "+Y", "-X")):
        rot = {"-Y": 0, "+X": 90, "+Y": 180, "-X": 270}[side]
        _rib(p, rot, True)
    # Balcony at 13 m.
    _balcony(p, 13.0)
    # Ladders: plinth to collar top, collar top to balcony (+X face, toward the back).
    ladder(p, (2.62, 1.75, 1.0), 4.0, facing="+X")
    zb = 13.0
    xw = shaft_w(4.0) / 2 + 0.32
    ladder(p, (xw + 0.12, 1.1, 4.0), zb + 0.05, facing="+X")
    for z in (5.0, 8.0, 11.0):
        x = shaft_w(z) / 2
        for s in (-1, 1):
            p.box((xw + 0.12 - x, 0.05, 0.05), at=((x + xw + 0.12) / 2, 1.1 + s * 0.23, z), mat="surf:galvanized", bevel=0.0, step=2)
    # Conduits up the back face.
    if fine():
        for dx in (-0.75, -0.6):
            pts = [Vector((dx, shaft_w(z) / 2 + 0.09, z)) for z in (4.0, 12.9)]
            p.pipe(pts, 0.05, mat="tex:keeper", paint="graphite", n=10)
        cable_tray(p, (-0.95, 2.42, 0.95), (-0.95, 2.42, 0.95), w=0.3) if False else None
    # Crown.
    _crown(p, SHAFT[1])
    # Service pipe out of the back of the plinth, flanged to meet a pipe run.
    p.pipe([(1.6, 3.4, 0.55), (1.6, 4.6, 0.55)], 0.32, mat="surf:galvanized", caps=(False, True))
    p.cyl(0.42, 0.08, at=(1.6, 4.5, 0.55), rot=(-90, 0, 0), mat="surf:galvanized", bevel=0.01)
    p.cyl(0.42, 0.08, at=(1.6, 3.48, 0.55), rot=(-90, 0, 0), mat="surf:galvanized", bevel=0.01)
    if fine():
        for k in range(10):
            a = 2 * math.pi * k / 10
            p.cyl(0.022, 0.05, at=(1.6 + math.cos(a) * 0.37, 4.56, 0.55 + math.sin(a) * 0.37), rot=(-90, 0, 0), n=6, mat="surf:galvanized", step=1)
    p.empty("spire_steam", (0, 0, SPIRE_H))
    p.empty("spire_balcony", (0, -2.3, 13.08))
    p.solid_box((-3.5, -3.5, 0), (3.5, 3.5, 1.0))
    p.solid_box((-1.3, -4.3, 0), (1.3, -3.5, 0.33))
    p.solid_box((-1.3, -3.9, 0), (1.3, -3.5, 0.66))
    p.solid_box((-2.4, -2.4, 1.0), (2.4, 2.4, 4.0))
    p.solid_box((-2.1, -2.1, 4.0), (2.1, 2.1, SPIRE_H))
    return p


def _rib(p, rot, lit):
    """A graphite rib on one face of the shaft, following its taper. `rot` turns
    the -Y version to the other faces."""
    from mathutils import Matrix
    R = Matrix.Rotation(math.radians(rot), 4, "Z")
    z0, z1 = SHAFT[0], SHAFT[1] + 0.2

    def slab(x0, x1, out0, out1, paint, mat="tex:keeper", bevel=0.02):
        rings = []
        for z in (z0, z1):
            h = shaft_w(min(z, SHAFT[1])) / 2 - 0.08
            pts = [(x0, -(h + out0)), (x1, -(h + out0)), (x1, -(h + out1)), (x0, -(h + out1))]
            # counter-clockwise seen from above: reorder
            pts = [(x0, -(h + out1)), (x1, -(h + out1)), (x1, -(h + out0)), (x0, -(h + out0))]
            rings.append([R @ Vector((x, y, z)) for x, y in pts])
        p.loft(rings, mat=mat, paint=paint, bevel=bevel)

    if lit:
        # Graphite lips stand 6 cm proud of the cladding; the light sits in
        # the dark channel between them, recessed below the panel face.
        slab(-0.36, -0.14, 0.0, 0.21, "graphite")
        slab(0.14, 0.36, 0.0, 0.21, "graphite")
        slab(-0.14, 0.14, 0.0, 0.08, "dark", bevel=0.0)
        slab(-0.07, 0.07, 0.08, 0.115, "white", mat="emit:team", bevel=0.0)
    else:
        slab(-0.28, 0.28, 0.0, 0.2, "graphite")
        slab(-0.06, 0.06, 0.2, 0.215, "orange", bevel=0.0)


def _panel(p, rot, sgn, rib, z0, z1, paint):
    """One tapered ceramic cladding panel on a face of the shaft, from the rib
    edge to just short of the chamfered corner (graphite shows at both)."""
    from mathutils import Matrix
    R = Matrix.Rotation(math.radians(rot), 4, "Z")
    rings = []
    for z in (z0, z1):
        h = shaft_w(z) / 2 - 0.06
        a, b = sgn * rib, sgn * (h - 0.12)
        x0, x1 = min(a, b), max(a, b)
        pts = [(x0, -(h + 0.14)), (x1, -(h + 0.14)), (x1, -h), (x0, -h)]
        rings.append([R @ Vector((x, y, z)) for x, y in pts])
    p.loft(rings, mat="tex:keeper", paint=paint, bevel=0.035 if fine() else 0.0)


def _balcony(p, z):
    hs = shaft_w(z) / 2 + 0.34
    ho = hs + 1.25
    t = 0.08
    for (x0, x1, y0, y1) in ((-ho, ho, -ho, -hs), (-ho, ho, hs, ho), (hs, ho, -hs, hs), (-ho, -hs, -hs, hs)):
        p.box((x1 - x0, y1 - y0, t), at=((x0 + x1) / 2, (y0 + y1) / 2, z - t / 2), mat="surf:galvanized", bevel=0.0)
        p.solid_box((x0,y0,z-t),(x1,y1,z))
    # Edge beams and brackets.
    for s in (-1, 1):
        p.box((2 * ho, 0.14, 0.22), at=(0, s * (ho - 0.07), z - 0.19), paint="graphite", bevel=0.015)
        p.box((0.14, 2 * ho, 0.22), at=(s * (ho - 0.07), 0, z - 0.19), paint="graphite", bevel=0.015)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for a, b in (((sx * hs, sy * hs * 0.5), (sx * ho * 0.95, sy * hs * 0.5)), ((sx * hs * 0.5, sy * hs), (sx * hs * 0.5, sy * ho * 0.95))):
                q0 = Vector((a[0], a[1], z - 1.4))
                q1 = Vector((b[0], b[1], z - 0.3))
                if fine() or True:
                    p.pipe([q0, q1], 0.06, mat="tex:keeper", paint="graphite", n=8)
    # Rail all round, gap where the ladder arrives (+X side, y about 1.1).
    zr = z
    gap = (0.75, 1.45)
    railing(p, (-ho + 0.05, -ho + 0.05, zr), (ho - 0.05, -ho + 0.05, zr))
    railing(p, (ho - 0.05, ho - 0.05, zr), (-ho + 0.05, ho - 0.05, zr))
    railing(p, (-ho + 0.05, ho - 0.05, zr), (-ho + 0.05, -ho + 0.05, zr))
    railing(p, (ho - 0.05, -ho + 0.05, zr), (ho - 0.05, gap[0], zr))
    railing(p, (ho - 0.05, gap[1], zr), (ho - 0.05, ho - 0.05, zr))
    # Two lamps under the balcony light the shaft at night; here just fittings.
    if fine():
        for s in (-1, 1):
            p.box((0.3, 0.18, 0.12), at=(s * 1.2, -ho + 0.2, z - 0.36), paint="graphite", bevel=0.02)
            p.box((0.24, 0.02, 0.07), at=(s * 1.2, -ho + 0.105, z - 0.37), mat="emit:lamp", paint="white", bevel=0.0)


def _crown(p, z):
    w = W1 + 0.9
    p.box((w, w, 0.45), at=(0, 0, z + 0.225), paint="graphite", bevel=0.05, seg=1)
    # Corner posts and louvres.
    hp = w / 2 - 0.25
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.5, 0.5, 2.0), at=(sx * hp, sy * hp, z + 0.45 + 1.0), paint="bone", bevel=0.05)
    inner = 2 * hp - 0.5
    n = 8 if fine() else 4
    for i in range(n):
        zz = z + 0.6 + (i + 0.5) * (1.7 / n)
        for side in range(4):
            ang = side * 90
            R = __import__("mathutils").Matrix.Rotation(math.radians(ang), 4, "Z")
            at = R @ Vector((0, -(hp + 0.05), zz))
            p.box((inner, 0.24, 0.03), at=at, rot=(-35, 0, ang), paint="graphite", bevel=0.0, step=2)
    p.box((inner + 0.02, inner + 0.02, 1.8), at=(0, 0, z + 0.45 + 0.9), paint="dark", bevel=0.0)
    # Light band under the cap, visible from every side.
    p.box((w - 0.1, w - 0.1, 0.14), at=(0, 0, z + 2.52), mat="emit:team", paint="white", bevel=0.0)
    p.box((w + 0.25, w + 0.25, 0.42), at=(0, 0, z + 2.8), paint="bone", bevel=0.06, seg=1)
    p.box((w - 0.6, w - 0.6, 0.12), at=(0, 0, z + 3.05), paint="graphite", bevel=0.03)
    if fine():
        fins(p, (0, 0, z + 3.12), w - 0.8, 0.04, 12, depth=w - 0.8, thick=0.05, axis="X", mat="tex:keeper", paint="dark")
    # Aircraft-warning style marker light and a mast.
    p.cyl(0.05, 1.6, at=(0.9, 0.9, z + 3.0), mat="surf:galvanized", paint="white")
    p.cyl(0.09, 0.14, at=(0.9, 0.9, z + 4.6), mat="emit:team", paint="white")


# ------------------------------------------------------------------ pylon

def pylon():
    """Control pylon, 1.95 m: a bone-white ceramic monolith with a tilted screen
    at chest height (child `pylon_screen`: dark glass with emit:team bars),
    a palm pad, amber readouts, a conduit into the ground."""
    p = Part("pylon")
    p.box((1.3, 1.0, 0.14), at=(0, 0, 0.07), mat="surf:concrete", bevel=0.03, seg=1)
    p.box((0.92, 0.62, 1.78), at=(0, 0, 0.14 + 0.89), paint="bone", bevel=0.06, seg=2, taper=(0.9, 0.86))
    # Graphite front inset with the screen hood.
    p.box((0.7, 0.05, 1.2), at=(0, -0.29, 0.98), paint="graphite", bevel=0.012, rot=(-2.2, 0, 0))
    p.box((0.68, 0.22, 0.46), at=(0, -0.36, 1.38), rot=(28, 0, 0), paint="graphite", bevel=0.025)
    p.box((0.58, 0.02, 0.36), at=(0, -0.52, 1.43), rot=(28, 0, 0), paint="dark", bevel=0.0)
    # Palm pad: orange rimmed square.
    p.box((0.24, 0.035, 0.24), at=(0, -0.33, 0.98), paint="orange", bevel=0.01)
    p.box((0.18, 0.04, 0.18), at=(0, -0.335, 0.98), paint="dark", bevel=0.008)
    if fine():
        for i in range(5):
            p.box((0.04, 0.02, 0.018), at=(-0.2 + i * 0.1, -0.33, 1.13), mat="emit:amber", paint="white", bevel=0.0)
        p.text("HOLD", 0.045, at=(0, -0.34, 0.84), depth=0.003, paint="orange")
        p.text("P·1", 0.09, at=(0.47, 0.0, 1.45), rot=(90, 0, 90), depth=0.004, paint="graphite")
        bolt_row(p, (-0.32, -0.32, 0.43), (0.32, -0.32, 0.43), 4, "-Y", r=0.012)
        # Back access panel.
        p.box((0.5, 0.02, 0.7), at=(0, 0.3, 0.9), paint="ivory", bevel=0.008, rot=(2.5, 0, 0))
        bolt_row(p, (-0.22, 0.315, 0.6), (0.22, 0.315, 0.6), 3, "+Y", r=0.01)
        bolt_row(p, (-0.22, 0.30, 1.2), (0.22, 0.30, 1.2), 3, "+Y", r=0.01)
    # Side stripe.
    p.box((0.012, 0.08, 1.4), at=(0.43, -0.12, 0.95), paint="orange", bevel=0.0, rot=(0, -1.6, 0))
    # Cap and stub antenna.
    p.box((0.86, 0.56, 0.08), at=(0, 0, 1.96), paint="graphite", bevel=0.02)
    p.cyl(0.015, 0.35, at=(0.25, 0.12, 2.0), mat="surf:galvanized")
    # Conduit into the ground.
    p.pipe([(0.0, 0.28, 0.5), (0.0, 0.5, 0.5), (0.0, 0.62, 0.38), (0.0, 0.62, -0.1)], 0.055, mat="tex:keeper", paint="graphite", bend=0.12)
    s = Part("pylon_screen", origin=(0, -0.54, 1.43), parent=p)
    s.box((0.54, 0.012, 0.32), at=(0, -0.54, 1.43), rot=(28, 0, 0), paint="dark", bevel=0.0)
    # Screen artwork stays within the screen node, so swapping/tilting is rigid.
    from mathutils import Matrix
    pivot=Vector((0,-.54,1.43))
    R=Matrix.Rotation(math.radians(28),4,'X')
    for i in range(4):
        pos=pivot+R@Vector((-.16+i*.105,-.011,-.04))
        s.box((.06,.008,.07+i*.025),at=pos,rot=(28,0,0),mat='emit:team',bevel=0)
    s.text('HASH / SYNC',.045,at=pivot+R@Vector((0,-.014,.106)),rot=(118,0,0),paint='ivory',depth=.001)
    p.solid_box((-0.5, -0.5, 0), (0.5, 0.5, 2.0))
    return p


# Station service kit. Dimensions are real metres; all footprints remain simple.
def cooling_row(variant=0):
    p = Part('fin_row' if variant == 0 else 'fin_row_b')
    L = 7.2
    p.box((L, 2.0, .24), at=(0, 0, .12), mat='surf:concrete', bevel=.045)
    p.box((L-.3, 1.4, .36), at=(0, 0, .43), paint='graphite', bevel=.04)
    for x in (-2.7, 2.7):
        p.box((.22, 1.65, 2.4), at=(x, 0, 1.5), paint='ivory', bevel=.045)
    # Broad spaced heat-exchanger blades retain depth at walking distance.
    count = 28 if fine() else 12
    for i in range(count):
        x = -3.22 + i*6.44/(count-1)
        p.box((.055 if fine() else .12, 1.45, 1.95), at=(x, 0, 1.6),
              mat='surf:galvanized', paint='iron', bevel=.007, step=1.5)
    for y in (-.82, .82):
        p.pipe([(-3.3,y,.76),(3.3,y,.76)], .13, paint='white')
        p.pipe([(-3.3,y,2.55),(3.3,y,2.55)], .1, paint='white')
    for x in (-3.4,3.4):
        p.box((.26,1.9,2.48),at=(x,0,1.6),paint='bone',bevel=.05)
        bolt_row(p,(x,-.965,.62),(x,-.965,2.6),5,r=.022)
    if variant:
        p.box((1.1,.16,.65),at=(2.2,-1,1.1),paint='graphite',bevel=.02)
        p.text('B / 02',.15,at=(2.2,-1.09,1.1),paint='ivory')
    else:
        hazard(p,(-3.4,-.96,1.4),.2,.45,stripe=.08)
    p.box((.38,.15,.5),at=(-2.4,-.94,1.23),paint='ivory',bevel=.018)
    p.text('HOT',.08,at=(-2.4,-1.022,1.29),paint='graphite',depth=.002)
    if fine():
        for x in (-3.3,3.3):
            for z in (.76,2.55):
                p.cyl(.18,.08,at=(x,-.82,z),rot=(0,90,0),mat='surf:galvanized',bevel=.012)
    p.box((1.08,.18,1.8),at=(2.7,-.84,1.65),paint='bone',bevel=.035)
    engraving(p,'02' if variant else '01',.4,(2.7,-.955,1.94),1,.78)
    for x in (2.3,3.1):
        bolt_row(p,(x,-.975,1.7),(x,-.975,2.2),2,r=.018)
    p.box((5.7,.025,.035),at=(0,-.98,.76),mat='emit:team',bevel=0)
    # The ends face the combat aisle after assembly rotation. Layered service
    # faces and inlet slots keep those close-up views from becoming blank boxes.
    for side in (-1,1):
        x=side*3.55
        p.box((.10,1.65,2.05),at=(x,0,1.59),paint='bone',bevel=.035)
        p.box((.025,1.25,.52),at=(side*3.603,0,1.03),paint='graphite',bevel=.025)
        for yy in (-.48,-.24,0,.24,.48):
            p.box((.025,.12,.38),at=(side*3.62,yy,1.03),mat='surf:galvanized',paint='iron',bevel=.01)
        p.box((.02,1.20,.055),at=(side*3.61,0,2.40),mat='emit:team',bevel=0)
        p.text('02' if variant else '01',.42,at=(side*3.612,0,1.85),rot=(90,0,side*90),paint='graphite',depth=.002)
        p.text('COOLANT / RETURN',.095,at=(side*3.615,0,1.47),rot=(90,0,side*90),paint='graphite',depth=.001)
        for yy in (-.66,.66):
            bolt_row(p,(side*3.615,yy,.72),(side*3.615,yy,2.45),3,'+X' if side>0 else '-X',r=.024)
    # Forced-draught deck: two fan housings over the blades. The rotors are
    # the separate `fin_fan` root (origin at the hub, local 0,0,2.95 here),
    # which STATIONS spins once the station is relit.
    p.box((6.7,1.92,.08),at=(0,0,2.70),paint='graphite',bevel=.015)
    for x in (-1.8,1.8):
        p.ring_profile([(.62,2.74),(.76,2.74),(.76,3.10),(.70,3.17),(.62,3.17),(.62,2.74)],at=(x,0,0),paint='bone',caps=(False,False),n=28 if fine() else 14)
        p.cyl(.62,.02,at=(x,0,2.74),paint='dark',bevel=0)
        p.cyl(.13,.16,at=(x,0,2.76),paint='graphite',bevel=0)
        for a in (0,90):
            p.box((1.5,.035,.035),at=(x,0,3.19),rot=(0,0,a),mat='surf:galvanized',paint='iron',bevel=0)
        p.box((.7,.02,.06),at=(x,-.765,2.98),mat='emit:team',bevel=0)
        p.solid_box((x-.76,-.76,2.74),(x+.76,.76,3.17))
    p.solid_box((-3.6,-1,0),(3.6,1,2.85))
    return p


def fan_rotor():
    """Six pitched graphite blades on a bone hub, 1.16 m across. Origin at the
    hub; the engine places it in each fin housing and spins it about +Y."""
    p=Part('fin_fan')
    p.cyl(.15,.12,at=(0,0,-.06),paint='bone',bevel=.02,n=16)
    for k in range(6):
        a=k*60
        r=math.radians(a)
        p.box((.44,.13,.018),at=(.33*math.cos(r),.33*math.sin(r),0),rot=(24,0,a),paint='graphite',bevel=0)
    return p


def pipe_rack(drop=False):
    """Overhead pipe bridge, 12 m long, 4.7 m clear under the beams: two
    graphite portal bents on concrete footings carrying the geothermal bundle,
    a cable tray and a team light line across an aisle. `drop` turns the
    bundle down to grade at +X to feed the equipment beside it."""
    p=Part('pipe_rack_drop' if drop else 'pipe_rack')
    H,top=4.7,5.0
    for x in (-5.7,5.7):
        p.box((1.1,2.1,.35),at=(x,0,.175),mat='surf:concrete',bevel=.04)
        for y in (-.75,.75):
            # Built-up H column: web plus two flanges.
            p.box((.06,.26,top-.35),at=(x,y,.35+(top-.35)/2),paint='graphite',bevel=.008)
            for dx in (-.13,.13):
                p.box((.03,.3,top-.35),at=(x+dx,y,.35+(top-.35)/2),paint='graphite',bevel=.006)
            if fine():
                p.box((.36,.36,.03),at=(x,y,.365),mat='surf:galvanized',paint='iron',bevel=.005)
                bolt_row(p,(x-.12,y-.12,.39),(x+.12,y-.12,.39),2,'+Z',r=.02)
            hazard(p,(x,y-.155,1.3),.26,.5,stripe=.09)
        p.box((.34,1.86,.32),at=(x,0,H+.16),paint='graphite',bevel=.02)
        for y in (-.75,.75):
            p.pipe([(x,y*.98,H-1.0),(x,0,H-.02)],.04,mat='tex:keeper',paint='graphite',n=6)
    for y in (-.75,.75):
        p.box((12.0,.22,.28),at=(0,y,top+.14),paint='graphite',bevel=.02,step=3)
        p.box((11.0,.03,.05),at=(0,y*1.005-(.11 if y<0 else -.11),top+.06),mat='emit:team',bevel=0)
    for x in (-3.8,-1.9,0,1.9,3.8):
        p.box((.12,1.62,.1),at=(x,0,top+.33),paint='graphite',bevel=.01)
    # The bundle: three insulated lines and a cable tray.
    lines=[(-.38,.24,'white'),(.16,.17,'iron'),(.56,.11,'orange')]
    for y,r,paint in lines:
        z=top+.38+r
        path=[(-6.05,y,z),(6.05,y,z)]
        if drop:
            path=[(-6.05,y,z),(6.25+(.62-y)*.5,y,z),(6.25+(.62-y)*.5,y,.75),(7.1,y,.75)]
        p.pipe(path,r,paint=paint,mat='surf:galvanized' if paint!='orange' else 'tex:keeper',bend=r*2.2)
        for x in (-5.9,0,5.9):
            p.cyl(r+.07,.09,at=(x,y,z),rot=(0,90,0),mat='surf:galvanized',bevel=.012)
    cable_tray(p,(-6.0,-.84,top+.4),(6.0,-.84,top+.4),w=.26)
    if drop:
        p.box((.5,1.7,.35),at=(6.6,.1,.175),mat='surf:concrete',bevel=.03)
        for z in (1.6,3.2):
            p.box((.12,1.5,.12),at=(6.62,.1,z),paint='graphite',bevel=.01)
        p.solid_box((5.95,-.65,0),(7.15,.7,top+.65))
    p.box((1.6,.03,.3),at=(0,-.865,top+.14),paint='bone',bevel=.006)
    p.text('PR / 4.7 M CLEAR',.11,at=(0,-.885,top+.14),paint='graphite',depth=0)
    for x in (-5.7,5.7):
        p.solid_box((x-.55,-1.05,0),(x+.55,1.05,.35))
        p.solid_box((x-.2,-.9,.35),(x+.2,.9,H+.32))
    p.solid_box((-6.05,-1.0,H),(6.05,1.0,top+.67))
    return p


def kiosk():
    """Control kiosk that frames the pylon (which stands at its origin): a
    graphite service wall with displays at the back, bone ceramic end caps,
    and a cantilevered canopy with a team light line, open on three sides."""
    p=Part('control_kiosk')
    p.box((3.2,2.7,.62),at=(0,.05,-.19),mat='surf:concrete',bevel=.04)
    p.box((3.0,2.5,.04),at=(0,.05,.12),paint='graphite',bevel=.01)
    hazard(p,(0,-1.31,.06),3.0,.1,stripe=.12)
    # Service wall.
    p.box((3.0,.34,2.9),at=(0,1.05,.12+1.45),paint='graphite',bevel=.03)
    p.box((2.5,.04,1.15),at=(0,.86,1.95),paint='dark',bevel=.01)
    for i in range(5):
        p.box((.32,.012,.12+i*.11),at=(-.8+i*.4,.835,1.55+(.12+i*.11)/2),mat='emit:team',bevel=0)
    for i in range(4):
        p.box((.18,.012,.06),at=(.95,.836,2.35-i*.11),mat='emit:amber',bevel=0)
    p.box((2.8,.06,.42),at=(0,.86,.55),paint='bone',bevel=.012)
    p.text('KEEPER / CONTROL',.12,at=(0,.825,.58),paint='graphite',depth=0)
    for x in (-1.25,1.25):
        p.pipe([(x,.95,2.9),(x,.95,.4),(x,.75,.14)],.06,mat='tex:keeper',paint='graphite',bend=.12)
    # Short end caps keep both side exits clear around the full-size pylon.
    for x in (-1.58,1.58):
        p.box((.16,.34,2.6),at=(x,1.05,.12+1.3),paint='bone',bevel=.035,taper=(1,.7))
        p.box((.03,.25,.05),at=(x*1.055,1.05,2.3),mat='emit:team',bevel=0)
    # Cantilevered canopy and its light line.
    p.box((3.5,2.6,.22),at=(0,.0,3.13),paint='bone',bevel=.04)
    p.box((3.3,2.4,.06),at=(0,.0,2.99),paint='graphite',bevel=.01)
    p.box((3.1,.05,.05),at=(0,-1.2,2.97),mat='emit:team',bevel=0)
    p.box((1.6,.5,.04),at=(0,-.2,2.955),mat='emit:lamp',bevel=0)
    p.solid_box((-1.6,-1.25,0),(1.6,1.35,.14))
    p.solid_box((-1.5,.88,.14),(1.5,1.22,3.02))
    for x in (-1.58,1.58):
        p.solid_box((x-.08,.88,.14),(x+.08,1.22,2.72))
    p.solid_box((-1.75,-1.3,3.02),(1.75,1.3,3.24))
    p.empty('kiosk_light',(0,-.2,2.9))
    return p


def tank(variant=0):
    p = Part('immersion_tank' if variant == 0 else 'immersion_tank_b')
    p.box((3.6,2.5,.24),at=(0,0,.12),mat='surf:concrete',bevel=.05)
    p.box((3.25,2.15,1.75),at=(0,0,1.115),paint='graphite',bevel=.1)
    # Separate ceramic cladding panels and continuous recessed belt.
    for x in (-.81,.81):
        for y in (-1.09,1.09):
            if not (x<0 and y<0):p.box((1.57,.08,1.3),at=(x,y,1.15),paint='bone',bevel=.025)
            bolt_row(p,(x-.62,y*1.045,.63),(x+.62,y*1.045,.63),3,'-Y' if y<0 else '+Y')
    p.box((3.3,2.2,.16),at=(0,0,2.04),paint='ivory',bevel=.045)
    for x in (-.8,.8):
        p.box((1.5,1.9,.055),at=(x,0,2.15),mat='surf:galvanized',paint='iron',bevel=.012)
        for y in (-.65,.65):
            p.pipe([(x-.15,y,2.18),(x-.15,y,2.27),(x+.15,y,2.27),(x+.15,y,2.18)],.022,n=8)
    for y in (-.65,.65):
        p.pipe([(1.6,y,1.5),(1.95,y,1.5),(1.95,y,.4),(2.35,y,.4)],.14,paint='iron')
        p.cyl(.23,.07,at=(2.28,y,.4),rot=(0,90,0),mat='surf:galvanized',bevel=.015)
    p.text('IMMERSION / '+('B2' if variant else 'A1'),.12,at=(-.81,-1.145,1.72),paint='graphite')
    hazard(p,(-1.15,-1.14,.83),.6,.15)
    if variant:
        cable_tray(p,(-1.4,1.28,.38),(1.4,1.28,.38),w=.22)
    # Fluid level sight strip and a service cover are deliberately asymmetric.
    p.box((.13,.025,.65),at=(.95,-1.15,1.15),paint='graphite',bevel=.009)
    p.box((.04,.014,.45),at=(.95,-1.17,1.14),paint='orange',bevel=.003)
    if fine():
        for z in (.91,1.05,1.19,1.33):
            p.box((.09,.006,.008),at=(.95,-1.184,z),paint='ivory',bevel=0)
    engraving(p,'02' if variant else '01',.5,(-.81,-1.14,1.15),1.57,1.3)
    p.box((1.23,.04,.09),at=(.81,-1.17,1.72),paint='graphite',bevel=.015)
    p.box((1.15,.025,.035),at=(.81,-1.2,1.72),mat='emit:team',bevel=0)
    p.box((.08,1.78,1.35),at=(-1.62,0,1.18),paint='bone',bevel=.04)
    p.box((.03,1.28,.30),at=(-1.672,0,.84),paint='graphite',bevel=.018)
    for yy in (-.48,-.24,0,.24,.48):
        p.box((.025,.09,.24),at=(-1.695,yy,.84),mat='surf:galvanized',paint='iron',bevel=.005)
    p.text('IMMERSION',.15,at=(-1.677,0,1.56),rot=(90,0,-90),paint='graphite',depth=.001)
    p.text('02' if variant else '01',.40,at=(-1.68,0,1.22),rot=(90,0,-90),paint='graphite',depth=.002)
    p.solid_box((-1.8,-1.25,0),(1.8,1.25,2.18))
    return p


def wellhead():
    p=Part('wellhead')
    p.box((4.8,4.8,.28),at=(0,0,.14),mat='surf:concrete',bevel=.05)
    p.box((2.3,2.3,1.0),at=(0,0,.78),mat='surf:cutStone',bevel=.08)
    p.cyl(.7,1.85,at=(0,0,1.28),mat='surf:galvanized',paint='iron',bevel=.04)
    for z in (1.36,2.36,3.14):
        p.cyl(.94,.13,at=(0,0,z),mat='surf:galvanized',bevel=.025)
        if fine():
            for i in range(12):
                a=i*math.tau/12
                p.cyl(.035,.09,at=(.83*math.cos(a),.83*math.sin(a),z+.13),n=6,mat='surf:galvanized')
    for x in (-1,1):
        p.pipe([(0,0,2.05),(x*1.8,0,2.05),(x*1.8,0,.6),(x*2.4,0,.6)],.29,paint='iron')
        p.cyl(.43,.13,at=(x*2.22,0,.6),rot=(0,90,0),mat='surf:galvanized',bevel=.02)
    p.box((1.1,.68,.7),at=(0,0,3.6),paint='bone',bevel=.055)
    p.text('GEO / 01',.13,at=(0,-.35,3.6),paint='graphite')
    p.pipe([(0,.4,1.1),(0,1.6,1.1),(0,1.6,2.5)],.07,paint='graphite')
    p.cyl(.32,.07,at=(0,1.6,2.5),mat='tex:keeper',paint='orange')
    for x in (-1.8,1.8):
        railing(p,(x,-1.65,.28),(x,1.65,.28))
    p.solid_box((-2.4,-2.4,0),(2.4,2.4,.28))
    p.solid_cyl(0,0,.94,.28,3.95)
    for x in (-1.8,1.8):
        p.solid_box((x-.3,-.3,.28),(x+.3,.3,2.34))
    engraving(p,'01',.48,(0,-1.19,.79),1.5,.72)
    for x in (-.6,.6):
        bolt_row(p,(x,-1.21,.56),(x,-1.21,1.02),2,r=.022)
    p.box((.75,.025,.035),at=(0,-.355,3.5),mat='emit:team',bevel=0)
    p.cyl(.18,.045,at=(0,-.77,2.8),rot=(90,0,0),paint='bone',bevel=.009)
    p.pipe([(0,-.805,2.8),(.1,-.805,2.86)],.01,mat='tex:keeper',paint='orange',n=6)
    p.empty('wellhead_steam' ,(0,0,3.95))
    return p


def pipe_run(variant=0):
    p=Part('pipe_run' if variant == 0 else 'pipe_run_b')
    pts=[(-2.8,0,.55),(2.8,0,.55)] if not variant else [(-2.8,0,.55),(.8,0,.55),(.8,2,.55)]
    for y,r in ((0,.23),(.56,.09)):
        path=[(x,yy+y,z) for x,yy,z in pts]
        p.pipe(path,r,paint='iron' if y==0 else 'white')
    for x in (-2.35,2.35) if not variant else (-2.35,0):
        p.box((.38,1.1,.27),at=(x,.25,.135),mat='surf:concrete',bevel=.025)
        p.cyl(.32,.09,at=(x,0,.55),rot=(0,90,0),mat='surf:galvanized',bevel=.012)
        bolt_row(p,(x+.1,-.2,.35),(x+.1,-.2,.75),3,'+X')
    p.box((.65,.025,.11),at=(-.8,-.24,.55),paint='ivory',bevel=.006)
    p.text('GEO / RETURN',.055,at=(-.8,-.257,.55),paint='graphite',depth=.002)
    if fine():
        for x in (-2.35,2.35) if not variant else (-2.35,0):
            for i in range(8):
                a=i*math.tau/8
                p.cyl(.018,.035,at=(x+.11,.27*math.cos(a),.55+.27*math.sin(a)),rot=(0,90,0),n=6,mat='surf:galvanized')
    p.solid_box((-2.8,-.32,0),(1.12 if variant else 2.8,.7,.8))
    if variant:p.solid_box((.48,-.32,0),(1.12,2.1,.8))
    return p


def lamp():
    p=Part('lamp_mast')
    p.box((.7,.7,.35),at=(0,0,.175),mat='surf:concrete',bevel=.04)
    p.box((.18,.18,5.3),at=(0,0,3),mat='surf:galvanized',paint='iron',bevel=.025)
    p.box((.26,.22,.7),at=(0,-.02,1.15),paint='bone',bevel=.025)
    p.pipe([(0,0,5.4),(0,0,5.85),(0,-1.2,5.85)],.065,paint='iron')
    p.box((.9,.5,.16),at=(0,-1.2,5.8),paint='graphite',bevel=.04)
    p.box((.76,.38,.025),at=(0,-1.2,5.705),mat='emit:lamp',bevel=.01)
    bolt_row(p,(-.23,-.23,.35),(.23,-.23,.35),2,'+Z',r=.028)
    p.solid_box((-.35,-.35,0),(.35,.35,.35))
    p.solid_box((-.09,-.09,.35),(.09,.09,5.6))
    p.text('L / 04',.065,at=(0,-.139,1.15),paint='graphite',depth=.002)
    bolt_row(p,(-.09,-.14,.9),(.09,-.14,.9),2,r=.01)
    p.empty('lamp_light' ,(0,-1.2,5.68))
    return p


def build(reg, only):
    if not only or 'spire' in only:
        reg.add('spire',spire,lod=True,ao=4,note='33 m including mast; shaft crown at 31 m; spire_steam marker, team light lines')
    if not only or 'pylon' in only:
        reg.add('pylon',pylon,ao=1,note='2 m control body; antenna at 2.35 m; rigid pylon_screen child')
    for name,fn,lod in [
        ('fin_row',lambda:cooling_row(0),True),('fin_row_b',lambda:cooling_row(1),True),
        ('immersion_tank',lambda:tank(0),True),('immersion_tank_b',lambda:tank(1),True),
        ('wellhead',wellhead,True),('pipe_run',lambda:pipe_run(0),True),
        ('pipe_run_b',lambda:pipe_run(1),True),('lamp_mast',lamp,True),
        ('fin_fan',fan_rotor,False),('pipe_rack',lambda:pipe_rack(False),True),
        ('pipe_rack_drop',lambda:pipe_rack(True),True),('control_kiosk',kiosk,True)]:
        if not only or name in only:reg.add(name,fn,lod=lod,ao=1.5)
