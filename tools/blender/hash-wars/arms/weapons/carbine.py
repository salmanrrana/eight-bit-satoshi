"""KC-7 carbine: the Keeper's starting rifle.

Conventional layout: pistol grip, magazine ahead of the trigger, a
bone-white ceramic upper over a graphite frame, an angular handguard with an
orange stripe, a skeletal stock and a low reflex sight. About 755 mm long.

Millimetres, weapon space: origin on the pistol grip's axis at mid-height
(where the right hand holds it), +Y toward the muzzle, +Z up, +X right.
"""

import math

from lib import geo

NAME = "carbine"
BORE_Z = 84          # barrel axis height
GRIP_TILT = 18       # pistol grip rake, degrees
REAR, FRONT = -150, 150  # receiver ends
HG_END = 350         # handguard front
MUZZLE = 432         # muzzle tip
STOCK_END = -330     # butt pad
SIGHT_Z = 123        # reflex sight optical axis
MAG_Y = 96           # magazine centre

# Where hands and gear polish the finish: (x, y, z, radius) mm.
RUBS = [(0, -10, 0, 55), (-17, MAG_Y, 40, 30), (17, MAG_Y, 40, 30), (0, 255, 70, 60), (-16, 8, 58, 16),
        (0, STOCK_END, 50, 50), (-26, FRONT - 40, 86, 18)]


def build(ctx):
    m = ctx.mat
    ceramic = m("ceramic", decals=[
        ctx.decal("top", "07 / KEEPER", 5.0, (0, -106, 102), "+Z", style="print", color="#393b3e"),
        ctx.decal("blk", "6 929 999", 9.0, (-16.2, -78, 84), "-X"),
        ctx.decal("kc7", "KC-7", 6.0, (-16.2, 108, 92), "-X"),
        ctx.decal("grid", "KEEPER ARMOURY  /  NODE GUARD", 3.2, (-16.2, -84, 75.5), "-X"),
    ])
    frame = m("frame", decals=[
        ctx.decal("sel", "S      1      A", 3.6, (-15.2, 8, 63.5), "-X"),
        ctx.decal("cal", "5.8 HB  ·  SN 0021-140", 2.6, (-15.2, -92, 52), "-X"),
    ])
    graphite = m("graphite", decals=[
        ctx.decal("hg", "HAND CLEAR OF MUZZLE", 2.6, (-21.2, 300, 70), "-X", style="print", color="#d9d3c4"),
    ])
    steel, bright, polymer, grip_m, rubber, orange, lensframe = (
        m("steel"), m("bright"), m("polymer"), m("grip"), m("rubber"), m("orange"), m("lensframe"))

    body = []

    # Upper receiver: a monolithic ceramic block with big chamfers.
    up = geo.prism("upper", [(REAR, 69), (FRONT, 69), (FRONT, 96), (FRONT - 8, 102), (REAR + 22, 102),
                             (REAR, 94)], "X", -16, 16, chamfer=5, mat=ceramic)
    geo.cut(up, geo.cbox("port", (12, 50, 15), (16, 36, 84), c=1.5))           # ejection port, right
    geo.cut(up, geo.cbox("slot", (8, 92, 6.5), (-16, 74, 85.5), c=0.8))         # bolt slot, left
    geo.cut(up, geo.cbox("seam_l", (3, 1.2, 40), (-16, -34, 86)))               # panel seam
    geo.cut(up, geo.cbox("seam_r", (3, 1.2, 40), (16, -34, 86)))
    for i in range(7):                                                          # sight mount slots
        geo.cut(up, geo.cbox(f"rail{i}", (24, 3, 3), (0, -62 + i * 9.5, 102.2), c=0.4))
    geo.bevel(up, 1.0, 2, 30)
    body.append(up)

    # Short raised indexing teeth read from above without changing the sight height.
    for y in list(range(-143,-121,8))+list(range(20,145,10)):
        tooth=geo.cbox('top_index',(28,5,3.2),(0,y,103),c=.6,mat=steel)
        geo.bevel(tooth,.3,1,35)
        body.append(tooth)
    # The port opens onto a dark cavity rather than a flat white cut face.
    body.append(geo.cbox('port_shadow',(1,47,13),(10.1,36,84),c=.4,mat=frame))
    body.append(geo.cbox('port_lip',(3,54,2),(16.1,36,75.8),c=.4,mat=steel))
    # Lower receiver (graphite frame) with the magazine well.
    lo = geo.prism("lower", [(REAR + 10, 46), (-30, 46), (-22, 40), (66, 40), (72, 46), (FRONT - 10, 46),
                             (FRONT - 10, 68), (REAR + 10, 68)], "X", -15, 15, chamfer=3, mat=frame)
    geo.cut(lo, geo.cbox("lseam", (3, 1.2, 30), (-15, 40, 56)))
    geo.bevel(lo, 0.8, 1, 30)
    body.append(lo)
    well = geo.prism("well", [(MAG_Y - 30, 28), (MAG_Y + 30, 28), (MAG_Y + 30, 47), (MAG_Y - 30, 47)],
                     "X", -17.5, 17.5, chamfer=3.5, mat=frame)
    geo.cut(well, geo.cbox("well_hole", (25, 52, 40), (0, MAG_Y, 30)))
    geo.bevel(well, 0.8, 1, 30)
    body.append(well)

    # Trigger guard: a loop under the frame.
    tg = geo.prism("guard", [(-6, 44), (-8, 30), (2, 20), (66, 20), (70, 24), (70, 44)], "X", -5, 5, 1.5, frame)
    geo.cut(tg, geo.prism("guard_win", [(4, 41), (4, 30), (8, 25), (63, 25), (65, 41)], "X", -8, 8))
    geo.bevel(tg, 0.6, 1, 30)
    body.append(tg)
    trig = geo.prism("trigger", [(30, 41), (36, 41), (37, 34), (40, 27), (44, 24), (41, 23), (35, 27),
                                 (31, 34)], "X", -3, 3, 0.8, bright)
    geo.bevel(trig, 0.4, 1, 30)
    body.append(trig)

    # Pistol grip, lofted along its raked axis, with a palm swell.
    t = math.radians(GRIP_TILT)
    ax, fw = (0, math.sin(t), math.cos(t)), (0, math.cos(t), -math.sin(t))
    secs = []
    for s, w, d, back in ((-54, 28, 46, 0), (-48, 30, 50, 0), (-20, 31, 54, 3), (12, 30.5, 53, 2.5),
                          (36, 29, 50, 0), (48, 28, 50, 0)):
        ring = geo.rrect(d, w, 11, n=4)
        secs.append([(x, s * ax[1] + (u - back) * fw[1], s * ax[2] + (u - back) * fw[2]) for u, x in ring])
    g = geo.loft("grip", secs, grip_m)
    geo.bevel(g, 0.8, 1, 40)
    body.append(g)
    cap = geo.cbox("grip_cap", (30, 54, 7), (0, 0, 0), c=2.2, mat=frame)
    geo.place(cap, (0, -54 * ax[1] - 1, -54 * ax[2] - 2.5), (-GRIP_TILT, 0, 0))
    geo.bevel(cap, 0.6, 1, 30)
    body.append(cap)
    tang = geo.prism("tang", [(-44, 46), (-6, 46), (-6, 52), (-30, 52), (-50, 50)], "X", -14, 14, 3, frame)
    geo.bevel(tang, 0.6, 1, 30)
    body.append(tang)

    # Selector lever and takedown pins on the left.
    sel = geo.lathe("selector", [(0.1, 0), (6.5, 0), (6.5, 2.2), (5.5, 3.2), (0.1, 3.2)], "X", 18, (8, 58), steel)
    geo.place(sel, (-18.2, 0, 0))
    lever = geo.prism("sel_lever", [(8, 56.5), (21, 57.5), (22, 59.5), (8, 60.5)], "X", -19.4, -16.6, 0.6, steel)
    body += [sel, lever]
    for y in (REAR + 26, FRONT - 22):
        pin = geo.lathe("pin", [(0.1, -17.5), (3.6, -17.5), (3.6, 17.5), (0.1, 17.5)], "X", 14, (y, 57), bright)
        body.append(pin)
    mrel = geo.cbox("mag_release", (4, 9, 7), (-16.2, 66, 50), c=1.2, mat=steel)
    body.append(mrel)

    # Rear cap and the skeletal stock: open frame, central rod, rubber pad.
    rcap = geo.cbox("rear_cap", (30, 8, 34), (0, REAR - 3, 84), c=2.5, mat=frame)
    body.append(rcap)
    stock = geo.prism("stock", [(REAR - 6, 99), (STOCK_END + 8, 99), (STOCK_END + 8, -14), (STOCK_END + 26, -14),
                                (REAR - 6, 46)], "X", -11, 11, chamfer=3, mat=graphite)
    geo.cut(stock, geo.prism("stock_win", [(REAR - 22, 89), (STOCK_END + 22, 89), (STOCK_END + 22, 4),
                                           (STOCK_END + 38, 4), (REAR - 22, 60)], "X", -20, 20, chamfer=0))
    geo.bevel(stock, 1.2, 1, 30)
    body.append(stock)
    rod = geo.tube("stock_rod", 6.5, REAR - 10, STOCK_END + 22, "Y", (0, 72), 16, mat=bright)
    body.append(rod)
    cheek = geo.prism("cheek", [(REAR - 30, 98), (STOCK_END + 30, 98), (STOCK_END + 36, 106), (REAR - 46, 106)],
                      "X", -10, 10, chamfer=3, mat=ceramic)
    geo.bevel(cheek, 0.8, 1, 30)
    body.append(cheek)
    pad = geo.prism("butt_pad", [(STOCK_END + 8, 104), (STOCK_END - 2, 102), (STOCK_END - 2, -12),
                                 (STOCK_END + 8, -16)], "X", -12.5, 12.5, chamfer=3, mat=rubber)
    for i in range(6):
        geo.cut(pad, geo.cbox(f"pad_rib{i}", (30, 3, 2.2), (0, STOCK_END - 2, 6 + i * 16)))
    geo.bevel(pad, 1.0, 1, 30)
    body.append(pad)
    loop = geo.lathe("sling_ring", [(4.5, -1.6), (6.8, -1.6), (6.8, 1.6), (4.5, 1.6)], "X", 16, (STOCK_END + 18, -6),
                     steel)
    body.append(loop)

    # Handguard: angular graphite shell, orange stripe channel, vents.
    hg_prof = [(-21, 68), (-13, 60), (13, 60), (21, 68), (21, 96), (11, 106), (-11, 106), (-21, 96)]
    hg = geo.prism("handguard", hg_prof, "Y", FRONT + 1.5, HG_END, chamfer=3, mat=graphite)
    geo.cut(hg, geo.tube("bore", 11, FRONT - 5, HG_END + 5, "Y", (0, BORE_Z), 20))
    for sx in (-1, 1):
        geo.cut(hg, geo.cbox(f"stripe_ch{sx}", (3, HG_END - FRONT - 44, 6.5), (21 * sx, (FRONT + HG_END) / 2 + 6, 82),
                             c=0.6))
    for i in range(8):  # vents on the upper chamfers, both sides
        y = FRONT + 52 + i * 15
        for sx in (-1, 1):
            v = geo.cbox(f"vent{i}{sx}", (6, 9, 22), (0, 0, 0), c=1.2)
            geo.place(v, (16 * sx, y, 101), (0, -45 * sx, 0))
            geo.cut(hg, v)
    for i in range(4):  # slots underneath
        geo.cut(hg, geo.cbox(f"uslot{i}", (14, 16, 6), (0, FRONT + 60 + i * 34, 60), c=1.5))
    geo.bevel(hg, 1.0, 2, 30)
    body.append(hg)
    for sx in (-1, 1):
        st = geo.cbox(f"stripe{sx}", (2.4, HG_END - FRONT - 46, 4.6), (19.9 * sx, (FRONT + HG_END) / 2 + 6, 82), c=0.5,
                      mat=orange)
        geo.bevel(st, 0.3, 1, 30)
        body.append(st)
        for y in (FRONT + 22, FRONT + 112, HG_END - 26):
            body.append(geo.screw("hg_screw", (21.0 * sx, y, 92), (sx, 0, 0), r=2.1, mat=steel))
    collar = geo.prism("collar", hg_prof, "Y", HG_END - 2, HG_END + 11, chamfer=3, mat=ceramic)
    geo.cut(collar, geo.tube("collar_bore", 12.5, HG_END - 10, HG_END + 20, "Y", (0, BORE_Z), 20))
    geo.bevel(collar, 0.9, 1, 30)
    body.append(collar)
    rear_ring = geo.prism("hg_ring", [(x * 1.02, (z - BORE_Z) * 1.02 + BORE_Z) for x, z in hg_prof], "Y",
                          FRONT - 1, FRONT + 6, chamfer=1.5, mat=frame)
    geo.bevel(rear_ring, 0.5, 1, 30)
    body.append(rear_ring)

    # Barrel and muzzle brake.
    bar = geo.tube("barrel", 8.4, FRONT, MUZZLE - 40, "Y", (0, BORE_Z), 22, mat=steel)
    body.append(bar)
    mz = geo.lathe("muzzle_dev", [(9.5, MUZZLE - 48), (12.5, MUZZLE - 44), (12.5, MUZZLE - 4), (11, MUZZLE),
                                  (5, MUZZLE), (5, MUZZLE - 3)], "Y", 24, (0, BORE_Z), steel, cap=True)
    for i in range(3):
        for sx in (-1, 1):
            geo.cut(mz, geo.cbox(f"mport{i}{sx}", (12, 6, 9), (11 * sx, MUZZLE - 36 + i * 11, BORE_Z), c=1.0))
    geo.cut(mz, geo.tube("mbore", 4.6, MUZZLE - 10, MUZZLE + 5, "Y", (0, BORE_Z), 16))
    geo.bevel(mz, 0.6, 2, 30)
    body.append(mz)

    # Low reflex sight: chamfered hood on a clamp base.
    base = geo.prism("sight_base", [(-60, 101), (6, 101), (6, 108), (2, 110), (-56, 110), (-60, 107)], "X", -15, 15,
                     chamfer=2, mat=lensframe)
    geo.bevel(base, 0.6, 1, 30)
    body.append(base)
    hood = geo.prism("hood", [(-44, 108), (-2, 108), (-2, 132), (-8, 139), (-38, 139), (-44, 134)], "X", -15, 15,
                     chamfer=4, mat=frame)
    geo.cut(hood, geo.prism("hood_win", geo.rrect(24, 19, 3, 3, 0, SIGHT_Z), "Y", -60, 20))
    geo.bevel(hood, 0.8, 2, 30)
    body.append(hood)
    knob = geo.lathe("sight_knob", [(0.1, 0), (5.5, 0), (5.5, 5), (4.6, 6), (0.1, 6)], "X", 18, (-30, 122), steel)
    geo.place(knob, (15, 0, 0))
    body.append(knob)
    for y in (-52, -6):
        for sx in (-1, 1):
            body.append(geo.screw("sight_screw", (15.0 * sx, y, 105.5), (sx, 0, 0), r=1.7, mat=steel))
    for y in (REAR + 10, -64):
        for sx in (-1, 1):
            body.append(geo.screw("rcv_screw", (16.0 * sx, y, 80), (sx, 0, 0), r=1.8, mat=steel))

    lens = geo.prism("lens", geo.rrect(24, 19, 3, 3, 0, SIGHT_Z), "Y", -12, -11, mat=ctx.lens)
    ret = []
    ret.append(geo.lathe("ret_ring", [(2.0, 0), (2.45, 0), (2.45, 0.2), (2.0, 0.2)], "Y", 32, (0, SIGHT_Z), ctx.emit("reticle")))
    ret.append(geo.lathe("ret_dot", [(0.1, 0), (0.42, 0), (0.42, 0.2), (0.1, 0.2)], "Y", 10, (0, SIGHT_Z), ctx.emit("reticle")))
    for i, a in enumerate((90, 210, 330)):  # three short ticks outside the ring
        tick = geo.cbox(f"tick{i}", (0.35, 0.2, 1.1), (0, 0, 0), mat=ctx.emit("reticle"))
        geo.place(tick, (0, 0, 0), (0, 90 - a, 0))
        geo.place(tick, (3.4 * math.cos(math.radians(a)), 0, SIGHT_Z + 3.4 * math.sin(math.radians(a))))
        ret.append(tick)
    for r_ in ret:
        geo.place(r_, (0, -10.8, 0))

    # Moving parts.
    mag = geo.prism("mag", [(MAG_Y - 25, 46), (MAG_Y + 25, 46), (MAG_Y + 28, 0), (MAG_Y + 36, -60), (MAG_Y + 48, -112),
                            (MAG_Y + 16, -116), (MAG_Y + 4, -64), (MAG_Y - 6, -6), (MAG_Y - 25, 30)], "X", -12, 12,
                    chamfer=2.5, mat=polymer)
    for i in range(4):  # grip ribs across the lower magazine
        rib = geo.cbox(f"mag_rib{i}", (30, 22, 1.6), (0, 0, 0), c=0.3)
        geo.place(rib, (0, MAG_Y + 6 + i * 3.8, -14 - i * 14), (-14 - i * 4, 0, 0))
        geo.cut(mag, rib)
    geo.bevel(mag, 0.9, 1, 30)
    floor = geo.prism("mag_floor", [(MAG_Y + 12, -112), (MAG_Y + 52, -108), (MAG_Y + 53, -116), (MAG_Y + 13, -121)],
                      "X", -14.5, 14.5, chamfer=2, mat=frame)
    geo.bevel(floor, 0.6, 1, 30)

    bolt = geo.prism("bolt_knob", [(FRONT - 50, 82.5), (FRONT - 34, 82.5), (FRONT - 34, 88.5), (FRONT - 50, 88.5)],
                     "X", -22, -13, chamfer=1.2, mat=bright)
    paddle = geo.prism("bolt_paddle", [(FRONT - 52, 80), (FRONT - 30, 81), (FRONT - 28, 91), (FRONT - 52, 92)],
                       "X", -30, -21.5, chamfer=2.2, mat=frame)
    for i in range(3):
        geo.cut(paddle, geo.cbox(f"pad_g{i}", (3, 1.4, 14), (-30, FRONT - 47 + i * 6, 86)))
    geo.bevel(paddle, 0.6, 1, 30)

    carrier=geo.cbox('bolt_carrier',(3,44,10),(12.3,36,84),c=.8,mat=steel)
    for y in (20,24,28):
        body.append(geo.cbox('extractor_flute',(1,1,7),(14.1,y,84),c=.2,mat=bright))
    # Serrations on the charging paddle and a stop block give it thickness from above.
    stop=geo.cbox('charging_stop',(8,8,5),(-24,109,88),c=.8,mat=steel)
    return dict(
        parts={"body": body, "mag": [mag, floor], "bolt": [bolt, paddle, carrier, stop]},
        emissive={"reticle": ret},
        glass={"lens": [lens]},
        pivots={"mag": (0, MAG_Y, 46), "bolt": (-22, FRONT - 42, 86), "reticle": (0, -10.8, SIGHT_Z),
                "lens": (0, -11.5, SIGHT_Z)},
        empties={"muzzle": (0, MUZZLE, BORE_Z), "sight": (0, -373, SIGHT_Z), "eject": (17, 36, 84)},
        grips=GRIPS,
        world_ratio=0.3,
        view=dict(eye=(-105, -430, 190), look=(-105, 500, 190), fov=52),
        close=dict(eye=(-240, -160, 160), look=(0, 40, 25)),
        three=dict(eye=(-950, 480, 430), look=(0, 55, 20)),
    )


# Hand poses: the palm is placed by hand, the fingers curl onto the targets.
GRIPS = {
    "r": dict(
        side="r",
        palm=((26, -30, 4), ((0, 0.95, -0.31), (0.95, 0.0, 0.3))),
        targets=["grip", "guard"],
        fingers={
            "index": dict(targets=["trigger"], spread=-4, lo=(10, 30, 15), hi=(60, 80, 60)),
            "middle": dict(spread=0),
            "ring": dict(spread=2),
            "pinky": dict(spread=5),
        },
        thumb=dict(rot=(10, -60, 40), targets=["grip", "tang", "lower"], hi=(30, 50, 50)),
        wrist=(-10, 25, 0),
        forearm=270,
        elbow=(160, -300, -140),
    ),
    "l": dict(
        side="l",
        palm=((-26, 250, 37), ((1, 0, 0.10), (0.10, -0.6, -1))),
        targets=["handguard", "stripe1", "stripe-1"],
        fingers={"index": dict(spread=-3), "middle": dict(), "ring": dict(spread=3), "pinky": dict(spread=6)},
        thumb=dict(rot=(-20, -40, 30), targets=["handguard"]),
        wrist=(20, -40, 0),
        forearm=310,
        elbow=(-340, 65, -370),
    ),
}
