"""Basalt atlas synthesised with numpy: base colour, normal, and AO/roughness.

Arrays use Blender's pixel order (row 0 = bottom, v up) and 512 px per metre.
  columns 0..1535    four 0.75 m wide column-face variants, tiling every 4 m
                     vertically. Every variant shares the same joint heights so
                     a joint runs all the way round a column.
  columns 1536..2047 four 1 m weathered crowns / drum ends, stacked in v.
Everything comes from a height field in metres, so the normal map, occlusion,
colour and roughness all agree with each other.
"""
import numpy as np

PX = 2048
PPM = 512.0          # pixels per metre
SIDE = 1536
VAR_W = 384
JOINTS = []   # filled by side_height: joint heights within the 4 m repeat


def band(shape, rng, f_lo, f_hi, ax=1.0, ay=1.0, slope=1.0):
    """Periodic band-limited noise, std 1. Frequencies in cycles per metre;
    ax/ay stretch the spectrum (ay < 1 makes features long in y)."""
    h, w = shape
    white = rng.standard_normal(shape)
    fy = np.fft.fftfreq(h)[:, None] * PPM / ay
    fx = np.fft.fftfreq(w)[None, :] * PPM / ax
    f = np.sqrt(fx * fx + fy * fy) + 1e-6
    window = np.clip((f - f_lo * .5) / (f_lo * .5), 0, 1) * np.clip((f_hi * 1.5 - f) / (f_hi * .5), 0, 1)
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * window * f ** -slope))
    return out / (out.std() + 1e-9)


def blur(a, sigma_px):
    """Periodic gaussian blur via FFT."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma_px) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def joints(rng):
    ys, y = [], rng.uniform(0, .5)
    while True:
        ys.append(y)
        y += rng.uniform(.4, 1.5)
        if y > 4.0 + ys[0] - .4:
            break
    # Rescale so the pattern wraps exactly at 4 m.
    span = (ys[-1] - ys[0]) + rng.uniform(.5, .9)
    return [ys[0] + (v - ys[0]) * 4.0 / span for v in ys]


def side_height(rng):
    """Height (m) and helper masks for the four tiling face variants."""
    h, w = PX, SIDE
    y = (np.arange(h)[:, None] + .5) / PPM * np.ones((1, w))
    xl = ((np.arange(w) % VAR_W)[None, :] + .5) / PPM * np.ones((h, 1))
    var = (np.arange(w) // VAR_W)[None, :] * np.ones((h, 1), dtype=int)
    t = xl / .75
    js = joints(rng)
    JOINTS[:] = js
    hgt = np.zeros((h, w))
    joint = np.zeros((h, w))          # 1 in the crack
    near = np.full((h, w), 9.0)       # distance to nearest joint (m)
    below = np.full((h, w), 9.0)      # distance below the nearest joint above
    chipmask = np.zeros((h, w))
    wob = band((h, w), rng, 2, 12, ay=50) * .0025
    chip_noise = band((h, w), rng, 3, 14, ay=40)
    for j in js:
        bow = np.zeros_like(y)
        for v in range(4):
            bow += (var == v) * rng.uniform(-.014, .014)
        for wrap in (-4.0, 0.0, 4.0):
            yj = j + wrap + bow * 4 * t * (1 - t) + wob * np.sin(np.pi * t)
            d = y - yj
            ad = np.abs(d)
            near = np.minimum(near, ad)
            below = np.where((d < 0) & (-d < below), -d, below)
            crack = np.exp(-(ad / .0032) ** 2)
            joint = np.maximum(joint, crack)
            chip = np.clip(chip_noise * .6 + .35, 0, 1)
            width = .004 + .024 * chip * np.where(d > 0, 1.25, .7)
            notch = np.clip(1 - ad / width, 0, 1) ** 1.6
            chipmask = np.maximum(chipmask, notch * chip)
            hgt -= .0075 * crack + .009 * notch * chip
    # Each drum swells slightly between joints and rolls off at its edges.
    hgt += .0035 * (1 - np.exp(-near / .09)) - .004 * np.exp(-near / .016)
    # Long cooling striae and broad undulation, then fine mineral grain.
    hgt += band((h, w), rng, 5, 24, ay=.12) * .0011
    hgt += band((h, w), rng, .5, 3) * .0028
    hgt += band((h, w), rng, 30, 160, slope=.5) * .00028
    # Vesicles: sparse pits.
    pits = np.clip((band((h, w), rng, 60, 160, slope=0) - 2.3) / .9, 0, 1)
    hgt -= pits * .0018
    # Conchoidal spall scars, mostly hanging off a joint.
    scar = np.zeros((h, w))
    for _ in range(4 * 70):
        v = rng.integers(4)
        if rng.random() < .65:
            cy = rng.choice(js) + rng.uniform(-.06, .03)
        else:
            cy = rng.uniform(0, 4)
        cx = rng.uniform(.06, .69)
        a = rng.uniform(.016, .075); b = a * rng.uniform(.45, .9); ang = rng.uniform(0, np.pi)
        depth = a * rng.uniform(.06, .13)
        r = int(a * PPM) + 3
        px, py = int(v * VAR_W + cx * PPM), int(cy * PPM)
        xs = np.arange(px - r, px + r + 1); ys = np.arange(py - r, py + r + 1)
        X, Y = np.meshgrid(xs, ys)
        dx = (X - px) / PPM; dy = (Y - py) / PPM
        u = (dx * np.cos(ang) + dy * np.sin(ang)) / a
        q = (-dx * np.sin(ang) + dy * np.cos(ang)) / b
        rr = u * u + q * q
        bowl = np.where(rr < 1, (1 - rr) * (.6 + .4 * np.clip(u + .6, 0, 1)), 0)
        xs_c = np.clip(xs, v * VAR_W, v * VAR_W + VAR_W - 1)
        ys_w = ys % h
        hgt[np.ix_(ys_w, xs_c)] -= bowl * depth
        scar[np.ix_(ys_w, xs_c)] = np.maximum(scar[np.ix_(ys_w, xs_c)], (rr < 1) * 1.0)
    return hgt, dict(joint=joint, near=near, below=below, chip=chipmask, scar=scar, pits=pits)


def top_height(rng):
    """Four weathered crowns (512 x 512 each) stacked: 512 x 2048."""
    h, w = PX, 512
    hgt = band((h, w), rng, .8, 4) * .006 + band((h, w), rng, 6, 30) * .0018
    hgt += band((h, w), rng, 30, 160, slope=.5) * .0004
    pits = np.clip((band((h, w), rng, 25, 90, slope=0) - 1.9) / .9, 0, 1)
    hgt -= pits * .003
    cracks = np.zeros((h, w))
    # A few weathering fractures per crown: wandering grooves from the rim.
    for sq in range(4):
        for _ in range(rng.integers(1, 4)):
            a = rng.uniform(0, 2 * np.pi)
            x, y = 256 + np.cos(a) * 250, sq * 512 + 256 + np.sin(a) * 250
            heading = a + np.pi + rng.uniform(-.5, .5)
            for step in range(int(rng.uniform(80, 260))):
                heading += rng.normal(0, .08)
                x += np.cos(heading) * 1.5; y += np.sin(heading) * 1.5
                xi, yi = int(x), int(y)
                if not (2 <= xi < w - 2 and sq * 512 + 2 <= yi < sq * 512 + 510):
                    break
                cracks[yi - 1:yi + 2, xi - 1:xi + 2] = np.maximum(cracks[yi - 1:yi + 2, xi - 1:xi + 2], .6)
                cracks[yi, xi] = 1
    hgt -= blur(cracks, .8) * .004
    return hgt, dict(pits=pits, cracks=cracks)


def normals(hgt):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * PPM / 2
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * PPM / 2
    n = np.stack([-dx, -dy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * .5 + .5


def cavity(hgt):
    c = blur(hgt, 5) - hgt
    c2 = blur(hgt, 22) - hgt
    return np.clip(1 - np.clip(c, 0, None) * 95 - np.clip(c2, 0, None) * 30, .28, 1)


def srgb(lin):
    lin = np.clip(lin, 0, 1)
    return np.where(lin <= .0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - .055)


def build(seed=1707):
    """Returns (base_rgb_srgb, normal_rgb, orm_rgb) float arrays, (2048, 2048, 3)."""
    rng = np.random.default_rng(seed)
    sh, sm = side_height(rng)
    th, tm = top_height(rng)
    hgt = np.concatenate([sh, th], 1)
    nrm = normals(hgt)
    # The two regions are separate surfaces: rebuild normals at the seam locally.
    nrm[:, SIDE - 1:SIDE + 1] = [.5, .5, 1]
    ao = cavity(hgt)
    shape = hgt.shape
    broad = band(shape, rng, .3, 1.6)
    film = smooth(-1.4, 2.2, band(shape, rng, .8, 5) * .6 + band(shape, rng, 4, 20) * .5 + broad * .3)
    speck = np.clip((band(shape, rng, 80, 200, slope=0) - 2.6) / .6, 0, 1)
    base = np.ones(shape + (3,)) * np.array([.050, .052, .056])
    base *= (1 + .16 * broad)[..., None]
    weather = np.array([.082, .079, .074])
    side = np.zeros(shape, bool); side[:, :SIDE] = True
    # Column faces: thin grey weathering film on the convex drums, fresh dark
    # glassy scars, seep stains running down from joints, sparse phenocrysts.
    convex = np.ones(shape)
    convex[:, :SIDE] = smooth(.01, .12, sm['near'])
    f = film * convex * np.where(side, .6, .8)
    base = base * (1 - f[..., None]) + weather * f[..., None]
    scar = np.zeros(shape); scar[:, :SIDE] = sm['scar']
    base = base * (1 - .3 * scar[..., None]) + np.array([.034, .038, .044]) * (.3 * scar[..., None])
    seep = np.zeros(shape)
    streak = np.clip(band((PX, SIDE), rng, 6, 30, ay=.06) * .8 + .2, 0, 1)
    seep[:, :SIDE] = np.exp(-sm['below'] / (.06 + .3 * np.clip(band((PX, SIDE), rng, 2, 8, ay=.2) * .5 + .5, 0, 1))) * streak
    iron = np.clip(band(shape, rng, .5, 3) * .7, 0, 1)
    stain = np.array([.072, .052, .036])
    base = base * (1 - .45 * seep[..., None] * (1 - iron[..., None])) + stain * (.45 * seep * iron)[..., None]
    base = base * (1 - speck[..., None] * .5) + np.array([.16, .16, .15]) * (speck[..., None] * .5)
    jointm = np.zeros(shape); jointm[:, :SIDE] = np.maximum(sm['joint'], sm['chip'] * .5)
    crackm = np.zeros(shape); crackm[:, SIDE:] = tm['cracks']
    base *= (1 - .6 * np.maximum(jointm, blur(crackm, 1.2) * .8))[..., None]
    base *= (.72 + .28 * ao)[..., None]
    base[:, SIDE:] *= 1.35  # sun-bleached crowns read lighter than the faces
    # Crowns weather paler and rougher.
    rough = np.where(side, .56, .7) + .2 * f - .2 * scar + .25 * jointm
    rough += band(shape, rng, 3, 20) * .03
    rough = np.clip(rough, .3, .95)
    orm = np.stack([ao, rough, np.zeros(shape)], -1)
    return srgb(base), nrm, orm
