"""Person-height geothermal trunk on stone piers. Segment repeats every 8 m."""
import math
from kit import Part,fine,bolt_row,hazard,cable_tray


def pipeline(variant=0):
    p=Part('pipeline_segment' if not variant else 'pipeline_segment_b')
    # Axis is glTF Z; centreline 3 m up, diameter 1.8 m.
    p.pipe([(0,-4,3),(0,4,3)],.9,mat='surf:galvanized',paint='iron',caps=(True,True),n=40 if fine() else 16)
    for y in (-3.92,0,3.92):
        p.cyl(1.04,.12,at=(0,y-.06,3),rot=(-90,0,0),mat='surf:galvanized',paint='iron',bevel=.018)
        if fine():
            for i in range(16):
                a=math.tau*i/16
                p.cyl(.031,.07,at=(.98*math.cos(a),y+.07,3+.98*math.sin(a)),rot=(-90,0,0),mat='surf:galvanized',n=6)
    # Eight replaceable insulation jackets with axial seams.
    for y in (-3,-1,1,3):
        p.cyl(.914,1.85,at=(0,y-.925,3),rot=(-90,0,0),mat='surf:galvanized',bevel=.009,n=40 if fine() else 16)
        for x in (-.74,.74):
            p.box((.045,1.7,.04),at=(x,y,3.54),paint='graphite',bevel=.006)
    cable_tray(p,(1.12,-4,2.8),(1.12,4,2.8),w=.28)
    for y in (-2,2):
        p.box((.45,.14,.1),at=(.98,y,2.7),paint='iron',bevel=.012)
    if variant:
        p.pipe([(0,1,3.9),(0,1,4.18)],.1,mat='surf:galvanized')
        p.cyl(.22,.1,at=(0,1,4.18),mat='tex:keeper',paint='orange',bevel=.012)
    else:
        p.box((.025,1.6,.3),at=(.918,.8,3),paint='ivory',bevel=.006)
        p.text('FLOW / 2140',.16,at=(.936,.8,3),rot=(90,0,90),paint='graphite')
    # Direction arrows on the visible side; flange rings retain individual nuts.
    p.text('>>>',.22,at=(.93,-1.4,3),rot=(90,0,90),paint='orange',depth=.003)
    p.solid_box((-.93,-4,2.07),(.93,4,3.93))
    return p


def pier():
    p=Part('pipeline_pier')
    p.box((3.4,2.6,.4),at=(0,0,.2),mat='surf:concrete',bevel=.07)
    p.box((2.6,1.7,1.45),at=(0,0,1.125),mat='surf:cutStone',bevel=.065,taper=(.83,.9))
    # Bearing cap; dark elastomer separates stone from steel.
    p.box((2.8,1.95,.18),at=(0,0,1.94),mat='surf:concrete',bevel=.045)
    p.box((1.4,1.3,.08),at=(0,0,2.07),paint='graphite',bevel=.015)
    for x in (-1.16,1.16):
        p.box((.16,1.5,1),at=(x,0,2.4),mat='surf:galvanized',paint='iron',bevel=.025)
        for y in (-.62,.62):
            p.cyl(.045,.12,at=(x,y,2.9),mat='surf:galvanized',n=6)
    for y in (-.86,.86):
        p.box((1.8,.015,.035),at=(0,y,.78),paint='graphite',bevel=0)
    p.box((1.1,.04,.44),at=(0,-.88,1.4),paint='ivory',bevel=.015)
    p.text('P / 08',.23,at=(0,-.906,1.4),paint='graphite',depth=.005)
    hazard(p,(-1.2,-1.31,.24),.6,.2)
    p.solid_box((-1.7,-1.3,0),(1.7,1.3,.4))
    p.solid_box((-1.3,-.975,.4),(1.3,.975,2.15))
    for x in (-1.16,1.16):p.solid_box((x-.08,-.75,2.15),(x+.08,.75,2.9))
    return p


def build(reg,only):
    for name,fn in [('pipeline_segment',lambda:pipeline(0)),('pipeline_segment_b',lambda:pipeline(1)),('pipeline_pier',pier)]:
        if not only or name in only:reg.add(name,fn,lod=True,ao=2)

    import bridge
    bridge.build(reg, only)
