import { Asset } from 'expo-asset';
import * as THREE from 'three';
// @ts-ignore (no type package: a small pure-JavaScript PNG reader, works the same on phone and server tools)
import UPNG from 'upng-js';

/**
 * Real 3D car files (.glb) made by tools/car-pipeline. No loader library is needed: a .glb is a small JSON description plus
 * one block of numbers (and small PNG pictures), and this reads exactly the parts the game uses.
 * If a file cannot be loaded for any reason the game quietly uses the built-in cars instead.
 */
export interface MatDesc { name: string; color: [number, number, number, number]; map: THREE.DataTexture | null; metallic: number; roughness: number; emissive: [number, number, number]; blend: boolean; doubleSided: boolean }
export interface Part { geometry: THREE.BufferGeometry; at: [number, number, number]; materials: MatDesc[] }
export interface CarModel { modern: boolean; parts: Record<string, Part> }

const TYPES: Record<number, { size: number; get: (v: DataView, o: number) => number }> = {
  5120: { size: 1, get: (v, o) => v.getInt8(o) }, 5121: { size: 1, get: (v, o) => v.getUint8(o) },
  5122: { size: 2, get: (v, o) => v.getInt16(o, true) }, 5123: { size: 2, get: (v, o) => v.getUint16(o, true) },
  5125: { size: 4, get: (v, o) => v.getUint32(o, true) }, 5126: { size: 4, get: (v, o) => v.getFloat32(o, true) },
};
const COUNTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function parseCarGlb(buf: ArrayBuffer): CarModel {
  const head = new DataView(buf);
  if (head.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json: any = null, bin = 0;
  while (off < buf.byteLength) {
    const len = head.getUint32(off, true), type = head.getUint32(off + 4, true);
    if (type === 0x4e4f534a) { const bytes = new Uint8Array(buf, off + 8, len); let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); json = JSON.parse(s); }
    else if (type === 0x004e4942) bin = off + 8;
    off += 8 + len;
  }
  if (!json) throw new Error('no json');
  const view = new DataView(buf);
  const read = (acc: number): number[] => {
    const a = json.accessors[acc], bv = json.bufferViews[a.bufferView], t = TYPES[a.componentType], n = COUNTS[a.type];
    const stride = bv.byteStride || t.size * n, base = bin + (bv.byteOffset || 0) + (a.byteOffset || 0), data: number[] = new Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) data[i * n + k] = t.get(view, base + i * stride + k * t.size);
    return data;
  };
  // pictures and materials (only present in the newer files)
  const textures = new Map<number, THREE.DataTexture>();
  const texture = (index: number): THREE.DataTexture | null => {
    if (textures.has(index)) return textures.get(index)!;
    try {
      const img = json.images[json.textures[index].source], bv = json.bufferViews[img.bufferView];
      const png = UPNG.decode(buf.slice(bin + (bv.byteOffset || 0), bin + (bv.byteOffset || 0) + bv.byteLength));
      const rgba = new Uint8Array(UPNG.toRGBA8(png)[0]);
      const t = new THREE.DataTexture(rgba, png.width, png.height, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
      textures.set(index, t); return t;
    } catch { return null; }
  };
  const mats: MatDesc[] = (json.materials ?? []).map((m: any) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    return {
      name: String(m.name ?? ''), color: pbr.baseColorFactor ?? [1, 1, 1, 1], map: pbr.baseColorTexture ? texture(pbr.baseColorTexture.index) : null,
      metallic: pbr.metallicFactor ?? 0.5, roughness: pbr.roughnessFactor ?? 0.5, emissive: m.emissiveFactor ?? [0, 0, 0], blend: m.alphaMode === 'BLEND', doubleSided: !!m.doubleSided,
    } as MatDesc;
  });
  const modern = mats.length > 0;
  const parts: CarModel['parts'] = {};
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined || !node.name) continue;
    const prims = json.meshes[node.mesh].primitives, g = new THREE.BufferGeometry();
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [], used: MatDesc[] = [];
    let haveUv = true;
    for (const p of prims) {
      const base = pos.length / 3, P = read(p.attributes.POSITION), start = idx.length;
      for (const v of P) pos.push(v);
      if (p.attributes.NORMAL !== undefined) for (const v of read(p.attributes.NORMAL)) nor.push(v);
      if (p.attributes.TEXCOORD_0 !== undefined) for (const v of read(p.attributes.TEXCOORD_0)) uv.push(v); else { haveUv = false; for (let i = 0; i < P.length / 3 * 2; i++) uv.push(0); }
      if (p.indices !== undefined) for (const i of read(p.indices)) idx.push(i + base);
      else for (let i = 0; i < P.length / 3; i++) idx.push(base + i);
      if (modern) { g.addGroup(start, idx.length - start, used.length); used.push(mats[p.material] ?? mats[0]); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    if (nor.length === pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals(); // after the indices, so shared corners are smoothed
    if (haveUv || modern) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    parts[String(node.name)] = { geometry: g, at: node.matrix ? [node.matrix[12], node.matrix[13], node.matrix[14]] : ((node.translation as [number, number, number]) ?? [0, 0, 0]), materials: used };
  }
  return { modern, parts };
}

// ---- the garage catalogue's car files, loaded on demand and kept ----
const FILES: Record<string, () => number> = {}; // filled by cars.ts (registerCarFile)
export const MODELS: { hero: CarModel | null; rival: CarModel | null; byId: Record<string, CarModel | null> } = { hero: null, rival: null, byId: {} };
const pending: Record<string, Promise<CarModel | null>> = {};

async function fetchBuffer(mod: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const res = await fetch(asset.localUri ?? asset.uri);
  return res.arrayBuffer();
}

/** Registers an extra car file (the garage catalogue calls this once per car). */
export function registerCarFile(id: string, getModule: () => number) { FILES[id] = getModule; }

/** Loads one car file (kept after the first time). Never throws: gives null if it cannot be read. */
export function loadCarModel(id: string): Promise<CarModel | null> {
  if (MODELS.byId[id]) return Promise.resolve(MODELS.byId[id]);
  pending[id] ??= (async () => {
    try { const m = parseCarGlb(await fetchBuffer(FILES[id]())); MODELS.byId[id] = m; if (id === 'hero') MODELS.hero = m; if (id === 'rival') MODELS.rival = m; return m; } catch { return null; }
  })();
  return pending[id];
}

/** Loads the two built-in car files once. Never throws. */
export function loadCarModels(): Promise<void> {
  return Promise.all([loadCarModel('hero'), loadCarModel('rival')]).then(() => undefined);
}
