"""WATCHER: an optical survey mast on a light, widely planted tripod."""
import math
from lib import (empty, node, box, cyl, annulus, rod_between, tube, piston,
                 loft, smooth_sections, bolts, P, rot)

CONFIG = dict(tex=1024, webp_quality=70, triangle_target=11500, budget=20000, lod_ratio=.3,
    ao_dist=.24, edge_dist=.005, cav_dist=.02, edge_gain=.50, bevel_r=.003,
    dust_h=.45, dust_h0=0, dust_col=(.16,.15,.13), heat=[((0,-.15,1.7),.24)],
    render=dict(lift=0,focus=1.65,size=3,close=4.5,close_eye=1.7))


def build():
    root=empty('watcher',(0,0,0))
    # Slender load column, exposed carbon neck, ceramic fairings either side.
    body=node('body',[
        cyl(.13,1.4,(0,0,1.93),'carbon',axis='z',segs=24),
        cyl(.22,.32,(0,0,1.28),'gunmetal',axis='z',segs=24),
        cyl(.17,.06,(0,0,2.52),'steel',axis='z',segs=24),
        box((.28,.23,.95),(0,.015,1.94),'pearl',bevel=.09,segments=3),
        box((.10,.10,1.03),(0,-.16,1.97),'chrome',bevel=.035),
        tube([(.1,-.1,1.35),(.18,-.2,1.7),(.15,-.22,2.36),(.09,-.15,2.51),(0,-.10,2.53)],.026,'carbon',segs=10),
    ],(0,0,1.6),root)
    legs={}
    for suffix,a in zip(('l','r','rear'),(35,145,270)):
        a=math.radians(a)
        def p(r,z): return (math.cos(a)*r,math.sin(a)*r,z)
        hip,knee,ankle=p(.17,1.35),p(.70,.79),p(1.10,.12)
        h=node('hip_'+suffix,[cyl(.115,.19,hip,'gunmetal',axis=P(-math.sin(a),math.cos(a),0),segs=16)],hip,body)
        t=node('thigh_'+suffix,[rod_between(hip,knee,.068,'carbon',segs=12),
             rod_between(p(.22,1.30),p(.59,.90),.085,'pearl',segs=12,r2=.055)],hip,h)
        s=node('shin_'+suffix,[cyl(.09,.14,knee,'chrome',axis=P(-math.sin(a),math.cos(a),0),segs=16),
            rod_between(knee,ankle,.037,'carbon',segs=12),
            rod_between(p(.75,.73),p(1.06,.20),.044,'pearl2',segs=12)] +
            piston(p(.51,1.0),p(.91,.42),.027),knee,t)
        # Braced foot: a splayed three-toe claw on a rubber pad, strutted to the ankle.
        toes=[]
        for da in (-.38,0,.38):
            tip=(math.cos(a+da)*1.36,math.sin(a+da)*1.36,.03)
            toes += [rod_between(ankle,(tip[0],tip[1],.06),.026,'gunmetal',segs=8),
                box((.13,.06,.06),tip,'carbon',bevel=.02,rot=rot('z',90-math.degrees(a+da)))]
        node('foot_'+suffix,[box((.27,.32,.08),p(1.10,.06),'rubber',bevel=.028,rot=rot('z',90-math.degrees(a))),
            box((.2,.24,.06),p(1.10,.13),'gunmetal',bevel=.02,rot=rot('z',90-math.degrees(a))),
            cyl(.069,.12,ankle,'steel',axis=P(-math.sin(a),math.cos(a),0),segs=12)]+toes,ankle,s)
        legs[suffix]=dict(hip=hip,knee=knee,ankle=ankle,sole_z=.02,
            thigh=math.dist(hip,knee),shin=math.dist(knee,ankle),
            axes={'hip_yaw':[0,1,0], 'hip_roll':[0,0,1], **{part:[-math.sin(a),0,math.cos(a)] for part in ('thigh','shin','foot')}})
    yaw=node('head', [cyl(.21,.13,(0,0,2.60),'gunmetal',axis='z',segs=24),
        box((.48,.25,.34),(0,-.04,2.75),'pearl',bevel=.09,segments=3)],(0,0,2.58),body)
    gun=node('gun',[
        loft(smooth_sections([(-.39,2.76,.12,.13,.13,3),(-.24,2.76,.18,.19,.19,3),
             (.22,2.76,.15,.15,.15,3),(.52,2.76,.105,.11,.11,3)],2),'pearl',segs=24),
        annulus(.145,.109,.20,(0,.55,2.76),'chrome',axis='f',segs=32),
        annulus(.11,.077,.035,(0,.642,2.76),'gunmetal',axis='f',segs=32),
        cyl(.078,.012,(0,.595,2.76),'glass',axis='f',segs=32),
        box((.055,.68,.045),(0,-.03,2.975),'carbon',bevel=.015),
        # Long slug barrel under the optics: rails, cooling collars, muzzle brake.
        cyl(.05,1.2,(0,.62,2.62),'carbon',axis='f',segs=16),
        box((.16,.9,.07),(0,.38,2.67),'gunmetal',bevel=.02),
        cyl(.07,.16,(0,.12,2.62),'pearl2',axis='f',segs=16),
        cyl(.068,.1,(0,.62,2.62),'gunmetal',axis='f',segs=16),
        cyl(.066,.1,(0,.82,2.62),'gunmetal',axis='f',segs=16),
        annulus(.075,.035,.18,(0,1.2,2.62),'chrome',axis='f',segs=16),
        box((.13,.12,.035),(0,1.2,2.62),'gunmetal',bevel=.01),
        # Rangefinder pods either side of the main lens: a lens cluster.
        cyl(.06,.3,(.21,.36,2.86),'gunmetal',axis='f',segs=16),
        cyl(.06,.3,(-.21,.36,2.86),'gunmetal',axis='f',segs=16),
        cyl(.045,.01,(.21,.515,2.86),'glass',axis='f',segs=16),
        cyl(.045,.01,(-.21,.515,2.86),'glass',axis='f',segs=16),
    ],(0,0,2.76),yaw)
    # Six broad aperture vanes surround the luminous inner lens.
    iris=[]
    for i in range(6):
        a=i*math.pi/3
        iris.append(rod_between((math.cos(a)*.065,.632,2.76+math.sin(a)*.065),
            (math.cos(a+.35)*.091,.632,2.76+math.sin(a+.35)*.091),.009,'carbon',segs=6,bevel=.001))
    node('sensor',iris+[annulus(.098,.062,.016,(0,.617,2.76),'sensor',axis='f',segs=32),
        cyl(.037,.008,(0,.62,2.76),'sensor',axis='f',segs=24),
        cyl(.022,.006,(.21,.522,2.86),'sensor',axis='f',segs=12),
        cyl(.022,.006,(-.21,.522,2.86),'sensor',axis='f',segs=12)],(0,.61,2.76),gun)
    empty('muzzle',(0,1.3,2.62),gun)
    node('vent_0',[box((.17,.045,.24),(0,-.21,1.75),'gunmetal',bevel=.02),
        box((.12,.012,.16),(0,-.239,1.75),'heat',bevel=.015)] +
        [box((.15,.018,.014),(0,-.249,1.69+i*.04),'carbon',bevel=.002) for i in range(4)],(0,-.21,1.75),body)
    return dict(root=root,legs=legs,weak=['vent_0'],axes={'head':'Y yaw / X pitch','gun':'X optional optical cradle pitch'},
        extra={'sim_centre_y':1.9,'sim_radius':.5,'height':3,
               'aim':'head yaw/pitch or head yaw then gun pitch; muzzle +Z; sensor aperture emit:sensor',
               'tripod':'wide unarmoured support, narrow hittable mast'})
