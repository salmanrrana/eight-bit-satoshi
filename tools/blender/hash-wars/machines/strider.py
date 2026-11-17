"""STRIDER: two-legged Cartel walker, about 2.4 m tall.

Bird-like: a pearl teardrop hull carried high on reverse-knee legs, the arc
caster slung under its nose, one cyan sensor slit wrapped round the nose,
a glowing radiator (its weak point, `vent_0`) and two swept tail blades at
the back so its facing reads from far away.

Model coords (left, forward, up); `_l` legs are on +X (the machine's left).
Change a dimension below and rebuild:  blender ... -P build.py -- strider
"""
import math
from mathutils import Matrix, Vector

from lib import (P, box, cyl, rod_between, sphere, loft, smooth_sections, cut_gap, kill_faces, repaint,
                 panels, tube, bolts, ring_points, piston, mirror_x, node, empty, seg_frame, framed,
                 down_loft, length, rot, moved, xform, annulus)

NAME = 'strider'
CONFIG = dict(
    tex=2048, budget=30000, lod_ratio=0.34,
    ao_dist=0.5, edge_dist=0.012, cav_dist=0.045, edge_gain=1.45, bevel_r=0.006,
    dust_h=0.75, dust_h0=0.0, dust_col=(0.16, 0.14, 0.12),
    heat=[((0.0, -0.93, 2.06), 0.48)],
    render=dict(lift=0.0, focus=1.3, size=2.4),
)

# --- dimensions (metres) -------------------------------------------------------
HIP = (0.46, 0.00, 1.50)     # left hip pivot (thigh rotates about X here)
KNEE = (0.50, -0.36, 0.98)   # knee axis BEHIND the hip: a reverse (bird) knee
ANKLE = (0.50, 0.12, 0.17)   # ankle axis, forward again under the chest
HULL_Z = 1.92                # hull centre height
GUN = (0.0, 0.62, 1.62)      # gun mount pivot (pitch about X)
VENT = (0.0, -0.93, 2.06)    # tail exhaust radiator centre (weak point)
VISOR_Z = 1.87               # sensor slit height at the nose

# hull key sections: (forward, centre z, half width, half height top, half height bottom, superellipse n)
# mass forward (chest and beak), tapering up into a tail that ends in the hot exhaust
HULL = [
    (-0.90, 2.07, 0.13, 0.10, 0.10, 2.4),
    (-0.78, 2.04, 0.22, 0.15, 0.13, 2.8),
    (-0.50, 1.99, 0.36, 0.24, 0.22, 3.4),
    (-0.10, 1.94, 0.44, 0.30, 0.27, 3.6),
    (0.25, 1.90, 0.42, 0.28, 0.26, 3.6),
    (0.55, 1.87, 0.32, 0.20, 0.20, 3.2),
    (0.82, 1.83, 0.18, 0.11, 0.12, 2.8),
    (1.02, 1.81, 0.05, 0.04, 0.045, 2.2),
]


def inset(sections, d):
    return [(f*.96, z, max(w - d, 0.01), max(t - d, 0.01), max(b - d, 0.01), n) for f, z, w, t, b, n in sections]


def hull_parts():
    secs = smooth_sections(HULL, 3)
    shell = loft(secs, 'pearl', segs=36)
    # visor slot wrapping the nose, seams fore and aft, a dorsal hatch, chrome belly
    cut_gap(shell, (0, 0, VISOR_Z), (0, 0, 1), 0.045, region=lambda c: c.y > 0.45)
    cut_gap(shell, (0, 0.42, 0), (0, 1, 0), 0.014)
    cut_gap(shell, (0, -0.52, 0), (0, 1, 0), 0.014)
    for s in (1, -1):
        cut_gap(shell, (0.16 * s, 0, 0), (1, 0, 0), 0.012, region=lambda c: c.z > 2.08 and -0.52 < c.y < 0.42)
    cut_gap(shell, (0, 0, 1.76), (0, 0, 1), 0.012, region=lambda c: c.y < 0.42)
    for gz in (1.95, 1.99, 2.03):  # cooling gills on both flanks
        cut_gap(shell, (0, 0, gz), (0, 0, 1), 0.016, region=lambda c: abs(c.x) > 0.3 and -0.05 < c.y < 0.30)
    kill_faces(shell, lambda c: c.y < -0.86)  # open tail: the exhaust sits there
    repaint(shell, 'chrome', lambda c: c.z < 1.76 and c.y < 0.42)  # dark chrome belly
    repaint(shell, 'chrome', lambda c: c.y > 0.42 and c.z < VISOR_Z)  # dark chin under the slit
    repaint(shell, 'pearl2', lambda c: c.y < -0.52)
    repaint(shell, 'chrome', lambda c: c.y < -0.70)  # heat-darkened tail ring
    panels(shell, 0.022, 0.006)
    core = loft(inset(secs, 0.026), 'carbon', segs=28)
    parts = [shell, core]
    # dorsal spine and sensor mast
    parts.append(box((0.05, 0.80, 0.035), (0, -0.05, 2.245), 'chrome', bevel=0.012))
    parts.append(rod_between((0.0, 0.10, 2.24), (0.0, 0.02, 2.40), 0.008, 'steel'))
    parts.append(sphere(0.014, (0.0, 0.02, 2.40), 'glass', segs=10, rings=6))
    # swept tail blades (silhouette: which way it faces)
    for s in (1, -1):
        b = box((0.03, 0.50, 0.08), (0, 0, 0), 'chrome', bevel=0.012)
        xform(b, rot('x', 30).to_4x4())
        xform(b, rot('f', 24 * s).to_4x4())
        xform(b, Matrix.Translation(P(0.15 * s, -0.78, 2.22)))
        parts.append(b)
    # chin mount for the gun
    parts.append(box((0.16, 0.24, 0.12), (0, GUN[1] - 0.02, GUN[2] + 0.11), 'gunmetal', bevel=0.02))
    # hip pylons: carbon struts from the belly to the hip bearings
    for s in (1, -1):
        parts.append(box((0.12, 0.34, 0.10), (0.20 * s, 0.0, 1.66), 'gunmetal', bevel=0.02))
        parts.append(cyl(0.085, 0.05, (0.27 * s, 0.0, 1.605), 'steel', axis='z', segs=24, bevel=0.006))
    # underside cable bundle into the hips
    for s in (1, -1):
        parts.append(tube([(0.05 * s, 0.25, 1.60), (0.12 * s, 0.10, 1.57), (0.22 * s, -0.05, 1.56),
                           (0.30 * s, -0.10, 1.53)], 0.014, 'rubber', segs=8))
    parts += bolts([(0.27, f, 1.61) for f in (-0.14, 0.14)] + [(-0.27, f, 1.61) for f in (-0.14, 0.14)],
                   (0, 0, -1), 0.009)
    return parts


def sensor_parts():
    """The single cyan slit: a glowing strip following the core under the visor slot."""
    pts = []
    for k in range(-10, 11):
        a = k / 10 * 1.2
        pts.append((math.sin(a) * 0.17, 0.62 + math.cos(a) * 0.38, VISOR_Z))
    return [tube(pts, 0.011, 'sensor', segs=6, smooth=1)]


def vent_parts():
    """Tail exhaust radiator: a round cowl, radial fins over a glowing heat core.
    Reads as 'the back' from any distance, and it is the weak point."""
    x, f, z = VENT
    parts = [annulus(0.15, 0.108, 0.16, (x, f + 0.02, z), 'gunmetal', axis='f', segs=28),
             annulus(0.165, 0.115, 0.035, (x, f - 0.06, z), 'chrome', axis='f', segs=28),
             cyl(0.112, 0.012, (x, f - 0.045, z), 'heat', axis='f', segs=24, bevel=0.0)]
    for k in range(8):
        a = k * math.pi / 4
        fin = box((0.012, 0.05, 0.11), (x, f - 0.085, z + 0.055), 'gunmetal', bevel=0.003)
        parts += moved([fin], rot('f', math.degrees(a)), (x, f, z))
    parts.append(cyl(0.03, 0.06, (x, f - 0.08, z), 'gunmetal', axis='f', segs=12, bevel=0.004))
    return parts


def hip_parts():
    """Left hip: rotary bearing under the pylon and the big hip hub."""
    hx, hf, hz = HIP
    parts = [
        cyl(0.075, 0.05, (0.27, 0.0, 1.56), 'gunmetal', axis='z', segs=24, bevel=0.006),
        box((0.12, 0.18, 0.12), (0.32, 0.0, 1.50), 'gunmetal', bevel=0.02),
        cyl(0.12, 0.10, (hx - 0.07, hf, hz), 'carbon', axis='x', segs=28, bevel=0.01),
        cyl(0.13, 0.025, (hx - 0.12, hf, hz), 'chrome', axis='x', segs=28, bevel=0.006),
    ]
    parts += bolts(ring_points((hx - 0.135, hf, hz), 0.095, 8), (-1, 0, 0), 0.008)
    return parts


def thigh_parts():
    """Left thigh, built in its own frame running down to the knee."""
    L = length(HIP, KNEE)
    loc = []
    # pearl armour: thick at the top, tapering, with a carbon inner side
    secs = smooth_sections([
        (-0.04, 0.00, 0.07, 0.12, 0.10, 3.0),
        (0.10, 0.03, 0.09, 0.16, 0.12, 3.4),
        (0.38, 0.03, 0.075, 0.12, 0.09, 3.2),
        (L - 0.10, 0.00, 0.055, 0.075, 0.065, 2.8),
        (L - 0.03, 0.00, 0.035, 0.045, 0.045, 2.2),
    ], 2)
    arm = down_loft([(f, z, w, t, b, n, 0.03) for f, z, w, t, b, n in secs], 'pearl', segs=16)
    repaint(arm, 'pearl2', lambda c: c.y < -0.03)  # darker back half: two-tone, less toy-white
    cut_gap(arm, (0, 0, -0.30), (0, 0, 1), 0.012)
    panels(arm, 0.016, 0.004)
    loc.append(arm)
    loc.append(down_loft([(f, z, w * 0.75, t * 0.8, b * 0.8, n, 0.03) for f, z, w, t, b, n in secs], 'carbon',
                         segs=12))
    # hub cap at the top (outside face)
    loc.append(cyl(0.125, 0.07, (0.03, 0, 0), 'gunmetal', axis='x', segs=28, bevel=0.01))
    loc.append(cyl(0.08, 0.02, (0.075, 0, 0), 'chrome', axis='x', segs=24, bevel=0.005))
    loc += bolts(ring_points((0.087, 0, 0), 0.06, 6), (1, 0, 0), 0.007)
    # knee clevis plates either side of the knee hub
    for dx in (-0.07, 0.07):
        loc.append(box((0.022, 0.15, 0.17), (0.03 + dx, 0, -L + 0.03), 'gunmetal', bevel=0.008))
    # actuator down the back, cable down the inner side
    loc += piston((0.03, -0.14, -0.08), (0.03, -0.11, -L + 0.12), 0.026)
    loc.append(tube([(-0.05, 0.02, -0.02), (-0.06, 0.07, -0.20), (-0.055, 0.06, -0.45), (-0.05, 0.0, -L + 0.06)],
                    0.011, 'rubber', segs=8))
    for z in (-0.18, -0.40):
        loc.append(box((0.03, 0.03, 0.025), (-0.055, 0.065, z), 'steel', bevel=0.004))
    return framed(loc, seg_frame(HIP, KNEE))


def shin_parts():
    """Left shin from the knee hub back and down to the ankle."""
    L = length(KNEE, ANKLE)
    loc = [cyl(0.085, 0.12, (0.03, 0, 0), 'steel', axis='x', segs=28, bevel=0.008),
           cyl(0.06, 0.15, (0.03, 0, 0), 'gunmetal', axis='x', segs=20, bevel=0.006)]
    loc += bolts(ring_points((0.03 + 0.077, 0, 0), 0.055, 6), (1, 0, 0), 0.006)
    secs = smooth_sections([
        (0.05, 0.0, 0.05, 0.07, 0.07, 2.6),
        (0.25, 0.0, 0.045, 0.06, 0.055, 2.6),
        (L - 0.15, 0.0, 0.035, 0.045, 0.045, 2.4),
        (L - 0.03, 0.0, 0.03, 0.04, 0.04, 2.2),
    ], 3)
    loc.append(down_loft([(f, z, w, t, b, n, 0.03) for f, z, w, t, b, n in secs], 'chrome', segs=20))
    # pearl shin guard on the forward face
    guard = down_loft([(0.10, 0.045, 0.06, 0.05, 0.02, 3.0, 0.03), (0.35, 0.05, 0.055, 0.045, 0.02, 3.0, 0.03),
                       (0.62, 0.035, 0.04, 0.03, 0.015, 2.6, 0.03)], 'pearl', segs=20, cap=True)
    loc.append(guard)
    loc += piston((0.03, -0.075, -0.10), (0.03, -0.06, -L + 0.12), 0.018)
    for dx in (-0.055, 0.055):
        loc.append(box((0.018, 0.10, 0.12), (0.03 + dx, 0, -L + 0.02), 'gunmetal', bevel=0.006))
    return framed(loc, seg_frame(KNEE, ANKLE))


def foot_parts():
    """Left foot: ankle hub, three splayed toes and a rear spur, rubber pads on the ground."""
    ax, af, az = ANKLE
    parts = [cyl(0.062, 0.09, (ax, af, az), 'steel', axis='x', segs=24, bevel=0.006),
             box((0.12, 0.16, 0.08), (ax, af + 0.02, az - 0.06), 'gunmetal', bevel=0.02)]
    for ang, ln in ((-28, 0.32), (0, 0.38), (28, 0.32)):
        r = rot('z', ang)
        toe = [box((0.055, ln, 0.05), (ax, af + 0.05 + ln / 2, 0.055), 'chrome', bevel=0.015),
               box((0.065, ln * 0.55, 0.03), (ax, af + 0.08 + ln * 0.6, 0.015), 'rubber', bevel=0.008),
               box((0.05, 0.06, 0.06), (ax, af + 0.05 + ln, 0.04), 'pearl', bevel=0.018)]
        parts += moved(toe, r, (ax, af, 0))
    parts.append(box((0.05, 0.16, 0.05), (ax, af - 0.10, 0.04), 'chrome', bevel=0.014, rot=rot('x', -12)))
    parts.append(box((0.06, 0.06, 0.03), (ax, af - 0.16, 0.015), 'rubber', bevel=0.008))
    return parts


def gun_parts():
    """Arc caster in the nose: pearl teardrop shell, cyan core, three prongs."""
    gx, gf, gz = GUN
    shell = loft(smooth_sections([
        (gf - 0.10, gz, 0.04, 0.04, 0.04, 2.0),
        (gf + 0.02, gz, 0.085, 0.085, 0.08, 2.2),
        (gf + 0.22, gz, 0.09, 0.09, 0.085, 2.2),
        (gf + 0.42, gz, 0.065, 0.065, 0.06, 2.1),
        (gf + 0.52, gz, 0.04, 0.04, 0.04, 2.0),
    ], 2), 'pearl', segs=24)
    repaint(shell, 'chrome', lambda c: c.y < gf + 0.04)
    cut_gap(shell, (0, 0, gz), (1, 0, 0), 0.03, region=lambda c: gf + 0.05 < c.y < gf + 0.38)
    panels(shell, 0.012, 0.003)
    parts = [shell,
             loft([(gf - 0.05, gz, 0.05, 0.05, 0.05, 2), (gf + 0.45, gz, 0.045, 0.045, 0.045, 2)], 'charge', segs=16),
             cyl(0.05, 0.08, (gx, gf, gz + 0.06), 'gunmetal', axis='x', segs=20, bevel=0.006),
             annulus(0.044,0.026,0.026,(gx,gf+0.53,gz),'gunmetal',axis='f',segs=20),
             cyl(0.024,0.008,(gx,gf+0.535,gz),'charge',axis='f',segs=20,bevel=0.0)]
    for k in range(3):
        a = math.radians(90 + k * 120)
        y, z = math.cos(a) * 0.05, math.sin(a) * 0.05
        parts.append(rod_between((y, gf + 0.45, gz + z), (y * 1.3, gf + 0.66, gz + z * 1.3), 0.011, 'chrome', segs=8,
                                 r2=0.006))
    return parts


def build():
    root = empty(NAME, (0, 0, 0))
    body = node('body', hull_parts(), (0, 0, HULL_Z), root)
    vent = node('vent_0', vent_parts(), VENT, body)
    gun = node('gun', gun_parts(), GUN, body)
    muzzle = empty('muzzle', (0, GUN[1] + 0.66, GUN[2]), gun)
    node('sensor', sensor_parts(), (0, 0.98, VISOR_Z), body)
    legs = {}
    for side, s in (('l', 1), ('r', -1)):
        def m(parts):
            return parts if s == 1 else mirror_x(parts)
        hip_p = (HIP[0] * s, HIP[1], HIP[2])
        knee_p = (KNEE[0] * s, KNEE[1], KNEE[2])
        ankle_p = (ANKLE[0] * s, ANKLE[1], ANKLE[2])
        hip = node('hip_' + side, m(hip_parts()), hip_p, body)
        thigh = node('thigh_' + side, m(thigh_parts()), hip_p, hip)
        shin = node('shin_' + side, m(shin_parts()), knee_p, thigh)
        foot = node('foot_' + side, m(foot_parts()), ankle_p, shin)
        legs[side] = dict(hip=hip_p, knee=knee_p, ankle=ankle_p, sole_z=0.0,
                          thigh=round(length(HIP, KNEE), 4), shin=round(length(KNEE, ANKLE), 4))
    return dict(root=root, legs=legs, axes=dict(hip='y (yaw), z (roll)', thigh='x', shin='x', foot='x'),
                knee='knee behind hip (-Z), ankle forward; flexion about +X', weak=['vent_0'],
                extra={'sim_centre_y':1.35,'sim_radius':.65,'sim_height':2.4})
