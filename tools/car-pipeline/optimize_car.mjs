/**
 * Turns a big downloaded car .glb into a light, game-ready one.
 *   node optimize_car.mjs <config.json>
 * Config: { "input": "...glb", "output": "...glb", "length": 4.9, "frontIsPlusZ": false, "triangles": 22000, "texture": 1024,
 *           "drop": ["interior-material-regex", ...], "wheels": ["rim", "tyre", ...], "paint": "body-material-regex" | null }
 * The output has: the outside only, wheels split into four nodes named wheel_fl/fr/rl/rr (centred, so they can spin),
 * a material called "paint" (the game recolours it), one small colour texture per material, front facing -z, sitting on y = 0.
 */
import { readFileSync } from 'fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(cfg.input);
const root = doc.getRoot();
const rx = (list) => (list ?? []).map((s) => new RegExp(s, 'i'));
const dropRx = rx(cfg.drop), wheelRx = rx(cfg.wheels), paintRx = cfg.paint ? new RegExp(cfg.paint, 'i') : cfg.paintNodes ? /^paint$/ : null;
const keepNodesRx = cfg.keepNodes ? new RegExp(cfg.keepNodes, 'i') : null, wheelNodesRx = cfg.wheelNodes ? new RegExp(cfg.wheelNodes, 'i') : null, paintNodesRx = cfg.paintNodes ? new RegExp(cfg.paintNodes, 'i') : null;
const matName = (p) => p.getMaterial()?.getName() ?? '';
const any = (list, s) => list.some((r) => r.test(s));

// 1. collect every triangle list in world space (positions, normals, uvs, indices) grouped by material
const groups = []; // {material, pos:[], nor:[], uv:[], idx:[]}
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  const tp = (x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
  const tn = (x, y, z) => { const v = [M[0] * x + M[4] * y + M[8] * z, M[1] * x + M[5] * y + M[9] * z, M[2] * x + M[6] * y + M[10] * z]; const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue;
    const nodeName = node.getName() ?? '';
    if (keepNodesRx && !keepNodesRx.test(nodeName)) continue;
    let name = matName(prim);
    if (any(dropRx, name) || (cfg.dropNodes && new RegExp(cfg.dropNodes, 'i').test(nodeName))) continue;
    if (paintNodesRx && paintNodesRx.test(nodeName)) name = 'paint';
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
    const n = P.getCount(), pos = [], nor = [], uv = [], v = [0, 0, 0];
    for (let i = 0; i < n; i++) { P.getElement(i, v); pos.push(tp(v[0], v[1], v[2])); if (N) { N.getElement(i, v); nor.push(tn(v[0], v[1], v[2])); } if (T) { const t = [0, 0]; T.getElement(i, t); uv.push([t[0], t[1]]); } }
    const idx = []; if (I) for (let i = 0; i < I.getCount(); i++) idx.push(I.getScalar(i)); else for (let i = 0; i < n; i++) idx.push(i);
    groups.push({ material: prim.getMaterial(), name, pos, nor: nor.length === n ? nor : null, uv: uv.length === n ? uv : null, idx, wheel: any(wheelRx, name) || (wheelNodesRx ? wheelNodesRx.test(nodeName) : false) });
  }
}

// 2. bounds, orientation, scale (front to -z, ground at y = 0, centred)
let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (const g of groups) for (const p of g.pos) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
// the car's long axis: z unless the model is turned sideways
const longAxis = (hi[0] - lo[0]) > (hi[2] - lo[2]) ? 0 : 2;
const rotate = longAxis === 0; // x -> z
const scale = cfg.length / (hi[longAxis] - lo[longAxis]);
const flipFront = cfg.frontIsPlusZ === true;
const fix = (p) => {
  let [x, y, z] = p;
  if (rotate) [x, z] = [-z, x]; // quarter turn
  return [x, y, z];
};
// recompute bounds after the turn
lo = [1e9, 1e9, 1e9]; hi = [-1e9, -1e9, -1e9];
for (const g of groups) for (const p of g.pos) { const q = fix(p); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); } }
const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2, base = lo[1];
const place = (p) => { const q = fix(p); let x = (q[0] - cx) * scale, y = (q[1] - base) * scale, z = (q[2] - cz) * scale; if (flipFront) { x = -x; z = -z; } return [x, y, z]; };
const placeN = (n) => { let [x, y, z] = fix(n); if (flipFront) { x = -x; z = -z; } return [x, y, z]; };
for (const g of groups) { g.pos = g.pos.map(place); if (g.nor) g.nor = g.nor.map(placeN); }

// 3. wheels: split the wheel triangles into four by position
const quad = (c) => (c[2] < wheelZ ? 'f' : 'r') + (c[0] < 0 ? 'l' : 'r');
let wz = []; for (const g of groups) if (g.wheel) for (const p of g.pos) wz.push(p[2]);
let zmin = 1e9, zmax = -1e9; for (const z of wz) { if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
const wheelZ = wz.length ? (zmin + zmax) / 2 : 0;
const pieces = []; // {name, material, pos, nor, uv, idx, centre?}
for (const g of groups) {
  if (!g.wheel) { pieces.push({ name: g.name, material: g.material, node: null, ...g }); continue; }
  const by = {};
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
    const cen = [0, 1, 2].map((k) => (g.pos[a][k] + g.pos[b][k] + g.pos[c][k]) / 3);
    (by[quad(cen)] ??= []).push(a, b, c);
  }
  for (const [q, tris] of Object.entries(by)) {
    const map = new Map(), pos = [], nor = [], uv = [], idx = [];
    for (const i of tris) { if (!map.has(i)) { map.set(i, pos.length); pos.push(g.pos[i]); if (g.nor) nor.push(g.nor[i]); if (g.uv) uv.push(g.uv[i]); } idx.push(map.get(i)); }
    pieces.push({ name: g.name, material: g.material, node: 'wheel_' + q, pos, nor: g.nor ? nor : null, uv: g.uv ? uv : null, idx });
  }
}
const wheelCentres = {};
for (const q of ['fl', 'fr', 'rl', 'rr']) {
  const ps = pieces.filter((p) => p.node === 'wheel_' + q); if (!ps.length) continue;
  const l = [1e9, 1e9, 1e9], h = [-1e9, -1e9, -1e9];
  for (const p of ps) for (const v of p.pos) for (let a = 0; a < 3; a++) { l[a] = Math.min(l[a], v[a]); h[a] = Math.max(h[a], v[a]); }
  wheelCentres[q] = [(l[0] + h[0]) / 2, (l[1] + h[1]) / 2, (l[2] + h[2]) / 2];
  for (const p of ps) p.pos = p.pos.map((v) => [v[0] - wheelCentres[q][0], v[1] - wheelCentres[q][1], v[2] - wheelCentres[q][2]]);
}

// 3b. weld and reduce every piece on its own, to its share of the triangle budget
const totalTris = (list) => list.reduce((s, p) => s + p.idx.length / 3, 0);
const bodyPieces = pieces.filter((p) => !p.node), wheelPieces = pieces.filter((p) => p.node);
const wheelBudget = cfg.wheelTriangles ?? 3200;
const bodyBudget = Math.max(2000, cfg.triangles - wheelBudget);
const bodyNow = totalTris(bodyPieces), wheelNow = totalTris(wheelPieces);
function weldPiece(p) {
  const map = new Map(), pos = [], nor = [], uv = [], remap = new Array(p.pos.length);
  for (let i = 0; i < p.pos.length; i++) {
    const v = p.pos[i], u = p.uv ? p.uv[i] : [0, 0];
    const k = `${Math.round(v[0] * 4000)},${Math.round(v[1] * 4000)},${Math.round(v[2] * 4000)},${Math.round(u[0] * 2000)},${Math.round(u[1] * 2000)}`;
    let j = map.get(k); if (j === undefined) { j = pos.length; map.set(k, j); pos.push(v); if (p.uv) uv.push(u); }
    remap[i] = j;
  }
  p.pos = pos; p.uv = p.uv ? uv : null; p.nor = null; p.idx = p.idx.map((i) => remap[i]);
  // drop degenerate triangles
  const idx = []; for (let t = 0; t < p.idx.length; t += 3) { const a = p.idx[t], b = p.idx[t + 1], c = p.idx[t + 2]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); } p.idx = idx;
}
function reducePiece(p, target) {
  weldPiece(p);
  const have = p.idx.length / 3; if (have <= target * 1.1) return;
  const positions = new Float32Array(p.pos.flat());
  let idx = new Uint32Array(p.idx), error = cfg.error ?? 0.004;
  for (let pass = 0; pass < 8; pass++) {
    const [res] = MeshoptSimplifier.simplify(idx, positions, 3, Math.max(3, Math.floor(target) * 3), error, []);
    idx = res; if (res.length / 3 <= target * 1.15) break; error *= 2.2;
  }
  // keep only the vertices still used
  const used = new Map(), pos = [], uv = [], out = [];
  for (const i of idx) { if (!used.has(i)) { used.set(i, pos.length); pos.push(p.pos[i]); if (p.uv) uv.push(p.uv[i]); } out.push(used.get(i)); }
  p.pos = pos; p.uv = p.uv ? uv : null; p.idx = out;
}
for (const p of bodyPieces) reducePiece(p, Math.max(60, bodyBudget * (p.idx.length / 3) / bodyNow));
for (const p of wheelPieces) reducePiece(p, Math.max(40, wheelBudget * (p.idx.length / 3) / wheelNow));

// 4. write a fresh document
const out = new Document(); const buf = out.createBuffer(); const scene = out.createScene('car');
const matMap = new Map(); const texMap = new Map();
const copyTex = (tex, suffix = '') => { const key = tex; if (!texMap.has(key)) { const t = out.createTexture((tex.getName() || 'tex') + suffix); t.setImage(tex.getImage()).setMimeType(tex.getMimeType()); texMap.set(key, t); } return texMap.get(key); };
const outMat = (m, name) => {
  const key = m ?? name; if (matMap.has(key)) return matMap.get(key);
  const o = out.createMaterial(paintRx && paintRx.test(name) ? 'paint' : name || 'mat');
  if (m) {
    o.setBaseColorFactor(m.getBaseColorFactor()); o.setMetallicFactor(Math.min(0.9, m.getMetallicFactor())); o.setRoughnessFactor(Math.max(0.12, m.getRoughnessFactor()));
    o.setEmissiveFactor(m.getEmissiveFactor()); o.setAlphaMode(m.getAlphaMode()); o.setDoubleSided(m.getDoubleSided());
    const tex = m.getBaseColorTexture();
    if (tex && !(paintRx && paintRx.test(name) && cfg.paintKeepsTexture !== true)) { o.setBaseColorTexture(copyTex(tex)); }
    const em = m.getEmissiveTexture(); if (em) o.setEmissiveTexture(copyTex(em, '_e'));
  }
  matMap.set(key, o); return o;
};
const nodeOf = {};
const addPrim = (mesh, p) => {
  const prim = out.createPrimitive();
  prim.setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(p.pos.flat())).setBuffer(buf));
  if (p.uv) prim.setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(new Float32Array(p.uv.flat())).setBuffer(buf));
  prim.setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(p.idx)).setBuffer(buf));
  prim.setMaterial(outMat(p.material, p.name)); mesh.addPrimitive(prim);
};
const body = out.createMesh('body'); const bodyNode = out.createNode('body').setMesh(body); scene.addChild(bodyNode);
for (const p of pieces) {
  if (!p.node) { addPrim(body, p); continue; }
  if (!nodeOf[p.node]) { const m = out.createMesh(p.node); const n = out.createNode(p.node).setMesh(m).setTranslation(wheelCentres[p.node.slice(6)]); scene.addChild(n); nodeOf[p.node] = m; }
  addPrim(nodeOf[p.node], p);
}

// 5. normals and textures
const tris = (d) => d.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((q, p) => q + p.getIndices().getCount() / 3, 0), 0);
const before = bodyNow + wheelNow;
// normals: area-weighted, averaged over every vertex at the same position (so texture seams do not show as lighting seams)
for (const mesh of out.getRoot().listMeshes()) {
  const acc = new Map();
  const key = (x, y, z) => Math.round(x * 2000) + ',' + Math.round(y * 2000) + ',' + Math.round(z * 2000);
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), I = prim.getIndices(), a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let i = 0; i < I.getCount(); i += 3) {
      P.getElement(I.getScalar(i), a); P.getElement(I.getScalar(i + 1), b); P.getElement(I.getScalar(i + 2), c);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const v of [a, b, c]) { const k = key(...v); const s = acc.get(k) ?? [0, 0, 0]; s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; acc.set(k, s); }
    }
  }
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), n = P.getCount(), arr = new Float32Array(n * 3), v = [0, 0, 0];
    for (let i = 0; i < n; i++) { P.getElement(i, v); const s = acc.get(key(...v)) ?? [0, 1, 0]; const l = Math.hypot(...s) || 1; arr[i * 3] = s[0] / l; arr[i * 3 + 1] = s[1] / l; arr[i * 3 + 2] = s[2] / l; }
    prim.setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(arr).setBuffer(buf));
  }
}
await out.transform(prune());
// textures: resize to max size, keep as PNG
for (const t of out.getRoot().listTextures()) {
  const img = Buffer.from(t.getImage());
  const png = await sharp(img).resize(cfg.texture ?? 1024, cfg.texture ?? 1024, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9, palette: false }).toBuffer();
  t.setImage(new Uint8Array(png)).setMimeType('image/png');
}
const bounds = getBounds(scene);
await new NodeIO().write(cfg.output, out);
const kb = Math.round(readFileSync(cfg.output).length / 1024);
console.log(`wrote ${cfg.output}: ${kb} KB, ${tris(out)} triangles (was ${before} after dropping interior), ${out.getRoot().listTextures().length} textures, size ${bounds.max.map((v, i) => (v - bounds.min[i]).toFixed(2))}`, 'wheels', JSON.stringify(Object.fromEntries(Object.entries(wheelCentres).map(([k, v]) => [k, v.map((x) => +x.toFixed(2))]))));
