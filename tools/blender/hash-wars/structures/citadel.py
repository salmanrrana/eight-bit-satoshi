"""Citadel: stepped, load-bearing Keeper architecture, no borrowed silhouettes.
Independent roots; place along the settled terrain. The sim currently has no
forecourt terrace/gate boxes: new solids are in the manifest for integration.
"""
import math
from mathutils import Vector
from kit import Part, fine, bolt_row, railing, fins
from architecture import slab, engraving


def gate():
    """Slab-free, 24 m open passage. Wings fit the settled x±16 supports;
    the climbing route runs unaltered beneath the deep portal, no threshold.
    Wings keep the 40 m width; stepped front piers extend to Z+7 m.
    """
    p=Part('citadel_gate')
    # Recessed graphite structure behind tiered pale buttresses. Deep reveals
    # are cut by actual geometry rather than painted on a flat gate frame.
    for side in (-1,1):
        x=side*16
        slab(p,(8,7.2,30.5),(x,.4,15.25),mat='surf:cutStone',paint='graphite',bevel=.16)
        for i in range(6):
            z=i*4.9+2.45
            # Broad ceramic armour courses, lapped onto a darker load path.
            p.box((6.8,.5,4.72),at=(x,-3.35,z),paint='bone',bevel=.10,step=1.8 if fine() else 4)
            for xx in (x-2.7,x+2.7):
                bolt_row(p,(xx,-3.62,z-1.7),(xx,-3.62,z+1.7),3,r=.085)
        # Stepped battered piers at outer and inner arrises. Same wing footprint.
        for dx in (-3.0,3.0):
            for h,depth,width,base in ((7.4,7,1.8,0),(8,6.2,1.5,7.4),(8,5.4,1.2,15.4),(7.1,4.6,.95,23.4)):
                p.box((width,depth,h-.08),at=(x+dx,-depth/2,base+h/2),mat='surf:concrete',paint='stone',bevel=.13,step=2 if fine() else 4)
                p.solid_box((x+dx-width/2,-depth,base+.04),(x+dx+width/2,0,base+h-.04))
        # Recessed long orange index: dark gutters give scale to the light.
        p.box((.48,.16,28.5),at=(x,-3.7,15.25),paint='graphite',bevel=.025,step=3)
        p.box((.11,.035,28.0),at=(x,-3.798,15.25),mat='emit:team',bevel=0,step=4)
        for z in (7.4,15.4,23.4):
            p.box((7.2,.3,.22),at=(x,-3.7,z),paint='graphite',bevel=.02)
        # A walkable maintenance shelf is wholly inside the wing collider;
        # rails and service hatches provide a human scale from the forecourt.
        p.box((5.8,1.1,.23),at=(x,-3.35,5.0),mat='surf:galvanized',paint='iron',bevel=.04)
        railing(p,(x-2.6,-3.91,5.12),(x+2.6,-3.91,5.12),r=.035)
        p.box((1.6,.18,2.65),at=(x-side*1.25,-3.63,1.38),paint='graphite',bevel=.07)
        p.box((1.23,.08,2.18),at=(x-side*1.25,-3.77,1.17),paint='ivory',bevel=.035)
        p.box((.08,.07,.34),at=(x-side*1.25+.4,-3.84,1.15),paint='graphite',bevel=.01)
        p.text('PERSONNEL / '+('01' if side<0 else '02'),.16,at=(x-side*1.25,-3.79,2.63),paint='ivory')
        # Recessed vents and six large service fasteners along each foot.
        for xx in (-2.3,2.3):
            p.box((.65,.05,1.6),at=(x+xx,-3.64,1.6),paint='graphite',bevel=.025)
            if fine():
                for zz in range(9):p.box((.58,.06,.035),at=(x+xx,-3.69,.93+zz*.16),mat='surf:galvanized',paint='iron',bevel=.005)
        for zz in (4.0,9.0,14.0,19.0,24.0):
            # Inset ceramic repairs break repeated broad panels at walking range.
            p.box((1.1,.055,.65),at=(x+side*1.7,-3.63,zz),paint='ivory',bevel=.018)
            p.text('K / '+str(int(zz*100)),.10,at=(x+side*1.7,-3.667,zz),paint='graphite')
    # The full-width lintel encloses nine metres of layered stone and plating.
    slab(p,(40,8,9),(0,0,35),mat='surf:concrete',paint='stone',bevel=.18)
    # Stepped portal: each layer steps 1.2 m in and 1.2 m down from the last,
    # front to back, with a light line on its leading edge, so the opening reads
    # as a deep cut rather than a frame.
    for k,(z,y0,y1,inset) in enumerate(((30.4,-3.8,-1.4,0),(29.2,-1.4,1.2,.6),(28.0,1.2,3.6,1.2))):
        w=24-2*inset
        slab(p,(w,y1-y0,.6+ (30.5-z)),(0,(y0+y1)/2,z+(30.5-z)/2-.3+.3),mat='surf:cutStone',paint='graphite' if k!=1 else 'stone',bevel=.055)
        p.box((w-.4,.05,.07),at=(0,y0-.03,z-.3+.05),mat='emit:team',bevel=0,step=4)
        if inset:
            for side in (-1,1):
                xi=side*(12-inset/2)
                slab(p,(inset,y1-y0,z-.3),(xi,(y0+y1)/2,(z-.3)/2),mat='tex:keeper',paint='bone' if k==2 else 'graphite',bevel=.05)
                p.box((.05,.07,z-1.0),at=(side*(12-inset)+side*-.03,y0-.04,(z-.3)/2),mat='emit:team',bevel=0,step=4)
    # Human-width catwalk below the monumental inscription gives the header
    # a readable service scale. Its deck has its own collision-authored slab.
    slab(p,(23.8,1.1,.25),(0,-4.25,30.8),mat='surf:galvanized',paint='iron',bevel=.035)
    railing(p,(-11.8,-4.75,30.93),(11.8,-4.75,30.93),post_every=2.5,r=.035)
    # Colossal block height cut across a 34 m ceramic frieze, a light line under it.
    engraving(p,'6 929 999',5.4,(0,-4.20,35.4),34,5.6,depth=.16)
    p.box((32,.06,.09),at=(0,-4.24,32.45),mat='emit:team',bevel=0,step=4)
    p.box((34.4,.3,.34),at=(0,-4.12,32.2),paint='graphite',bevel=.03,step=4)
    p.box((34.4,.3,.34),at=(0,-4.12,38.4),paint='graphite',bevel=.03,step=4)
    p.text('KEEPER   /   CONSENSUS CITADEL',.36,at=(0,-4.29,32.2),paint='bone',depth=0)
    for x in (-18.6,18.6):
        p.box((2.4,.3,7.4),at=(x,-3.98,35.1),paint='bone',bevel=.10,step=2)
        for z in (32.5,37.7):bolt_row(p,(x-.8,-4.15,z),(x+.8,-4.15,z),2,r=.09)
    # Coping and light-lined inner returns extend back into the portal.
    p.box((39.5,7.7,.4),at=(0,0,39.3),mat='surf:cutStone',paint='graphite',bevel=.08,step=3)
    for side in (-1,1):
        for y in (-2.8,0,2.8):
            p.box((.13,.24,28.0),at=(side*12.04,y,15),paint='iron',bevel=.02,step=3)
            p.box((.025,.08,26.0),at=(side*11.965,y,15),mat='emit:team',bevel=0,step=3)
    for side in (-1,1):
        x=side*16
        # Tower heads rise above the lintel: a ceramic stage, a lit crown, a cap.
        slab(p,(7.2,6.6,7.4),(x,0,39.5+3.7),mat='surf:cutStone',paint='graphite',bevel=.12)
        for y in (-3.45,3.45):
            for i in range(2):
                p.box((6.2,.4,3.3),at=(x,y,40.05+1.65+i*3.6),paint='bone' if i==0 else 'ivory',bevel=.08,step=2.5)
        p.box((.48,.16,6.8),at=(x,-3.72,43.3),paint='graphite',bevel=.025,step=3)
        p.box((.11,.035,6.5),at=(x,-3.81,43.3),mat='emit:team',bevel=0,step=4)
        slab(p,(6.0,5.4,3.6),(x,0,46.9+1.8),mat='surf:cutStone',paint='graphite',bevel=.08)
        for ang in (0,90,180,270):
            import mathutils
            R=mathutils.Matrix.Rotation(math.radians(ang),4,'Z')
            half=2.7 if ang in (0,180) else 3.0
            for i in range(6 if fine() else 3):
                at=R@Vector((0,-half-.05,47.4+i*(2.6/(6 if fine() else 3))))
                p.box((4.4 if ang in (0,180) else 3.8,.26,.05),at=(x+at.x,at.y,at.z),rot=(-35,0,ang),paint='graphite',bevel=0,step=4)
        p.box((6.1,5.5,.16),at=(x,0,50.4),mat='emit:team',bevel=0,step=4)
        p.box((6.8,6.2,.55),at=(x,0,50.8),paint='bone',bevel=.08,step=3)
        p.cyl(.06,2.4,at=(x+side*-2.2,-2.0,51.1),mat='surf:galvanized',paint='white')
        p.cyl(.12,.18,at=(x+side*-2.2,-2.0,53.5),mat='emit:team')
        # Galleries between the buttresses at 15.4 and 23.4 m, with doors.
        for z in (15.4,23.4):
            p.box((4.6,1.4,.2),at=(x,-4.3,z),mat='surf:galvanized',paint='iron',bevel=.03)
            railing(p,(x-2.25,-4.95,z+.1),(x+2.25,-4.95,z+.1),r=.035)
            p.box((1.3,.12,2.3),at=(x,-3.62,z+1.25),paint='graphite',bevel=.04)
            p.box((.6,.04,.08),at=(x,-3.7,z+2.55),mat='emit:lamp',bevel=0)
            p.solid_box((x-2.3,-5.0,z-.1),(x+2.3,-3.6,z+.1))
        p.box((.7,.06,.1),at=(x-side*1.25,-3.8,3.0),mat='emit:lamp',bevel=0)
        # Rear face: ceramic courses and the light line, seen from the summit.
        for i in range(6):
            p.box((6.8,.5,4.72),at=(x,4.25,i*4.9+2.45),paint='bone' if i%2 else 'ivory',bevel=.10,step=2.5)
        p.box((.48,.16,28.5),at=(x,4.55,15.25),paint='graphite',bevel=.025,step=3)
        p.box((.11,.035,28.0),at=(x,4.648,15.25),mat='emit:team',bevel=0,step=4)
        # Curtain walls tie the gate into the cliffs: battered plinth, ceramic
        # bays between graphite pilasters, slit windows, coping and a light line.
        cx=side*28.25
        slab(p,(16.5,5.3,30),(cx,1.85,9.0),mat='surf:cutStone',paint='graphite',bevel=.12)
        p.box((16.5,1.2,7.0),at=(cx,-1.2,-2.5),mat='surf:concrete',paint='stone',bevel=.1,step=3,taper=(1,.4))
        for k in range(5):
            px=side*(20.4+k*4.0)
            p.box((.9,.7,23.0),at=(px,-1.05,1.0+11.5),paint='graphite',bevel=.06,step=3)
        for k in range(4):
            bx=side*(22.4+k*4.0)
            for i in range(5):
                z=1.4+i*4.2
                p.box((3.0,.32,3.9),at=(bx,-.95,z+1.95),paint='bone' if (i+k)%3 else 'ivory',bevel=.07,step=2.5)
            if k%2==0:
                p.box((.5,.1,1.7),at=(bx,-1.13,14.0),paint='dark',bevel=.02)
                p.box((.08,.04,1.3),at=(bx,-1.17,14.0),mat='emit:amber',bevel=0)
        p.box((17.0,6.0,.7),at=(cx,1.85,24.35),mat='surf:cutStone',paint='graphite',bevel=.08,step=3)
        p.box((17.2,.5,.5),at=(cx,-1.25,24.95),paint='bone',bevel=.06,step=3)
        p.box((15.5,.05,.09),at=(cx,-1.13,22.2),mat='emit:team',bevel=0,step=4)
        railing(p,(side*20.3,-.7,25.2),(side*36.3,-.7,25.2),post_every=2.4,r=.035)
    # Rear inscription over the passage, read from the summit.
    p.text('THE CHAIN HOLDS',1.5,at=(0,4.06,34.6),rot=(90,0,180),depth=.12,paint='graphite',font='sans')
    p.box((26,.06,.09),at=(0,4.04,32.6),mat='emit:team',bevel=0,step=4)
    p.empty('gate_lamp',(0,-3.8,30.5))
    return p


def wall():
    p=Part('terrace_wall')
    slab(p,(12,2,2.7),(0,0,1.35),mat='surf:cutStone',paint='graphite')
    for x in (-4.5,-1.5,1.5,4.5):
        slab(p,(2.96,.28,2.55),(x,-1.1,1.325),mat='surf:concrete')
    slab(p,(12.1,2.2,.3),(0,0,2.85),mat='surf:cutStone')
    for x in (-5.3,5.3):
        p.box((.4,.03,.09),at=(x,-1.253,2.3),mat='emit:team',bevel=.005)
    for x in (-4.5,-1.5,1.5,4.5):
        p.box((.1,.04,.17),at=(x,-1.26,.2),paint='graphite',bevel=.015)
    for x in (-3,0,3):
        p.box((.22,.06,.12),at=(x,-1.27,.35),paint='graphite',bevel=.015)
    return p


def steps():
    p=Part('terrace_steps')
    # Nine 30 cm risers; below the simulation's 35 cm auto-step limit.
    for i in range(9):
        y=-2.7+i*.6;h=(i+1)*.3
        slab(p,(8,.6,h),(0,y,h/2),mat='surf:cutStone')
        p.box((7.7,.06,.01),at=(0,y-.24,h+.006),paint='ivory',bevel=0,step=2)
    for x in (-3.6,3.6):
        for y,z in ((-2.9,.3),(.1,1.8),(1.9,2.7)):
            p.box((.11,.035,.04),at=(x,y,z-.1),mat='emit:team',bevel=.004)
    for x in (-3.86,3.86):
        railing(p,(x,-2.9,.3),(x,2.3,2.7),r=.032)
    return p


def paving():
    p=Part('forecourt_paving')
    slab(p,(12,12,.3),(0,0,.15),mat='surf:cutStone')
    for x in (-4,-2,0,2,4):
        p.box((.018,11.98,.005),at=(x,0,.304),paint='iron',bevel=0,step=3)
    for y in (-4,0,4):
        p.box((11.98,.018,.005),at=(0,y,.304),paint='iron',bevel=0,step=3)
    for x in (-5.5,5.5):
        for y in (-5.5,5.5):
            p.box((.34,.34,.01),at=(x,y,.309),paint='iron',bevel=.02)
    return p


def platform():
    p=Part('summit_platform')
    # Three shallow octagonal courses. Front stairs make the 0.9 m climb usable.
    for r,z in ((6,0),(5.8,.3),(5.6,.6)):
        p.cyl(r,.3,at=(0,0,z),n=8,mat='surf:cutStone',bevel=.04,paint='stone')
        # Conservative eight-sided footprint decomposed into three rectangles.
        p.solid_box((-r*.70,-r*.70,z),(r*.70,r*.70,z+.3))
        p.solid_box((-r*.923,-r*.382,z),(r*.923,r*.382,z+.3))
        p.solid_box((-r*.382,-r*.923,z),(r*.382,r*.923,z+.3))
    for x in (-2.7,2.7):
        p.box((.07,4,.015),at=(x,0,.909),mat='emit:team',bevel=0)
    for i in range(3):
        slab(p,(3,.65,(i+1)*.3),(0,-6.5+i*.65,(i+1)*.15),mat='surf:cutStone')
    for x in (-1.5,1.5):
        for y in (-1.5,1.5):p.cyl(.065,.018,at=(x,y,.902),n=8,paint='iron')
    p.empty('beacon_mount',(0,0,.9))
    return p


def beacon():
    p=Part('summit_beacon')
    slab(p,(2.6,2.6,.3),(0,0,.15),mat='surf:cutStone')
    slab(p,(1.6,1.6,1.4),(0,0,1),mat='surf:concrete')
    for x in (-.65,.65):
        p.box((.28,1.3,6.7),at=(x,0,3.65),paint='bone',bevel=.06,step=2)
        p.box((.05,.05,5.5),at=(x,-.68,3.7),mat='emit:team',bevel=0)
    p.box((1.3,.7,5),at=(0,.28,3.7),paint='graphite',bevel=.07,step=2)
    core=Part('beacon_core',origin=(0,0,1.8),parent=p)
    core.cyl(.28,4.8,at=(0,0,1.8),n=16,mat='emit:team')
    # Optical head is a separate rigid pivot; engine can yaw or raise it.
    head=Part('beacon_emitter',origin=(0,0,6.9),parent=p)
    head.cyl(.8,.25,at=(0,0,6.9),n=16,paint='graphite',bevel=.03)
    head.cyl(.57,.22,at=(0,0,7.15),n=16,paint='bone',bevel=.03)
    head.cyl(.38,.06,at=(0,0,7.37),n=16,mat='emit:team')
    for x in (-.58,.58):head.box((.15,.9,.65),at=(x,0,7.2),paint='bone',bevel=.04)
    p.box((.7,.16,.46),at=(0,-.84,1.3),rot=(20,0,0),paint='graphite',bevel=.03)
    p.box((.25,.035,.2),at=(0,-.95,1.3),mat='emit:team',bevel=.015)
    p.text('HOLD / LINK',.09,at=(0,-.965,1.08),paint='graphite')
    engraving(p,'01',.52,(0,-.815,.6),.85,.55)
    for z in (.42,.51,.6):
        p.box((.018,.7,.025),at=(.812,0,z),paint='graphite',bevel=.006)
    head.ring_profile([(.38,7.415),(.48,7.415),(.48,7.47),(.38,7.47),(.38,7.415)],n=16,paint='graphite',caps=(False,False))
    head.empty('beacon_beam',(0,0,7.48));p.empty('beacon_use',(0,-1.1,1.2))
    p.solid_box((-.85,-.85,.3),(.85,.85,7.85))
    return p


def monument():
    p=Part('whitepaper_monument')
    slab(p,(6,2.5,.25),(0,0,.125),mat='surf:cutStone',paint='graphite')
    slab(p,(5.6,1.9,2.75),(0,0,1.625),mat='surf:cutStone')
    engraving(p,'Bitcoin:\nA Peer-to-Peer\nElectronic Cash System',.34,(0,-.975,1.95),5.3,1.75,depth=.025)
    engraving(p,'Satoshi Nakamoto',.22,(0,-.975,.75),5.3,.55,depth=.018)
    p.box((3.8,.025,.018),at=(0,-.994,1.03),paint='graphite',bevel=0)
    p.text('2008   /   2140',.12,at=(0,-.987,2.91),paint='graphite')
    p.box((.08,.015,.36),at=(-2.48,-.998,2.62),paint='orange',bevel=.005)
    p.empty('monument_read',(0,-5.975,1.68))
    return p


def build(reg,only):
    for name,fn,note in [
        ('citadel_gate',gate,'53.6 m high, 73 m across curtain wings; deep stepped portal and crown towers. Slab-free 24 m central passage; wings centred x±16. Place at x0,z-389 on independent level retaining footings. Route support is untouched; personnel doors and maintenance shelves are in the solid wing envelopes.'),
        ('terrace_wall',wall,'12 m module, height3; backfill rises behind wall. New forecourt solids needed: current sim only has cover/pylon/spire, no terrace boxes.'),
        ('summit_beacon',beacon,'7.525 m emitter. Place on platform; engine use target must follow beacon_use. beacon_emitter pivot local Y6.9: yaw Y, rise up to .8 m. beacon_core emits team.'),
        ('whitepaper_monument',monument,'3 m stone block. Actual cut title and author; monument_read is 5 m from engraved face. Front +Z.')]:
        if not only or name in only:reg.add(name,fn,lod=True,ao=2.5,note=note,lod_ratio=.32 if name=='citadel_gate' else .35)
