import * as THREE from 'three';
import { Entity, Kind, LANES, LANE_W, ROAD_HALF, World, poseOf } from './sim';

/**
 * The 3D look of Apex Run: a luxury car on a road with traffic, motorbikes, buses and people crossing.
 * Everything is built from code (no image files), and nothing here changes the rules: the rules live in sim.ts.
 * Three.js axes: the road runs along -z (forward), x is sideways (right is +x), y is up. A rule-world position (x, z)
 * is drawn at (x, 0, -z).
 */

export interface View { x: number; z: number; id: number; color?: number }
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
function glowTexture(): THREE.DataTexture {
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x - n / 2 + 0.5) / (n / 2), dy = (y - n / 2 + 0.5) / (n / 2), d = Math.min(1, Math.sqrt(dx * dx + dy * dy)), a = Math.pow(1 - d, 2);
    const i = (y * n + x) * 4; data[i] = 255; data[i + 1] = 244; data[i + 2] = 200; data[i + 3] = Math.round(a * 255);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); tex.needsUpdate = true; return tex;
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

/** The hero car: a low, wide luxury saloon. `tier` adds more: 0 starter, 1 sport (spoiler), 2 luxury (long, chrome), 3 flagship. */
export function buildLuxuryCar(color: number, tier = 2): CarParts {
  const group = new THREE.Group();
  const paint = std(color, { metalness: 0.35, roughness: 0.28, emissive: 0x000000 });
  const W = 1.95;
  const bodyPts: Array<[number, number]> = [[-2.4, 0.32], [2.4, 0.32], [2.5, 0.58], [2.15, 0.86], [0.95, 0.94], [-1.55, 0.97], [-2.38, 0.9], [-2.5, 0.62]];
  const body = new THREE.Mesh(bodyFromOutline(bodyPts, W), paint);
  group.add(body);
  const cabin = new THREE.Mesh(bodyFromOutline([[-1.5, 0.95], [-0.95, 1.36], [0.35, 1.4], [1.05, 0.97]], W - 0.34, 0.07), GLASS_M);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.05, 1.25), paint);
  roof.position.set(0, 1.44, 0.28); group.add(roof);
  // sill and chrome trim
  const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.05, 4.9), std(0xdfe3ea, { metalness: 0.95, roughness: 0.2 }));
  trim.position.set(0, 0.5, 0); group.add(trim);
  // wheels
  const wheels: THREE.Mesh[] = [];
  for (const [wx, wz] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.55], [0.95, 1.55]] as const) {
    const w = new THREE.Mesh(WHEEL_G, TYRE_M); w.position.set(wx, 0.36, wz);
    const rim = new THREE.Mesh(RIM_G, RIM_M); w.add(rim);
    group.add(w); wheels.push(w);
  }
  // lights: front is -z
  const head = std(0xffffff, { emissive: 0xfff3c4, emissiveIntensity: 0.9, metalness: 0.1, roughness: 0.2 });
  const tail = std(0x330000, { emissive: 0xff1a1a, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.3 });
  for (const sx of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), head); h.position.set(sx, 0.7, -2.52); group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06), tail); t.position.set(sx, 0.78, 2.5); group.add(t);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.05), std(0x15171c, { metalness: 0.8 })); grille.position.set(0, 0.55, -2.52); group.add(grille);
  if (tier >= 1) { const sp = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.06, 0.34), std(0x14161b, { metalness: 0.6 })); sp.position.set(0, 1.12, 2.15); group.add(sp); }
  if (tier >= 3) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 4.2), std(0xf3f4f7, { metalness: 0.6 })); stripe.position.set(0, 0.99, 0.1); group.add(stripe); }
  // nitro flame
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 }));
  flame.position.set(0, 0.5, 3.6); flame.visible = false; group.add(flame);
  return { group, body, tail, head, flame, wheels, paint };
}

/** A plainer car for the traffic: shorter and boxier than the hero car. */
function buildTrafficCar(color: number, kind: number) {
  const group = new THREE.Group();
  const paint = std(color, { metalness: 0.25, roughness: 0.45 });
  const hatch = kind === 1;
  const body = new THREE.Mesh(bodyFromOutline(hatch
    ? [[-2.1, 0.3], [2.1, 0.3], [2.2, 0.6], [1.9, 0.82], [0.9, 0.9], [-2.1, 0.95], [-2.2, 0.6]]
    : [[-2.2, 0.3], [2.2, 0.3], [2.3, 0.6], [2.0, 0.84], [0.9, 0.92], [-2.0, 0.94], [-2.3, 0.62]], 1.8, 0.1), paint);
  group.add(body);
  const cabin = new THREE.Mesh(bodyFromOutline(hatch ? [[-2.0, 0.92], [-1.8, 1.45], [0.5, 1.5], [1.0, 0.94]] : [[-1.4, 0.92], [-0.95, 1.42], [0.3, 1.44], [0.95, 0.94]], 1.55, 0.06), GLASS_M);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, hatch ? 2.0 : 1.1), paint); roof.position.set(0, 1.48, hatch ? 0.75 : 0.25); group.add(roof);
  for (const [wx, wz] of [[-0.88, -1.35], [0.88, -1.35], [-0.88, 1.4], [0.88, 1.4]] as const) { const w = new THREE.Mesh(WHEEL_G, TYRE_M); w.position.set(wx, 0.34, wz); group.add(w); }
  const tail = std(0x330000, { emissive: 0xff2a2a, emissiveIntensity: 0.6 });
  for (const sx of [-0.6, 0.6]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.05), tail); t.position.set(sx, 0.75, 2.27); group.add(t); }
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
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.3, 320);
  private hero!: CarParts;
  private others = new Map<number, CarParts>();
  private live = new Map<number, { obj: THREE.Object3D; ent: Entity }>();
  private dashes: THREE.Mesh[] = [];
  private sides: Array<{ g: THREE.Group; building: THREE.Mesh; crown: THREE.Mesh; trunk: THREE.Mesh; lamp: THREE.Group; slot: number }> = [];
  private ground!: THREE.Mesh;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sky!: THREE.Mesh;
  private theme: Theme;
  private trafficCache = new Map<string, THREE.Object3D>();
  private wheelSpin = 0;

  constructor(readonly world: World, car = 'luxury', tier = 2, color = 0xd9283c) {
    this.theme = themeFor(world.level);
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

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 700).rotateX(-Math.PI / 2), std(0x6f8f4e, { roughness: 1, metalness: 0 })); this.ground.position.y = -0.02; s.add(this.ground);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.6, 700).rotateX(-Math.PI / 2), std(0x2a2d34, { roughness: 0.95, metalness: 0 })); road.position.y = 0; road.name = 'road'; s.add(road);
    this.road = road;
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 700), std(0xf2f2f2, { roughness: 0.6 })); edge.position.set(sx * (ROAD_HALF - 0.1), 0.02, 0); edge.name = 'edge'; s.add(edge); this.edges.push(edge);
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 700), std(0x9aa0a8)); kerb.position.set(sx * (ROAD_HALF + 0.55), 0.07, 0); s.add(kerb); this.edges.push(kerb);
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
        const building = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: 0.9, metalness: 0, map: tex, emissiveMap: tex, emissive: 0x000000 })); g.add(building);
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
      gate.position.set(0, 0, -z); gate.name = name; this.scene.add(gate);
    };
    mk(0, 'start'); mk(this.world.length, 'finish');

    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 34).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.beam.position.y = 0.05; this.scene.add(this.beam);
    this.hero = buildLuxuryCar(color, tier);
    this.scene.add(this.hero.group);
  }
  private road!: THREE.Mesh;
  private beam!: THREE.Mesh;
  private edges: THREE.Mesh[] = [];

  private applyTheme() {
    const t = this.theme;
    this.scene.background = new THREE.Color(t.sky);
    this.scene.fog = new THREE.Fog(t.fog, 70, 250);
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

  update(f: Frame) {
    const { player } = f;
    const pz = -player.z;
    // hero car
    const hero = this.hero;
    hero.group.position.set(player.x, 0, pz);
    hero.group.rotation.y = -f.steer * 0.1;
    hero.group.rotation.z = -f.steer * 0.05;
    hero.group.position.y = f.flash > 0 ? 0.06 * Math.sin(f.t * 60) : 0;
    this.wheelSpin += f.speed * 0.033 / 0.36;
    hero.wheels.forEach((w) => { w.rotation.x = this.wheelSpin; });
    hero.tail.emissiveIntensity = f.braking ? 3 : 0.7;
    hero.flame.visible = f.nitroOn; if (f.nitroOn) hero.flame.scale.set(1, 1, 0.8 + 0.4 * Math.abs(Math.sin(f.t * 40)));
    hero.paint.emissive.setHex(f.flash > 0 ? 0x661111 : 0x000000);

    this.beam.position.set(player.x, 0.05, pz - 17);

    // other racers (see-through, so they never block the view)
    const seen = new Set<number>();
    for (const o of f.others) {
      seen.add(o.id);
      let c = this.others.get(o.id);
      if (!c) {
        c = buildLuxuryCar(o.color ?? PALETTE[o.id % PALETTE.length], 1);
        c.group.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.material) { const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; mats.forEach((mm) => { const x = mm.clone(); x.transparent = true; x.opacity = 0.55; x.depthWrite = false; mesh.material = x; }); } });
        this.scene.add(c.group); this.others.set(o.id, c);
      }
      const dz = o.z - player.z;
      c.group.visible = dz > -4 && dz < VIEW_AHEAD; // never between the camera and your own car
      c.group.position.set(o.x, 0, -o.z);
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
      o.position.set(p.x, 0, -p.z);
      if (e.kind === 'ped') {
        const crossing = p.moving && pi >= 0 && f.arrived[pi] >= 0;
        o.rotation.y = -e.dir * Math.PI / 2 * (crossing ? 1 : 0.0) + (crossing ? 0 : e.dir * 0.5);
        o.position.y = crossing ? 0.06 * Math.abs(Math.sin(f.t * 9 + e.id)) : 0;
        const warn = o.getObjectByName('warn'); if (warn) { warn.position.y = 2.35 + 0.12 * Math.sin(f.t * 6); warn.rotation.y = f.t * 3; warn.visible = !crossing || p.z - player.z > 0; }
      } else if (e.amp) {
        const q = poseOf(e, f.t + 0.1, -1); o.rotation.y = Math.atan2(-(q.x - p.x), 0.1 * e.speed) * 0.9 * -1;
      }
    }
    for (const [id, entry] of this.live) if (!now.has(id)) { this.scene.remove(entry.obj); this.live.delete(id); }

    // lane dashes and road decoration follow the car
    const spacing = 8;
    const base = Math.floor(player.z / (spacing * 2)) * (spacing * 2) - 40;
    let k = 0;
    for (let lane = 1; lane < LANES; lane++) for (let i = 0; i < 24; i++) {
      const d = this.dashes[k++];
      d.position.set(-ROAD_HALF + lane * LANE_W, 0.02, -(base + i * (spacing * 2)));
    }
    const slotLen = 36;
    const first = Math.floor((player.z - 60) / slotLen);
    for (const s of this.sides) {
      const sx = (s.g as any).userData.sx as number;
      const idxInSide = this.sides.indexOf(s) % 16;
      const slot = first + idxInSide;
      if (s.slot !== slot) {
        s.slot = slot;
        const h = hash(slot * 2 + (sx > 0 ? 1 : 0) + this.world.seed * 3);
        const isBuilding = h < 0.5;
        s.building.visible = isBuilding; s.trunk.visible = !isBuilding; s.crown.visible = !isBuilding;
        if (isBuilding) {
          const w = 7 + hash(slot * 5 + 1) * 8, ht = 5 + hash(slot * 5 + 2) * 22, d = 10 + hash(slot * 5 + 3) * 8;
          s.building.scale.set(w, ht, d); s.building.position.set(sx * (ROAD_HALF + 5 + w / 2), ht / 2, 0);
          const tone = 0.6 + hash(slot * 5 + 4) * 0.4;
          const bm = s.building.material as THREE.MeshStandardMaterial;
          bm.color.setRGB(tone, tone * 0.95, tone * 0.85);
          if (bm.map) { bm.map.repeat.set(Math.max(1, Math.round(d / 3.2)), Math.max(1, Math.round(ht / 3.2))); bm.map.needsUpdate = false; }
          bm.emissive.setHex(this.theme.night ? 0x8a6a30 : 0x000000);
        } else {
          const x = sx * (ROAD_HALF + 4 + hash(slot * 5 + 6) * 6);
          s.trunk.position.set(x, 3, 0); s.crown.position.set(x, 7, 0); s.crown.scale.setScalar(0.8 + hash(slot * 5 + 7) * 0.6);
        }
        s.lamp.position.set(sx * (ROAD_HALF + 1.4), 0, slotLen * 0.5);
      }
      s.g.position.set(0, 0, -(slot * slotLen));
    }

    // the sky and ground follow the car so they never run out
    this.sky.position.set(0, 0, pz); this.ground.position.z = pz;
    this.road.position.z = pz - 100; for (const e of this.edges) e.position.z = pz - 100;

    // camera: behind and above, wider and shakier when fast
    const cam = this.camera;
    const sh = f.shake;
    cam.fov = 60 + Math.min(18, f.speed * 0.22) + (f.nitroOn ? 8 : 0); cam.updateProjectionMatrix();
    cam.position.set(player.x * 0.75 + (sh ? Math.sin(f.t * 83) * sh * 0.25 : 0), 4.6 + (sh ? Math.sin(f.t * 71) * sh * 0.2 : 0), pz + 10.5);
    cam.lookAt(player.x * 0.9, 1.2, pz - 16);
  }

  dispose() { this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); }
}
