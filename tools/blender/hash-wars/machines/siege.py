"""SIEGE: 22m vertical drain crawler; authored outriggers follow the sim targets.

Root coincides with Station Three's spire origin, unrotated. +Z is forward.
The 22m pressure spine rides the west face of the 32.74m spire; square
clamp jaws clear its 4.2m shaft. Long low couplings preserve the authored
shootable centres. Turret subtrees can be detached at their world pivots.
"""
import json
import math
import os
import subprocess
from lib import (empty,node,box,cyl,annulus,rod_between,tube,piston,loft,bolts,xform,rot,smooth_sections,wedge)

CONFIG=dict(tex=2048,webp_quality=52,triangle_target=48000,budget=150000,lod_ratio=.33,
    ao_dist=1.2,edge_dist=.018,cav_dist=.08,edge_gain=.7,bevel_r=.012,
    dust_h=1,dust_h0=-1,dust_col=(.16,.15,.13),heat=[((-6,0,11),3.5)],
    render=dict(lift=0,focus=14,size=30,close=45,close_eye=1.7))


def authored():
    repo=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../..'))
    raw=subprocess.check_output(['node','-e',
        'const h=require("./js/hash-wars.js");console.log(JSON.stringify({spire:h.entities.stations[2].spire,clamps:h.entities.clamps,turrets:h.entities.turrets}))'],cwd=repo)
    return json.loads(raw)


def build():
    data=authored(); origin=data['spire']
    def local(p,dy=0): return (p['x']-origin['x'],p['z']-origin['z'],p['y']-origin['y']+dy)
    root=empty('siege',(0,0,0))
    X=-5.3   # spine centre line, west of the 4.2m shaft (shaft spans x -2.1..2.1)
    parts=[box((2.6,3.0,22.4),(X+.4,0,16.4),'carbon',bevel=.4,segments=2)]
    # Seven overlapping armour segments, shingled downward like a pangolin's:
    # each flares at its lower lip over the narrower top of the one below.
    seg_z=[6.6+i*3.25 for i in range(7)]
    scale=[.86,.96,1.04,1.08,1.04,.97,.9]
    for i,(z,k) in enumerate(zip(seg_z,scale)):
        shell=loft(smooth_sections([
            (z-1.95,0,1.95*k,2.75*k,2.75*k,3.2,X-.55),
            (z-1.45,0,2.65*k,3.75*k,3.75*k,3.6,X-.95),
            (z+.35,0,2.5*k,3.5*k,3.5*k,3.4,X-.85),
            (z+1.55,0,2.05*k,2.8*k,2.8*k,3.0,X-.5),
            (z+1.85,0,1.5*k,2.05*k,2.05*k,2.8,X-.35)],2),'pearl',segs=22)
        xform(shell,rot('x',-90).to_4x4())
        parts.append(shell)
        # Dorsal crest: a dark keel plate down the outer back gives the silhouette teeth.
        parts.append(wedge([(X-3.5*k,-.42,z-1.5),(X-3.5*k,.42,z-1.5),(X-2.6,.42,z-1.5),(X-2.6,-.42,z-1.5),
            (X-5.3*k,-.26,z+1.0),(X-5.3*k,.26,z+1.0),(X-2.6,.3,z+1.4),(X-2.6,-.3,z+1.4)],'gunmetal',bevel=.06))
        parts.append(box((.14,.9,1.8),(X-3.9*k,0,z-.2),'charge',bevel=.04,rot=rot('f',-35)))
        for f in (-1,1):
            # Flared side skirt, panel seam and fasteners on each flank.
            # Dark flared skirt over each flank with a lit cyan lip: the plates
            # read as overlapping armour, not a stack of white boxes.
            parts.append(box((3.4*k,.26,2.6),(X-.9,f*3.75*k,z-.45),'gunmetal',bevel=.08,rot=rot('x',f*-13)))
            parts.append(box((3.0*k,.1,.09),(X-.9,f*4.02*k,z-1.62),'charge',bevel=.03,segments=1))
            parts.append(box((2.6*k,.06,.07),(X-1.0,f*3.9*k,z+.45),'carbon',bevel=.02,segments=1))
            # Cyan drain line: a lit conduit in a carbon channel feeding the shaft.
            parts.append(box((.36,.34,2.9),(X+2.05,f*1.75,z),'carbon',bevel=.06,segments=1))
            parts.append(cyl(.11,2.95,(X+2.05,f*1.75,z),'charge',axis='z',segs=10))
            parts.append(rod_between((X+2.05,f*1.75,z+1.1),(-1.9,f*1.2,z+1.1),.09,'charge',segs=8))
    # Exposed black joint mechanics between segments: drums, rams and hoses.
    for i in range(6):
        z=seg_z[i]+1.62
        parts.append(cyl(.62,4.6,(X-.2,0,z),'gunmetal',axis='f',segs=16))
        parts.append(cyl(.34,4.9,(X-.2,0,z),'steel',axis='f',segs=12))
        for f in (-1.65,1.65):
            # Ram between segments: dark barrel, polished rod.
            parts += [rod_between((X-1.6,f,seg_z[i]+.3),(X-1.6,f,seg_z[i]+1.9),.16,'gunmetal',segs=10),
                rod_between((X-1.6,f,seg_z[i]+1.8),(X-1.6,f,seg_z[i+1]-.3),.08,'rod',segs=8)]
    # Long carbon rails stay visible when the crawler tears away.
    for f in (-1.52,1.52):
        parts += [cyl(.27,22,(-4.25,f,16),'gunmetal',axis='z',segs=16),
            cyl(.12,22,(-7.2,f,16),'chrome',axis='z',segs=12)]
    # Gripper legs bite the shaft's side faces (f=+-2.1) at five heights.
    for z in (8.2,11.4,17.9,21.2,24.8):
        for f in (-1,1):
            sh=(X+.4,f*2.8,z); el=(-1.6,f*6.0,z+1.9); tip=(.5,f*2.18,z-.2)
            parts += [rod_between(sh,el,.44,'gunmetal',segs=12),
                cyl(.68,1.0,el,'gunmetal',axis='z',segs=16),
                cyl(.32,1.12,el,'steel',axis='z',segs=10),
                rod_between(el,(tip[0]-.7,tip[1]+f*.3,tip[2]),.32,'carbon',segs=12)]
            parts += [rod_between((X+.2,f*2.4,z-.8),(el[0]-.4,el[1]-f*.5,el[2]-.5),.15,'rod',segs=8)]
            # Pearl armour sleeve over the upper arm, angled with it; a second,
            # dark guard over the forearm.
            mid=((sh[0]+el[0])/2,(sh[1]+el[1])/2,(sh[2]+el[2])/2+.42)
            yaw=math.degrees(math.atan2(el[1]-sh[1],el[0]-sh[0]))
            parts.append(box((4.1,.95,.9),mid,'pearl',bevel=.2,rot=rot('z',-yaw)@rot('f',f*-12)))
            fm=((el[0]+tip[0])/2-.2,(el[1]+tip[1])/2+f*.25,(el[2]+tip[2])/2+.35)
            yaw2=math.degrees(math.atan2(tip[1]-el[1],tip[0]-el[0]))
            parts.append(box((3.6,.6,.55),fm,'gunmetal',bevel=.14,rot=rot('z',-yaw2)))
            # Claw: two dark talons pressed into the shaft face.
            for dz in (-.28,.28):
                parts.append(wedge([(tip[0]-.9,f*(2.62),tip[2]+dz-.16),(tip[0]-.9,f*(2.62),tip[2]+dz+.16),
                    (tip[0]-.9,f*2.95,tip[2]+dz+.16),(tip[0]-.9,f*2.95,tip[2]+dz-.16),
                    (tip[0]+.15,f*2.16,tip[2]+dz-.06),(tip[0]+.15,f*2.16,tip[2]+dz+.06),
                    (tip[0]+.15,f*2.3,tip[2]+dz+.06),(tip[0]+.15,f*2.3,tip[2]+dz-.06)],'gunmetal',bevel=.03))
    body=node('body',parts,(X,0,16),root)
    # Two real climbing belts press onto the west shaft face.
    for label,f in (('front',1.48),('rear',-1.48)):
        belt=[box((.60,.72,21.6),(-2.77,f,16.2),'carbon',bevel=.20)]
        for h in (5.6,26.8):
            belt += [cyl(.65,.80,(-2.77,f,h),'gunmetal',axis='f',segs=20),
                cyl(.25,.88,(-2.77,f,h),'chrome',axis='f',segs=16)]
        for j in range(21):
            belt += [box((.30,.83,.72),(-2.29,f,6.05+j*1.0),'rubber',bevel=.06,segments=1)]
        node('track_'+label,belt,(-2.77,f,16),body)
    # The head crowns the crawler above the hull: a heavy armoured skull with a
    # brow, mandibles hooked over the shaft top and a three-lens sensor cluster.
    head=loft(smooth_sections([
        (27.0,0,1.9,2.6,2.6,3.0,X-.3),
        (28.0,0,2.55,3.1,3.1,3.4,X-.9),
        (29.6,0,2.35,2.8,2.8,3.2,X-1.2),
        (30.9,0,1.5,1.9,1.9,2.6,X-.9)],2),'pearl',segs=24)
    xform(head,rot('x',-90).to_4x4())
    hp=[head, box((1.1,5.6,.7),(X-3.0,0,30.0),'gunmetal',bevel=.2,rot=rot('f',-18)),
        box((.5,4.4,1.6),(X-3.35,0,28.4),'carbon',bevel=.12)]
    for f in (-1,1):
        hp += [rod_between((X+.5,f*2.4,29.4),(-1.2,f*3.1,30.6),.26,'gunmetal',segs=12),
            rod_between((-1.2,f*3.1,30.6),(1.4,f*2.3,30.0),.2,'carbon',segs=12),
            box((.9,.5,.5),(1.3,f*2.4,29.9),'gunmetal',bevel=.08)]
    node('head',hp,(X,0,28.5),body)
    sensor=[]
    for f,zz,r in ((0,28.8,.62),(-1.25,28.2,.34),(1.25,28.2,.34)):
        sensor += [annulus(r+.16,r,.36,(X-3.55,f,zz),'chrome',axis='x',segs=28),
            cyl(r*.92,.08,(X-3.62,f,zz),'glass',axis='x',segs=28),
            cyl(r*.46,.06,(X-3.68,f,zz),'sensor',axis='x',segs=20)]
    node('sensor',sensor,(X-3.6,0,28.6),body)
    node('vent_0',[box((2.6,.3,1.0),(-5.5,-2.44,6),'gunmetal',bevel=.15),
        box((2.2,.1,.55),(-5.5,-2.64,6),'heat',bevel=.1)] +
        [box((.13,.15,.8),(-6.4+i*.36,-2.73,6),'carbon',bevel=.025) for i in range(6)],(-5.5,-2.44,6),body)
    targets=[]
    for i,target in enumerate(data['clamps']):
        p=local(target); targets.append([p[0],p[2],p[1]])
        h=7+i*7.3
        # Collar is a square open-centred C: closed individual beams, 4.42m clear.
        collar=[box((7.6,.66,1.15),(-1.5,-2.57,h),'pearl',bevel=.24),
            box((.78,5.0,1.15),(-4.91,0,h),'pearl',bevel=.24),
            box((3.3,.66,1.15),(-3.65,2.57,h),'pearl',bevel=.24),
            box((.36,4.4,.52),(-2.32,0,h),'rubber',bevel=.12)]
        # Twin deep struts reach the authored, player-height drain coupling.
        elbow=(-10-i*1.1,p[1]*.56,h*.52)
        # Each drain strut is a massive armoured leg planted on the forecourt:
        # thick ram-driven thigh, a big knee drum, a guarded shin, lit conduit.
        top=(-6.2,0,h)
        for off in (-.55,.55):
            collar += [rod_between((top[0],off,h),(elbow[0],elbow[1]+off,elbow[2]),.36,'gunmetal',segs=16),
                rod_between((elbow[0],elbow[1]+off,elbow[2]),(p[0],p[1]+off,p[2]+.6),.28,'carbon',segs=16)]
        def sleeve(a,b,w,hgt,paint,lift):
            mx,my,mz=[(a[k]+b[k])/2 for k in range(3)]
            dx,dy,dz=[b[k]-a[k] for k in range(3)]
            run=math.hypot(dx,dy); yaw=math.degrees(math.atan2(dy,dx)); pitch=math.degrees(math.atan2(dz,run))
            return box((math.hypot(run,dz)*.82,w,hgt),(mx,my,mz+lift),paint,bevel=.22,
                rot=rot('z',-yaw)@rot('f',-pitch))
        collar += [sleeve(top,elbow,1.7,1.25,'pearl',.55),
            sleeve(elbow,(p[0],p[1],p[2]+.6),1.2,.8,'gunmetal',.45),
            tube([(top[0]-.4,0,h+1.1),(elbow[0]-.2,elbow[1],elbow[2]+1.2),(p[0],p[1],p[2]+1.3)],.13,'charge',segs=8,smooth=4),
            cyl(.95,2.0,elbow,'gunmetal',axis='f',segs=24),
            cyl(.5,2.2,elbow,'steel',axis='f',segs=16)]
        collar += piston((top[0]-1.2,0,h-1.4),(elbow[0]+.9,elbow[1]*.85,elbow[2]+1.4),.3)
        collar += [cyl(.58,1.6,elbow,'chrome',axis='f',segs=24),
            box((2.4,1.25,1.75),p,'gunmetal',bevel=.28,segments=3),
            box((2.6,1.2,.45),(p[0],p[1],p[2]+.97),'pearl',bevel=.17)]
        collar += [cyl(.86,1.25,(-4.91,-1.55,h),'gunmetal',axis='f',segs=32),
            annulus(.69,.38,.18,(-4.91,-2.23,h),'chrome',axis='f',segs=32)]
        collar += piston((-7.1,-1.8,h+.8),(elbow[0]+1.1,elbow[1]-.4,elbow[2]+.7),.26)
        clamp=node('clamp_'+str(i),collar,p,body)
        # Coupling faces the approach (+Z); 1.45m luminous face in a recessed ring.
        coupling=node('clamp_'+str(i)+'_coupling',[
            annulus(.92,.70,.18,(p[0],p[1]+.70,p[2]),'chrome',axis='f',segs=32),
            cyl(.69,.06,(p[0],p[1]+.74,p[2]),'heat',axis='f',segs=32),
            annulus(.51,.38,.08,(p[0],p[1]+.75,p[2]),'carbon',axis='f',segs=24),
        ],p,clamp)
        # Separate outer jaw is the breakaway load-bearing piece, not an open shell.
        jaw=node('clamp_'+str(i)+'_jaw',[
            box((.66,5.1,1.15),(2.57,0,h),'pearl',bevel=.22),
            box((4.3,.66,1.15),(.75,2.57,h),'pearl',bevel=.22),
            box((.38,4.4,.55),(2.29,0,h),'rubber',bevel=.12),
            cyl(.58,1.0,(2.57,-2.57,h),'gunmetal',axis='z',segs=24),
        ],(2.57,-2.57,h),clamp)
        # Capped umbilicals actually terminate within the spire shaft.
        hoses=[]
        for j in (-1,1):
            hoses.append(tube([(p[0]+.3,p[1]+j*.52,p[2]-.3),
                (elbow[0],elbow[1]+j*.8,elbow[2]-.6),(-6,j*2.0,h-.6),
                (-2.3,j*1.4,h-.6),(-1.8,j*1.4,h-.6)],.22,'rubber',segs=12,smooth=5))
        node('drain_'+str(i),hoses,p,clamp)
    turret_map=[]
    for i,t in enumerate(data['turrets']):
        p=local(t)
        mount=node('turret_'+str(i),[
            cyl(.58,.26,(p[0],p[1],p[2]+.14),'gunmetal',axis='z',segs=24),
            cyl(.22,.58,(p[0],p[1],p[2]+.49),'carbon',axis='z',segs=20)],p,root)
        hp=(p[0],p[1],p[2]+.88)
        # Armoured head with twin shrouded barrels, muzzle brakes and a lens.
        th=[box((1.25,1.05,.66),hp,'pearl',bevel=.2,segments=3),
            box((1.32,.5,.2),(p[0],p[1]-.2,p[2]+1.26),'gunmetal',bevel=.06),
            cyl(.11,.09,(p[0]-.66,p[1]+.1,p[2]+.88),'sensor',axis='x',segs=16)]
        for dx in (-.24,.24):
            th += [cyl(.13,.5,(p[0]+dx,p[1]+.72,p[2]+.9),'gunmetal',axis='f',segs=16),
                cyl(.075,1.3,(p[0]+dx,p[1]+1.5,p[2]+.9),'carbon',axis='f',segs=14),
                annulus(.11,.055,.22,(p[0]+dx,p[1]+2.12,p[2]+.9),'chrome',axis='f',segs=16)]
        head=node('turret_'+str(i)+'_head',th,hp,mount)
        empty('turret_'+str(i)+'_muzzle',(p[0],p[1]+2.25,p[2]+.9),head)
        turret_map.append({'root':mount.name,'head':head.name,'muzzle':'turret_'+str(i)+'_muzzle','world_anchor':t})
    # Generic muzzle/gun also give tools a standard aim reference for the main hull.
    gun=empty('gun',(-5.3,2.4,25.6),body);empty('muzzle',(-5.3,2.5,25.6),gun)
    return dict(root=root,weak=['clamp_'+str(i)+'_coupling' for i in range(3)],
        origin='Station Three spire origin; no scale/rotation/centre offset',
        axes={'turret_*_head':'Y yaw, X pitch','clamp_*_jaw':'Y hinge'},
        extra={'placement':{'world':origin,'relative_to_spire':[0,0,0],'yaw':0},
            'body_length_m':22,'body_axis':'Y (vertical, climbed west face)',
            'fit':'4.48m ceramic opening; rubber contact planes x=-2.14 / +2.10m (4.24m clear) around 4.2m shaft; jaws at 7 / 14.3 / 21.6m, above base',
            'coupling_hit_fit':'emissive face radius .69m, forward depth .77m; inside sim ±.8m XZ / ±.7m Y box',
            'clamp_centres':targets,'clamp_centres_space':'glTF, relative to spire origin; equals sim entities.clamps',
            'tracks':'track_front / track_rear are closed vertical traction belts; contact plane x=-2.14m',
            'breakaway':{str(i):'clamp_'+str(i)+'_jaw' for i in range(3)},
            'turrets':turret_map,'turret_note':'1.2m high; detach each turret subtree preserving world transform, then animate at sim ground anchor. Unique scoped head/muzzle names.',
            'envelope_note':'22m crawler body; wide envelope includes authored low drain couplings and remote defending turrets; do not rescale whole file to 22m.'})
