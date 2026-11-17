"""STAVE / 04 — Keeper precision accelerator, mm, +Y downrange.

Twin side rails leave five capacitor cassettes open to air. The independent
orange coil mesh is driven by emit:charge. The eye node sits 350 mm behind
the open, glass-ended scope; the underside power cell drops along -Z.
"""
import math
from lib import geo

NAME = 'rail'
RUBS = [(0,-15,0,55),(0,292,24,65),(-22,65,36,25),(0,-225,86,35)]


def build(ctx):
    ceramic = ctx.mat('ceramic',decals=[
        ctx.decal('top','STAVE / 04',5,(0,-85,114),'+Z',style='print',color='#343638'),
        ctx.decal('left','KEEPER / PRECISION',4,(-25,-18,86),'-X',style='print',color='#343638'),
        ctx.decal('scope','2.5 / K',4,(0,-13,186),'+Z',style='print',color='#343638'),
        ctx.decal('cell','04  /  PULSE CELL',4,(-18,84,-21),'-X',style='print',color='#343638')])
    dark,frame,steel,bright,gripmat,rubber,orange,copper = [ctx.mat(k) for k in
        ('graphite','frame','steel','bright','grip','rubber','orange','copper')]
    heatblue = ctx.mat('steel',tint='#5d617d',wear=.3)
    heatgold = ctx.mat('steel',tint='#99826b',wear=.3)
    black = ctx.mat('lensframe')
    body,mag,bolt,coil,reticle,lens = [],[],[],[],[],[]

    def block(name,size,at,mat=dark,c=2,group=body):
        ob=geo.cbox(name,size,at,c=c,mat=mat)
        if c >= 3:
            geo.bevel(ob,.45,1)
        group.append(ob)
        return ob

    def pipe(name,r,start,end,center,mat,inside=0,group=body,segs=24):
        ob=geo.tube(name,r,start,end,'Y',center,segs,r_in=inside,mat=mat)
        if r >= 27:
            geo.bevel(ob,.35,1)
        group.append(ob)
        return ob

    # Ceramic receiver is compact; most of the length belongs to empty space.
    block('receiver',(50,252,51),(0,7,88),ceramic,5)
    block('lower',(43,200,22),(0,18,52),frame,3)
    block('rear_cap',(48,12,47),(0,-126,88),steel,3)
    for sx in (-1,1):
        for y in (-100,18,117):
            body.append(geo.screw('receiver_screw',(sx*25.5,y,88),(sx,0,0),r=2.5,mat=steel))
        block('panel_seam',(1.3,2,35),(sx*25,49,87),frame,.3)
        block('charge_conduit',(4,170,5),(sx*24,24,62),copper,1)
    # A recessed bolt cover and a manually accessible charging tab.
    block('bolt_recess',(2,70,12),(-25.5,61,92),frame,1)
    block('bolt_face',(3,48,8),(-27,62,92),steel,1,bolt)
    block('bolt_tab',(12,15,12),(-33,77,91),dark,2,bolt)

    # Parallel machined rails: an open ladder, never a solid barrel block.
    for sx in (-1,1):
        block('rail_spar',(17,653,33),(sx*29,474,91),steel,3)
        block('rail_ceramic',(14,585,9),(sx*30,465,113),ceramic,2)
        block('rail_stripe',(2.5,544,2),(sx*38.1,465,101),orange,.4)
        for i in range(9):
            # Small transverse heat cuts on the exposed top faces.
            block('rail_gasket',(15,2.5,1.5),(sx*30,204+i*61,118),frame,.3)
        for y in (169,365,565,757):
            body.append(geo.screw('rail_fastener',(sx*29,y,118),(0,0,1),r=2.4,mat=bright))
    # Capacitor rings, copper windings and distinct emissive charge collars.
    charge=ctx.emit('charge',color='#f7931a',strength=3)
    for i,y in enumerate((222,337,452,567,682)):
        pipe('capacitor',24,y-15,y+15,(0,91),dark,inside=15)
        for d in (-17,-10,-3,4,11,18):
            pipe('winding',25,y+d,y+d+2.2,(0,91),copper,inside=23,segs=20)
        pipe('charge_collar',25.7,y-3,y+3,(0,91),charge,inside=24,group=coil,segs=24)
        # The light sits behind a slotted collar rather than across the whole gun.
        for sx in (-1,1):
            block('coil_connector',(7,27,12),(sx*24,y,73),frame,1.2)
    # Slender lower tension tie and two hefty ceramic end yokes.
    block('tension_tie',(11,624,9),(0,470,55),frame,2)
    for y in (153,789):
        block('end_yoke',(90,24,72),(0,y,90),dark,5)
        geo.cut(body[-1],geo.cbox('yoke_aperture',(40,36,39),(0,y,91),c=7))
        for sx in (-1,1):
            body.append(geo.screw('yoke_screw',(sx*35,y,127),(0,0,1),r=3,mat=bright))
    # Heat-tinted muzzle strips move from warm straw to violet at the exit.
    for sx in (-1,1):
        for y,length,mat in ((809,17,heatgold),(825,15,heatblue),(839,13,steel)):
            block('muzzle_rail',(20,length,29),(sx*24,y,91),mat,2)
    block('muzzle_bridge',(69,8,9),(0,843,71),dark,2)

    # Forward counterweight doubles as a mount for the support grip.
    block('counterweight',(64,112,25),(0,288,44),dark,4)
    fore=block('foregrip',(45,112,33),(0,288,17),gripmat,7)
    for y in (248,268,288,308,328):
        block('foregrip_rib',(47,3,6),(0,y,11),frame,1)
    block('foregrip_stop',(50,8,34),(0,346,23),steel,2)
    for sx in (-1,1):
        block('counterweight_pad',(4,70,15),(sx*33,288,44),ceramic,1.5)
        body.append(geo.screw('counterweight_screw',(sx*35.5,271,44),(sx,0,0),r=2.5,mat=steel))

    # Pistol grip and short precision shoulder frame.
    grip=block('grip',(32,53,104),(0,-10,-2),gripmat,9)
    geo.place(grip,rot=(-18,0,0))
    block('tang',(37,36,13),(0,-33,44),frame,3)
    guard=block('guard',(12,64,35),(0,29,25),frame,3)
    geo.cut(guard,geo.cbox('trigger_window',(20,48,23),(0,29,25),c=3))
    block('trigger',(6,7,22),(0,25,31),bright,1)
    block('grip_cap',(37,55,8),(0,-25,-53),frame,3)
    # The cell is a separate rigid node with a top insertion connector.
    block('cell_well',(42,74,18),(0,85,35),frame,3)
    block('cell',(36,63,99),(0,85,-22),ceramic,4,mag)
    block('cell_contact',(27,46,16),(0,85,32),copper,2,mag)
    block('cell_base',(43,70,12),(0,85,-73),dark,3,mag)
    block('cell_pull',(20,40,4),(0,85,-81),steel,1,mag)
    for z in (-48,-37,-26):
        block('cell_grip',(1.4,44,2),(-18.5,85,z),frame,.3,mag)
    block('cell_release',(5,15,9),(-24,49,45),steel,1)
    for sx in (-1,1):
        block('stock_spar',(12,157,16),(sx*16,-211,72),steel,2)
    block('stock_cheek',(39,126,19),(0,-213,100),ceramic,4)
    block('stock_stop',(53,14,104),(0,-295,55),frame,4)
    block('stock_pad',(52,10,98),(0,-307,55),rubber,4)
    for z in (20,40,60,80):
        block('stock_rib',(44,2,2),(0,-312.5,z),dark,.4)

    # Scope: actual hollow eyepiece and objective, on two independent saddles.
    optical_z=165
    for y in (-37,101):
        block('scope_saddle',(28,18,28),(0,y,128),steel,3)
        pipe('scope_clamp',24,y-8,y+8,(0,optical_z),dark,inside=21)
        for sx in (-1,1):
            body.append(geo.screw('scope_mount_screw',(sx*15,y,136),(sx,0,0),r=2,mat=bright))
    pipe('scope_tube',21,-78,132,(0,optical_z),dark,inside=18)
    pipe('eyepiece',27,-102,-57,(0,optical_z),rubber,inside=19,segs=32)
    pipe('eyepiece_lip',27.8,-104,-99,(0,optical_z),steel,inside=19,segs=32)
    pipe('objective_hood',29,125,161,(0,optical_z),dark,inside=23,segs=32)
    pipe('objective_trim',29.5,153,158,(0,optical_z),ceramic,inside=28,segs=32)
    block('optic_plate',(12,25,1.4),(0,-13,186),ceramic,.4)
    # Exposed scope turrets; low enough that the scope remains readable in hip view.
    body.append(geo.tube('elevation_dial',12,183,197,'Z',(0,43),20,mat=steel))
    for i in range(12):
        a=2*math.pi*i/12
        block('dial_knurl',(2,2,8),(12*math.cos(a),43+12*math.sin(a),191),dark,.3)
    block('scope_index',(3,15,1),(0,60,187),orange,.4)
    # The reticle is etched on the eye side of the ocular: alpha-sorted
    # scope glass must not conceal it during the aim transition.
    # Glass at both ends lets aiming see the world through the real aperture.
    lens.append(geo.tube('ocular_glass',18,-75,-74.7,'Y',(0,optical_z),32,mat=ctx.lens))
    lens.append(geo.tube('objective_glass',22,138,138.3,'Y',(0,optical_z),32,mat=ctx.lens))
    glow=ctx.emit('reticle',strength=4)
    reticle.append(geo.tube('reticle_ring',3.6,-79,-78.85,'Y',(0,optical_z),32,r_in=3.1,mat=glow))
    for sx in (-1,1):
        block('reticle_tick',(4,.2,.35),(sx*6,-79,optical_z),glow,.05,reticle)
    block('reticle_center',(.4,.2,.4),(0,-79,optical_z),glow,.05,reticle)
    return dict(parts={'body':body,'mag':mag,'bolt':bolt},
        emissive={'coil':coil,'reticle':reticle},glass={'lens':lens},
        pivots={'mag':(0,85,35),'bolt':(-27,62,92),'coil':(0,452,91),
                'reticle':(0,-79,optical_z),'lens':(0,-75,optical_z)},
        empties={'muzzle':(0,850,91),'sight':(0,-454,optical_z),'eject':(26,91,94)},
        grips={
            'r':dict(side='r',palm=((26,-30,4),((0,.95,-.31),(.95,0,.3))),targets=['grip','guard'],
                fingers={'index':dict(targets=['trigger'],lo=(10,30,15),hi=(60,80,60))},
                thumb=dict(rot=(10,-60,40),targets=['grip','tang','lower'],hi=(30,50,50)),
                forearm=270,elbow=(160,-300,-140)),
            'l':dict(side='l',palm=((-26,289,-14),((1,0,.10),(.10,-.6,-1))),targets=[fore.name,'foregrip_rib'],
                fingers={'index':dict(spread=-3),'ring':dict(spread=3),'pinky':dict(spread=6)},
                thumb=dict(rot=(-20,-40,30),targets=[fore.name]),forearm=310,elbow=(-340,90,-390))},
        world_ratio=.30,
        view=dict(eye=(-125,-500,232),look=(-125,600,232),fov=52),
        three=dict(eye=(-1240,880,710),look=(0,260,48)),
        close=dict(eye=(-305,-240,281),look=(0,10,105)))
