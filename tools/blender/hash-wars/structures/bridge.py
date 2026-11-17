"""Dam crossing kit. Existing 9 x 75 x 1 m deck and 1 x 10.2 x 1.25 parapets
are authoritative. Origin under each piece; deck bays' top is local Y=1.
"""
import math
from kit import Part, fine, bolt_row, railing, ladder, fins
from architecture import slab, bearing, engraving


def deck(variant=0):
    p=Part(['causeway_segment','causeway_segment_b','causeway_segment_c'][variant])
    slab(p,(9,15,1),(0,0,.5),mat='surf:concrete')
    # Post-tensioned edge ribs, bearing ledges and a narrow service gutter.
    for x in (-4.25,4.25):
        p.box((.5,15,.48),at=(x,0,.25),paint='graphite',bevel=.07,step=2)
        for y in (-5,0,5):
            p.box((.14,.5,.3),at=(x,y,.25),paint='iron',bevel=.02)
        p.box((.09,14.95,.015),at=(x*.91,0,1.009),paint='iron',bevel=0,step=3)
    # Non-uniform slab sizes, with flush transverse joints and staggered repairs.
    for y in (-5.1,-1.2,3.4):
        p.box((7.7,.025,.008),at=(0,y,1.005),paint='graphite',bevel=0,step=3)
    for side in (-1,1):
        for y in (-5.8,-2.2,1.4,5):
            p.box((.35,.7,.016),at=(side*3.7,y,1.012),paint='graphite',bevel=.008)
            if fine():
                for dy in (-.22,0,.22):p.box((.28,.018,.006),at=(side*3.7,y+dy,1.023),paint='iron',bevel=0)
    for end in (-7.46,7.46):
        p.box((8.8,.06,.018),at=(0,end,1.012),paint='graphite',bevel=0,step=2)
    # Flush service-patch patterns vary independently of the identical seam pitch.
    for x,y0 in [(-1.2+variant*.9,1.8-variant*2.4),(2.7-variant*.8,-4.8+variant)]:
        p.box((.65+variant*.2,.018,.006),at=(x,y0,1.006),paint='iron',bevel=0)
    y=[-3.2,2.1,5.4][variant]
    p.box((.9,1.2,.025),at=(-2.8 if variant!=1 else 2.8,y,1.015),paint='iron',bevel=.012)
    bolt_row(p,(-3.14,y-.4,1.032),(-2.46,y-.4,1.032),3,'+Z',r=.019)
    return p


def parapet():
    p=Part('causeway_parapet')
    slab(p,(1,10.2,1.25),(0,0,.625),mat='surf:concrete')
    for x in (-.51,.51):
        p.box((.025,9.6,.14),at=(x,0,.35),paint='graphite',bevel=.012)
        for y in (-4,0,4):
            p.box((.026,.22,.4),at=(x,y,.8),paint='ivory',bevel=.012)
    for y in (-4.8,4.8):p.box((1, .028,.008),at=(0,y,1.254),paint='iron',bevel=0)
    for side in (-1,1):
        for y in (-3.2,2.4):p.box((.012,.3,.08),at=(side*.519,y,.15),paint='dark',bevel=.015)
    p.box((.08,10,.025),at=(0,0,1.258),mat='emit:team',bevel=0)
    return p


def support():
    p=Part('causeway_pier')
    # Splayed paired legs carry transverse cap; 37 m up from gorge bed to deck underside.
    slab(p,(12,8,1.2),(0,0,.6),mat='surf:cutStone',paint='graphite')
    for x in (-3.4,3.4):
        slab(p,(3.5,5.6,4),(x,0,3.2),paint='stone')
        p.box((2.8,4.5,28),at=(x,0,19),mat='surf:concrete',bevel=.12,taper=(.76,.72),step=2 if fine() else 5)
        p.solid_box((x-1.4,-2.25,5),(x+1.4,2.25,33))
        p.box((.45,4.7,23),at=(x,0,20),paint='graphite',bevel=.055,step=3)
        for z in (8,15,22,29):
            p.box((2.95,4.6,.14),at=(x,0,z),mat='surf:cutStone',paint='stone',bevel=.02,step=3)
    slab(p,(10.8,5,2.5),(0,0,34.25),mat='surf:concrete')
    for x in (-3.4,3.4):
        bearing(p,x,0,35.65,w=2.5)
        slab(p,(3.2,2,1.1),(x,0,36.45),mat='surf:concrete')
    for x in (-3.4,3.4):
        p.box((1.8,.05,1.2),at=(x,-2.82,3.6),paint='bone',bevel=.035)
    for x in (-3.4,3.4):
        bolt_row(p,(x-.6,-2.86,3.25),(x+.6,-2.86,3.25),3,r=.035)
    engraving(p,'02',1.7,(0,-2.535,34.25),3.2,2.15)
    return p


def sluice():
    p=Part('dam_sluice')
    for x in (-3.1,3.1):slab(p,(1.4,3,14),(x,0,7),mat='surf:concrete')
    slab(p,(7.6,3,1.1),(0,0,14.45),mat='surf:concrete')
    gate=Part('sluice_gate',origin=(0,0,2),parent=p)
    gate.box((4.8,.45,11.8),at=(0,0,7.9),paint='graphite',bevel=.08,step=2)
    for z in (2.7,4.8,6.9,9,11.1,13.2):
        gate.box((4.9,.7,.25),at=(0,-.15,z),mat='surf:galvanized',paint='iron',bevel=.03,step=2)
    p.solid_box((-2.4,-.4,2),(2.4,.4,13.8))
    for x in (-2.1,2.1):
        p.cyl(.09,13,at=(x,0,2),mat='surf:galvanized',n=10)
        p.box((.45,1, .5),at=(x,0,15.1),paint='bone',bevel=.06)
    for x in (-3.1,3.1):
        p.box((.17,.06,11),at=(x,-1.53,7.5),paint='graphite',bevel=.025,step=2)
    ladder(p,(3.85,0,.2),15.1,facing='+X',cage_from=3)
    p.empty('sluice_winch_mount',(0,0,15))
    return p


def winch():
    p=Part('dam_winch')
    slab(p,(3.5,2.4,.25),(0,0,.125),mat='surf:concrete')
    for x in (-1.35,1.35):
        p.box((.42,1.8,1.85),at=(x,0,1.15),paint='bone',bevel=.1,taper=(.8,.8))
        bolt_row(p,(x,-.65,.27),(x,.65,.27),3,'+Z',r=.04)
    p.cyl(.58,2.5,at=(-1.25,0,1.2),rot=(0,90,0),paint='graphite',n=32)
    for x in (-1.15,1.15):p.cyl(.73,.12,at=(x-.06,0,1.2),rot=(0,90,0),paint='iron',bevel=.025)
    if fine():
        for x in [i*.09-1 for i in range(23)]:
            p.cyl(.6,.025,at=(x,0,1.2),rot=(0,90,0),paint='iron',n=24)
    p.box((1.2,.7,.5),at=(0,.65,1.9),paint='bone',bevel=.075)
    p.box((.8,.03,.045),at=(0,.283,1.9),mat='emit:team',bevel=0)
    bolt_row(p,(-1.72,-.7,.6),(-1.72,.7,.6),4,'-X',r=.03)
    p.pipe([(-1.3,.5,1.75),(-.9,.9,1.8),(.9,.9,1.8),(1.3,.5,1.75)],.035,mat='tex:keeper',paint='graphite',n=8)
    p.text('02 / WATER CONTROL',.12,at=(0,-.65,.58),paint='ivory')
    p.solid_box((-1.75,-1.2,0),(1.75,1.2,2.15))
    return p


def hut():
    p=Part('dam_control_hut')
    slab(p,(5,4.8,.25),(0,0,.125),mat='surf:cutStone')
    slab(p,(4.3,3.8,3.2),(0,0,1.85),mat='surf:concrete',paint='graphite')
    for x in (-1.9,1.9):p.box((.45,4,3.4),at=(x,0,1.95),paint='bone',bevel=.08)
    p.box((4.6,4.3,.28),at=(0,0,3.64),paint='bone',bevel=.07)
    p.box((3.3,.04,.8),at=(0,-1.925,2.6),paint='dark',bevel=.02)
    for x in (-1.2,0,1.2):p.box((.06,.1,.85),at=(x,-1.97,2.6),paint='bone',bevel=.01)
    p.box((1.04,.12,2.12),at=(-.95,-1.95,1.31),paint='iron',bevel=.04)
    p.box((.065,.13,.28),at=(-.6,-2.035,1.3),mat='surf:galvanized',bevel=.009)
    p.box((3.4,.06,.055),at=(0,-1.94,3.25),mat='emit:team',bevel=0)
    engraving(p,'02',.72,(1,-1.99,1.3),1.1,1.3)
    bolt_row(p,(-1.88,-2.02,.5),(-1.88,-2.02,3.3),6,r=.025)
    fins(p,(0,1.94,1.8),2.9,1.2,16,depth=.15,axis='X',paint='iron')
    p.box((.6,.2,.55),at=(1.92,1.2,1),paint='graphite',bevel=.04)
    p.pipe([(1.92,1.2,.8),(1.92,1.2,.3),(2.2,1.2,.25)],.04,mat='tex:keeper',paint='iron',n=8)
    p.empty('hut_lamp',(0,-2.1,3.4))
    return p


def tower():
    p=Part('watcher_tower')
    slab(p,(6,6,.8),(0,0,.4),mat='surf:cutStone')
    slab(p,(3.8,3.8,10.5),(0,0,6.05),mat='surf:concrete',paint='stone')
    for x in (-1.72,1.72):
        p.box((.35,4.2,10.6),at=(x,0,6.1),paint='bone',bevel=.07,step=2)
    for z in (3.2,6.4,9.6):
        p.box((3.9,3.9,.12),at=(0,0,z),paint='graphite',bevel=.015,step=2)
    slab(p,(6,6,.5),(0,0,11.55),mat='surf:concrete')
    # Low parapets leave watcher feet and silhouette visible.
    for x in (-2.8,2.8):slab(p,(.4,6,.65),(x,0,12.125),mat='surf:concrete')
    slab(p,(5.2,.4,.65),(0,2.8,12.125),mat='surf:concrete')
    p.box((3.2,.04,.055),at=(0,-3.015,11.55),mat='emit:team',bevel=0)
    engraving(p,'02',1.25,(0,-1.955,8.1),2.6,2.4)
    p.box((1.15,.08,2.2),at=(0,-1.95,1.9),paint='graphite',bevel=.04)
    p.text('ACCESS',.12,at=(0,-2.003,2.8),paint='ivory')
    ladder(p,(0,2.05,.8),11.85,facing='+Y')
    for x in (-2.65,2.65):
        p.box((.09,.08,.55),at=(x,-2.96,12.07),paint='orange',bevel=.012)
    p.empty('watcher_stand',(0,0,11.8))
    return p


def build(reg,only):
    entries=[('causeway_segment'+s,lambda v=i:deck(v),'15 m repeat along Z; top local Y=1. Place y=21, z=-157.5-15*i; five bays reach -225.') for i,s in enumerate(['','_b','_c'])]
    entries += [('causeway_parapet',parapet,'Matches layout: x +/-5, y22, z=-155-10*i (i 0..6). 1 x 1.25 x 10.2 m.'),
        ('causeway_pier',support,'37 m foot-to-bearing. Place at y=-16 (top y21), z=-165,-187.5,-210; do not bottom-align to deck.'),
        ('dam_sluice',sluice,'Off-lane dam bay; pivot sluice_gate local Y=2; raise max 9 m. Needs new layout solids.'),
        ('dam_winch',winch,'Separate winch housing for sluice top or deck-side cover; needs layout solids.'),
        ('dam_control_hut',hut,'Off-lane control shelter; needs layout solids.'),
        ('watcher_tower',tower,'Two far-bank towers; watcher_stand at local Y11.8. Watchers currently spawn on deck; STATIONS/LEAD must place actors and solids together.')]
    for name,fn,note in entries:
        if not only or name in only:reg.add(name,fn,lod=True,ao=2,note=note,lod_ratio=.35)
