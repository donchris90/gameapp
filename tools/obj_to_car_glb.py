"""
Turns a car OBJ (one body object + four wheel objects) into the game's light car file (.glb).
  python3 tools/obj_to_car_glb.py car.obj out.glb --tris 22000 [--length 4.9]
Parts written (node names the game looks for): paint, carbon, glass, lights, wheel_fl, wheel_fr, wheel_rl, wheel_rr.
The car is turned so the front points to -z, centred, sitting on y = 0, and scaled to the given length in metres.
Needs: pip install trimesh fast-simplification numpy
"""
import sys, argparse, collections
import numpy as np, trimesh, fast_simplification

ap = argparse.ArgumentParser(); ap.add_argument('obj'); ap.add_argument('out')
ap.add_argument('--tris', type=int, default=22000); ap.add_argument('--length', type=float, default=4.9)
ap.add_argument('--front', default='+z', help='which way the front of the car points in the OBJ: +z or -z')
ap.add_argument('--paint', default='Car_Texture'); ap.add_argument('--glass', default='Window_Glass'); ap.add_argument('--lights', default='Rear_Lights')
ap.add_argument("--agg", type=int, default=5)
a = ap.parse_args(); AGG = a.agg

V = []; VN = []; objs = collections.OrderedDict(); cur = None; mtl = None
for l in open(a.obj):
    if l.startswith('v '): p = l.split(); V.append((float(p[1]), float(p[2]), float(p[3])))
    elif l.startswith('vn '): p = l.split(); VN.append((float(p[1]), float(p[2]), float(p[3])))
    elif l.startswith('o '): cur = l.split()[1]; objs[cur] = collections.defaultdict(list)
    elif l.startswith('usemtl'): mtl = l.split()[1]
    elif l.startswith('f '):
        toks = [t.split('/') for t in l.split()[1:]]
        idx = [int(t[0]) - 1 for t in toks]
        nidx = [int(t[2]) - 1 if len(t) > 2 and t[2] else -1 for t in toks]
        for i in range(1, len(idx) - 1):
            tri = (idx[0], idx[i], idx[i + 1]); ns = [nidx[0], nidx[i], nidx[i + 1]]
            if min(ns) >= 0 and VN:
                # make the winding agree with the file's own normals, so lighting is the same as in the original model
                p0, p1, p2 = (np.array(V[j]) for j in tri); g = np.cross(p1 - p0, p2 - p0)
                n = np.array(VN[ns[0]]) + np.array(VN[ns[1]]) + np.array(VN[ns[2]])
                if np.dot(g, n) < 0: tri = (tri[0], tri[2], tri[1])
            objs[cur][mtl].append(tri)
V = np.array(V, dtype=np.float64)

names = list(objs)
body = names[0]; wheels = names[1:5]
def kind(m):
    if m == a.paint: return 'paint'
    if m == a.glass: return 'glass'
    if m == a.lights: return 'lights'
    return 'carbon'
parts = collections.defaultdict(list)
for m, fs in objs[body].items(): parts[kind(m)] += fs

def mesh_of(faces):
    f = np.array(faces); used = np.unique(f); remap = {int(v): i for i, v in enumerate(used)}
    m = trimesh.Trimesh(vertices=V[used], faces=np.vectorize(remap.get)(f), process=False)
    m.merge_vertices(); m.update_faces(m.nondegenerate_faces()); return m

meshes = {k: mesh_of(v) for k, v in parts.items()}
wmesh = {}
for n in wheels:
    allf = [f for fs in objs[n].values() for f in fs]; wmesh[n] = mesh_of(allf)

# drop stray pieces that are far from the car (some downloads carry a lamp or helper object)
body_all = trimesh.util.concatenate(list(meshes.values()))
wheel_centres = np.array([w.bounds.mean(axis=0) for w in wmesh.values()])
cx = wheel_centres[:, 0].mean(); cz = wheel_centres[:, 2].mean()
for k, m in list(meshes.items()):
    keep = []
    for comp in m.split(only_watertight=False):
        c = comp.bounds.mean(axis=0)
        if abs(c[0] - cx) < 14 and abs(c[2] - cz) < 26: keep.append(comp)
    meshes[k] = trimesh.util.concatenate(keep) if keep else m

allv = np.vstack([m.vertices for m in meshes.values()] + [w.vertices for w in wmesh.values()])
lo, hi = allv.min(axis=0), allv.max(axis=0)
# orientation: put the front at -z
flip = (a.front == '+z')
lenz = hi[2] - lo[2]; scale = a.length / lenz
centre = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
def fix(p):
    q = (p - centre) * scale
    if flip: q[:, 0] *= -1; q[:, 2] *= -1
    return q

total = sum(len(m.faces) for m in meshes.values()); wheel_budget = 800 * 4
body_budget = max(2000, a.tris - wheel_budget)
scene = trimesh.Scene()
def simplify(m, target):
    if len(m.faces) <= target: return m
    pts, fcs = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32), target_count=int(target), agg=AGG)
    return trimesh.Trimesh(vertices=pts, faces=fcs, process=False)
# Simplify the whole body as ONE welded mesh (separate simplification of paint and carbon leaves gaps and overlaps that flicker),
# then give every new triangle the material of the nearest original triangle.
from scipy.spatial import cKDTree
keys = list(meshes)
allm = trimesh.util.concatenate([meshes[k] for k in keys])
label = np.concatenate([np.full(len(meshes[k].faces), i) for i, k in enumerate(keys)])
orig_centres = allm.triangles_center
simp = simplify(allm, body_budget)
new_centres = simp.triangles_center
_, nn = cKDTree(orig_centres).query(new_centres)
new_label = label[nn]
simp.vertices = fix(simp.vertices)
for i, k in enumerate(keys):
    f = simp.faces[new_label == i]
    if len(f) == 0: continue
    used = np.unique(f); remap = {int(v): j for j, v in enumerate(used)}
    part = trimesh.Trimesh(vertices=simp.vertices[used], faces=np.vectorize(remap.get)(f), process=False)
    scene.add_geometry(part, node_name=k, geom_name=k)
pos = {}
for n, w in wmesh.items():
    s = simplify(w, 800); s.vertices = fix(s.vertices)
    c = s.bounds.mean(axis=0); s.vertices = s.vertices - c
    # the car's left/right: after the turn, x<0 is left
    side = 'l' if c[0] < 0 else 'r'; end = 'f' if c[2] < 0 else 'r'
    T = np.eye(4); T[:3, 3] = c
    scene.add_geometry(s, node_name=f'wheel_{end}{side}', geom_name=f'wheel_{end}{side}', transform=T)
    pos[f'wheel_{end}{side}'] = (c.round(3).tolist(), round(float(s.bounds[1][1] - s.bounds[0][1]) / 2, 3))
data = scene.export(file_type='glb')
open(a.out, 'wb').write(data)
tris = sum(len(g.faces) for g in scene.geometry.values())
print('wrote', a.out, len(data) // 1024, 'KB,', tris, 'triangles; size m:', ((hi - lo) * scale).round(2).tolist(), 'wheels:', pos)
