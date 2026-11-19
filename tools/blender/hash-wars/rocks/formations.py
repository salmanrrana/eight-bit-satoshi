"""Route-scale lava formations and shore-polished step crowns."""
import math
import random

import columns as C


def face(mesh, a, b, c, uv):
    normal = C.norm(C.cross(C.sub(b, a), C.sub(c, a)))
    mesh.tri(*((p, normal, uv(p)) for p in (a, b, c)))


def soften(mesh):
    """Blend across small changes of plane. Keep fractured lips and sharp beds."""
    corners = {}
    for i, p in enumerate(mesh.p):
        corners.setdefault(p, []).append(i)
    normals = list(mesh.n)
    for copies in corners.values():
        planes = list(dict.fromkeys(normals[i] for i in copies))
        for i in copies:
            n = normals[i]
            near = [p for p in planes if C.dot(p, n) > .66]
            combined = tuple(sum(p[axis] for p in near) for axis in range(3))
            mesh.n[i] = C.norm(C.add(C.mul(n, .42), C.mul(C.norm(combined), .58)))


# Each pair is the height and depth of a break in the exposed face. Closely
# spaced pairs form projecting lips, with broad faces and recessed beds between.
PROFILES = {
    'lava_bank': [(0., -.46), (.17, -.49), (.39, -.30), (.43, -.35),
                  (.60, -.25), (.67, -.07), (.70, -.11), (.91, .11), (1., .29)],
    'cut_gorge': [(0., -.24), (.18, -.49), (.34, -.44), (.39, -.26),
                  (.44, -.29), (.59, -.25), (.64, -.01), (.67, -.07),
                  (.84, .10), (.90, .27), (.94, .24), (1., .36)],
    'fins_bank': [(0., -.47), (.18, -.47), (.55, -.30), (.58, -.34),
                  (.93, -.11), (1., .025)],
    'summit_ridge': [(0., -.49), (.24, -.43), (.31, -.28), (.36, -.34),
                     (.56, -.13), (.62, -.21), (.83, .04), (.91, .20), (1., .35)],
}


def escarpment(kind, seed, lod):
    """A rock face with sloping ledges and multiple ridges along strike."""
    profile = PROFILES[kind]
    fins = kind == 'fins_bank'
    shore_cut = kind == 'cut_gorge'
    width = 16.
    depth = 14.
    height = 38. if shore_cut else 27.
    rng = random.Random(seed)
    samples = 21 if fins else 17
    xs = [-.5] + [(i / (samples - 1) - .5) + rng.uniform(-.025, .025)
                   for i in range(1, samples - 1)] + [.5]
    broad = [C.vnoise(x * 3.2, .1, seed) - .5 for x in xs]
    teeth = [rng.uniform(-1., 1.) for _ in xs]
    if fins:
        # Thin, asymmetric ribs break away above the same thick lower bed.
        teeth = [v * (.9 if i % 3 else .5) + (.7 if i % 3 == 1 else -.55)
                 for i, v in enumerate(teeth)]
    if not lod:
        # Midpoints carry smaller broken edges on top of the metre-scale ribs.
        def mids(values):
            return [v for a, b in zip(values, values[1:])
                    for v in (a, a * .45 + b * .55)] + [values[-1]]
        xs, broad, teeth = (mids(v) for v in (xs, broad, teeth))

    mesh = C.Mesh()
    beds = []
    for j, ((h, offset), (next_h, next_offset)) in enumerate(zip(profile, profile[1:])):
        beds.append((h, offset, j))
        if not lod and next_h - h > .065:
            beds.append(((h + next_h) * .5, (offset + next_offset) * .5, j + .5))
    beds.append((*profile[-1], len(profile) - 1))
    rows = []
    for row, (h, offset, bed) in enumerate(beds):
        line = []
        for x, bank, tooth in zip(xs, broad, teeth):
            rock_strike = .055 * math.sin(x * 7. + seed)
            dip = x * (.11 if fins else .085) + bank * .13
            erosion = tooth * (.085 if fins else .048) + bank * .27
            spall = (C.vnoise(x * 23., h * 17., seed + 3) - .5) * (.039 if lod else .065)
            y = offset + erosion * (.55 + .45 * h) + .035 * math.sin(bed * 1.7 + x * 8. + seed)
            ridge = (tooth * (.13 if fins else .045) + rock_strike) * h ** 3
            end = (max(0., abs(x) - .32) / .18) ** 2
            y += end * (.18 if fins else .12)
            z = max(0., h * (1. + dip) + ridge + spall * .38) if row else 0.
            lean = h * (bank * .06 + (0.11 if fins else .045) * math.cos(seed))
            line.append(((x * (1. - .05 * h) + lean) * width,
                         min(.49, y + spall) * depth, z * height))
        rows.append(line)

    def side_uv(p):
        return (.11 + p[0] * .021, (p[2] + p[1] * .25) / 4.)

    def top_uv(p):
        return C.top_uv(seed % 4, (p[0] % 4. - 2.) * .19, (p[1] % 4. - 2.) * .19, 1.)

    for j, (lower, upper) in enumerate(zip(rows, rows[1:])):
        for i in range(len(xs) - 1):
            a, b, c, d = lower[i], lower[i + 1], upper[i + 1], upper[i]
            if (i + j) % 2:
                face(mesh, a, b, d, side_uv)
                face(mesh, b, c, d, side_uv)
            else:
                face(mesh, a, b, c, side_uv)
                face(mesh, a, c, d, side_uv)

    # Behind the broken crown, rock closes into the existing hillside.
    back = [[(p[0], depth * .55, p[2]) for p in row] for row in rows]
    for i in range(len(xs) - 1):
        a, b, c, d = rows[-1][i], rows[-1][i + 1], back[-1][i + 1], back[-1][i]
        face(mesh, a, b, c, top_uv)
        face(mesh, a, c, d, top_uv)
    for j in range(len(rows) - 1):
        for i, order in ((0, (1, 0, 3, 2)), (-1, (0, 1, 2, 3))):
            corners = rows[j][i], back[j][i], back[j + 1][i], rows[j + 1][i]
            a, b, c, d = (corners[k] for k in order)
            face(mesh, a, b, c, side_uv)
            face(mesh, a, c, d, side_uv)
    for i in range(len(xs) - 1):
        a, b, c, d = back[0][i + 1], back[0][i], back[-1][i], back[-1][i + 1]
        face(mesh, a, b, c, side_uv)
        face(mesh, a, c, d, side_uv)
    soften(mesh)
    return mesh


def tread(seed, lod):
    """Broad, rounded flowstone crowns. The tops share the collision plane."""
    rng = random.Random(seed)
    splits = [-3.]
    while splits[-1] < 1.85:
        splits.append(min(2.63, splits[-1] + rng.uniform(.49, 1.57)))
    splits.append(3.)
    offsets = [0.] + [rng.uniform(-.14, .14) for _ in splits[1:-1]] + [0.]
    mesh = C.Mesh()
    for i, (left, right) in enumerate(zip(splits, splits[1:])):
        gap = .004 + rng.random() * .009
        left += gap if i else 0.
        right -= gap if i < len(splits) - 2 else 0.
        a, b, c, d = [min(rng.uniform(.045, .16), (right - left) * .22) for _ in range(4)]
        # Two weathered contours and asymmetric breaks keep the feet planted
        # on broad crowns with a ragged edge toward the shore.
        front = -.4 if i == 0 else -.4 + rng.uniform(.0, .083)
        middle = (left + right) * .5
        poly = [(left + a, front + .026), (middle, front), (right - b, front + .012),
                (right, front + b), (right, .4 - c), (right - c, .4),
                (middle, .4 - rng.uniform(.015, .043)), (left + d, .4),
                (left, .4 - d), (left, front + a)]
        # Joints sweep obliquely across the step. Both slabs on an edge
        # share its offset, so the break can't open up into a shoe-wide gap.
        poly = [(x + ((right - x) * offsets[i] + (x - left) * offsets[i + 1]) /
                 max(.01, right - left) * (y + .4) / .8, y) for x, y in poly]
        centre = ((left + right) * .5, 0.)
        h = 2.4 if i == 1 else 2.4 - rng.uniform(.003, .024)
        C.column(mesh, poly, centre, [0.] * len(poly), h, rng, lod=lod,
                 bevel=0., rim=rng.uniform(.021, .047), side_variant=i % 4,
                 top_variant=(seed + i) % 4)
    soften(mesh)
    return mesh
