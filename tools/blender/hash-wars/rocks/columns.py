"""Columnar-basalt geometry, pure Python (no bpy): build.py turns it into meshes.

Coordinates are Blender's: metres, Z up, the front of every piece faces -Y.
A piece is a list of triangles; every vertex carries its own position, normal
and UV, so flat faces stay flat and only the worn edges are rounded.

Columns come from a jittered hex lattice: each cell is the Voronoi cell of its
six lattice neighbours, so neighbours share edges and the field packs edge to
edge with only a thin dark joint between them. Faces hidden by a taller
neighbour are omitted; perimeter faces reach the root so scaled pieces seal.

UVs address one 2048 x 2048 atlas (see textures.py):
  side faces  u in [0, .75): four 0.75 m wide face variants, v = height / 4 m
              (tiles vertically, so tall columns never stretch)
  tops/ends   u in [.75, 1): four 1 m squares stacked in v
"""
import math
import random

TILE_H = 4.0        # metres of column face per vertical texture repeat
SIDE_W = 0.75       # metres per side variant
PX = 2048
SIDE_VARIANTS = 4
# Joint heights inside one 4 m texture repeat; build.py sets these from textures.py.
TEX_JOINTS = [.4, 1.2, 1.9, 2.9, 3.5]
TOP_VARIANTS = 4


class Mesh:
    """Triangle soup with per-vertex normal and uv."""

    def __init__(self):
        self.p, self.n, self.uv = [], [], []

    def tri(self, a, b, c):
        for v in (a, b, c):
            self.p.append(v[0]); self.n.append(v[1]); self.uv.append(v[2])

    def quad(self, a, b, c, d):
        self.tri(a, b, c); self.tri(a, c, d)

    def fan(self, ring):
        for i in range(1, len(ring) - 1):
            self.tri(ring[0], ring[i], ring[i + 1])

    @property
    def triangles(self):
        return len(self.p) // 3

    def extend(self, other):
        self.p += other.p; self.n += other.n; self.uv += other.uv


def norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / l for c in v)


def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def add(a, b): return tuple(x + y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def side_uv(variant, x_face, z, voff):
    """x_face: metres from the face centre; 512 px per metre both ways."""
    px_per_m = PX / 4.0
    u = (variant * SIDE_W * px_per_m + SIDE_W * px_per_m / 2 + x_face * px_per_m) / PX
    return (u, (z + voff) / TILE_H)


def top_uv(variant, dx, dy, scale):
    px_per_m = PX / 4.0
    u = (SIDE_VARIANTS * SIDE_W * px_per_m + 256 + dx * px_per_m * scale) / PX
    v = (variant * 512 + 256 + dy * px_per_m * scale) / PX
    return (u, v)


def circumcentre(a, b, c):
    ax, ay = a; bx, by = b; cx, cy = c
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    return (ux, uy)


def lattice(rng, x0, x1, y0, y1, spacing, jitter, keep=lambda x, y: True):
    """Jittered hex lattice. Returns cells {key: {centre, poly, neighbours}}.
    poly[k] runs counter-clockwise; edge k (poly[k-1] -> poly[k]) faces neighbour k."""
    rows = int((y1 - y0) / (spacing * .866)) + 3
    cols = int((x1 - x0) / spacing) + 3
    pts = {}
    for j in range(-1, rows + 1):
        for i in range(-1, cols + 1):
            x = x0 + (i + (j % 2) * .5) * spacing + rng.uniform(-jitter, jitter) * spacing
            y = y0 + j * spacing * .866 + rng.uniform(-jitter, jitter) * spacing
            pts[(i, j)] = (x, y)
    # Neighbour offsets for odd-row-shifted lattice, counter-clockwise from +X.
    def around(i, j):
        if j % 2 == 0:
            return [(i + 1, j), (i, j + 1), (i - 1, j + 1), (i - 1, j), (i - 1, j - 1), (i, j - 1)]
        return [(i + 1, j), (i + 1, j + 1), (i, j + 1), (i - 1, j), (i, j - 1), (i + 1, j - 1)]
    cells = {}
    for (i, j), c in pts.items():
        if not (x0 <= c[0] <= x1 and y0 <= c[1] <= y1 and keep(*c)):
            continue
        nb = around(i, j)
        if not all(k in pts for k in nb):
            continue
        poly = [circumcentre(c, pts[nb[k]], pts[nb[(k + 1) % 6]]) for k in range(6)]
        # poly[k] lies between neighbours k and k+1, so edge (poly[k-1], poly[k]) faces nb[k].
        cells[(i, j)] = {'c': c, 'poly': poly, 'nb': nb}
    return cells


def shrink(poly, gap):
    cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly)
    inr = min(abs(cross2(sub2(poly[k], poly[k - 1]), sub2((cx, cy), poly[k - 1]))) / max(1e-6, dist2(poly[k], poly[k - 1]))
              for k in range(len(poly)))
    s = max(.5, 1 - gap / 2 / max(inr, 1e-3))
    return [(cx + (p[0] - cx) * s, cy + (p[1] - cy) * s) for p in poly], (cx, cy), inr


def sub2(a, b): return (a[0] - b[0], a[1] - b[1])
def cross2(a, b): return a[0] * b[1] - a[1] * b[0]
def dist2(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])


def column(m, poly, centre, z_lo_of_face, top, rng, lod=False, voff=0.0, lean=(0.0, 0.0),
           bevel=.035, rim=.045, tilt=(0.0, 0.0), step=None, side_variant=0, top_variant=0, rounded_top=True,
           drums=(), insets=(0.0,)):
    """Emit one column. poly: CCW footprint (already shrunk). z_lo_of_face[k]:
    lowest visible height of edge k, or None to skip it. top: crown height at centre.
    drums: joint heights (ascending) where the column steps in or out by
    insets[i] (len(drums) + 1 values, metres), so joints show in silhouette."""
    import bisect
    n = len(poly)
    cx, cy = centre

    def inset_at(z):
        return insets[bisect.bisect(drums, z)] if drums else insets[0]

    def sp(p, ins):
        d = max(dist2(p, centre), 1e-3)
        f = 1 - ins / d
        return (cx + (p[0] - cx) * f, cy + (p[1] - cy) * f)

    def lean_at(x, y, z):
        return (x + lean[0] * z, y + lean[1] * z, z)

    def top_z(x, y):
        z = top + tilt[0] * (x - cx) + tilt[1] * (y - cy)
        if step and (x - cx) * step[0] + (y - cy) * step[1] - step[2] < 0:
            z -= step[3]
        return z

    # Ring of footprint points: bevelled corners give two points per corner.
    ring = []  # (point, face index whose normal it carries, _)
    for k in range(n):
        a, b, c = poly[k - 1], poly[k], poly[(k + 1) % n]
        if lod or bevel <= 0:
            ring.append((b, k, k + 1))
            continue
        la, lc = dist2(a, b), dist2(b, c)
        t1 = min(bevel, la * .3) / la; t2 = min(bevel, lc * .3) / lc
        p1 = (b[0] + (a[0] - b[0]) * t1, b[1] + (a[1] - b[1]) * t1)
        p2 = (b[0] + (c[0] - b[0]) * t2, b[1] + (c[1] - b[1]) * t2)
        ring.append((p1, k, k))          # end of face k
        ring.append((p2, (k + 1) % n, (k + 1) % n))  # start of face k+1
    # Outward normals per face edge k: from poly[k-1] to poly[k].
    face_n = []
    for k in range(n):
        a, b = poly[k - 1], poly[k]
        e = (b[0] - a[0], b[1] - a[1], 0.0)
        up = norm((lean[0], lean[1], 1.0))
        face_n.append(norm(cross(e, up)))
    face_w = [dist2(poly[k - 1], poly[k]) for k in range(n)]
    face_mid = [((poly[k - 1][0] + poly[k][0]) / 2, (poly[k - 1][1] + poly[k][1]) / 2) for k in range(n)]
    # Scale wide faces into the 0.75 m variant strip, leaving room for bevels.
    def face_x(k, p):
        a, b = poly[k - 1], poly[k]
        e = sub2(b, a); l = math.hypot(*e)
        s = (p[0] - face_mid[k][0]) * e[0] / l + (p[1] - face_mid[k][1]) * e[1] / l
        squeeze = min(1.0, .62 / max(face_w[k], 1e-3))
        return s * squeeze

    rr = 0.0 if (lod or not rounded_top or step) else rim

    def crossing(pa, pb):
        if not step:
            return False
        da = (pa[0] - cx) * step[0] + (pa[1] - cy) * step[1] - step[2]
        db = (pb[0] - cx) * step[0] + (pb[1] - cy) * step[1] - step[2]
        return (da < 0) != (db < 0)

    def emit_face_quad(k, pa, pb, za, zb, na, nb, xa, xb, variant):
        ta, tb = top_z(*pa) - rr, top_z(*pb) - rr
        if crossing(pa, pb):  # the break runs through this face: keep the high side
            ta = top + tilt[0] * (pa[0] - cx) + tilt[1] * (pa[1] - cy)
            tb = top + tilt[0] * (pb[0] - cx) + tilt[1] * (pb[1] - cy)
        if ta - za < .02 and tb - zb < .02:
            return
        cuts = [z for z in drums if za + .05 < z < min(ta, tb) - .08]
        levels = [za] + cuts
        for i, z0 in enumerate(levels):
            last = i == len(cuts)
            z1a = ta if last else cuts[i]
            z1b = tb if last else cuts[i]
            ins = inset_at((z0 + min(z1a, z1b)) / 2)
            A, B = sp(pa, ins), sp(pb, ins)
            m.quad((lean_at(A[0], A[1], z0), na, side_uv(variant, xa, z0, voff)),
                   (lean_at(B[0], B[1], z0), nb, side_uv(variant, xb, z0, voff)),
                   (lean_at(B[0], B[1], z1b), nb, side_uv(variant, xb, z1b, voff)),
                   (lean_at(A[0], A[1], z1a), na, side_uv(variant, xa, z1a, voff)))
            if not last:
                z = cuts[i]
                il, iu = ins, inset_at(z + .01)
                if abs(il - iu) > .002:
                    Al, Bl, Au, Bu = sp(pa, il), sp(pb, il), sp(pa, iu), sp(pb, iu)
                    up = (0, 0, 1) if il < iu else (0, 0, -1)
                    q = [(lean_at(P[0], P[1], z), up, side_uv(variant, x, z - .01, voff))
                         for P, x in ((Al, xa), (Bl, xb), (Bu, xb), (Au, xa))]
                    m.quad(*(q if il < iu else q[::-1]))

    variants = [(side_variant + k * 3) % SIDE_VARIANTS for k in range(n)]
    if lod or bevel <= 0:
        for k in range(n):
            if z_lo_of_face[k] is None:
                continue
            pa, pb = poly[k - 1], poly[k]
            z = z_lo_of_face[k]
            emit_face_quad(k, pa, pb, z, z, face_n[k], face_n[k], face_x(k, pa), face_x(k, pb), variants[k])
    else:
        for k in range(n):
            # flat face k: ring[2k-1] (start of face k) -> ring[2k] (end of face k)
            pa = ring[(2 * k - 1) % (2 * n)][0]; pb = ring[2 * k][0]
            zk = z_lo_of_face[k]
            if zk is not None:
                emit_face_quad(k, pa, pb, zk, zk, face_n[k], face_n[k], face_x(k, pa), face_x(k, pb), variants[k])
            # bevel at corner k: ring[2k] (normal face k) -> ring[2k+1] (normal face k+1)
            k2 = (k + 1) % n
            zs = [z for z in (z_lo_of_face[k], z_lo_of_face[k2]) if z is not None]
            if zs:
                z = min(zs)
                p1 = ring[2 * k][0]; p2 = ring[2 * k + 1][0]
                x1 = face_x(k, p1); x2 = x1 + dist2(p1, p2)
                emit_face_quad(k, p1, p2, z, z, face_n[k], face_n[k2], x1, x2, variants[k])

    # Crown. Footprint ring at the rim, then optional rounded inset, then cap.
    pts = [sp(r[0], inset_at(top)) for r in ring]
    top_n = norm((-tilt[0], -tilt[1], 1.0))
    sc = min(1.0, .9 / max(max(dist2(p, centre) for p in pts) * 2, 1e-3))
    pnorm = []
    for idx, r in enumerate(ring):
        k = r[1]
        pnorm.append(face_n[k] if not (lod or bevel <= 0) else face_n[k])
    if step is None:
        if rr > 0:
            inner = [(cx + (p[0] - cx) * (1 - rr / max(dist2(p, centre), 1e-3)),
                      cy + (p[1] - cy) * (1 - rr / max(dist2(p, centre), 1e-3))) for p in pts]
            outer_v = [(lean_at(p[0], p[1], top_z(*p) - rr), pnorm[i], top_uv(top_variant, p[0] - cx, p[1] - cy, sc)) for i, p in enumerate(pts)]
            inner_v = [(lean_at(p[0], p[1], top_z(*p)), norm(add(mul(pnorm[i], .55), top_n)), top_uv(top_variant, p[0] - cx, p[1] - cy, sc)) for i, p in enumerate(inner)]
            for i in range(len(pts)):
                j = (i + 1) % len(pts)
                m.quad(outer_v[i], outer_v[j], inner_v[j], inner_v[i])
            cap = [(lean_at(p[0], p[1], top_z(*p)), top_n, top_uv(top_variant, p[0] - cx, p[1] - cy, sc)) for p in inner]
            m.fan(cap)
        else:
            cap = [(lean_at(p[0], p[1], top_z(*p)), top_n, top_uv(top_variant, p[0] - cx, p[1] - cy, sc)) for p in pts]
            m.fan(cap)
    else:
        # Stepped break: clip the crown by a chord into a high and a low part.
        d = lambda p: (p[0] - cx) * step[0] + (p[1] - cy) * step[1] - step[2]
        hi, lo, chord = [], [], []
        L = len(pts)
        for i in range(L):
            p, q = pts[i], pts[(i + 1) % L]
            dp, dq = d(p), d(q)
            (hi if dp >= 0 else lo).append(p)
            if (dp >= 0) != (dq >= 0):
                t = dp / (dp - dq)
                x = (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
                hi.append(x); lo.append(x); chord.append(x)
        hz = lambda p: top + tilt[0] * (p[0] - cx) + tilt[1] * (p[1] - cy)
        for part, drop in ((hi, 0.0), (lo, step[3])):
            if len(part) >= 3:
                cap = [(lean_at(p[0], p[1], hz(p) - drop), top_n, top_uv(top_variant, p[0] - cx, p[1] - cy, sc)) for p in part]
                m.fan(cap)
        if len(chord) == 2:
            a, b = chord
            rn = norm((-step[0], -step[1], 0.0))
            e = (b[0] - a[0], b[1] - a[1], 0.0)
            if dot(cross(e, (0, 0, 1)), rn) < 0:
                a, b = b, a
            xa, xb = 0.0, dist2(a, b)
            m.quad((lean_at(a[0], a[1], hz(a) - step[3]), rn, side_uv(top_variant, xa - xb / 2, hz(a) - step[3], voff)),
                   (lean_at(b[0], b[1], hz(b) - step[3]), rn, side_uv(top_variant, xb - xb / 2, hz(b) - step[3], voff)),
                   (lean_at(b[0], b[1], hz(b)), rn, side_uv(top_variant, xb - xb / 2, hz(b), voff)),
                   (lean_at(a[0], a[1], hz(a)), rn, side_uv(top_variant, xa - xb / 2, hz(a), voff)))


def smoothstep(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def vnoise(x, y, seed):
    """Cheap smooth value noise for height fields (deterministic)."""
    def h(i, j):
        n = math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
        return n - math.floor(n)
    i, j = math.floor(x), math.floor(y)
    fx, fy = x - i, y - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = h(i, j) * (1 - fx) + h(i + 1, j) * fx
    b = h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx
    return a * (1 - fy) + b * fy


def field(seed, bounds, spacing, height, ground=lambda x, y: -1e9, lod=False, jitter=.17,
          keep=lambda x, y: True, gap=-.025, broken=.12, stepped=.22, tilt_max=.16,
          lean_amp=.03, bevel=.022, rim=.045, bury_margin=2.0, quarry=.1, spread=.5, joint_geometry=True):
    """A packed field of columns. height(x, y, rng) -> crown height or None.
    ground(x, y): the bank used to shape crowns and omit fully buried columns.
    Perimeter faces always extend to zero, independent of the target bank."""
    rng = random.Random(seed)
    x0, x1, y0, y1 = bounds
    cells = lattice(rng, x0, x1, y0, y1, spacing, jitter, keep)
    tops = {}
    meta = {}
    lean_seed = seed * .37
    for key, cell in cells.items():
        x, y = cell['c']
        h = height(x, y, rng)
        if h is None:
            continue
        r = rng.random()
        g = ground(x, y)
        if r < broken:
            h -= rng.uniform(.8, 3.2)
        elif r < broken + quarry and g > -1e8 and h - g > 3:
            h = g + (h - g) * rng.uniform(.25, .75)  # niche: a column fallen out
        h += rng.uniform(-1, 1) * spread
        if h < g - .6:
            continue
        tops[key] = h
        a = rng.uniform(0, math.tau)
        t = rng.uniform(0, tilt_max) if rng.random() < .7 else rng.uniform(0, .03)
        # Draw the same random numbers for both LODs so they share one layout.
        want_step = rng.random() < stepped
        ang = rng.uniform(0, math.tau)
        st = (math.cos(ang), math.sin(ang), rng.uniform(-.15, .2) * spacing, rng.uniform(.08, .38))
        if not want_step or lod:
            st = None
        rng.uniform(-1, 1); lx = (vnoise(0, 0, lean_seed) - .5) * 2 * lean_amp
        rng.uniform(-1, 1); ly = (vnoise(9, 0, lean_seed) - .5) * 2 * lean_amp
        meta[key] = dict(tilt=(math.cos(a) * t, math.sin(a) * t), step=st, voff=rng.uniform(0, TILE_H),
                         sv=rng.randrange(SIDE_VARIANTS), tv=rng.randrange(TOP_VARIANTS), lean=(lx, ly),
                         rounded=rng.random() < .8)
    m = Mesh()
    for key, h in tops.items():
        cell = cells[key]
        poly, centre, inr = shrink(cell['poly'], gap)
        md = meta[key]
        # Lowest crown point of this column (tilt and step lower one side).
        tmin = h - math.hypot(*md['tilt']) * inr * 1.2 - (md['step'][3] if md['step'] else 0)
        zlo = []
        for k in range(6):
            nk = cell['nb'][k]
            # The kit is scaled onto different banks. A predicted buried face
            # can face open air there: perimeter columns must reach the root.
            lo = 0.0
            if nk in tops:
                nmeta = meta[nk]
                ninr = inr
                ntmin = tops[nk] - math.hypot(*nmeta['tilt']) * ninr * 1.2 - (nmeta['step'][3] if nmeta['step'] else 0)
                lo = max(lo, ntmin - 1.2)
            if lo > tmin - .03:
                zlo.append(None)
            else:
                zlo.append(lo)
        jr = random.Random(seed * 7919 + key[0] * 131 + key[1])
        drums = sorted(j - md['voff'] + TILE_H * k for j in TEX_JOINTS for k in range(-1, int(h / TILE_H) + 2)
                       if jr.random() < .28)
        drums = [z for z in drums if 0 < z < h] if joint_geometry else []
        insets = [jr.choice((0, 0, jr.uniform(.008, .024))) for _ in range(len(drums) + 1)]
        # Only cut where a drum actually steps in or out.
        keep = [i for i in range(len(drums)) if abs(insets[i] - insets[i + 1]) > .002]
        insets = [insets[0]] + [insets[i + 1] for i in keep]
        drums = [drums[i] for i in keep]
        column(m, poly, centre, zlo, h, rng, lod=lod, voff=md['voff'], lean=md['lean'],
               drums=() if lod else drums, insets=(0.0,) if lod else insets,
               bevel=0 if lod else bevel, rim=rim, tilt=md['tilt'], step=None if lod else md['step'],
               side_variant=md['sv'], top_variant=md['tv'], rounded_top=md['rounded'])
    # A buried closed core stops oblique views seeing sky between columns.
    # It stays below the shortest nearby crowns and uses a coarse grid, so
    # the detailed outer silhouette still comes entirely from the hex prisms.
    if ground(0, 0) > -1e8 and len(tops) > 30:
        nx, ny = 9, 9
        points = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                x = x0 + (x1 - x0) * i / nx
                y = y0 + (y1 - y0) * j / ny
                nearby = sorted(tops, key=lambda k: dist2(cells[k]['c'], (x, y)))[:7]
                h = max(.05, min(tops[k] for k in nearby) - 1.4)
                row.append(((x, y, h), (0, 0, 1), top_uv(0, x % .5, y % .5, 1)))
            points.append(row)
        for j in range(ny):
            for i in range(nx):
                m.quad(points[j][i], points[j][i+1], points[j+1][i+1], points[j+1][i])
        edge = points[0] + [r[-1] for r in points[1:]] + list(reversed(points[-1][:-1])) + [r[0] for r in reversed(points[1:-1])]
        for i, a in enumerate(edge):
            b = edge[(i + 1) % len(edge)]
            normal = norm((b[0][1]-a[0][1], a[0][0]-b[0][0], 0))
            A = ((a[0][0], a[0][1], 0), normal, (0, 0))
            B = ((b[0][0], b[0][1], 0), normal, (.1, 0))
            m.quad(A, B, (b[0], normal, (.1, 1)), (a[0], normal, (0, 1)))
    return m


def drum(m, rng, centre, axis, radius, length, lod=False, sv=0, tv=0, broken_end=True):
    """A fallen column drum lying along `axis` (unit, roughly horizontal)."""
    up = (0, 0, 1)
    side = norm(cross(axis, up)) if abs(dot(axis, up)) < .95 else (1, 0, 0)
    upv = cross(side, axis)
    n = 6
    rot = rng.uniform(0, math.tau)
    poly = []
    for k in range(n):
        a = rot + k * math.tau / n + rng.uniform(-.12, .12)
        r = radius * rng.uniform(.88, 1.06)
        poly.append((math.cos(a) * r, math.sin(a) * r))
    # Build as a column in local frame (z along axis), then map to world.
    local = Mesh()
    zlo = [0.0] * n
    tilt = (rng.uniform(-.2, .2), rng.uniform(-.2, .2)) if broken_end else (0, 0)
    column(local, poly, (0, 0), zlo, length, rng, lod=lod, voff=rng.uniform(0, 4), bevel=0 if lod else .03,
           rim=.04, tilt=tilt, side_variant=sv, top_variant=tv)
    # Bottom end cap (the other joint face).
    cap = [((p[0], p[1], 0.0), (0, 0, -1), top_uv(tv, p[0], -p[1], 1.0)) for p in reversed(poly)]
    local.fan(cap)

    def to_world(v):
        return (centre[0] + side[0] * v[0] + upv[0] * v[1] + axis[0] * (v[2] - length / 2),
                centre[1] + side[1] * v[0] + upv[1] * v[1] + axis[1] * (v[2] - length / 2),
                centre[2] + side[2] * v[0] + upv[2] * v[1] + axis[2] * (v[2] - length / 2))

    def rot_n(nv):
        return norm((side[0] * nv[0] + upv[0] * nv[1] + axis[0] * nv[2],
                     side[1] * nv[0] + upv[1] * nv[1] + axis[1] * nv[2],
                     side[2] * nv[0] + upv[2] * nv[1] + axis[2] * nv[2]))
    for p, nn, uv in zip(local.p, local.n, local.uv):
        m.p.append(to_world(p)); m.n.append(rot_n(nn)); m.uv.append(uv)


def bounds_of(m):
    xs = [p[0] for p in m.p]; ys = [p[1] for p in m.p]; zs = [p[2] for p in m.p]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def recentre(m):
    """Ground-centred origin: x/y centred, lowest point at z=0."""
    x0, x1, y0, y1, z0, _ = bounds_of(m)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    m.p = [(p[0] - cx, p[1] - cy, p[2] - z0) for p in m.p]
    return m
