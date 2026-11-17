"""QUARRY / 06 — a short Keeper twin-bore scattergun, authored in mm.

The exposed drum indexes about +Y; the dorsal slide cycles along +Y.
Neither the rotary carrier nor its six shells are welded to the body.
"""
import math
from lib import geo

NAME = 'scatter'
RUBS = [(0, -20, 0, 50), (0, 238, 24, 62), (-49, 95, 54, 24), (0, -190, 68, 35)]


def build(ctx):
    ceramic = ctx.mat('ceramic', decals=[
        ctx.decal('top', 'QUARRY / 06', 5, (0, -142, 103), '+Z', style='print', color='#303236'),
        ctx.decal('serial', 'KEEPER  /  2140', 3.1, (-35, -42, 100), '-X', style='print', color='#303236'),
    ])
    dark = ctx.mat('graphite', decals=[
        ctx.decal('index', '06', 13, (-35.8,-27,78), '-X', style='print', color='#d1c9b8'),
        ctx.decal('load', 'ROTARY / 8P', 3, (0,234,118.6), '+Z', style='print', color='#d1c9b8')])
    frame = ctx.mat('frame')
    steel = ctx.mat('steel')
    bright = ctx.mat('bright')
    orange = ctx.mat('orange')
    gripmat = ctx.mat('grip')
    rubber = ctx.mat('rubber')
    shellmat = ctx.mat('polymer', tint='#7f4430')
    brass = ctx.mat('copper', tint='#b49b65')
    body, drum, bolt = [], [], []

    def block(name, size, at, mat=dark, c=2, group=body):
        ob = geo.cbox(name, size, at, c=c, mat=mat)
        if c >= 3:
            geo.bevel(ob, .55, 1)
        group.append(ob)
        return ob

    # Wide flat breech, visibly split from the indexing chamber and slide.
    receiver = block('receiver', (70, 114, 49), (0, -28, 84), ceramic, 6)
    block('lower', (57, 118, 20), (0, -21, 50), frame, 4)
    block('rear_cap', (62, 9, 40), (0, -90, 81), steel, 3)
    for x in (-1, 1):
        block('upper_seam', (1.2, 52, 22), (x * 35.1, -26, 78), dark, .2)
        body.append(geo.screw('breech_pin', (x*35.5, -65, 87), (x, 0, 0), r=3, mat=steel))
        block('trunnion', (12, 25, 21), (x*47, 36, 53), steel, 2)
        body.append(geo.screw('axle_lock', (x*54, 36, 53), (x, 0, 0), r=5, mat=bright))

    # Orange sight-line inlay stays visible from the player's eye.
    block('dorsal_inlay', (2.5, 57, 1.2), (-19, -27, 109), orange, .3)

    # Left thumb release opens the rotary carrier for loading.
    block('drum_release', (9, 29, 11), (-54, 22, 73), dark, 2)
    block('release_mark', (1.2, 13, 2), (-59, 22, 75), orange, .3)
    for y in (-63, 7):
        for x in (-22, 22):
            body.append(geo.screw('top_lock', (x, y, 109), (0, 0, 1), r=2.2, mat=steel))

    # Two honest bores and separate heat sleeves; the bridge never obscures them.
    for x in (-23, 23):
        barrel = geo.tube('bore', 19, 140, 337, 'Y', (x, 87), 32, r_in=13, mat=steel)
        geo.bevel(barrel, .65, 2)
        body.append(barrel)
        body.append(geo.tube('bore_shadow', 13, 285, 330, 'Y', (x, 87), 28, r_in=11.8, mat=frame))
        body.append(geo.tube('muzzle_collar', 22, 316, 338, 'Y', (x, 87), 32, r_in=19, mat=dark))
        for y in (169, 299):
            body.append(geo.tube('barrel_band', 21, y, y+6, 'Y', (x, 87), 24, r_in=19, mat=bright))
    # A dorsal bridge and vented side cheeks hold the paired barrels.
    block('bridge', (84, 153, 9), (0, 231, 114), dark, 3)
    for sx in (-1, 1):
        cheek = block('barrel_cheek', (8, 142, 40), (sx*45, 232, 88), ceramic, 3)
        for i in range(7):
            geo.cut(cheek, geo.cbox('cooling_slot', (15, 6, 20), (sx*45, 184+i*15, 93), c=1.5))
        block('stripe', (1.8, 112, 3.2), (sx*49.1, 233, 76), orange, .5)
        for y in (168, 294):
            body.append(geo.screw('barrel_fastener', (sx*49.5, y, 104), (sx,0,0), r=2.6, mat=steel))
    for i in range(4):
        block('bridge_fin', (70, 3, 3), (0, 250+i*13, 119), frame, .6)

    # Open six-shell carrier: thin end spiders, narrow ribs, visible red hulls.
    # Axis passes through (0, 94, 45), parallel to the bores.
    drum.append(geo.tube('drum_axle', 10, 29, 151, 'Y', (0,45), 24, mat=steel))
    for y in (47, 137):
        drum.append(geo.tube('carrier_rim', 52, y, y+5, 'Y', (0,45), 36, r_in=47, mat=dark))
        drum.append(geo.tube('carrier_hub', 18, y-2, y+7, 'Y', (0,45), 24, mat=steel))
    for i in range(6):
        a = math.radians(i*60+30)
        x, z = 34*math.cos(a), 45+34*math.sin(a)
        drum.append(geo.tube('shell_hull', 11.4, 52, 130, 'Y', (x,z), 24, mat=shellmat))
        drum.append(geo.tube('shell_head', 12.3, 45, 57, 'Y', (x,z), 24, mat=brass))
        drum.append(geo.tube('primer', 3.4, 44.2, 45, 'Y', (x,z), 16, mat=bright))
        drum.append(geo.tube('shell_crimp', 10.8, 126, 132, 'Y', (x,z), 18, mat=orange))
        for y in (49, 139):
            spoke = geo.cbox('carrier_spoke', (5, 4, 39), (0, 0, 24), c=1, mat=steel)
            geo.place(spoke, (0,y,45), (0,90-i*60-30,0))
            drum.append(spoke)
        # Numbered, orange index tabs form a readable six-position rhythm.
        tab = geo.cbox('index_tab', (9, 18, 4), (0, 92, 97), c=1, mat=orange if i == 0 else dark)
        geo.place(tab, (0,-92,-45))
        geo.place(tab, (0,92,45), (0,i*60,0))
        drum.append(tab)
    # Fixed spine supports the rotary assembly without enclosing it.
    block('drum_spine', (21, 125, 12), (0,92,106), frame, 2)

    # The separate top slide and its left-side release paddle.
    block('slide', (50, 74, 8), (0,-25,116), steel, 2, bolt)
    block('slide_ear', (18, 27, 12), (-38,-18,108), frame, 2, bolt)
    for i in range(4):
        block('slide_ridge', (2, 22, 2), (-44+i*4,-18,115), bright, .4, bolt)

    # A short twin-rod brace and a broad, heavily padded shoulder stop.
    for x in (-18,18):
        body.append(geo.tube('brace_rod', 6, -199,-90,'Y',(x,75),16,mat=steel))
    block('brace_cheek', (46, 85, 14), (0,-142,96), ceramic, 4)
    block('brace_stop', (69, 17, 100), (0,-202,52), frame, 5)
    block('brace_pad', (68, 9, 94), (0,-214,52), rubber, 4)
    for z in (18,35,52,69,86):
        block('pad_groove', (55, 1.6, 2), (0,-219,z), dark, .3)

    # Grip profiles follow the carbine's palm frame, with more mass on the fore-end.
    grip = block('grip', (32,52,103), (0,-9,-1), gripmat, 9)
    geo.place(grip, (0,0,0), (-18,0,0))
    block('tang', (39,35,15), (0,-30,43), frame, 3)
    guard = block('guard', (12,66,36), (0,30,25), frame, 3)
    geo.cut(guard,geo.cbox('trigger_window',(20,49,23),(0,30,25),c=3))
    block('trigger',(6,7,22),(0,27,31),bright,1)
    block('grip_heel',(38,55,8),(0,-24,-52),frame,3)
    for i in range(4):
        block('grip_rib',(33,2,3),(0,10-i*4,17-i*13),dark,.6)
    block('foregrip_mount',(26,105,20),(0,238,59),frame,3)
    fore = block('foregrip',(48,105,36),(0,238,31),gripmat,8)
    for i in range(5):
        block('foregrip_rib',(50,3,7),(0,204+i*17,22),dark,1)
    block('foregrip_stop',(54,10,47),(0,294,37),frame,4)

    # Low robust open notch, with a small warm bead rather than an electronic display.
    block('rear_sight',(43,11,17),(0,-65,127),frame,2)
    geo.cut(body[-1],geo.cbox('sight_notch',(14,20,14),(0,-65,133),c=1))
    block('front_blade',(5,11,12),(0,303,126),dark,1)
    bead = geo.tube('bead',1.7,297,299,'Y',(0,133),12,mat=ctx.emit('reticle',strength=2))
    return dict(parts={'body':body,'drum':drum,'bolt':bolt}, emissive={'reticle':[bead]},
        pivots={'drum':(0,94,45),'bolt':(0,-25,116),'reticle':(0,298,133)},
        empties={'muzzle':(0,338,87),'sight':(0,-415,133),'eject':(55,68,49)},
        grips={
            'r':dict(side='r',palm=((26,-30,4),((0,.95,-.31),(.95,0,.3))),targets=['grip','guard'],
                fingers={'index':dict(targets=['trigger'],lo=(10,30,15),hi=(60,80,60))},
                thumb=dict(rot=(10,-60,40),targets=['grip','tang','lower'],hi=(30,50,50)),
                forearm=270,elbow=(160,-300,-140)),
            'l':dict(side='l',palm=((-27,239,0),((1,0,.10),(.10,-.6,-1))),targets=[fore.name,'foregrip_rib'],
                fingers={'index':dict(spread=-3),'ring':dict(spread=3),'pinky':dict(spread=6)},
                thumb=dict(rot=(-20,-40,30),targets=[fore.name]),forearm=300,elbow=(-340,45,-370))},
        world_ratio=.30,
        view=dict(eye=(-115,-460,207),look=(-115,500,207),fov=52),
        three=dict(eye=(-870,540,440),look=(0,55,32)),
        close=dict(eye=(-320,-220,235),look=(0,65,56)))
