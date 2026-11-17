"""HAULER: a twin-sponson lifting frame, four gimballed lift engines, deep belly bay."""
import math
from lib import (empty,node,box,cyl,annulus,rod_between,tube,loft,smooth_sections,bolts)

CONFIG=dict(tex=2048,webp_quality=74,budget=40000,lod_ratio=.33,
    ao_dist=.75,edge_dist=.014,cav_dist=.06,edge_gain=.7,bevel_r=.009,
    dust_h=-2,dust_h0=-3,dust_col=(.16,.15,.13),heat=[((0,-5,-.5),2)],
    render=dict(lift=6,focus=0,size=14,close=22,close_eye=1.7))


def build():
    root=empty('hauler',(0,0,0))
    parts=[]
    # Two aerodynamic load-bearing sponsons leave a real open central cargo well.
    for s in (-1,1):
        x=s*2.4
        hull=[(-7,0,.36,.30,.30,3,x),(-5.8,.08,.65,.75,.6,3.4,x),
            (-2,.16,.72,1.34,.86,3.6,x),(3,.16,.65,1.30,.88,3.5,x),
            (5.7,.10,.49,.55,.48,3.2,x),(7,-.02,.12,.17,.17,3,x)]
        parts += [loft(smooth_sections(hull,3),'pearl',segs=28),
            box((.55,8.5,.28),(s*2.4,-.2,-.68),'carbon',bevel=.1),
            box((.2,5.0,.55),(s*3.08,-.2,.12),'chrome',bevel=.08)]
        for f in (-4.9,4.4):
            parts += [box((2.1,.70,.40),(s*3.35,f,.05),'pearl2',bevel=.18),
                cyl(.33,.70,(s*4.08,f,0),'gunmetal',axis='x',segs=24)]
        # Recessed aft heat exchange, seated behind a carbon grille.
        parts += [box((.9,.23,.9),(x,-6.02,0),'gunmetal',bevel=.16)]
        for i in range(5):
            parts.append(box((.65,.15,.06),(x,-6.17,-.32+i*.16),'chrome',bevel=.02))
        parts += bolts([(s*3.14,f,.28) for f in (-3,-.6,2.5)],(s,0,0),.055,h=.022)
    # Upper keel and two structural bridges; belly remains open when doors swing out.
    parts += [loft([(-5.7,.28,.45,.28,.25,3),(-3,.62,.72,.48,.28,3.5),
        (2,.65,.68,.55,.3,3.5),(5.5,.25,.28,.28,.25,3)],'pearl',segs=28),
        box((4.2,.90,.55),(0,-4.55,.32),'pearl2',bevel=.22),
        box((4.2,.90,.55),(0,4.45,.32),'pearl2',bevel=.22),
        box((3.6,7.6,.24),(0,-.05,.82),'carbon',bevel=.08)]
    for f in (-3.5,-1.8,0,1.8,3.5):
        parts += [box((3.85,.12,.2),(0,f,.04),'gunmetal',bevel=.035)]
    parts += [loft(smooth_sections([(4.5,.38,.60,.65,.52,3),
        (5.4,.42,.67,.60,.51,3.6),(6.05,.32,.50,.35,.33,3),
        (6.42,.25,.23,.15,.15,3)],3),'pearl',segs=28),
        box((1.10,.13,.27),(0,6.35,.28),'glass',bevel=.065)]
    body=node('body',parts,(0,0,0),root)
    # Nose visor is one cold slit, not a cockpit or a copied aircraft canopy.
    node('sensor',[box((.84,.035,.10),(0,6.43,.28),'sensor',bevel=.035)],(0,6.43,.28),body)
    bay=node('bay',[box((.18,7.4,.32),(-1.45,0,-.1),'chrome',bevel=.06),
        box((.18,7.4,.32),(1.45,0,-.1),'chrome',bevel=.06),
        box((2.9,.25,.35),(0,-3.6,-.10),'gunmetal',bevel=.08),
        box((2.9,.25,.35),(0,3.6,-.10),'gunmetal',bevel=.08)],(0,0,-.38),body)
    empty('bay_release',(0,0,-.75),bay)
    # Visible sling machinery explains how a carrier lowers its passengers.
    for i,(s,f) in enumerate(((-1,-2.35),(1,-2.35),(-1,2.35),(1,2.35))):
        x=s*1.20; pivot=(x,f,.39)
        drum=[cyl(.17,.34,pivot,'gunmetal',axis='f',segs=20)]
        for d in (-.19,.19):
            drum.append(annulus(.235,.12,.045,(x,f+d,.39),'chrome',axis='f',segs=20))
        node('winch_'+str(i),drum,pivot,bay)
        node('sling_'+str(i),[
            tube([(x,f,.36),(x-s*.14,f-.05,.14),(x-s*.16,f,-.27)],.026,'rubber',segs=8),
            annulus(.085,.045,.05,(x-s*.16,f,-.30),'steel',axis='f',segs=16),
        ],(x-s*.16,f,-.30),bay)

    for i,s in enumerate((-1,1)):
        door_parts=[box((1.47,7.0,.16),(s*.735,0,-.44),'pearl2',bevel=.07),
            box((.16,6.65,.14),(s*1.24,0,-.55),'gunmetal',bevel=.04)]
        for f in (-2.8,-1.4,0,1.4,2.8):
            door_parts.append(box((1.20,.13,.12),(s*.75,f,-.55),'chrome',bevel=.03))
        node('bay_door_'+str(i),door_parts,(s*1.48,0,-.38),bay)
    for i,(s,f) in enumerate(((-1,-4.9),(1,-4.9),(-1,4.4),(1,4.4))):
        x=s*4.08
        parts=[annulus(.83,.62,1.30,(x,f,-.10),'pearl',axis='z',segs=32),
            cyl(.88,.18,(x,f,-.64),'gunmetal',axis='z',segs=32,bevel=.04),
            annulus(.83,.59,.26,(x,f,-.82),'chrome',axis='z',segs=32),
            cyl(.58,.06,(x,f,-.932),'engine',axis='z',segs=32),
            cyl(.17,.16,(x,f,-.96),'carbon',axis='z',segs=20)]
        parts += [annulus(.77,.55,.16,(x,f,.60),'chrome',axis='z',segs=32),
            cyl(.54,.035,(x,f,.48),'carbon',axis='z',segs=32)]
        parts += [cyl(.38,.24,(x+s*.88,f,0),'gunmetal',axis='x',segs=24),
            cyl(.25,.28,(x+s*.91,f,0),'chrome',axis='x',segs=24),
            cyl(.11,.30,(x+s*.93,f,0),'carbon',axis='x',segs=16),
            box((.60,.16,.63),(x,f-.82,.05),'gunmetal',bevel=.08)]
        for j in range(5):
            parts.append(box((.46,.10,.04),(x,f-.92,-.18+j*.115),'chrome',bevel=.01))
        parts.append(tube([(x-s*.72,f-.32,.25),(x-s*1.05,f-.65,.40),
            (x-s*1.22,f-.66,.22),(x-s*1.55,f-.35,.12)],.065,'rubber',segs=10))
        for k in range(8):
            a=k*math.pi/4
            parts.append(rod_between((x+math.cos(a)*.20,f+math.sin(a)*.20,-.984),
                (x+math.cos(a+.20)*.57,f+math.sin(a+.20)*.57,-.984),.04,'gunmetal',segs=6))
        node('thruster_'+str(i),parts,(x,f,0),body)
    node('vent_0',[box((1.1,.25,.65),(0,-5.58,.25),'gunmetal',bevel=.12),
        box((.8,.06,.30),(0,-5.74,.25),'heat',bevel=.08)],(0,-5.6,.25),body)
    g=empty('gun',(0,5.3,0),body);empty('muzzle',(0,5.5,0),g)
    return dict(root=root,flyer=True,weak=[],axes={'thruster_*':'X vectoring at nacelle axle',
        'bay_door_0':'Z hinge, outward +','bay_door_1':'Z hinge, outward -'},
        extra={'role':'unshootable squad carrier','hover_origin_y':6,'length_m':14,
            'bay_release':'bay_release marks belly exit; lower passengers along -Y',
            'winches':'winch_0..3 turn about local Z (forward); sling_0..3 are capped cables and closed shackles',
            'doors':'bay_door_0 and bay_door_1 use local Z (forward) hinges; open ±75 degrees',
            'thrusters':'four separate rigid pods, emit:engine, tilt about local X'})
