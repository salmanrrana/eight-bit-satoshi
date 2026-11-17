"""AX-3 — original Cartel field emitter, held by a Keeper.

AX-3: recovered Cartel induction tool, adapted to a Keeper two-hand hold.

A droplet split into two pearl cheeks around a cold core. Three independent
carbon/composite prongs focus the discharge. All dimensions below are mm.
"""
import copy
import math
from lib import geo
from .carbine import GRIPS

RUBS = [(0, 0, 0, 50), (-35, 185, 40, 48)]


def build(ctx):
    pearl, carbon, chrome = (ctx.mat(f) for f in ("pearl", "carbon", "chrome"))
    grip = ctx.mat("grip")
    heat = ctx.emit("heat", "#5ff4ff", 2.5)
    body = []
    core = []
    stations = [(-85, 5, 8, 80), (-65, 24, 28, 80), (-15, 40, 42, 83),
                (65, 53, 50, 85), (160, 52, 47, 85), (245, 37, 37, 85),
                (305, 22, 26, 85), (325, 18, 23, 85)]
    # Smooth station interpolation preserves the single teardrop silhouette.
    smooth=[]
    for i in range(len(stations)-1):
        p0,p1,p2,p3=stations[max(0,i-1)],stations[i],stations[i+1],stations[min(len(stations)-1,i+2)]
        for j in range(4):
            t=j/4
            smooth.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
                                for a,b,c,d in zip(p0,p1,p2,p3)))
    stations=smooth+[stations[-1]]
    # Two thick closed shells leave a narrow dorsal/core channel. Cross-section
    # rings run through outer then inner skin, so dropped parts have no holes.
    for side in (-1, 1):
        sections = []
        for y, rx, rz, z in stations:
            angles = [math.radians(a) for a in range(-72, 73, 6)]
            outer = [(side*rx*math.cos(a), y, z+rz*math.sin(a)) for a in angles]
            inner = [(side*(rx-3)*math.cos(a), y, z+(rz-3)*math.sin(a)) for a in reversed(angles)]
            sections.append(outer+inner)
        shell = geo.loft('pearl_cheek', sections, pearl)
        # Three induction vents per cheek: slots through the pearl skin with the
        # cyan core glow visible behind them (brightens with heat).
        for vy in (52, 92, 132):
            yy0 = min(range(len(stations)), key=lambda i: abs(stations[i][0]-vy))
            vrx = stations[yy0][1]
            body.append(geo.cbox('cheek_vent', (3, 28, 8), (side*(vrx+.6), vy, 80), c=1.0, mat=carbon))
            core.append(geo.cbox('vent_glow', (1.2, 22, 3.5), (side*(vrx+1.8), vy, 80), c=.4, mat=heat))
        geo.bevel(shell, .7, 2, 40)
        body.append(shell)
        # Transverse panel breaks: dark seams split each cheek into plates.
        for sy in (20, 175, 238):
            y0 = min(range(len(stations)), key=lambda i: abs(stations[i][0]-sy))
            yy, rx, rz, z = stations[y0]
            arc_rings = []
            for ang in range(-66, 67, 6):
                t = math.radians(ang)
                cx, cz = side*(rx+.3)*math.cos(t), z+(rz+.3)*math.sin(t)
                arc_rings.append([(cx+1.4*math.cos(u)*math.cos(t)*side, yy+1.4*math.sin(u), cz+1.4*math.cos(u)*math.sin(t))
                                  for u in [2*math.pi*i/8 for i in range(8)]])
            body.append(geo.loft('panel_break', arc_rings, carbon))
        # Chrome edge reveals are structural, not decorative panel seams.
        for a in (-72,72):
            theta=math.radians(a)
            rings=[]
            for y,rx,rz,z in stations[1:]:
                x=side*rx*math.cos(theta)
                zz=z+rz*math.sin(theta)
                rings.append([(x+1.3*math.cos(t),y,zz+1.3*math.sin(t)) for t in
                              [2*math.pi*i/8 for i in range(8)]])
            body.append(geo.loft('edge_reveal',rings,chrome))
    housing=geo.tube('core_housing',23,-55,315,'Y',(0,111),24,r_in=19.5,mat=carbon)
    geo.cut(housing,geo.cbox('core_window',(34,335,30),(0,135,131),c=3))
    geo.bevel(housing,.5,2)
    body.append(housing)
    core_sections=[]
    for y,r,z in ((0,16,111),(30,19,111),(270,19,111),(315,10,94),(345,2.5,85)):
        core_sections.append([(r*math.cos(i*math.tau/24),y,z+r*math.sin(i*math.tau/24)) for i in range(24)])
    core.append(geo.loft('cyan_core',core_sections,heat))
    # An exposed core aperture follows the dorsal shell lip. The left-facing
    # edge stays readable from the Keeper's off-axis eye, even at idle heat.
    aperture=[]
    for y,rx,rz,z in stations:
        if -65 <= y <= 245:
            x=-rx*math.cos(math.radians(72))+1.2
            zz=z+rz*math.sin(math.radians(72))+1.3
            aperture.append([(x+1.8*math.cos(i*math.tau/8),y,zz+1.8*math.sin(i*math.tau/8)) for i in range(8)])
    core.append(geo.loft('core_aperture_lip',aperture,heat))
    # Pearl tail bridge closes the back of the machine pod; energy is exposed
    # only in the working channel, rather than an open glowing cut at the wrist.
    tail_sections=[]
    for y,rx,rz,z in stations:
        if y > -15:
            break
        angles=[math.radians(a) for a in range(70,111,5)]
        outer=[(rx*math.cos(a),y,z+rz*math.sin(a)) for a in angles]
        inner=[((rx-3)*math.cos(a),y,z+(rz-3)*math.sin(a)) for a in reversed(angles)]
        tail_sections.append(outer+inner)
    body.append(geo.loft('pearl_tail',tail_sections,pearl))
    # Repeated thin induction collars visible through the shell channel.
    for y in range(-25,310,24):
        collar=geo.tube('inductor',24,y,y+4,'Y',(0,111),20,r_in=19.5,mat=chrome)
        geo.bevel(collar,.5,2)
        body.append(collar)
    for n,angle in enumerate((90,210,330)):
        a=math.radians(angle)
        sections=[]
        for y,r,w,h in ((292,22,13,12),(330,31,13,12),(380,29,10,9),(416,20,6,6)):
            # Prongs converge toward the beam without forming a closed muzzle.
            cx,cz=r*math.cos(a),85+r*math.sin(a)
            sections.append([(cx+x,y,cz+z) for x,z in geo.rrect(w,h,2,2)])
        prong=geo.loft(f'prong_{n}',sections,carbon)
        geo.bevel(prong,.8,2,40)
        body.append(prong)
        body.append(geo.tube('prong_contact',3,393,410,'Y',(20*math.cos(a),85+20*math.sin(a)),12,mat=chrome))
    # Carbon pistol grip: rounded and raked to fit the same right-hand hold.
    t=math.radians(18)
    secs=[]
    for z,w,d in ((-54,28,46),(-40,30,51),(0,31,54),(38,29,50),(53,29,48)):
        secs.append([(x,z*math.sin(t)+u*math.cos(t),z*math.cos(t)-u*math.sin(t))
                     for u,x in geo.rrect(d,w,11,4)])
    g=geo.loft('grip',secs,grip)
    geo.bevel(g,.8,2)
    body.append(g)
    guard=geo.prism('guard',[(-14,48),(68,48),(73,24),(57,12),(5,14),(-15,31)],'X',-7,7,3,carbon)
    geo.cut(guard,geo.prism('guard_hole',[(5,40),(58,40),(60,27),(51,22),(10,23)],'X',-12,12))
    geo.bevel(guard,1,2)
    body.append(guard)
    trigger=geo.cbox('trigger',(6,6,18),(0,31,33),c=2,mat=chrome)
    body.append(trigger)
    # A pearl saddle above the wrist is the only raised sight, no gun stock.
    for side in (-1,1):
        body.append(geo.cbox('guide_root',(5,42,22),(side*12,-23,131),c=1.5,mat=carbon))
        saddle=geo.cbox('sight_guide',(5,42,12),(side*12,-23,143),c=2,mat=pearl)
        geo.bevel(saddle,.6,2)
        body.append(saddle)
    body.append(geo.cbox('front_sight_post',(5,7,28),(0,298,132),c=1.2,mat=chrome))
    reticle=[geo.cbox('sight_bead',(2,2,3),(0,298,147),c=.5,mat=ctx.emit('reticle','#5ff4ff',2))]
    # A single rigid louver assembly opens around a transverse rear hinge.
    # Gaps between the pearl leaves expose the cold induction core below.
    vents=[]
    spine=geo.cbox('vent_spine',(5,125,5),(0,105,128),c=1,mat=carbon)
    vents.append(spine)
    for i in range(5):
        y=48+i*24
        leaf=geo.loft('vent_leaf',[
            [(x,y,z) for x,z in geo.rrect(27,5,1.5,2,0,133)],
            [(x,y+8,z) for x,z in geo.rrect(30,6,1.5,2,0,137)],
            [(x,y+17,z) for x,z in geo.rrect(25,4,1.3,2,0,135)]],pearl)
        geo.bevel(leaf,.5,1,40)
        vents.append(leaf)
    for side in (-1,1):
        body.append(geo.tube('vent_hinge',4.5,side*11-2,side*11+2,'X',(44,131),12,mat=chrome))
    # A carbon saddle is the deliberate second-hand grip, below the cheeks.
    saddle=geo.cbox('support_saddle',(53,86,13),(0,188,34),c=3,mat=carbon)
    geo.bevel(saddle,1,2)
    body.append(saddle)
    # Rubber ribs under the support saddle read as a real grip, clear of the palm.
    for ry in (156,170,206,220):
        body.append(geo.cbox('saddle_rib',(55,5,4),(0,ry,26),c=1.2,mat=grip))
    grips=copy.deepcopy(GRIPS)
    grips['l']['palm']=((-34,195,24),((1,0,.1),(.1,-.6,-1)))
    grips['l']['targets']=['support_saddle','pearl_cheek','pearl_cheek.001','core_housing']
    grips['l']['thumb']['targets']=grips['l']['targets']
    grips['l']['elbow']=(-340,35,-370)
    return dict(parts={'body':body,'vent':vents}, emissive={'core':core,'reticle':reticle},
                pivots={'vent':(0,45,133),'core':(0,120,111),'reticle':(0,298,147)},
                empties={'muzzle':(0,420,85),'sight':(0,-373,147)},grips=grips,world_ratio=.32,
                view=dict(eye=(-100,-400,210),look=(-100,500,210),fov=52),
                three=dict(eye=(-850,450,400),look=(0,100,30)),
                close=dict(eye=(-250,-150,185),look=(0,65,65)))
