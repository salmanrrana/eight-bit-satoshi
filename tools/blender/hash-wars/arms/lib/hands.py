"""The Keeper gauntlet: armoured hand and forearm, posed onto a grip.

Built once in a "hand frame" (millimetres): origin at the palm centre, +Y
toward the fingers, +Z out of the back of the hand, thumb on -X. That is a
right hand; the left hand is the same build mirrored across X.

Posing: the palm is placed by hand (a location and rotation per weapon) and
the fingers curl themselves. Each finger curls all three joints together
until a segment touches the target mesh, then that segment freezes and the
rest keep curling, like a real grasp. Change a grip's size and rebuild and
the fingers re-wrap.

pose = dict(
    side="r" | "l",
    palm=((x, y, z) mm, (rx, ry, rz) deg),     # hand frame in weapon space
    targets=[objects the fingers wrap],
    fingers={"index": dict(spread=deg, targets=[...], lo=(a, b, c), hi=(a, b, c)), ...},
    thumb=dict(rot=(rx, ry, rz), lo=..., hi=..., targets=[...]),
    wrist=(pitch, yaw, roll) deg,              # used when elbow is omitted
    elbow=(x, y, z) mm,                       # optional world-space arm direction
    bracer_up=(0, -0.3, 1),                   # optional dorsal plate direction
    forearm=length mm,
)
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from . import geo
from .geo import MM

# Knuckle position (mm, hand frame), segment lengths, width and thickness.
FINGERS = {
    "index": dict(at=(-30.5, 46, 2.5), L=(44, 26, 23), w=20.5, t=19.0),
    "middle": dict(at=(-9.5, 49, 3.0), L=(48, 30, 24), w=21.0, t=19.5),
    "ring": dict(at=(11.0, 47, 2.5), L=(45, 28, 23), w=20.0, t=18.5),
    "pinky": dict(at=(30.0, 40, 1.0), L=(35, 21, 20), w=17.5, t=16.5),
}
THUMB = dict(at=(-34, -22, -5), L=(44, 33, 27), w=23.5, t=21.5)
PALM = dict(w=90, y0=-52, y1=48, t=33)


def rx(a):
    return Matrix.Rotation(math.radians(a), 4, "X")


def ry(a):
    return Matrix.Rotation(math.radians(a), 4, "Y")


def rz(a):
    return Matrix.Rotation(math.radians(a), 4, "Z")


def T(x, y, z):
    return Matrix.Translation(Vector((x, y, z)) * MM)


def rot(r):
    return (rz(r[2]) @ ry(r[1]) @ rx(r[0]))


def palm_rotation(r):
    """Palm orientation from Euler degrees (rx, ry, rz) or from two directions:
    (finger direction, back-of-hand direction), both in weapon space."""
    if len(r) == 2:
        y = Vector(r[0]).normalized()
        z = Vector(r[1])
        z = (z - y * z.dot(y)).normalized()
        x = y.cross(z)
        return Matrix((x, y, z)).transposed().to_4x4()
    return rot(r).to_4x4()


def chain(base, L, angles):
    """Frames of each segment: segment j starts at frame j's origin, runs +Y."""
    out = []
    m = base
    for j, a in enumerate(angles):
        m = m @ rx(-a)
        out.append(m)
        m = m @ T(0, L[j], 0)
    return out


class Target:
    """Signed distance to a set of meshes (world space, metres)."""

    def __init__(self, objs):
        verts, polys = [], []
        dg = bpy.context.evaluated_depsgraph_get()
        for o in objs:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            mw = o.matrix_world
            off = len(verts)
            verts += [mw @ v.co for v in me.vertices]
            polys += [[off + i for i in p.vertices] for p in me.polygons]
            ev.to_mesh_clear()
        self.bvh = BVHTree.FromPolygons(verts, polys)

    def sdist(self, p):
        loc, nrm, _, d = self.bvh.find_nearest(p)
        if loc is None:
            return 1.0
        return d if (p - loc).dot(nrm) >= 0 else -d


def _samples(L, w, t, tip):
    pts = []
    for fy in (0.25, 0.55, 0.85):
        for fx in (-0.33, 0.0, 0.33):
            pts.append(Vector((fx * w, fy * L, -t * 0.47)) * MM)
    if tip:
        pts += [Vector((0, L + t * 0.1, -t * 0.15)) * MM, Vector((0, L, -t * 0.4)) * MM]
    return pts


def solve(world, base, spec, lo, hi, target, squeeze=0.4):
    """Curl a 3-joint finger until it grips. Returns the three joint angles."""
    L, w, t = spec["L"], spec["w"], spec["t"]
    ang = list(lo)
    locked = 0
    rate = [(h - l) / 120.0 for l, h in zip(lo, hi)]
    samples = [_samples(L[j], w, t, j == 2) for j in range(3)]

    def hit():
        frames = chain(base, L, ang)
        for j in range(locked, 3):
            m = world @ frames[j]
            for s in samples[j]:
                if target.sdist(m @ s) < -squeeze * MM:
                    return j
        return None

    if target is None:
        return ang
    for _ in range(240):
        prev = list(ang)
        moved = False
        for j in range(locked, 3):
            if ang[j] < hi[j]:
                ang[j] = min(hi[j], ang[j] + max(rate[j], 0.2))
                moved = True
        if not moved:
            break
        k = hit()
        if k is not None:
            ang = prev
            # Freeze the touching segment and everything before it.
            locked = k + 1
            if locked >= 3:
                break
    return ang


# --- meshes ------------------------------------------------------------------

def _phalanx(name, L, w, t, tip, mats):
    """Tapered glove with a crowned overlapping dorsal plate; joints stay exposed."""
    sections = []
    for y, scale in ((-1, .86), (3, 1), (L-4, .91), (L+2, .65 if tip else .84)):
        sections.append([(x,y,z) for x,z in geo.rrect(w*scale,t*scale,min(w,t)*.4*scale,2)])
    parts = [geo.loft(name+'_glove', sections, mats['fabric'])]
    # A folded plate wraps the dorsal corners instead of a white rectangular cap.
    sections=[]
    for y, scale in ((3,.81), (6,1), (L-4,.87)):
        profile=[(-w*.43, t*.22),(-w*.38,t*.56),(-w*.22,t*.66),
                 (w*.22,t*.66),(w*.38,t*.56),(w*.43,t*.22),
                 (w*.32,t*.36),(-w*.32,t*.36)]
        sections.append([(x*scale,y,z) for x,z in profile])
    plate=geo.loft(name+'_armour',sections,mats['graphite'] if tip else mats['ceramic'])
    geo.bevel(plate,.65,1,35)
    parts.append(plate)
    # Transverse dark hinge, separated from both adjacent ceramic edges.
    parts.append(geo.tube(name+'_hinge',t*.43,-w*.41,w*.41,'X',(0,0),10,mat=mats['rubber']))
    # One dark inset on the proximal plate reads as a real plate attachment.
    if L > 32:
        parts.append(geo.cbox(name+'_inset',(w*.48,1.5,.65),(0,8,t*.66+.1),c=.15,mat=mats['frame']))
    return parts


def _palm(mats, side):
    """A soft palm, two floating metacarpal plates, four knuckles and wrist seal."""
    parts=[]
    secs=[]
    for y,sx,sz in ((-58,.78,.8),(-46,.92,.95),(0,1,1),(42,1,.92),(50,.96,.78)):
        secs.append([(x,y,z) for x,z in geo.rrect(90*sx,33*sz,11*min(sx,sz),3,cy=-1.5)])
    parts.append(geo.loft('palm_core',secs,mats['fabric']))
    # Separate pressure pads follow the palm creases; the heel no longer
    # presents one smooth black rectangle above the wrist in first person.
    for y,width in ((-27,61),(-3,71),(21,65)):
        parts.append(geo.cbox('palm_pad',(width,20,4),(2,y,-17.7),c=2,mat=mats['rubber']))
    # Split along the metacarpals; a dark tendon channel and glove surround stay visible.
    for sx in (-1,1):
        profile=[(-29,-36),(-5,-43),(1,-30),(2,23),(-9,34),(-33,27),(-37,4)]
        profile=[(sx*(x+38),y) for x,y in profile]
        plate=geo.prism('hand_dorsal',profile,'Z',15,24,2,mats['ceramic'])
        geo.bevel(plate,.8,1,35)
        parts.append(plate)
    # Orange status inset is set into a graphite carrier, below the dorsal surface.
    parts.append(geo.cbox('hand_channel',(6,46,3),(0,-3,20),c=.5,mat=mats['frame']))
    parts.append(geo.cbox('hand_status',(1.7,38,1),(0,-3,21.6),c=.2,mat=mats['orange']))
    for fname,f in FINGERS.items():
        x,y,z=f['at']
        guard=geo.cbox('knuckle_'+fname,(f['w']*.85,17,7),(x,y-6,18.5),c=2,mat=mats['ceramic'])
        geo.bevel(guard,.7,1,35)
        parts.append(guard)
    for x,y in ((-27,-28),(27,-28),(-26,22),(26,22)):
        parts.append(geo.screw('hand_fastener',(x,y,24),(0,0,1),r=1.7,h=.6,mat=mats['steel'],segs=8))
    # A closed flexible liner fills the seal even when the independent elbow
    # bends the forearm away from the palm axis. No hollow ring is exposed.
    liner=[]
    for y,w,h in ((-52,59,43),(-65,65,48),(-78,64,46),(-91,56,40)):
        liner.append([(x,y,z-2) for x,z in geo.rrect(w,h,12,3)])
    parts.append(geo.loft('wrist_liner',liner,mats['fabric']))
    # Compressed accordion wrist fabric and an open oval armour ring.
    for y in (-61,-66,-71,-76):
        cuff=geo.tube('wrist_bellows',31,y,y+2.5,'Y',(0,-2),16,r_in=27,mat=mats['rubber'])
        cuff.data.transform(Matrix.Diagonal((1.1,1,.78,1)))
        parts.append(cuff)
    cuff=geo.tube('wrist_ring',34,-85,-77,'Y',(0,-2),16,r_in=29,mat=mats['graphite'])
    cuff.data.transform(Matrix.Diagonal((1.1,1,.8,1)))
    geo.bevel(cuff,.65,1,35)
    parts.append(cuff)
    return parts


def _forearm(mats, length):
    """Separate ceramic and graphite lames over a visible ribbed pressure sleeve."""
    parts=[]
    stations=[(0,30,23),(-40,36,28),(-length*.45,45,37),(-length*.8,46,40),(-length,42,38)]
    def radii(y):
        for (y0,a,b),(y1,c,d) in zip(stations,stations[1:]):
            if y1<=y<=y0:
                t=(y-y0)/(y1-y0)
                return a+(c-a)*t,b+(d-b)*t
        return 42,38
    sections=[[(a*math.cos(i*math.tau/20),y,b*math.sin(i*math.tau/20)) for i in range(20)] for y,a,b in stations]
    parts.append(geo.loft('forearm_suit',sections,mats['fabric']))
    # Broad flat crown with sloping sides: recognisable armour, no white tube.
    profile=[(-.95,.26),(-.8,.74),(-.43,1.09),(.43,1.09),(.8,.74),(.95,.26)]
    for index,(start,end) in enumerate(((.14,.32),(.40,.61),(.72,.86))):
        sections=[]
        for frac,scale in ((start,.95),(start+.025,1),(end-.025,1),(end,.94)):
            y=-length*frac
            a,b=radii(y)
            # The middle plate is narrower, leaving the sleeve visible on both
            # sides instead of making three identical lengths of a white tube.
            width = .82 if index == 1 else 1
            outer=[(a*x*scale*width,y,b*z+4) for x,z in profile]
            inner=[(a*x*scale*width,y,b*z+.7) for x,z in reversed(profile)]
            sections.append(outer+inner)
        shell=geo.loft('vambrace_lame_'+str(index),sections,
                       mats['graphite'] if index == 2 else mats['ceramic'])
        # A real negative channel and dark bed make the orange line recessed.
        cut_sections=[]
        for frac in (start-.01,start+.025,end-.025,end+.01):
            y=-length*frac; a,b=radii(y); z=b*1.09+4
            cut_sections.append([(8.5,y,z-2.8),(13.5,y,z-2.8),(13.5,y,z+3),(8.5,y,z+3)])
        cutter=geo.loft('status_recess',cut_sections)
        geo.cut(shell,cutter)
        geo.bevel(shell,.8,1,35)
        parts.append(shell)
        trim=[]
        for frac in (start+.02,end-.02):
            y=-length*frac
            a,b=radii(y)
            z=b*1.09+2.6
            trim.append([(8.5,y,z-1),(13.5,y,z-1),(13.5,y,z),(8.5,y,z)])
        parts.append(geo.loft('status_channel',trim,mats['frame']))
        line=[[(10.1,y,z+1.12),(11.9,y,z+1.12),(11.9,y,z+1.42),(10.1,y,z+1.42)] for (x,y,z),*rest in trim]
        parts.append(geo.loft('recessed_orange',line,mats['orange']))
        for frac in (start+.055,end-.05):
            y=-length*frac; a,b=radii(y)
            for x in (-a*.32,a*.32):
                parts.append(geo.screw('lame_fastener',(x,y,b*1.09+4),(0,0,1),r=1.8,h=.65,mat=mats['steel'],segs=8))
    # A pair of flexible tendon straps remains visible in each armour gap.
    for frac in (.36,.665):
        y=-length*frac; a,b=radii(y)
        for x in (-a*.58,a*.58):
            parts.append(geo.cbox('tendon_strap',(8,13,2),(x,y,b*.92),c=.5,mat=mats['rubber']))
    # Raised cloth seams and rubber flex ribs remain visible between the plates.
    # These are transverse to the arm, breaking the old continuous pipe silhouette.
    for frac in (.045,.075,.105,.345,.37,.64,.67,.695,.90,.93):
        y=-length*frac; a,b=radii(y)
        rib=geo.tube('sleeve_flex',a+1.2,y-1.2,y+1.2,'Y',(0,0),16,
                     r_in=a-1,mat=mats['rubber'])
        rib.data.transform(Matrix.Diagonal((1,1,b/a,1)))
        parts.append(rib)
    # Dark side spar with a vent stack, inset so it belongs to the shell.
    side=geo.cbox('vambrace_spar',(7,length*.48,24),(43,-length*.54,4),c=1.8,mat=mats['graphite'])
    parts.append(side)
    for i in range(5):
        parts.append(geo.cbox('spar_vent',(1,3,14),(47,-length*.43-i*9,4),c=.3,mat=mats['rubber']))
    # Elbow cuff is a separate dark seal with a small ceramic dorsal tab.
    cuff=geo.tube('elbow_cuff',43,-length+5,-length+20,'Y',(0,0),20,r_in=38,mat=mats['frame'])
    cuff.data.transform(Matrix.Diagonal((1.05,1,.93,1)))
    geo.bevel(cuff,1,1,35)
    parts.append(cuff)
    parts.append(geo.cbox('cuff_latch',(25,24,8),(0,-length+13,39),c=2,mat=mats['ceramic']))
    cap=geo.lathe('elbow_cap',[(0,0),(39,0),(41,-10),(36,-26),(24,-36),(0,-39)],'Y',20,(0,0),mats['graphite'])
    geo.place(cap,(0,-length+6,0))
    parts.append(cap)
    return parts


def build(name, pose, mats):
    """Build one posed gauntlet as a single mesh object with its origin at the palm centre."""
    side = pose.get("side", "r")
    S = Matrix.Diagonal((-1 if side == "l" else 1, 1, 1, 1))
    world = Matrix.Translation(Vector(pose["palm"][0]) * MM) @ palm_rotation(pose["palm"][1]) @ S

    def tgt(names):
        objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
        return Target(objs) if objs else None

    default_t = tgt(pose.get("targets", []))
    parts = []  # (object, matrix in hand frame)

    for fname, spec in FINGERS.items():
        fp = pose.get("fingers", {}).get(fname, {})
        base = T(*spec["at"]) @ rz(-fp.get("spread", 0)) @ rx(-fp.get("bend", 0))
        target = tgt(fp["targets"]) if "targets" in fp else default_t
        lo = fp.get("lo", (8, 8, 4))
        hi = fp.get("hi", (88, 100, 75))
        ang = solve(world, base, spec, lo, hi, target, fp.get("squeeze", 0.4))
        frames = chain(base, spec["L"], ang)
        for j in range(3):
            for ob in _phalanx(f"{fname}{j}", spec["L"][j], spec["w"] * (1 - 0.04 * j), spec["t"] * (1 - 0.05 * j),
                               j == 2, mats):
                parts.append((ob, frames[j]))

    th = pose.get("thumb", {})
    tb = T(*THUMB["at"]) @ rot(th.get("rot", (0, 0, 0))).to_4x4()
    target = tgt(th["targets"]) if "targets" in th else default_t
    ang = solve(world, tb, THUMB, th.get("lo", (0, 6, 4)), th.get("hi", (25, 70, 70)), target, 0.4)
    frames = chain(tb, THUMB["L"], ang)
    for j in range(3):
        if j == 0:
            # The thumb's first segment is the fleshy base; a fat soft segment with a plate.
            seg = geo.loft("thumb0", [[(x, y, z) for x, z in geo.rrect(THUMB["w"] * s, THUMB["t"] * s, 9 * s, 3)]
                                      for y, s in ((-8, 1.15), (6, 1.12), (THUMB["L"][0] - 6, 1.0), (THUMB["L"][0] + 2, 0.88))],
                           mats["fabric"])
            pl = geo.cbox("thumb0p", (THUMB["w"] * 0.8, THUMB["L"][0] * 0.62, 3.6),
                          (0, THUMB["L"][0] * 0.5, THUMB["t"] * 0.5 + 1.0), c=1.2, mat=mats["ceramic"])
            geo.bevel(pl, 0.5, 2, 30)
            parts += [(seg, frames[0]), (pl, frames[0])]
        else:
            for ob in _phalanx(f"thumb{j}", THUMB["L"][j], THUMB["w"] * (1 - 0.05 * j), THUMB["t"] * (1 - 0.05 * j),
                               j == 2, mats):
                parts.append((ob, frames[j]))

    for ob in _palm(mats, side):
        parts.append((ob, Matrix.Identity(4)))

    wp, wy, wr = pose.get("wrist", (0, 0, 0))
    fm = T(0, PALM["y0"] - 12, 0) @ rz(wy) @ rx(wp) @ ry(wr)
    if "elbow" in pose:
        # Keep the palm wrapped across the grip while the forearm returns to
        # the player. A wrist-relative Euler rotation couples those two poses.
        wrist_world = world @ fm.to_translation()
        toward_wrist = (wrist_world - Vector(pose["elbow"]) * MM).normalized()
        outward = Vector(pose.get("bracer_up", (0, -0.3, 1)))
        outward = (outward - toward_wrist * outward.dot(toward_wrist)).normalized()
        across = toward_wrist.cross(outward)
        basis = Matrix((across, toward_wrist, outward)).transposed().to_4x4()
        forearm_world = Matrix.Translation(wrist_world) @ basis
        fm = world.inverted() @ forearm_world
    for ob in _forearm(mats, pose.get("forearm", 270)):
        parts.append((ob, fm))

    # Move raw parts (and their boolean cutters) into place before the
    # modifiers run, so bevels and normals come out right on the mirrored hand.
    objs = []
    moved = set()
    for ob, m in parts:
        full = world @ m
        for md in ob.modifiers:
            if md.type == "BOOLEAN" and md.object.name not in moved:
                md.object.data.transform(full)
                if full.determinant() < 0:
                    md.object.data.flip_normals()
                moved.add(md.object.name)
        ob.data.transform(full)
        if full.determinant() < 0:
            ob.data.flip_normals()
        geo.apply_mods(ob)
        objs.append(ob)
    arm = geo.join(objs, name)
    # Origin at the palm centre so the engine can swing the whole arm from there.
    pivot = world.to_translation()
    arm.data.transform(Matrix.Translation(-pivot))
    arm.location = pivot
    return arm
