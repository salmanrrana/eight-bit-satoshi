"""Keeper field equipment. Hinged parts stay rigid and keep their own pivots."""
import math
from mathutils import Matrix, Vector
from kit import Part, fine, bolt_row, hazard, fins


def panel(p, w, h, at, label=''):
    x,y,z=at
    p.box((w,.045,h),at=at,paint='ivory',bevel=.025)
    if fine():
        for dz in (-h*.37,h*.37):
            bolt_row(p,(x-w*.4,y-.03,z+dz),(x+w*.4,y-.03,z+dz),3,r=.014)
        if label:p.text(label,min(.14,h*.17),at=(x,y-.027,z),paint='graphite',depth=.003)


def cover(variant=0):
    name=['cover_wall','cover_wall_b','barrier','barrier_b'][variant]
    p=Part(name)
    wall=variant<2
    w,d,h=(3,2.5,1.3) if wall else (3,.78,1.2)
    p.box((w,d,h),at=(0,0,h/2),mat='surf:concrete',bevel=.08,seg=1)
    # Recessed service belt, end caps and lifting sockets make cover feel built.
    for y in (-d/2-.012,d/2+.012):
        p.box((w-.24,.026,.08),at=(0,y,.33),paint='graphite',bevel=.008)
    for x in (-1.25,1.25):
        p.box((.22,d+.025,.12),at=(x,0,h-.08),paint='graphite',bevel=.02)
        p.cyl(.055,.012,at=(x,0,h+.003),mat='tex:keeper',paint='dark',n=12)
    panel(p,1.1,.43,(.38,-d/2-.035,.83),['K / 17','K / 38','B / 04','B / 09'][variant])
    hazard(p,(-1,-d/2-.04,.75),.46,.5,stripe=.13)
    if variant%2:
        p.box((.43,.05,.32),at=(-.55,-d/2-.028,.86),paint='iron',bevel=.015)
        p.text('REPAIR',.07,at=(-.55,-d/2-.058,.87),paint='bone')
    if fine():
        # Drain slots below the belt have a real dark recess and a shallow lip.
        for x in (-.7,-.45,-.2):
            p.box((.11,.02,.055),at=(x,-d/2-.032,.17),paint='dark',bevel=.01)
        for x in (-1.26,1.26):
            p.box((.12,.015,.11),at=(x,-d/2-.038,h-.12),paint='iron',bevel=.01)
    p.solid_box((-w/2,-d/2,0),(w/2,d/2,h))
    return p


def crate(variant=0):
    p=Part('ammo_crate' if variant==0 else 'ammo_crate_b')
    w,d,h=1.05,.72,.72
    for x in (-.4,.4):
        for y in (-.28,.28):p.box((.13,.14,.06),at=(x,y,.03),paint="graphite",bevel=.012)
    p.box((w,d,h-.1),at=(0,0,h/2),paint='graphite',bevel=.055)
    panel(p,.81,.36,(0,-d/2-.018,.36),'CELL / '+('08' if variant else '32'))
    p.box((1.07,.74,.09),at=(0,0,.705),paint='bone',bevel=.025)
    for x in (-.4,.4):
        p.box((.095,.76,.1),at=(x,0,.76),paint='iron',bevel=.012)
        p.box((.1,.055,.18),at=(x,-.385,.59),paint='orange',bevel=.012)
        for y in (-.28,.28):
            p.box((.11,.12,.65),at=(x,y,.35),paint='iron',bevel=.025)
    for x in (-.54,.54):
        p.box((.03,.3,.09),at=(x,0,.45),paint='dark',bevel=.012)
        p.pipe([(x,-.1,.44),(x*1.1,-.1,.44),(x*1.1,.1,.44),(x,.1,.44)],.016,n=8,mat='tex:keeper',paint='iron')
    hazard(p,(0,0,.753),.45,.14,axis='+Z')
    if variant:
        p.box((.12,.025,.26),at=(.23,-.4,.36),paint='orange',bevel=.012)
        for z in (.29,.36,.43):
            p.box((.08,.012,.025),at=(.23,-.42,z),paint='dark',bevel=.002)
    else:
        p.box((.22,.025,.1),at=(0,.38,.46),paint='ivory',bevel=.008)
    bolt_row(p,(-.32,-.4,.16),(.32,-.4,.16),3,r=.012,mat='tex:keeper')
    p.solid_box((-.54,-.38,0),(.54,.38,.81))
    return p


def moving_solid(root, part):
    """Conservative collision box for a lid in its exported static pose."""
    points=[v.co for v in part.bm.verts]
    root.solid_box(tuple(min(v[i] for v in points) for i in range(3)),
                   tuple(max(v[i] for v in points) for i in range(3)))


def hinge_pose(part,origin,angle):
    """Rotate actual vertex coordinates about the pivot; local node origin stays at hinge."""
    R=Matrix.Rotation(math.radians(angle),4,'X');o=Vector(origin)
    for v in part.bm.verts:v.co=o+R@(v.co-o)


def rack(opened=False):
    p=Part('weapon_rack_open' if opened else 'weapon_rack')
    p.box((2.5,1,.16),at=(0,0,.08),paint='graphite',bevel=.04)
    p.box((2.3,.6,2.14),at=(0,.13,1.23),paint='graphite',bevel=.04)
    for x in (-1.14,1.14):p.box((.18,.82,2.3),at=(x,0,1.31),paint='bone',bevel=.04)
    p.box((2.45,.85,.18),at=(0,0,2.43),paint='bone',bevel=.035)
    # Weapon sockets are empty: the engine inserts the artist's weapon models.
    for x in (-.67,0,.67):
        for z in (.62,1.55):
            p.box((.23,.26,.12),at=(x,-.28,z),paint='iron',bevel=.018)
        p.empty('rack_socket_'+str(round(x,2)),(x,-.45,1.18))
    panel(p,.65,.23,(0,-.2,2.13),'FIELD / 03')
    pivot=(0,-.45,2.27)
    door=Part('rack_door'+('_open' if opened else ''),origin=pivot,parent=p)
    door.box((2.06,.09,1.97),at=(0,-.45,1.285),paint='ivory',bevel=.04)
    door.box((1.74,.02,.14),at=(0,-.505,1.45),paint='graphite',bevel=.01)
    hazard(door,(0,-.51,.53),1.5,.1)
    door.text('KEEPER / EQUIPMENT',.14,at=(0,-.505,1.73),paint='graphite')
    # Recessed pull handle and four service quadrants break the broad door.
    for x in (-.88,.88):
        bolt_row(door,(x,-.505,.48),(x,-.505,2.06),5,r=.02,mat='tex:keeper')
    door.box((1.7,.012,.018),at=(0,-.502,1.03),paint='iron',bevel=0)
    door.box((.52,.035,.1),at=(0,-.52,1.45),paint='dark',bevel=.015)
    door.pipe([(-.2,-.55,1.45),(-.2,-.61,1.45),(.2,-.61,1.45),(.2,-.55,1.45)],.02,mat='tex:keeper',paint='iron',n=8)
    for x in (-.7,.7):
        p.cyl(.04,.22,at=(x-.11,-.45,2.27),rot=(0,90,0),mat='tex:keeper',paint='iron')
    if opened:
        hinge_pose(door,pivot,-110)
        moving_solid(p,door)
    p.solid_box((-1.25,-.5,0),(1.25,.5,2.52))
    return p


def case(opened=False):
    p=Part('weapon_case_open' if opened else 'weapon_case')
    for x in (-.75,.75):
        for y in (-.28,.28):p.box((.16,.15,.045),at=(x,y,.0225),paint='graphite',bevel=.008)
    p.box((1.8,.8,.3),at=(0,0,.19),paint='graphite',bevel=.045)
    for x in (-.78,.78):
        p.box((.18,.85,.36),at=(x,0,.2),paint='iron',bevel=.025)
        p.box((.1,.05,.12),at=(x,-.44,.28),paint='orange',bevel=.01)
    for x in (-.5,.5):p.box((.12,.46,.08),at=(x,0,.36),paint='dark',bevel=.02)
    p.empty('case_socket',(0,0,.4))
    pivot=(0,.36,.36)
    lid=Part('case_lid'+('_open' if opened else ''),origin=pivot,parent=p)
    lid.box((1.78,.8,.16),at=(0,0,.44),paint='ivory',bevel=.035)
    panel(lid,1.15,.1,(0,-.415,.44),'RAIL / LONG RANGE')
    lid.text('K / 2140',.16,at=(0,0,.525),rot=(0,0,0),paint='graphite')
    lid.box((1.45,.55,.025),at=(0,0,.351),paint='dark',bevel=.03)
    for x in (-.55,.55):
        p.cyl(.035,.2,at=(x-.1,.36,.36),rot=(0,90,0),mat='tex:keeper',paint='iron')
        lid.box((.08,.66,.025),at=(x,0,.525),paint='graphite',bevel=.006)
    p.pipe([(-.16,-.43,.22),(-.16,-.5,.22),(.16,-.5,.22),(.16,-.43,.22)],.018,mat='tex:keeper',paint='iron',n=8)
    if opened:
        hinge_pose(lid,pivot,-105)
        moving_solid(p,lid)
    p.solid_box((-.9,-.43,0),(.9,.43,.52))
    return p


def sled():
    p=Part('cargo_sled')
    for x in (-1.1,1.1):p.box((.4,4.3,.14),at=(x,0,.07),paint='iron',bevel=.045)
    for x in (-1.1,1.1):p.box((.46,4.5,.4),at=(x,0,.3),paint='graphite',bevel=.12)
    p.box((2.7,4,.36),at=(0,0,.63),paint='iron',bevel=.09)
    for x in (-1,1):
        p.box((.14,3.5,.14),at=(x,0,.87),paint='bone',bevel=.025)
        for y in (-1.6,1.6):
            p.pipe([(x,y,.86),(x,y,1.0),(x,y+.15,1.0)],.032,mat='tex:keeper',paint='orange')
    p.box((2.2,2.7,.52),at=(0,0,1.02),paint='bone',bevel=.055)
    for x in (-.8,.8):p.box((.09,2.75,.55),at=(x,0,1.04),paint='graphite',bevel=.01)
    panel(p,1.25,.3,(0,-1.38,1.02),'TRANSFER / 09')
    hazard(p,(0,-2.04,.64),1.3,.2)
    for x in (-1.35,1.35):
        for y in (-1.3,0,1.3):
            p.box((.025,.55,.18),at=(x,y,.63),paint='bone',bevel=.016)
            p.cyl(.025,.025,at=(x,y,.63),rot=(0,90 if x>0 else -90,0),n=6,mat='tex:keeper',paint='iron')
    p.pipe([(-.2,-2.05,.55),(-.2,-2.3,.55),(.2,-2.3,.55),(.2,-2.05,.55)],.045,mat='tex:keeper',paint='orange',n=10)
    p.solid_box((-1.35,-2.25,0),(1.35,2.25,1.3))
    return p


def pod():
    """Blunt lifting capsule with an open pressure shell and detached hatch.
    Root and 2.72 m body footprint are retained; the old hatch stays in place.
    """
    p=Part('drop_pod')
    # Broad, scorched ablative underside; taper to a narrow rounded crown.
    profile=[(1.05,.06),(1.32,.18),(1.36,.34),(1.32,.51),(1.19,.68)]
    p.ring_profile(profile,paint='soot',n=40 if fine() else 16,bevel=.018)
    p.cyl(1.18,.16,at=(0,0,.5),paint='graphite',n=40 if fine() else 16)
    levels=[(.58,1.26),(1,1.23),(2.35,1.04),(2.95,.83),(3.3,.6),(3.6,.28),(3.725,.08)]
    # The front pressure door has blown off. Thick shell cut edges remain visible.
    n=28 if fine() else 12
    rings=[]
    for z,r in levels:
        outer=[Vector((math.cos(math.radians(-36+252*i/n))*r,math.sin(math.radians(-36+252*i/n))*r,z)) for i in range(n+1)]
        inner=[Vector((v.x*(r-.12)/r,v.y*(r-.12)/r,v.z)) for v in reversed(outer)]
        rings.append(outer+inner)
    p.loft(rings,paint='bone',bevel=.016,step=.6 if fine() else 1.8)
    # Rear longitudinal graphite service spine and replaceable ceramic shell courses.
    p.pipe([(0,1.18,.65),(0,1.02,2.3),(0,.62,3.26),(0,.16,3.65)],.12,mat='tex:keeper',paint='graphite',n=10)
    for z,r in ((1.05,1.22),(2.4,1.02),(2.98,.8)):
        pts=[(math.cos(math.radians(-34+248*i/28))*r,math.sin(math.radians(-34+248*i/28))*r,z) for i in range(29)]
        if not fine():pts=pts[::4]+[pts[-1]]
        p.pipe(pts,.018,mat='tex:keeper',paint='graphite',n=6)
    # Two structural hatch jambs and orange continuity marks, following the taper.
    for side in (-1,1):
        path=[(side*r*.81,-r*.588,z) for z,r in levels[:-1]]
        p.pipe(path,.075,mat='tex:keeper',paint='iron',n=10)
        p.pipe([(side*1.16,-.38,.75),(side*.98,-.36,2.3),(side*.72,-.3,2.95)],.028,mat='emit:team',n=8)
        for z,r in ((.9,1.23),(1.65,1.13),(2.4,1.02),(2.95,.83)):
            p.box((.13,.15,.11),at=(side*r*.81,-r*.588,z),paint='iron',bevel=.018)
            p.cyl(.028,.045,at=(side*r*.81,-r*.588-.09,z),rot=(90,0,0),mat='surf:galvanized',n=6)
    # A real seat cavity: padded back, head support, hip cushion and foot trough.
    p.box((.84,.26,1.45),at=(0,.53,1.74),paint='iron',bevel=.12,rot=(-9,0,0))
    p.box((.54,.22,.35),at=(0,.45,2.56),paint='dark',bevel=.1)
    p.box((.83,.8,.19),at=(0,.1,1.02),paint='iron',bevel=.065)
    for z in (1.3,1.65,2,2.28):
        p.box((.7,.06,.026),at=(0,.335,z),paint='iron',bevel=.008)
    for x in (-.34,.34):
        p.pipe([(x,.24,2.5),(x*.8,.17,1.9),(x*.5,-.03,1.2)],.042,mat='tex:keeper',paint='dark',n=8)
        p.box((.075,.055,.17),at=(x*.75,.1,1.8),paint='iron',bevel=.012)
    p.box((.22,.07,.13),at=(0,-.06,1.21),paint='orange',bevel=.015)
    for x in (-.32,.32):
        p.box((.22,.54,.06),at=(x,-.56,.74),paint='iron',bevel=.025,rot=(12,0,0))
    for side in (-1,1):
        p.pipe([(side*.45,.12,2.2),(side*.6,-.15,1.85),(side*.63,-.1,1.1)],.035,mat='surf:galvanized',n=8)
    # Circumferential ablator tiles: irregular soot and hot-edge rust, darkest underneath.
    if fine():
        for i in range(32):
            a=math.tau*i/32
            r=1.325
            p.box((.2,.03,.19),at=(r*math.cos(a),r*math.sin(a),.3),rot=(0,0,math.degrees(a)-90),paint=('soot' if i%4 else 'iron'),bevel=.012)
    # Detachable lifting eyes, charge packs and reaction nozzles sit inside the footprint.
    for side in (-1,1):
        p.box((.17,.23,.42),at=(side*.77,.35,2.95),paint='graphite',bevel=.04)
        p.pipe([(side*.8,.18,3.1),(side*.8,.18,3.3),(side*.8,.4,3.3),(side*.8,.4,3.1)],.028,mat='surf:galvanized',n=8)
        p.cyl(.15,.25,at=(side*1.04,.35,.75),rot=(0,side*32,0),paint='iron',bevel=.02)
    p.text('K / 01',.17,at=(.96,-.42,2.5),rot=(90,0,68),paint='graphite')
    hatch=Part('pod_hatch',origin=(0,-1.2,.3),parent=p)
    hatch.box((1.75,2.6,.17),at=(0,-2.25,.19),paint='ivory',bevel=.065,rot=(3,0,-8))
    hazard(hatch,(0,-2.2,.3),1.2,.2,axis='+Z')
    p.solid_cyl(0,0,1.35,0,.65)
    for x in (-1,1):p.solid_box((x-.3,-.75,.65),(x+.3,.75,3.0))
    p.solid_box((-.8,.65,.65),(.8,1.2,3.3))
    moving_solid(p,hatch)
    for x,y in ((-.7,.5),(.7,.5),(0,-.65)):
        p.box((.3,.4,.1),at=(x,y,.05),paint='soot',bevel=.025)
    # Keep the inherited root envelope exactly: no placement change for STATIONS.
    for v in p.bm.verts:
        v.co.x=max(-1.36,min(1.36,v.co.x))
        v.co.y=max(-1.35,min(1.35,v.co.y))
        v.co.z=max(0,min(3.725,v.co.z))
    p.empty('pod_smoke',(0,.8,3.7))
    return p


def build(reg,only):
    entries=[(name,lambda v=i:cover(v),True) for i,name in enumerate(['cover_wall','cover_wall_b','barrier','barrier_b']) if name!='barrier_b']  # barrier_b: unused by the game
    entries += [('ammo_crate',lambda:crate(0),False),('ammo_crate_b',lambda:crate(1),False),
        ('weapon_rack',lambda:rack(False),False),('weapon_rack_open',lambda:rack(True),False),
        ('weapon_case',lambda:case(False),False),('weapon_case_open',lambda:case(True),False),
        ('cargo_sled',sled,True),('drop_pod',pod,True)]
    for name,fn,lod in entries:
        if not only or name in only:reg.add(name,fn,lod=lod,ao=1.0,lod_ratio=.35 if name=="drop_pod" else None)
