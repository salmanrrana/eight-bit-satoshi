"""GNAT: a compact vector-thrust scout, a split flying wedge, never a small strider.

All dimensions are metres in (left, forward, up). Origin is at the flying
centre. The sim places this root at ground + MACHINES.gnat.centre (2.5 m).
"""
import math
import bmesh
from mathutils.bvhtree import BVHTree
from lib import (box, cyl, loft, smooth_sections, cut_gap, panels, node, empty,
                 tube, rod_between, bolts, repaint, moved, annulus, P, PI)

NAME = 'gnat'
CONFIG = dict(
    tex=1024, budget=8000, lod_ratio=0.34,
    ao_dist=0.15, edge_dist=0.004, cav_dist=0.016, edge_gain=1.4, bevel_r=0.002,
    dust_h=-0.25, dust_h0=-0.4, dust_col=(0.16, 0.15, 0.13),
    heat=[((0, -0.17, -0.12), 0.22)],
    render=dict(lift=2.5, focus=0, size=0.76, close=1.25, close_eye=2.7),
)
HULL = [(-0.30, 0.025, 0.10, 0.045, 0.06, 3),
        (-0.20, 0.035, 0.22, 0.10, 0.08, 3),
        (-0.04, 0.025, 0.27, 0.115, 0.085, 3.4),
        (0.14, 0.005, 0.22, 0.085, 0.065, 3.2),
        (0.30, -0.02, 0.11, 0.045, 0.035, 3),
        (0.37, -0.035, 0.03, 0.022, 0.022, 2.4)]


def build():
    root = empty(NAME, (0, 0, 0))
    shell = loft(smooth_sections(HULL, 2), 'pearl', segs=24)
    # Trace the uncut manufactured surface so the sensor sits in its slot,
    # instead of floating like a neon wire in front of the nose.
    shell_bvh = BVHTree.FromBMesh(shell)
    trace=[]
    for i in range(21):
        x=(i-10)*.015
        hit,_,_,_=shell_bvh.ray_cast(P(x,1,-.015),P(0,-1,0))
        if hit is not None:
            trace.append((x,-hit.y-.0015,-.015))
    cut_gap(shell, (0, 0, -0.015), (0, 0, 1), 0.062, region=lambda c: c.y > 0.16)
    cut_gap(shell, (0, -0.16, 0), (0, 1, 0), 0.009)
    repaint(shell, 'chrome', lambda c: c.z < -0.02)
    panels(shell, 0.01, 0.002)
    core = loft([(f*.96,z,w*.93,t*.88,b*.85,n) for f,z,w,t,b,n in HULL], 'carbon', segs=20)
    parts = [shell, core]
    # Wide swept stabilisers with a broad carbon root and bright ceramic leading edge.
    for s in (-1, 1):
        fin = loft([(-0.31,0.02,0.055,0.025,0.025,3, s*0.32),
                    (-0.14,0.035,0.045,0.035,0.025,3,s*0.30),
                    (0.04,0.02,0.025,0.015,0.015,2.5,s*0.25)], 'pearl2', segs=12)
        parts.append(fin)
        parts.append(rod_between((s*.21,-.16,0), (s*.33,-.24,.015), .026,'carbon',segs=10))
        parts += bolts([(s*.19,-.14,.13)], (0,0,1), .009)
    body = node('body', parts, (0,0,0), root)
    # The dark glass bar has a single cyan trace inset into its leading face.
    # A closed 56mm flat diffuser uses the old strip's exact forward envelope.
    # It remains legible when the round tube would shrink below a native pixel.
    band=bmesh.new(); rows=[]
    for x,f,z in trace:
        rows.append([band.verts.new(P(x,f+df,z+dz))
            for df,dz in ((.0045,-.028),(.0045,.028),(-.015,.028),(-.015,-.028))])
    for a,b in zip(rows,rows[1:]):
        for j in range(4): band.faces.new((a[j],b[j],b[(j+1)%4],a[(j+1)%4]))
    band.faces.new(rows[0][::-1]);band.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(band,faces=band.faces)
    for face in band.faces: face.material_index=PI['sensor']
    node('sensor',[band],(0,.37,-.015),body)
    gun = node('gun', [cyl(.033,.13,(0,.22,-.105),'gunmetal',axis='f',segs=16),
                       cyl(.022,.045,(0,.30,-.105),'chrome',axis='f',segs=16),
                       cyl(.014,.008,(0,.325,-.105),'glass',axis='f',segs=12)], (0,.16,-.105),body)
    empty('muzzle',(0,.331,-.105),gun)
    # Twin downward nozzles with a recessed luminous diffuser and a sealed heat shield.
    for i,s in enumerate((-1,1)):
        p=(s*.13,-.13,-.095)
        parts=[cyl(.074,.065,p,'gunmetal',axis='z',segs=20,bevel=.005),
               annulus(.066,.058,.028,(p[0],p[1],-.147),'chrome',segs=20),
               cyl(.057,.008,(p[0],p[1],-.146),'engine',axis='z',segs=20)]
        for k in range(4):
            a=k*math.pi/2
            parts.append(rod_between((p[0],p[1],-.164),
                (p[0]+math.cos(a)*.05,p[1]+math.sin(a)*.05,-.164),.006,'carbon',segs=6))
        node('thruster_'+str(i),parts,p,body)
    node('vent_0',[box((.22,.018,.075),(0,-.305,.03),'gunmetal',bevel=.008),
                   box((.19,.008,.045),(0,-.316,.03),'heat',bevel=.005)] +
         [box((.009,.014,.04),(x,-.324,.03),'carbon',bevel=.001) for x in (-.04,0,.04)], (0,-.31,.03), body)
    return dict(root=root,flyer=True,weak=['vent_0'],
                axes={'gun':'x (pitch)','thruster_*':'x (vectoring)'},
                extra={'sim_centre_y':2.5,'sim_radius':.38,'role':'vector-thrust scout','range_read':'56mm flat sensor diffuser, wider rear heat face and 27% wider engine diffuser; original node pivots and exact bounds retained'})
