import * as THREE from 'three';
import { buildBus, buildTrafficCar, speckleTexture, THEMES, towerTexture, windowTexture } from './scene';

export interface Collider { x: number; z: number; halfW: number; halfD: number }

const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });
const repeatTex = (t: THREE.DataTexture, rx: number, ry: number) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.needsUpdate = true; return c; };

/**
 * The Lagos district, dressed like the race scenes: a golden-hour sky, speckled asphalt with lane lines,
 * lit windows, lamp posts, palms and a far skyline. It uses the race's own textures and traffic models.
 * The street layout and building footprints are unchanged, so driving and collisions behave as before.
 */
export function buildLagosWorld(scene: THREE.Scene, opts: { road: number; quality: number }) {
  const { road: ROAD, quality } = opts;
  const t = THEMES[1]; // the sunset look
  scene.background = new THREE.Color(t.horizon);
  scene.fog = new THREE.Fog(t.fog, 90, [210, 270, 320][Math.max(0, Math.min(2, quality))]);
  const hemi = new THREE.HemisphereLight(t.ambient, 0x556070, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(t.sun, t.sunPower); sun.position.set(-35, 70, 20); scene.add(sun);

  // sky dome: horizon glow at the bottom, sky at the top
  const skyG = new THREE.SphereGeometry(300, 16, 12); const cols: number[] = []; const sp = skyG.attributes.position;
  const top = new THREE.Color(t.sky), hor = new THREE.Color(t.horizon);
  for (let i = 0; i < sp.count; i++) { const h = Math.min(1, Math.max(0, sp.getY(i) / 300)); const k = Math.pow(h, 0.6); cols.push(hor.r + (top.r - hor.r) * k, hor.g + (top.g - hor.g) * k, hor.b + (top.b - hor.b) * k); }
  skyG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false })); scene.add(sky);
  if (quality > 0) { // a few stars high up, as the light fades
    const n = 160, p = new Float32Array(n * 3); let s = 99; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, e = Math.acos(0.25 + r() * 0.75); p[i * 3] = 280 * Math.sin(e) * Math.cos(a); p[i * 3 + 1] = 280 * Math.cos(e); p[i * 3 + 2] = 280 * Math.sin(e) * Math.sin(a); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  }

  // ground
  const gTex = repeatTex(speckleTexture(215, 60), 160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), std(0x7b8a50, { map: gTex, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; scene.add(ground);

  // roads: speckled asphalt, white edge lines, dashed yellow centre lines
  const aTex = repeatTex(speckleTexture(200, 50), 30, 30);
  const asphalt = std(0x555a66, { map: aTex, roughness: 0.95 });
  const slab = (x: number, z: number, w: number, d: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), asphalt); m.position.set(x, 0, z); m.receiveShadow = true; scene.add(m); };
  const XS = [-84, -42, 0, 42, 84], ZS = [-168, -105, -42];
  for (const x of XS) slab(x, -105, ROAD, 300);
  for (const z of ZS) slab(0, z, 300, ROAD);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4e5a0 }), edgeMat = new THREE.MeshBasicMaterial({ color: 0xe9edf2 });
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.03, 4), lineMat, 5 * 40); const dash2 = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.03, 0.2), lineMat, 3 * 40);
  const d = new THREE.Object3D(); let a = 0, b = 0;
  for (const x of XS) for (let z = -250; z < 45; z += 9) { d.position.set(x, 0.08, z); d.updateMatrix(); dash.setMatrixAt(a++, d.matrix); }
  for (const z of ZS) for (let x = -145; x < 150; x += 9) { d.position.set(x, 0.08, z); d.updateMatrix(); dash2.setMatrixAt(b++, d.matrix); }
  dash.count = a; dash2.count = b; scene.add(dash, dash2);
  for (const x of XS) for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 300), edgeMat); e.position.set(x + sx * (ROAD / 2 - 0.7), 0.08, -105); scene.add(e); }
  // kerbs and pavements
  const pave = std(0xc2b8a2, { map: repeatTex(speckleTexture(225, 30), 4, 60) });
  for (const x of [-8, 8, 34, 50, 76, 92, -34, -50, -76, -92]) { const s = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 310), pave); s.position.set(x, 0.08, -105); scene.add(s); }

  // buildings with lit windows (same footprints as before)
  const facade = [0xc56b45, 0xd6b26c, 0x879c9e, 0xc4c7b9, 0x9c705a, 0xe0a15a, 0x788c76];
  const colliders: Collider[] = [];
  const baseWin = windowTexture();
  const tanks = std(0x25333a);
  const addBuilding = (x: number, z: number, w: number, h: number, dep: number, color: number, i: number) => {
    const tex = repeatTex(baseWin, Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), std(color, { map: tex, roughness: 0.9, emissive: 0x7a5a38, emissiveIntensity: 0.28 })); m.position.set(x, h / 2, z); scene.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, dep + 0.6), std(0x3a3f4a)); roof.position.set(x, h + 0.25, z); scene.add(roof);
    if (i % 3 === 0) { const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10), tanks); tk.position.set(x, h + 1.6, z); scene.add(tk); }
  };
  let n = 0;
  for (let z = -235; z < 30; z += 25) for (const side of [-1, 1]) for (const lane of [0, 1]) {
    if ([-168, -105, -42].some((roadZ) => Math.abs(z - roadZ) < 13)) continue;
    const x = side * (20 + lane * 42 + ((n % 3) - 1) * 2); const bz = z + (n % 2) * 5; const h = 8 + ((n * 7) % 19); const bw = 12 + (n % 4) * 2;
    addBuilding(x, bz, bw, h, 15, facade[n % facade.length], n); colliders.push({ x, z: bz, halfW: bw / 2, halfD: 7.5 }); n++;
  }
  // workshop landmark with a lit sign
  colliders.push({ x: -18, z: -44, halfW: 6.5, halfD: 8.5 });
  addBuilding(-18, -44, 13, 6.6, 17, 0xe1b26a, 1);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd17d })); sign.position.set(-18, 5.4, -35.3); scene.add(sign);
  const door = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3, 0.3), std(0x3d4b5d)); door.position.set(-18, 1.5, -35.2); scene.add(door);
  // the bridge
  const concrete = std(0x8a949c, { map: repeatTex(speckleTexture(215, 40), 6, 1) });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 1.4, 5), concrete); deck.position.set(0, 10, -100); scene.add(deck);
  for (const px of [-32, 32]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 3), concrete); pl.position.set(px, 5, -100); scene.add(pl); }

  // lamp posts and palms along the long roads
  const lampCount = XS.length * 2 * 10;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.13, 7, 6), std(0x555a66, { metalness: 0.7 }), lampCount);
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.14, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), lampCount);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 6, 6), std(0x7a5a3a, { roughness: 1 }), lampCount);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 2.6, 7), std(0x2e8b3d, { roughness: 1 }), lampCount);
  let li = 0, ti = 0;
  for (const x of XS) for (const sx of [-1, 1]) for (let k = 0; k < 10; k++) {
    const z = -240 + k * 27;
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    d.position.set(x + sx * (ROAD / 2 + 1.2), 3.5, z); d.updateMatrix(); poles.setMatrixAt(li, d.matrix);
    d.position.set(x + sx * (ROAD / 2 - 0.2), 7, z); d.updateMatrix(); bulbs.setMatrixAt(li, d.matrix); li++;
    const pz = z + 13;
    d.position.set(x + sx * (ROAD / 2 + 2.4), 3, pz); d.updateMatrix(); trunks.setMatrixAt(ti, d.matrix);
    d.position.set(x + sx * (ROAD / 2 + 2.4), 6.9, pz); d.updateMatrix(); crowns.setMatrixAt(ti, d.matrix); ti++;
  }
  poles.count = bulbs.count = li; trunks.count = crowns.count = ti; scene.add(poles, bulbs, trunks, crowns);

  // far skyline
  if (quality > 0) {
    const tw = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: towerTexture(), color: 0xd6b8e0, fog: false }), 40);
    for (let i = 0; i < 40; i++) { const ang = (i / 40) * Math.PI * 2, r = 235 + (i % 3) * 14, h = 40 + ((i * 37) % 60); d.position.set(Math.cos(ang) * r, h / 2 - 2, -110 + Math.sin(ang) * r); d.scale.set(16 + (i % 4) * 4, h, 16 + (i % 3) * 5); d.updateMatrix(); tw.setMatrixAt(i, d.matrix); }
    scene.add(tw); d.scale.set(1, 1, 1);
  }

  /** Traffic cars use the race's own models. Their nose points along -z, like the player's car. */
  const makeTraffic = (color: number, kind: number) => (kind === 2 ? buildBus() : buildTrafficCar(color, kind));
  return { colliders, sky, makeTraffic, hemi, sun };
}
