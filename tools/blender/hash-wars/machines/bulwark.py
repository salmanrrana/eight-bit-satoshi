"""BULWARK: a four-footed armoured siege mortar; broad front shield, exposed rear heat rails.

The hull is a single cold ceramic wedge, not a scaled strider. Dimensions in
metres; adjust HULL and LEG_PIVOTS together to preserve actuator clearances.
"""
from mathutils import Matrix
from lib import (P, rot, xform, box, cyl, loft, smooth_sections, cut_gap, panels, repaint, rod_between,
                 piston, tube, bolts, ring_points, node, empty, length, wedge, annulus)

NAME = 'bulwark'
CONFIG = dict(tex=2048,webp_quality=62,triangle_target=26500,budget=45000,lod_ratio=.31,
    ao_dist=.65,edge_dist=.018,cav_dist=.065,edge_gain=.65,bevel_r=.008,
    dust_h=.95,dust_h0=0,dust_col=(.16,.14,.12),
    heat=[((0,-1.83,2.5),.75),((0,0,1.25),.55)],
    render=dict(lift=0,focus=1.5,size=4,close=5))
HULL=[(-1.95,1.85,.50,.30,.23,3),(-1.65,1.95,.85,.48,.38,3.8),
      (-.80,2.02,.95,.55,.45,4),(0.6,2.02,.99,.53,.51,4),
      (1.43,1.95,1.04,.40,.60,4),(1.62,1.87,.91,.37,.56,4),
      (1.76,1.85,.62,.23,.39,3.5)]


def leg(body, side, fore):
    s=1 if side=='l' else -1
    f=1 if fore=='f' else -1
    suffix=fore+side
    h=(s*.98,f*1.05,1.70); k=(s*1.23,f*1.45,.88); a=(s*1.25,f*1.12,.22)
    hip=node('hip_'+suffix,[cyl(.21,.22,h,'carbon',axis='x',segs=24,bevel=.014),
         cyl(.17,.25,h,'gunmetal',axis='x',segs=24,bevel=.012)],h,body)
    mid=tuple((x+y)/2 for x,y in zip(h,k))
    parts=[rod_between(h,k,.2,'gunmetal',segs=16,bevel=.012,r2=.16),
           box((.40,.54,.6),mid,'pearl',bevel=.06),
           box((.08,.42,.46),(mid[0]+s*.22,mid[1],mid[2]),'carbon',bevel=.02),
           cyl(.17,.38,k,'steel',axis='x',segs=20,bevel=.01),
           cyl(.21,.3,k,'gunmetal',axis='x',segs=20,bevel=.012)]
    parts+=piston((h[0],h[1]-.20*f,h[2]-.04),(k[0],k[1]-.18*f,k[2]+.12),.075)
    parts+=piston((h[0]+.12*s,h[1]+.14*f,h[2]-.1),(k[0]+.12*s,k[1]+.16*f,k[2]+.08),.05)
    parts+=[tube([(h[0]-.10*s,h[1],h[2]),(mid[0]-.12*s,mid[1]-.15*f,mid[2]),
                 (k[0]-.12*s,k[1],k[2])],.025,'rubber',segs=8)]
    parts+=bolts(ring_points((k[0]+s*.16,k[1],k[2]),.08,6), (s,0,0),.012)
    thigh=node('thigh_'+suffix,parts,h,hip)
    mid2=tuple((x+y)/2 for x,y in zip(k,a))
    parts=[rod_between(k,a,.16,'gunmetal',segs=16,bevel=.008),
           box((.34,.40,.48),mid2,'pearl2',bevel=.05),
           box((.36,.1,.3),(mid2[0],mid2[1]+f*.22,mid2[2]+.06),'gunmetal',bevel=.03),
           cyl(.15,.3,a,'gunmetal',axis='x',segs=20,bevel=.008)]
    parts+=piston((k[0]+.1*s,k[1]+.12*f,k[2]),(a[0]+.1*s,a[1]+.12*f,a[2]+.03),.05)
    shin=node('shin_'+suffix,parts,k,thigh)
    node('foot_'+suffix,[box((.62,.80,.17),(a[0],a[1],.115),'gunmetal',bevel=.05),
         box((.58,.76,.05),(a[0],a[1],.025),'rubber',bevel=.015),
         box((.32,.42,.1),(a[0],a[1]+.18*f,.18),'pearl',bevel=.03)] +
         [box((.12,.16,.08),(a[0]+dx,a[1]+f*.44,.05),'gunmetal',bevel=.02) for dx in (-.2,0,.2)],a,shin)
    return suffix,dict(hip=h,knee=k,ankle=a,sole_z=0,thigh=length(h,k),shin=length(k,a))


def build():
    root=empty(NAME,(0,0,0))
    shell=loft(smooth_sections(HULL,3),'pearl',segs=32)
    cut_gap(shell,(0,.95,0),(0,1,0),.018)
    cut_gap(shell,(0,-1.1,0),(0,1,0),.014)
    repaint(shell,'chrome',lambda c:c.z<1.6)
    repaint(shell,'pearl2',lambda c:c.y<-.95)
    panels(shell,.035,.006)
    parts=[shell,loft([(f*.96,z,w*.95,t*.91,b*.92,n) for f,z,w,t,b,n in HULL],'carbon',segs=24)]
    # Front shield is broad, featureless and deep: its lower edge protects the belly.
    # Layered front armour: a thick sloped main plate, a heavy dark brow that
    # overhangs the sensor slit, angled cheek guards and a chin skirt.
    plate=wedge([(-.85,1.65,1.20),(.85,1.65,1.20),(.85,1.98,1.30),(-.85,1.98,1.30),
                 (-1.04,1.44,2.30),(1.04,1.44,2.30),(.95,2.12,2.20),(-.95,2.12,2.20)],
                 'pearl',bevel=.07)
    parts.append(plate)
    parts.append(wedge([(-1.12,1.55,2.28),(1.12,1.55,2.28),(1.0,2.36,2.24),(-1.0,2.36,2.24),
                 (-1.12,1.45,2.58),(1.12,1.45,2.58),(1.0,2.22,2.52),(-1.0,2.22,2.52)],'gunmetal',bevel=.05))
    for s in (-1,1):
        parts.append(wedge([(s*.82,1.7,1.25),(s*1.18,1.45,1.3),(s*1.2,1.5,2.35),(s*.92,2.0,2.3),
                     (s*.86,1.78,1.25),(s*1.25,1.52,1.3),(s*1.27,1.57,2.35),(s*.96,2.08,2.3)],'gunmetal',bevel=.03))
        parts+=bolts([(s*.62,2.1+0.0,z) for z in (1.55,1.8,2.05)],(0,1,.15),.022)
    for z in (1.5,1.78):
        parts.append(box((1.5,.07,.1),(0,2.02+(z-1.5)*.1,z),'carbon',bevel=.025,rot=rot('x',-14)))
    parts.append(wedge([(-.9,1.6,.98),(.9,1.6,.98),(.9,1.86,1.04),(-.9,1.86,1.04),
                 (-.9,1.6,1.28),(.9,1.6,1.28),(.9,1.95,1.3),(-.9,1.95,1.3)],'pearl2',bevel=.03))
    parts.append(box((1.38,.06,.1),(0,2.2,2.17),'glass',bevel=.018))
    # Segmented back: four overlapping dorsal plates with lit heat grilles between.
    for i in range(4):
        y=-.25-i*.42
        parts.append(box((1.5-.06*i,.5,.12),(0,y,2.62-i*.02),'pearl2' if i%2 else 'pearl',bevel=.04,rot=rot('x',-8)))
        parts.append(box((1.1,.08,.04),(0,y-.27,2.57-i*.02),'heat',bevel=.01))
    parts.append(box((1.3,.06,.5),(0,-2.02,1.95),'carbon',bevel=.02))
    for k in range(5):
        parts.append(box((1.1,.03,.05),(0,-2.06,1.77+k*.09),'heat',bevel=.008))
    for s in (-1,1):
        parts.append(box((.075,2.40,.055),(s*.76,-.15,2.57),'chrome',bevel=.018))
        parts.append(box((.15,.22,.40),(s*.47,-1.83,2.35),'carbon',bevel=.025))
        parts+=bolts([(s*.88,-1.3,2.37),(s*.91,.75,2.42)],(s,0,.3),.017)
    body=node('body',parts,(0,0,1.95),root)
    node('sensor',[box((1.08,.02,.03),(0,2.235,2.17),'sensor',bevel=.008)],(0,2.24,2.17),body)
    # High-angle mortar housed in a thick rotary saddle. No external conventional tank barrel.
    # A fat mortar tube at 50 degrees in a heavy saddle, recoil rams each side.
    gunparts=[cyl(.36,.3,(0,.10,2.6),'gunmetal',axis='z',segs=28,bevel=.025),
              cyl(.3,.05,(0,.10,2.77),'chrome',axis='z',segs=28,bevel=.012),
              box((.62,.5,.32),(0,.05,2.86),'pearl',bevel=.06),
              rod_between((0,-.05,2.8),(0,.62,3.6),.2,'carbon',segs=24,bevel=.015),
              rod_between((0,.42,3.36),(0,.66,3.65),.235,'gunmetal',segs=24,bevel=.015),
              annulus(.24,.16,.12,(0,.68,3.66),'chrome',axis=(0,-.64,.77),segs=24)]
    for sx in (-.27,.27):
        gunparts+=piston((sx,-.05,2.78),(sx,.35,3.25),.05)
    gun=node('gun',gunparts,(0,.10,2.6),body)
    empty('muzzle',(0,.72,3.71),gun)
    for i,s in enumerate((-1,1)):
        parts=[box((.31,1.02,.10),(s*.47,-1.17,2.46),'gunmetal',bevel=.025),
               box((.23,.88,.03),(s*.47,-1.17,2.525),'heat',bevel=.01)]
        for k in range(12):
            parts.append(box((.28,.025,.065),(s*.47,-1.58+k*.075,2.54),'chrome',bevel=.005))
        # Radiator cassettes lean toward a flanking player's eye instead of
        # presenting only a hairline of heat on the horizontal roof.
        pivot=P(s*.47,-1.17,2.50)
        transform=(Matrix.Translation(pivot+P(0,-.66,0)) @
                   rot('x',-65).to_4x4() @ Matrix.Translation(-pivot))
        for part in parts:
            xform(part,transform)
        node('vent_'+str(i),parts,(s*.47,-1.83,2.50),body)
    parts=[cyl(.27,.11,(0,0,1.42),'gunmetal',axis='z',segs=28,bevel=.016),
           cyl(.21,.018,(0,0,1.35),'heat',axis='z',segs=24,bevel=.006)]
    for x in (-.13,-.065,0,.065,.13):
        parts.append(box((.018,.36,.04),(x,0,1.32),'chrome',bevel=.004))
    node('vent_belly',parts,(0,0,1.35),body)
    legs=dict(leg(body,side,fore) for side in ('l','r') for fore in ('f','r'))
    return dict(root=root,legs=legs,axes={'hip':'y (yaw)','thigh':'x','shin':'x','foot':'x','gun':'y (yaw), x (elevation)'},
                knee='front knees forward, rear knees backward',weak=['vent_0','vent_1','vent_belly'],
                extra={'sim_centre_y':1.5,'sim_radius':1.5,'armour':'front shield','role':'armoured mortar'})
