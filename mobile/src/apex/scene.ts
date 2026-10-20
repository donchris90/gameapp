import * as THREE from 'three';
import { MODELS, CarModel, MatDesc } from './model';
import { CIRCUIT } from './circuit';
import { Entity, Kind, LANES, LANE_W, ROAD_HALF, World, curvatureAt, poseOf, trackInfo } from './sim';

/**
 * The 3D look of Apex Run: a luxury car on a road with traffic, motorbikes, buses and people crossing.
 * Everything is built from code (no image files), and nothing here changes the rules: the rules live in sim.ts.
 * Three.js axes: the road runs along -z (forward), x is sideways (right is +x), y is up. A rule-world position (x, z)
 * is drawn at (x, 0, -z).
 */

export interface View { x: number; z: number; id: number; color?: number; model?: string }
export type CameraMode = 'chase' | 'cockpit';

export interface Frame {
  t: number; speed: number; steer: number; nitroOn: boolean; braking: boolean; flash: number; shake: number;
  player: View; others: View[]; arrived: number[]; finished: boolean;
}

const VIEW_AHEAD = 240, VIEW_BEHIND = 25;
export const PALETTE = [0xd9283c, 0x2563eb, 0xf5c518, 0x22a06b, 0x7c3aed, 0xff7a1a, 0x16b5d8, 0xe7e9ee, 0x1a1d24, 0x9a4a22];
const hash = (n: number) => { let x = (n | 0) + 0x9e3779b9; x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// ---- time of day: the level picks the light ----
interface Theme { sky: number; horizon: number; fog: number; sun: number; sunPower: number; ambient: number; ground: number; night: boolean; lamps: boolean }
const THEMES: Theme[] = [
  { sky: 0x3a8ee6, horizon: 0xbfe4ff, fog: 0xbfe4ff, sun: 0xfff1d6, sunPower: 2.2, ambient: 0xcfe6ff, ground: 0x6f8f4e, night: false, lamps: false }, // day
  { sky: 0x5b3a8c, horizon: 0xffa46b, fog: 0xe58a5e, sun: 0xffb27a, sunPower: 1.7, ambient: 0xffd2b0, ground: 0x7a6a45, night: false, lamps: true }, // sunset
  { sky: 0x0a1030, horizon: 0x2b3d7a, fog: 0x16224a, sun: 0x8ea6ff, sunPower: 1.1, ambient: 0x7a8ccc, ground: 0x1b2438, night: true, lamps: true }, // night
];
export const themeFor = (level: number) => THEMES[[0, 0, 1, 2][(Math.max(1, level) - 1) % 4]];

// A tiny window-grid texture made from raw pixels (no image files needed).
function windowTexture(): THREE.DataTexture {
  const w = 8, h = 8, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, win = x % 4 >= 1 && x % 4 <= 2 && y % 4 >= 1 && y % 4 <= 2;
    const v = win ? 70 : 235; data[i] = v; data[i + 1] = win ? 90 : v; data[i + 2] = win ? 120 : v - 6; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  return tex;
}
/** Grey speckle for asphalt and grass, tinted by the material colour. */
function speckleTexture(base: number, spread: number, size = 32): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4); let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, base + (rnd() - 0.5) * spread)); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true; return tex;
}
/** Dark skyscrapers with lit windows, for the far-off city. */
function towerTexture(): THREE.DataTexture {
  const w = 16, h = 32, data = new Uint8Array(w * h * 4); let s = 777;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, cell = x % 2 === 0 && y % 2 === 0, lit = cell && rnd() < 0.5, warm = rnd() < 0.7;
    data[i] = lit ? (warm ? 255 : 127) : 16; data[i + 1] = lit ? (warm ? 217 : 230) : 20; data[i + 2] = lit ? (warm ? 160 : 255) : 42; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true; return tex;
}
function shadowTexture(): THREE.DataTexture {
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x - n / 2 + 0.5) / (n / 2), dy = (y - n / 2 + 0.5) / (n / 2), d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const i = (y * n + x) * 4; data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = Math.round(Math.pow(1 - d, 1.4) * 255);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tex.needsUpdate = true; return tex;
}
const chevronTexture = (): THREE.DataTexture => {
  const w = 32, h = 64, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, k = (y % 21) / 21, edge = Math.abs(x - w / 2) / (w / 2), on = Math.abs(k - (0.75 - edge * 0.5)) < 0.09;
    data[i] = 61; data[i + 1] = 224; data[i + 2] = 255; data[i + 3] = on ? 255 : 0;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); tex.needsUpdate = true; return tex;
};
function glowTexture(): THREE.DataTexture {
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x - n / 2 + 0.5) / (n / 2), dy = (y - n / 2 + 0.5) / (n / 2), d = Math.min(1, Math.sqrt(dx * dx + dy * dy)), a = Math.pow(1 - d, 2);
    const i = (y * n + x) * 4; data[i] = 255; data[i + 1] = 244; data[i + 2] = 200; data[i + 3] = Math.round(a * 255);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tex.needsUpdate = true; return tex;
}

// A small made-up sky for the paint to reflect (no image files): bright sky, warm horizon, dark ground, one soft light strip.
let ENV: THREE.CubeTexture | null = null;
function envMap(): THREE.CubeTexture {
  if (ENV) return ENV;
  const n = 16;
  const face = (kind: 'side' | 'up' | 'down', strip: boolean) => {
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = y / (n - 1); // 0 top .. 1 bottom
      let r: number, g: number, b: number;
      if (kind === 'up') { r = 170; g = 205; b = 245; if (strip && x > 4 && x < 11 && y > 3 && y < 12) { r = 255; g = 255; b = 255; } }
      else if (kind === 'down') { r = 38; g = 36; b = 40; }
      else if (v < 0.42) { const k = v / 0.42; r = 120 + 110 * k; g = 170 + 60 * k; b = 235 - 10 * k; }
      else if (v < 0.52) { r = 255; g = 236; b = 205; }
      else { const k = Math.min(1, (v - 0.52) / 0.3); r = 150 - 112 * k; g = 138 - 100 * k; b = 130 - 94 * k; }
      if (kind === 'side' && strip && y > 2 && y < 5) { r = 255; g = 255; b = 255; }
      const i = (y * n + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    const tx = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tx.needsUpdate = true; return tx;
  };
  const faces = [face('side', true), face('side', false), face('up', true), face('down', false), face('side', true), face('side', false)];
  ENV = new THREE.CubeTexture(faces as any);
  ENV.needsUpdate = true;
  return ENV;
}

// ---- shared geometry and materials ----
const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...o });

function sideShape(pts: Array<[number, number]>) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}
/** Extrudes a side outline (x along the car, y up) across the car's width and turns it to face forward (-z). */
function bodyFromOutline(pts: Array<[number, number]>, width: number, bevel = 0.12) {
  const g = new THREE.ExtrudeGeometry(sideShape(pts), { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

const WHEEL_G = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14).rotateZ(Math.PI / 2);
const RIM_G = new THREE.CylinderGeometry(0.22, 0.22, 0.28, 10).rotateZ(Math.PI / 2);
const TYRE_M = std(0x0c0c10, { roughness: 0.9 });
const RIM_M = std(0xc9ced8, { metalness: 0.9, roughness: 0.25 });
const GLASS_M = std(0x1b2a44, { metalness: 0.5, roughness: 0.12 });

export interface CarParts { group: THREE.Group; body: THREE.Mesh; tail: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; flame: THREE.Mesh; wheels: THREE.Mesh[]; paint: THREE.MeshStandardMaterial }

// ---- a smooth car body made by lofting rounded cross-sections along the car's length ----
interface Station { z: number; hw: number; y0: number; y1: number }
const SEG = 22;
/** Builds a closed rounded tube. Each station is a slice (half-width, bottom, top) along z; the slice is a squircle so the sides curve instead of being flat. */
function loft(stations: Station[], n = 3.2) {
  const pos: number[] = [], idx: number[] = [];
  const p = 2 / n;
  stations.forEach((s) => {
    const cy = (s.y0 + s.y1) / 2, hh = (s.y1 - s.y0) / 2;
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(Math.sign(c) * Math.pow(Math.abs(c), p) * s.hw, cy + Math.sign(sn) * Math.pow(Math.abs(sn), p) * hh, s.z);
    }
  });
  for (let i = 0; i < stations.length - 1; i++) for (let k = 0; k < SEG; k++) {
    const a = i * SEG + k, b = i * SEG + ((k + 1) % SEG), c = (i + 1) * SEG + k, d = (i + 1) * SEG + ((k + 1) % SEG);
    idx.push(a, b, c, b, d, c);
  }
  // close both ends with a fan
  for (const [i0, flip] of [[0, false], [stations.length - 1, true]] as const) {
    const s = stations[i0], ci = pos.length / 3;
    pos.push(0, (s.y0 + s.y1) / 2, s.z);
    for (let k = 0; k < SEG; k++) { const a = i0 * SEG + k, b = i0 * SEG + ((k + 1) % SEG); if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Interpolates a list of [z, value] points. */
const prof = (pts: Array<[number, number]>) => (z: number) => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]; const t = (z - z0) / (z1 - z0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t)); }
  return pts[pts.length - 1][1];
};
const zs = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

interface Shape { len: number; hw: number; top: number; deckRear: number; cabinFront: number; cabinRear: number; roof: number; roofW: number; wheelR: number; axleF: number; axleR: number }
const SHAPES: Record<string, Shape> = {
  // front is -z. len = half length of the car
  super: { len: 2.45, hw: 0.99, top: 0.9, deckRear: 1.0, cabinFront: -0.95, cabinRear: 1.35, roof: 1.38, roofW: 0.78, wheelR: 0.35, axleF: -1.55, axleR: 1.45 },
  saloon: { len: 2.45, hw: 0.99, top: 0.98, deckRear: 1.04, cabinFront: -0.85, cabinRear: 1.5, roof: 1.55, roofW: 0.82, wheelR: 0.36, axleF: -1.5, axleR: 1.5 },
  hatch: { len: 2.1, hw: 0.9, top: 0.98, deckRear: 1.08, cabinFront: -0.9, cabinRear: 1.95, roof: 1.6, roofW: 0.78, wheelR: 0.34, axleF: -1.3, axleR: 1.3 },
};

function carBody(shape: Shape, paint: THREE.Material, glass: THREE.Material, wheelR: number) {
  const g = new THREE.Group(), L = shape.len;
  const hw = prof([[-L, 0.55], [-L + 0.35, 0.86], [-L + 0.9, shape.hw], [L - 0.9, shape.hw], [L - 0.25, shape.hw * 0.9], [L, 0.72]]);
  const y1 = prof([[-L, 0.6], [-L + 0.5, shape.top - 0.14], [-L + 1.2, shape.top], [shape.cabinFront, shape.top + 0.04], [shape.cabinRear - 0.3, shape.deckRear], [L - 0.2, shape.deckRear - 0.02], [L, shape.deckRear - 0.14]]);
  const y0 = prof([[-L, 0.42], [-L + 0.3, 0.3], [L - 0.3, 0.3], [L, 0.42]]);
  const body = new THREE.Mesh(loft(zs(-L, L, 26).map((z) => ({ z, hw: hw(z), y0: y0(z), y1: y1(z) }))), paint);
  g.add(body);
  // greenhouse: sloping windscreen, curved roof, short tail window
  const c0 = shape.cabinFront, c1 = shape.cabinRear;
  const chw = prof([[c0, shape.roofW + 0.12], [c0 + 0.5, shape.roofW + 0.1], [c1 - 0.6, shape.roofW + 0.06], [c1, shape.roofW - 0.12]]);
  const cy1 = prof([[c0, shape.top], [c0 + 0.25, shape.top + 0.2], [c0 + 0.9, shape.roof], [c1 - 0.8, shape.roof], [c1 - 0.25, shape.roof - 0.2], [c1, shape.deckRear]]);
  const cabin = new THREE.Mesh(loft(zs(c0, c1, 18).map((z) => ({ z, hw: chw(z), y0: shape.top - 0.06, y1: cy1(z) })), 2.6), glass);
  g.add(cabin);
  const r0 = c0 + 0.85, r1 = c1 - 0.85;
  const roof = new THREE.Mesh(loft(zs(r0, r1, 8).map((z) => ({ z, hw: chw(z) - 0.02, y0: cy1(z) - 0.1, y1: cy1(z) + 0.012 })), 3), paint);
  g.add(roof);
  return { group: g, body };
}

function addWheels(group: THREE.Group, shape: Shape, tyre: THREE.Material, rimM: THREE.Material) {
  const R = shape.wheelR, wheels: THREE.Mesh[] = [];
  const tyreG = new THREE.CylinderGeometry(R, R, 0.3, 16).rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(R * 0.66, R * 0.66, 0.32, 10).rotateZ(Math.PI / 2);
  const hubG = new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.34, 6).rotateZ(Math.PI / 2);
  const spokeG = new THREE.BoxGeometry(0.34, R * 1.2, 0.07);
  const archG = new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.06, 16).rotateZ(Math.PI / 2);
  const archM = new THREE.MeshBasicMaterial({ color: 0x050507 });
  const x = shape.hw - 0.12;
  for (const az of [shape.axleF, shape.axleR]) for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(tyreG, tyre); w.position.set(sx * x, R, az);
    w.add(new THREE.Mesh(rimG, rimM), new THREE.Mesh(hubG, tyre));
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(spokeG, rimM); sp.rotation.x = (i / 5) * Math.PI; w.add(sp); }
    group.add(w); wheels.push(w);
    const arch = new THREE.Mesh(archG, archM); arch.position.set(sx * (shape.hw - 0.02), R + 0.04, az); group.add(arch);
  }
  return wheels;
}

/** The hero car: a low, wide luxury car. `tier` adds more: 0 starter saloon, 1 sport (spoiler), 2 luxury (chrome, long), 3 flagship (stripe + wing). */
export function buildLuxuryCar(color: number, tier = 2): CarParts {
  const shape = tier >= 1 ? SHAPES.super : SHAPES.saloon;
  const paint = std(color, { metalness: 0.6, roughness: 0.18, envMap: envMap(), envMapIntensity: 1.25 });
  const glass = std(0x0d1626, { metalness: 0.9, roughness: 0.05, envMap: envMap(), envMapIntensity: 1.4 });
  const { group, body } = carBody(shape, paint, glass, shape.wheelR);
  const chrome = std(0xe4e8ef, { metalness: 1, roughness: 0.1, envMap: envMap(), envMapIntensity: 1.3 });
  const dark = std(0x0e1015, { metalness: 0.6, roughness: 0.4 });
  const wheels = addWheels(group, shape, TYRE_M, chrome);
  const L = shape.len;
  // lights: front is -z
  const head = std(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 1, metalness: 0.1, roughness: 0.2 });
  const tail = std(0x330000, { emissive: 0xff1a1a, emissiveIntensity: 0.8, metalness: 0.1, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.24), head); h.position.set(sx * 0.68, shape.top - 0.2, -L + 0.28); h.rotation.y = sx * 0.35; group.add(h);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), paint); mirror.position.set(sx * 1.08, shape.top + 0.22, shape.cabinFront + 0.55); group.add(mirror);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8).rotateX(Math.PI / 2), chrome); pipe.position.set(sx * 0.5, 0.3, L - 0.02); group.add(pipe);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.1), tail); bar.position.set(0, shape.deckRear - 0.2, L - 0.12); group.add(bar);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.12), tier >= 2 ? chrome : dark); grille.position.set(0, 0.45, -L + 0.08); group.add(grille);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.3), dark); splitter.position.set(0, 0.2, -L + 0.1); group.add(splitter);
  // door line and sill
  for (const sx of [-1, 1]) { const sill = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 2.5), tier >= 2 ? chrome : dark); sill.position.set(sx * (shape.hw - 0.01), 0.36, 0); group.add(sill); }
  if (tier >= 1) {
    for (const sx of [-1, 1]) { const up = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.1), dark); up.position.set(sx * 0.6, shape.deckRear + 0.1, L - 0.4); group.add(up); }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.42), tier >= 3 ? paint : dark); wing.position.set(0, shape.deckRear + 0.25, L - 0.4); group.add(wing);
  }
  if (tier >= 3) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 3.6), std(0xf3f4f7, { metalness: 0.5, roughness: 0.3 })); stripe.position.set(0, shape.top + 0.05, -0.3); group.add(stripe); }
  // nitro flame
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 }));
  flame.position.set(0, 0.4, L + 1.2); flame.visible = false; group.add(flame);
  group.add(blobShadow());
  return { group, body, tail, head, flame, wheels, paint };
}

/** A car built from a real 3D file. The part called `paint` takes the chosen colour; the wheels spin. `glow` adds an underglow colour (0 = none). */
function buildModelCar(model: CarModel, color: number, look: { glow?: number; flame?: number } = {}): CarParts {
  const group = new THREE.Group();
  const paint = std(color, { metalness: 0.65, roughness: 0.16, envMap: envMap(), envMapIntensity: 1.3 });
  const tailDefault = std(0x330000, { emissive: 0xff1a1a, emissiveIntensity: 0.8, metalness: 0.1, roughness: 0.3 });
  const head = std(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 1, metalness: 0.1, roughness: 0.2 });
  let tail: THREE.MeshStandardMaterial = tailDefault;
  let body: THREE.Mesh | null = null;
  const wheels: THREE.Mesh[] = [];
  const cache = new Map<MatDesc, THREE.Material>();
  const material = (m: MatDesc): THREE.Material => {
    if (m.name === 'paint') return paint;
    let x = cache.get(m);
    if (!x) {
      const glassy = /glass|window|windscreen/i.test(m.name) || m.blend;
      const lamp = /tail|brake|rear.?light|stop/i.test(m.name);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.color[0], m.color[1], m.color[2]).multiplyScalar(/carbon/i.test(m.name) ? 0.28 : 1), map: m.map, roughness: glassy ? 0.05 : Math.max(0.2, m.roughness), metalness: glassy ? 0.9 : Math.min(0.8, m.metallic),
        envMap: envMap(), envMapIntensity: glassy ? 1.5 : 0.9, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        emissive: new THREE.Color(m.emissive[0], m.emissive[1], m.emissive[2]), transparent: glassy && m.color[3] < 0.99, opacity: glassy ? Math.min(0.85, m.color[3]) : 1,
      });
      if (lamp) { mat.emissive = new THREE.Color(0xff1a1a); mat.emissiveIntensity = 0.8; tail = mat; }
      x = mat; cache.set(m, mat);
    }
    return x;
  };
  // old-style files (no materials): colour the parts by their names
  const legacy: Record<string, THREE.Material> = {
    paint, carbon: std(0x14161b, { metalness: 0.7, roughness: 0.35, envMap: envMap(), envMapIntensity: 0.9 }),
    glass: std(0x0b1220, { metalness: 0.95, roughness: 0.05, envMap: envMap(), envMapIntensity: 1.5 }), lights: tailDefault,
  };
  const tyre = std(0x0d0e12, { metalness: 0.5, roughness: 0.5, envMap: envMap(), envMapIntensity: 0.6 });
  for (const [name, part] of Object.entries(model.parts)) {
    const isWheel = name.startsWith('wheel_');
    const mats: THREE.Material | THREE.Material[] = model.modern ? part.materials.map(material) : isWheel ? tyre : (legacy[name] ?? legacy.carbon);
    const m = new THREE.Mesh(part.geometry, mats);
    if (isWheel) { m.position.set(...part.at); wheels.push(m); } else if (!body || name === 'paint' || name === 'body') body = m;
    group.add(m);
  }
  // headlight glow strips on the nose so the lights read at night
  for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.12), head); h.position.set(sx * 0.62, 0.5, -2.34); h.rotation.y = sx * 0.4; group.add(h); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: look.flame ?? 0x66ccff, transparent: true, opacity: 0.85 }));
  flame.position.set(0, 0.42, 3.6); flame.visible = false; group.add(flame);
  if (look.glow) { // underglow: a soft coloured pool of light under the car
    const g = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: look.glow, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.position.y = 0.04; group.add(g);
  }
  group.add(blobShadow());
  return { group, body: body ?? (group.children[0] as THREE.Mesh), tail, head, flame, wheels, paint };
}

function blobShadow(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 6.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.6, depthWrite: false }));
  m.position.y = 0.045; m.renderOrder = 1; return m;
}
export interface CarLook { glow?: number; flame?: number }
/** The player's car: the chosen real 3D model when its file is loaded, otherwise the built-in luxury car. */
export function makeHeroCar(color: number, tier = 2, carId = 'hero', look: CarLook = {}): CarParts {
  const m = MODELS.byId[carId] ?? MODELS.hero;
  return m ? buildModelCar(m, color, look) : buildLuxuryCar(color, tier);
}
/** A rival's car: a lighter version of a model (fewer triangles, as there are five of them). */
export function makeRivalCar(color: number, modelId = 'rival'): CarParts {
  const m = MODELS.byId[modelId] ?? MODELS.rival ?? MODELS.hero;
  return m ? buildModelCar(m, color) : buildLuxuryCar(color, 1);
}

/** A plainer car for the traffic: shorter and taller than the hero car. */
function buildTrafficCar(color: number, kind: number) {
  const shape = kind === 1 ? SHAPES.hatch : SHAPES.saloon;
  const paint = std(color, { metalness: 0.4, roughness: 0.3, envMap: envMap(), envMapIntensity: 0.8 });
  const glass = std(0x172338, { metalness: 0.7, roughness: 0.12, envMap: envMap(), envMapIntensity: 1 });
  const { group } = carBody(shape, paint, glass, shape.wheelR);
  addWheels(group, shape, TYRE_M, RIM_M);
  const tail = std(0x330000, { emissive: 0xff2a2a, emissiveIntensity: 0.7 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.08), tail); bar.position.set(0, shape.deckRear - 0.18, shape.len - 0.1); group.add(bar);
  const head = std(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 0.6 });
  for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.1), head); h.position.set(sx * 0.62, shape.top - 0.2, -shape.len + 0.3); group.add(h); }
  return group;
}

function buildBus() {
  const g = new THREE.Group();
  const yellow = std(0xf2c200, { metalness: 0.3, roughness: 0.5 }); // a yellow city bus with a black stripe
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.3, 10.6), yellow); body.position.y = 1.6; g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.4, 10.62), std(0x111111)); stripe.position.y = 1.15; g.add(stripe);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.7, 9.6), GLASS_M); win.position.set(0, 2.15, -0.2); g.add(win);
  for (const sz of [-3.6, 3.6]) for (const sx of [-1.2, 1.2]) { const w = new THREE.Mesh(WHEEL_G, TYRE_M); w.scale.set(1.3, 1.3, 1.3); w.position.set(sx, 0.45, sz); g.add(w); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.05), std(0x330000, { emissive: 0xff2a2a, emissiveIntensity: 0.6 })); tail.position.set(0, 1.0, 5.32); g.add(tail);
  return g;
}

function buildTruck(color: number) {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), std(color, { metalness: 0.4 })); cab.position.set(0, 1.5, -3.4); g.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.8, 0.1), GLASS_M); glass.position.set(0, 2.0, -4.62); g.add(glass);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.7, 6.2), std(0xe9e6df, { roughness: 0.7 })); cargo.position.set(0, 1.75, 1.2); g.add(cargo);
  for (const sz of [-3.4, 0.4, 2.6]) for (const sx of [-1.15, 1.15]) { const w = new THREE.Mesh(WHEEL_G, TYRE_M); w.scale.set(1.2, 1.2, 1.2); w.position.set(sx, 0.43, sz); g.add(w); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.05), std(0x330000, { emissive: 0xff2a2a, emissiveIntensity: 0.6 })); tail.position.set(0, 0.9, 4.32); g.add(tail);
  return g;
}

function buildBike(colorA: number, colorB: number) {
  const g = new THREE.Group();
  const frame = std(colorA, { metalness: 0.5 });
  for (const wz of [-0.7, 0.7]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 12).rotateZ(Math.PI / 2), TYRE_M); w.position.set(0, 0.33, wz); g.add(w); }
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.9), frame); tank.position.set(0, 0.75, -0.1); g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.6), std(0x151515)); seat.position.set(0, 0.88, 0.5); g.add(seat);
  const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), std(colorB, { roughness: 0.8 })); rider.position.set(0, 1.35, 0.35); rider.rotation.x = -0.25; g.add(rider);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), std(0xf5f5f5, { metalness: 0.4 })); helmet.position.set(0, 1.85, 0.15); g.add(helmet);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), std(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 1 })); lamp.position.set(0, 0.95, -0.95); g.add(lamp);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), std(0x330000, { emissive: 0xff2a2a, emissiveIntensity: 0.8 })); tail.position.set(0, 0.8, 0.95); g.add(tail);
  return g;
}

function buildPed(shirt: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), std(shirt, { roughness: 0.8 })); body.position.y = 0.95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), std(0x7a4a2b, { roughness: 0.8 })); head.position.y = 1.62; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.2), std(0x1c2230)); legs.position.y = 0.3; g.add(legs);
  const sign = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0xffd400 })); sign.position.y = 2.35; sign.name = 'warn'; g.add(sign);
  return g;
}

// ---- the scene ----
export class ApexScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.6, 720);
  private hero!: CarParts;
  private others = new Map<number, CarParts>();
  private live = new Map<number, { obj: THREE.Object3D; ent: Entity }>();
  private dashes: THREE.Mesh[] = [];
  private sides: Array<{ g: THREE.Group; building: THREE.Mesh; crown: THREE.Mesh; trunk: THREE.Mesh; lamp: THREE.Group; slot: number }> = [];
  private ground!: THREE.Mesh;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sky!: THREE.Mesh;
  private stars!: THREE.Points;
  private towers!: THREE.InstancedMesh;
  private pads: Array<{ mat: THREE.MeshBasicMaterial; z: number }> = [];
  private theme: Theme;
  private trafficCache = new Map<string, THREE.Object3D>();
  private wheelSpin = 0;
  cameraMode: CameraMode = 'chase';
  private carId = 'hero';
  private look: CarLook = {};

  constructor(readonly world: World, car = 'luxury', tier = 2, color = 0xd9283c, look: CarLook = {}) {
    const info = trackInfo(world.track);
    this.theme = info ? { ...THEMES[info.theme], ground: info.ground } : themeFor(world.level);
    this.carId = car; this.look = look;
    this.buildPath();
    this.build(tier, color);
    this.applyTheme();
  }

  private build(tier: number, color: number) {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.0); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2); this.sun.position.set(-30, 60, 20); s.add(this.sun);

    // sky dome with a horizon glow
    const skyG = new THREE.SphereGeometry(300, 16, 12);
    const cols: number[] = []; const pos = skyG.attributes.position;
    for (let i = 0; i < pos.count; i++) { const h = Math.max(0, pos.getY(i) / 300); cols.push(h, h, h); }
    skyG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
    s.add(this.sky);
    { // stars for the evening and night
      const n = 260, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = hash(i * 3 + 1) * Math.PI * 2, e = Math.acos(0.15 + hash(i * 3 + 2) * 0.85); p[i * 3] = 280 * Math.sin(e) * Math.cos(a); p[i * 3 + 1] = 280 * Math.cos(e); p[i * 3 + 2] = 280 * Math.sin(e) * Math.sin(a); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })); s.add(this.stars);
    }
    { // the far-off city: dark towers with lit windows, kept around the car
      const n = 54, m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: towerTexture(), fog: false }), n), mat4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + hash(i) * 0.1, r = 330 + hash(i + 50) * 190, w = 26 + hash(i + 90) * 44, h = 60 + hash(i + 130) * 200; mat4.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r), q, new THREE.Vector3(w, h, w)); m.setMatrixAt(i, mat4); }
      m.frustumCulled = false; this.towers = m; s.add(m);
    }

    const grass = speckleTexture(225, 60); grass.repeat.set(140, 140);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), std(0x6f8f4e, { roughness: 1, metalness: 0, map: grass })); this.ground.position.y = -0.2; s.add(this.ground); // well below the road, so the two never fight over the same pixels
    this.road = this.ribbon(-ROAD_HALF - 0.3, ROAD_HALF + 0.3, 0, std(0x2a2d34, { roughness: 0.95, metalness: 0, map: speckleTexture(235, 40) }));
    const lineM = std(0xf2f2f2, { roughness: 0.6 });
    const kerbM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const rail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      this.ribbon(Math.min(sx * (ROAD_HALF - 0.3), sx * ROAD_HALF), Math.max(sx * (ROAD_HALF - 0.3), sx * ROAD_HALF), 0.02, lineM);
      this.ribbon(Math.min(sx * (ROAD_HALF + 0.3), sx * (ROAD_HALF + 1.1)), Math.max(sx * (ROAD_HALF + 0.3), sx * (ROAD_HALF + 1.1)), 0.03, kerbM, [0xd23a3a, 0xf2f2f2]);
      this.wall(sx * (ROAD_HALF + 1.4), 1.1, rail, [0xd23a3a, 0xf2f2f2]);
    }
    // dashes between lanes (recycled as the car moves)
    const dashM = std(0xeeeeee, { roughness: 0.6 });
    for (let i = 0; i < (LANES - 1) * 24; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 3.2), dashM); d.position.y = 0.02; this.scene.add(d); this.dashes.push(d); }

    // roadside: buildings, palms and lamps, 16 slots each side, recycled
    const lampPoleM = std(0x555a66, { metalness: 0.7 });
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 16; i++) {
        const g = new THREE.Group();
        const tex = windowTexture().clone(); tex.needsUpdate = true;
        const building = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: 0.9, metalness: 0, map: tex, emissive: 0x3a3f58, emissiveIntensity: 0.55 })); g.add(building);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 6, 6), std(0x7a5a3a, { roughness: 1 })); g.add(trunk);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 7), std(0x2e8b3d, { roughness: 1, metalness: 0 })); g.add(crown);
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), lampPoleM); pole.position.y = 3.5; lamp.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), lampPoleM); arm.position.set(-sx * 0.9, 7, 0); lamp.add(arm);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })); bulb.position.set(-sx * 1.7, 6.92, 0); bulb.name = 'bulb'; lamp.add(bulb);
        g.add(lamp);
        this.scene.add(g);
        this.sides.push({ g, building, crown, trunk, lamp, slot: -9999 });
        (g as any).userData.sx = sx;
      }
    }

    // start line and finish gate
    const mk = (z: number, name: string) => {
      const gate = new THREE.Group();
      const post = std(0x20242c, { metalness: 0.6 });
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), post); p.position.set(sx * (ROAD_HALF + 0.9), 4, 0); gate.add(p); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 2.4, 1.3, 0.4), std(0xffffff, { emissive: 0x222222 })); bar.position.set(0, 8, 0); gate.add(bar);
      const cells = 16;
      for (let i = 0; i < cells; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF * 2 + 2.4) / cells, 0.65, 0.42), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x111111 : 0xffffff }));
        c.position.set(-(ROAD_HALF + 1.2) + ((i + 0.5) * (ROAD_HALF * 2 + 2.4)) / cells, 8.32 - (i % 2) * 0.65, 0.01); gate.add(c);
      }
      for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) {
        const cc = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 / 12, 0.02, 0.9), new THREE.MeshBasicMaterial({ color: (i + r) % 2 ? 0x111111 : 0xffffff }));
        cc.position.set(-ROAD_HALF + ((i + 0.5) * ROAD_HALF * 2) / 12, 0.03, (r - 0.5) * 0.9); gate.add(cc);
      }
      this.put(gate, 0, z); gate.name = name; this.scene.add(gate);
    };
    mk(0, 'start'); if (!this.loop) mk(this.world.length, 'finish');

    // nitro pads (circuit): cyan chevrons that glow
    const padTex = chevronTexture(), glow = glowTexture();
    for (const p of this.world.pads) {
      const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 10).rotateX(-Math.PI / 2), mat); g.add(m);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(9, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glow, color: 0x3de0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45, fog: false })); gl.position.y = -0.01; g.add(gl);
      for (const yaw of [0, Math.PI / 2]) { // a faint column of light, so a pad can be seen from far down the road
        const beam = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 12), new THREE.MeshBasicMaterial({ map: glow, color: 0x3de0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9, fog: false, side: THREE.DoubleSide }));
        beam.position.y = 6; beam.rotation.y = yaw; g.add(beam);
      }
      this.put(g, p.x, p.z, 0, 0.06); this.scene.add(g); this.pads.push({ mat, z: p.z });
    }

    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 34).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.beam.position.y = 0.05; this.scene.add(this.beam);
    this.hero = makeHeroCar(color, tier, this.carId, this.look);
    this.scene.add(this.hero.group);
  }
  // ---- the road path: the bends are drawn by walking down the road in 2 m steps ----
  private S = 2;
  private z0 = -80;
  private px!: Float32Array; private pz!: Float32Array; private th!: Float32Array; private tx!: Float32Array; private tz!: Float32Array;
  private loop = false;
  private ribbons: THREE.Mesh[] = [];
  private buildPath() {
    this.loop = this.world.lapLength > 0;
    if (this.loop) { // a closed circuit: read the lap from its table; every lap is the same road
      const n = CIRCUIT.x.length;
      this.S = CIRCUIT.step; this.z0 = 0;
      this.px = Float32Array.from(CIRCUIT.x); this.pz = Float32Array.from(CIRCUIT.z); this.th = new Float32Array(n + 1);
      this.tx = new Float32Array(n); this.tz = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n, dx = CIRCUIT.x[b] - CIRCUIT.x[a], dz = CIRCUIT.z[b] - CIRCUIT.z[a], l = Math.hypot(dx, dz) || 1;
        this.tx[i] = dx / l; this.tz[i] = dz / l;
      }
      return;
    }
    const n = Math.ceil((this.world.length + 240 - this.z0) / this.S) + 2;
    this.px = new Float32Array(n); this.pz = new Float32Array(n); this.th = new Float32Array(n);
    let x = 0, zz = -this.z0, th = 0;
    for (let i = 0; i < n; i++) {
      this.px[i] = x; this.pz[i] = zz; this.th[i] = th;
      const next = th + curvatureAt(this.world, this.z0 + (i + 0.5) * this.S) * this.S, mid = (th + next) / 2;
      x += this.S * Math.sin(mid); zz -= this.S * Math.cos(mid); th = next;
    }
  }
  /** Road space (x across, z along) to a scene position; returns the road's heading there. */
  private at(x: number, z: number, out: THREE.Vector3, y = 0): number {
    if (this.loop) {
      const n = this.px.length, L = this.world.lapLength, zl = z - Math.floor(z / L) * L, f = zl / this.S, i = Math.floor(f) % n, u = f - Math.floor(f), j = (i + 1) % n;
      let dx = this.tx[i] + (this.tx[j] - this.tx[i]) * u, dz = this.tz[i] + (this.tz[j] - this.tz[i]) * u; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const th = Math.atan2(dx, -dz);
      out.set(this.px[i] + (this.px[j] - this.px[i]) * u + x * Math.cos(th), y, this.pz[i] + (this.pz[j] - this.pz[i]) * u + x * Math.sin(th));
      return th;
    }
    const f = Math.max(0, Math.min(this.th.length - 1.001, (z - this.z0) / this.S)), i = Math.floor(f), u = f - i;
    const th = this.th[i] + (this.th[i + 1] - this.th[i]) * u;
    out.set(this.px[i] + (this.px[i + 1] - this.px[i]) * u + x * Math.cos(th), y, this.pz[i] + (this.pz[i + 1] - this.pz[i]) * u + x * Math.sin(th));
    return th;
  }
  private put(o: THREE.Object3D, x: number, z: number, yaw = 0, y = 0): number { const th = this.at(x, z, o.position, y); o.rotation.y = -th + yaw; return th; }
  /** A strip of road surface between two distances from the middle, as one mesh (a quad every 2 m, so it can bend and be striped). */
  private strip(a: (i: number, out: THREE.Vector3) => void, b: (i: number, out: THREE.Vector3) => void, mat: THREE.Material, colors?: number[]): THREE.Mesh {
    const n = this.th.length - 1, uv = new Float32Array(n * 8), stripe = Math.max(1, Math.round(4 / this.S)), pos = new Float32Array(n * 12), idx = new Uint16Array(n * 6), col = colors ? new Float32Array(n * 12) : null, v = new THREE.Vector3(), c = new THREE.Color();
    const write = (o: number, p: THREE.Vector3) => { pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z; };
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      a(i, v); write(o, v); b(i, v); write(o + 3, v); a(i + 1, v); write(o + 6, v); b(i + 1, v); write(o + 9, v);
      const vv = (i * this.S) / 12, q0 = i * 8; uv[q0] = 0; uv[q0 + 1] = vv; uv[q0 + 2] = 1; uv[q0 + 3] = vv; uv[q0 + 4] = 0; uv[q0 + 5] = vv + this.S / 12; uv[q0 + 6] = 1; uv[q0 + 7] = vv + this.S / 12;
      const q = i * 4; idx.set([q, q + 1, q + 2, q + 1, q + 3, q + 2], i * 6);
      if (col && colors) { c.setHex(colors[Math.floor(i / stripe) % colors.length]); for (let k = 0; k < 4; k++) { col[o + k * 3] = c.r; col[o + k * 3 + 1] = c.g; col[o + k * 3 + 2] = c.b; } }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; this.scene.add(m); this.ribbons.push(m);
    return m;
  }
  private ribbon(x0: number, x1: number, y: number, mat: THREE.Material, colors?: number[]): THREE.Mesh {
    const at = (x: number) => (i: number, out: THREE.Vector3) => { this.at(x, this.z0 + i * this.S, out, y); };
    return this.strip(at(x0), at(x1), mat, colors);
  }
  private wall(x: number, h: number, mat: THREE.Material, colors?: number[]): THREE.Mesh {
    return this.strip((i, out) => { this.at(x, this.z0 + i * this.S, out, 0); }, (i, out) => { this.at(x, this.z0 + i * this.S, out, h); }, mat, colors);
  }
  /** Distance from a spot beside the road to the nearest part of the circuit that is not next to it along the lap. */
  private clearance(x: number, z: number): number {
    const p = new THREE.Vector3(); this.at(x, z, p);
    const n = CIRCUIT.x.length, here = Math.round((((z % CIRCUIT.length) + CIRCUIT.length) % CIRCUIT.length) / CIRCUIT.step);
    let best = 1e9;
    for (let i = 0; i < n; i++) { const d = Math.min(Math.abs(i - here), n - Math.abs(i - here)); if (d < 14) continue; best = Math.min(best, Math.hypot(CIRCUIT.x[i] - p.x, CIRCUIT.z[i] - p.z)); }
    return best;
  }
  private tmpA = new THREE.Vector3(); private tmpB = new THREE.Vector3();

  private road!: THREE.Mesh;
  private beam!: THREE.Mesh;

  private applyTheme() {
    const t = this.theme;
    this.scene.background = new THREE.Color(t.sky);
    this.scene.fog = new THREE.Fog(t.fog, 90, 320);
    this.hemi.color.setHex(t.ambient); this.hemi.groundColor.setHex(t.night ? 0x10131f : 0x556070); this.hemi.intensity = t.night ? 1.9 : 1.1;
    this.sun.color.setHex(t.sun); this.sun.intensity = t.sunPower;
    (this.ground.material as THREE.MeshStandardMaterial).color.setHex(t.ground);
    (this.road.material as THREE.MeshStandardMaterial).color.setHex(t.night ? 0x1b1d24 : 0x2d3038);
    // sky colours: horizon at the bottom of the dome, sky at the top
    const g = (this.sky.geometry as THREE.SphereGeometry).attributes.color as THREE.BufferAttribute;
    const top = new THREE.Color(t.sky), hor = new THREE.Color(t.horizon);
    const pos = (this.sky.geometry as THREE.SphereGeometry).attributes.position;
    for (let i = 0; i < g.count; i++) { const h = Math.min(1, Math.max(0, pos.getY(i) / 300)); const k = Math.pow(h, 0.6); g.setXYZ(i, hor.r + (top.r - hor.r) * k, hor.g + (top.g - hor.g) * k, hor.b + (top.b - hor.b) * k); }
    g.needsUpdate = true;
    this.hero.head.emissiveIntensity = t.night ? 2.2 : 0.9;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = t.night ? 0.75 : t.lamps ? 0.25 : 0;
    for (const s of this.sides) s.lamp.visible = t.lamps;
    this.stars.visible = t.lamps;
    (this.towers.material as THREE.MeshBasicMaterial).color.setHex(t.night ? 0xffffff : t.lamps ? 0xd6b8e0 : 0x8da6c8);
  }

  private vehicle(e: Entity): THREE.Object3D {
    const h = hash(e.id * 7 + this.world.seed);
    let o: THREE.Object3D;
    switch (e.kind) {
      case 'bus': o = buildBus(); break;
      case 'truck': o = buildTruck(PALETTE[Math.floor(h * PALETTE.length)]); break;
      case 'bike': o = buildBike(PALETTE[Math.floor(h * PALETTE.length)], PALETTE[Math.floor(hash(e.id * 13) * PALETTE.length)]); break;
      case 'ped': o = buildPed(PALETTE[Math.floor(h * PALETTE.length)]); break;
      default: o = buildTrafficCar(PALETTE[Math.floor(h * PALETTE.length)], h < 0.4 ? 1 : 0); break;
    }
    return o;
  }

  resize(w: number, h: number) { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }
  setCameraMode(mode: CameraMode) { this.cameraMode = mode; }

  update(f: Frame) {
    const { player } = f;
    // hero car
    const hero = this.hero;
    hero.group.visible = this.cameraMode !== 'cockpit'; // inside the car you do not see your own roof
    hero.group.rotation.order = 'YXZ';
    this.put(hero.group, player.x, player.z, -f.steer * 0.14);
    hero.group.rotation.z = -f.steer * 0.045 * Math.min(1, f.speed / 30);
    hero.group.rotation.x = f.braking ? -0.035 : f.nitroOn ? 0.03 : 0; // nose dips under braking, lifts on nitro
    hero.group.position.y = f.flash > 0 ? 0.06 * Math.sin(f.t * 60) : 0;
    this.wheelSpin += f.speed * 0.033 / 0.36;
    hero.wheels.forEach((w) => { w.rotation.x = -this.wheelSpin; });
    hero.tail.emissiveIntensity = f.braking ? 3 : 0.7;
    hero.flame.visible = f.nitroOn; if (f.nitroOn) hero.flame.scale.set(1, 1, 0.8 + 0.4 * Math.abs(Math.sin(f.t * 40)));
    hero.paint.emissive.setHex(f.flash > 0 ? 0x661111 : 0x000000);

    this.put(this.beam, player.x, player.z + 17, 0, 0.05);

    // other racers (solid cars)
    const seen = new Set<number>();
    for (const o of f.others) {
      seen.add(o.id);
      let c = this.others.get(o.id);
      if (!c) {
        c = makeRivalCar(o.color ?? PALETTE[o.id % PALETTE.length], o.model);
        this.scene.add(c.group); this.others.set(o.id, c);
      }
      const dz = o.z - player.z;
      c.group.visible = dz > -12 && dz < VIEW_AHEAD; // hidden only once it is behind the camera
      this.put(c.group, o.x, o.z);
    }
    for (const [id, c] of this.others) if (!seen.has(id)) { this.scene.remove(c.group); this.others.delete(id); }

    // traffic in view
    const es = this.world.entities;
    const lo = player.z - VIEW_BEHIND, hi = player.z + VIEW_AHEAD;
    const now = new Set<number>();
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.z > hi + (e.kind === 'ped' ? 0 : 30 * f.t + 400)) break; // beyond anything that could be in view
      const pi = e.kind === 'ped' ? this.world.peds.indexOf(e.id) : -1;
      const p = poseOf(e, f.t, pi >= 0 ? f.arrived[pi] : -1);
      if (p.z < lo || p.z > hi) continue;
      now.add(e.id);
      let entry = this.live.get(e.id);
      if (!entry) { entry = { obj: this.vehicle(e), ent: e }; this.live.set(e.id, entry); this.scene.add(entry.obj); }
      const o = entry.obj;
      const th = this.put(o, p.x, p.z);
      if (e.kind === 'ped') {
        const crossing = p.moving && pi >= 0 && f.arrived[pi] >= 0;
        o.rotation.y = -e.dir * Math.PI / 2 * (crossing ? 1 : 0.0) + (crossing ? 0 : e.dir * 0.5) - th;
        o.position.y = crossing ? 0.06 * Math.abs(Math.sin(f.t * 9 + e.id)) : 0;
        const warn = o.getObjectByName('warn'); if (warn) { warn.position.y = 2.35 + 0.12 * Math.sin(f.t * 6); warn.rotation.y = f.t * 3; warn.visible = !crossing || p.z - player.z > 0; }
      } else if (e.amp) {
        const q = poseOf(e, f.t + 0.1, -1); o.rotation.y = Math.atan2(-(q.x - p.x), 0.1 * e.speed) * 0.9 * -1 - th;
      }
    }
    for (const [id, entry] of this.live) if (!now.has(id)) { this.scene.remove(entry.obj); this.live.delete(id); }

    // lane dashes and road decoration follow the car
    const spacing = 8;
    const base = Math.floor(player.z / (spacing * 2)) * (spacing * 2) - 40;
    let k = 0;
    for (let lane = 1; lane < LANES; lane++) for (let i = 0; i < 24; i++) {
      const d = this.dashes[k++];
      this.put(d, -ROAD_HALF + lane * LANE_W, base + i * (spacing * 2), 0, 0.02);
    }
    const nSlots = this.loop ? Math.max(1, Math.round(this.world.lapLength / 36)) : 0, slotLen = this.loop ? this.world.lapLength / nSlots : 36;
    const first = Math.floor((player.z - 60) / slotLen);
    for (const s of this.sides) {
      const sx = (s.g as any).userData.sx as number;
      const idxInSide = this.sides.indexOf(s) % 16;
      const slot = first + idxInSide;
      if (s.slot !== slot) {
        s.slot = slot;
        const hs = this.loop ? ((slot % nSlots) + nSlots) % nSlots : slot; // on a circuit every lap has the same scenery
        const clear = this.loop ? this.clearance(sx * (ROAD_HALF + 14), hs * slotLen) : 999; // how far the nearest other piece of road is
        const h = hash(hs * 2 + (sx > 0 ? 1 : 0) + this.world.seed * 3);
        const isBuilding = h < 0.5;
        s.building.visible = isBuilding && clear > 48; s.trunk.visible = !isBuilding && clear > 30; s.crown.visible = s.trunk.visible;
        if (isBuilding) {
          const w = 7 + hash(hs * 5 + 1) * 8, ht = 5 + hash(hs * 5 + 2) * 22, d = 10 + hash(hs * 5 + 3) * 8;
          s.building.scale.set(w, ht, d); s.building.position.set(sx * (ROAD_HALF + 5 + w / 2), ht / 2, 0);
          const tone = 0.6 + hash(hs * 5 + 4) * 0.4;
          const bm = s.building.material as THREE.MeshStandardMaterial;
          bm.color.setRGB(tone, tone * 0.95, tone * 0.85);
          if (bm.map) { bm.map.repeat.set(Math.max(1, Math.round(d / 3.2)), Math.max(1, Math.round(ht / 3.2))); bm.map.needsUpdate = false; }
          bm.emissive.setHex(this.theme.night ? 0x8a6a30 : 0x4a5070);
        } else {
          const x = sx * (ROAD_HALF + 4 + hash(hs * 5 + 6) * 6);
          s.trunk.position.set(x, 3, 0); s.crown.position.set(x, 7, 0); s.crown.scale.setScalar(0.8 + hash(hs * 5 + 7) * 0.6);
        }
        s.lamp.position.set(sx * (ROAD_HALF + 1.4), 0, slotLen * 0.5);
      }
      this.put(s.g, 0, slot * slotLen);
    }

    // the sky and ground follow the car so they never run out; only the stretch of road near the car is drawn
    this.at(0, player.z, this.tmpA); this.sky.position.set(this.tmpA.x, 0, this.tmpA.z); this.ground.position.set(this.tmpA.x, -0.2, this.tmpA.z);
    const i0 = Math.max(0, Math.floor((player.z - 60 - this.z0) / this.S)), i1 = Math.min(this.th.length - 1, Math.ceil((player.z + VIEW_AHEAD + 60 - this.z0) / this.S));
    if (!this.loop) for (const m of this.ribbons) m.geometry.setDrawRange(i0 * 6, Math.max(0, i1 - i0) * 6);
    this.stars.position.set(this.tmpA.x, 0, this.tmpA.z); this.towers.position.set(this.tmpA.x, 0, this.tmpA.z);
    for (const p of this.pads) p.mat.opacity = 0.65 + 0.3 * Math.sin(f.t * 5 + p.z);

    // camera: behind and above, following the bend; wider and shakier when fast
    const cam = this.camera, sh = f.shake, look = this.tmpB;
    if (this.cameraMode === 'cockpit') {
      // A low forward-facing camera approximates the driver's eye line without changing race physics.
      cam.fov = 76 + (f.nitroOn ? 4 : 0);
      this.at(player.x * 0.96, player.z - 0.05, cam.position, 1.42);
      this.at(player.x * 0.96, player.z + 28, look, 1.3);
    } else {
      cam.fov = 60 + Math.min(18, f.speed * 0.22) + (f.nitroOn ? 8 : 0);
      this.at(player.x * 0.75, player.z - 10.5, cam.position, 4.6 + (sh ? Math.sin(f.t * 71) * sh * 0.2 : 0));
      if (sh) cam.position.x += Math.sin(f.t * 83) * sh * 0.25;
      this.at(player.x * 0.9, player.z + 16, look, 1.2);
    }
    cam.lookAt(look);
    cam.updateProjectionMatrix();
  }

  dispose() { this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); }
}
