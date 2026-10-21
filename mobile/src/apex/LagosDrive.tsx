import * as THREE from 'three';
import { makeRenderer } from './glfix';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarStyle, LAMPS } from './style';
import { loadCarModel } from './model';
import './cars'; // Register the same GLB catalogue used by the garage and race renderer.

export type LagosDriveResult = { checkpoints: number; coins: number; distance: number };
type Controls = { left: boolean; right: boolean; gas: boolean; brake: boolean; nitro: boolean };
const ROAD = 14;
const CHECKPOINTS = [
  { x: 0, z: -44, label: 'TOMI’S WORKSHOP' },
  { x: 34, z: -100, label: 'UNDER THE BRIDGE' },
  { x: -26, z: -160, label: 'LAGOS LOOKOUT' },
];

function addBox(scene: THREE.Scene, x: number, y: number, z: number, w: number, h: number, d: number, color: number, material?: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.86 }));
  mesh.position.set(x, y, z); scene.add(mesh); return mesh;
}

/** First playable, code-built Lagos district slice. It is a prototype environment, not a finished open world. */
export function LagosDrive({ carId, paint = 0x2788ff, style, rewardClaimed = false, quality = 2, autoGas = true, onExit, onWorkshop, onComplete }: {
  carId: string; paint?: number; style?: CarStyle; rewardClaimed?: boolean; quality?: number; autoGas?: boolean; onExit: () => void; onWorkshop: () => void; onComplete: (result: LagosDriveResult) => void;
}) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const carModelLoadRef = useRef(0);
  const insets = useSafeAreaInsets();
  const controls = useRef<Controls>({ left: false, right: false, gas: autoGas, brake: false, nitro: false });
  const motion = useRef({ x: 0, z: 0, heading: 0, speed: 0, distance: 0, checkpoints: 0 });
  const alive = useRef(true);
  const glRef = useRef<any>(null);
  const resizeRef = useRef<((w: number, h: number) => void) | null>(null);
  const [hud, setHud] = useState({ speed: 0, checkpoints: 0, banner: 'DRIVE TO THE GLOWING WAYPOINTS', nearWorkshop: false, collision: false });
  const finished = hud.checkpoints >= CHECKPOINTS.length;
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    alive.current = true;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientWidth: w, clientHeight: h, getContext: () => gl };
    const renderer = makeRenderer(gl, canvas, { antialias: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.setClearColor(0x121b32, 1);
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8bb5d7); const qf = [0.6, 0.8, 1][Math.max(0, Math.min(2, Math.round(quality)))]; scene.fog = new THREE.Fog(0x8bb5d7, 115 * qf, 310 * qf);
    const camera = new THREE.PerspectiveCamera(62, w / Math.max(1, h), 0.1, 500 * qf); glRef.current = gl; resizeRef.current = (nw, nh) => { if (nw < 1 || nh < 1) return; renderer.setSize(nw, nh, false); camera.aspect = nw / nh; camera.updateProjectionMatrix(); };
    scene.add(new THREE.HemisphereLight(0xdceeff, 0x48513d, 2.0));
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.2); sun.position.set(-35, 70, 20); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ color: 0x68784d, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; scene.add(ground);
    // A compact connected street grid: long boulevard, side streets and visible lane markings.
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x303641, roughness: 0.96 });
    const road = (x: number, z: number, w: number, d: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), asphalt); m.position.set(x, 0, z); scene.add(m); };
    road(0, -105, ROAD, 300); road(0, -105, 300, ROAD); road(42, -105, ROAD, 300); road(-42, -105, ROAD, 300); road(0, -42, 300, ROAD); road(0, -168, 300, ROAD); road(84, -105, ROAD, 300); road(-84, -105, ROAD, 300);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4e5a0 });
    const verticalLineGeo = new THREE.BoxGeometry(0.18, 0.03, 4);
    const verticalLineCount = 5 * Array.from({ length: 33 }, (_, i) => -250 + i * 9).length;
    const verticalLines = new THREE.InstancedMesh(verticalLineGeo, lineMat, verticalLineCount);
    const lineDummy = new THREE.Object3D(); let lineIndex = 0;
    for (const x of [0, 42, -42, 84, -84]) for (let z = -250; z < 45; z += 9) { lineDummy.position.set(x, 0.08, z); lineDummy.updateMatrix(); verticalLines.setMatrixAt(lineIndex++, lineDummy.matrix); }
    verticalLines.count = lineIndex; scene.add(verticalLines);
    const horizontalLineGeo = new THREE.BoxGeometry(4, 0.03, 0.18);
    const horizontalLines = new THREE.InstancedMesh(horizontalLineGeo, lineMat, 3 * 33); lineIndex = 0;
    for (const z of [-42, -105, -168]) for (let x = -145; x < 150; x += 9) { lineDummy.position.set(x, 0.08, z); lineDummy.updateMatrix(); horizontalLines.setMatrixAt(lineIndex++, lineDummy.matrix); }
    horizontalLines.count = lineIndex; scene.add(horizontalLines);
    const sidewalk = new THREE.MeshStandardMaterial({ color: 0xb7ad95 });
    for (const x of [-8, 8, 34, 50, 76, 92, -34, -50, -76, -92]) { const s = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 310), sidewalk); s.position.set(x, 0.08, -105); scene.add(s); }
    // Distinctive low-rise Lagos blocks with colorful facades and rooftop water tanks.
    const facade = [0xc56b45, 0xd6b26c, 0x879c9e, 0xc4c7b9, 0x9c705a, 0xe0a15a, 0x788c76];
    const buildingColliders: Array<{ x: number; z: number; halfW: number; halfD: number }> = [];
    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x263b4c, emissive: 0x172a3d, roughness: 0.4 });
    const windowGeometry = new THREE.BoxGeometry(1.1, 1.2, 0.08);
    const windowPositions: THREE.Vector3[] = [];
    let n = 0;
    for (let z = -235; z < 30; z += 25) for (const side of [-1, 1]) for (const lane of [0, 1]) {
      // Keep the blocks out of the cross-streets so the boulevard grid remains driveable.
      if ([-168, -105, -42].some((roadZ) => Math.abs(z - roadZ) < 13)) continue;
      const x = side * (20 + lane * 42 + ((n % 3) - 1) * 2); const buildingZ = z + (n % 2) * 5; const hgt = 8 + ((n * 7) % 19); const bw = 12 + (n % 4) * 2;
      addBox(scene, x, hgt / 2, buildingZ, bw, hgt, 15, facade[n % facade.length]);
      buildingColliders.push({ x, z: buildingZ, halfW: bw / 2, halfD: 7.5 });
      for (let fy = 2; fy < hgt - 1; fy += 3) for (let fx = -bw / 2 + 2; fx < bw / 2 - 1; fx += 3) windowPositions.push(new THREE.Vector3(x + fx, fy, buildingZ + 7.58));
      if (n % 3 === 0) { addBox(scene, x, hgt + 1.3, buildingZ, 3.2, 2.2, 3.2, 0x25333a); }
      n++;
    }
    // Batch repeated windows into one instanced draw call for mobile performance.
    const windowInstances = new THREE.InstancedMesh(windowGeometry, windowMaterial, windowPositions.length);
    const windowDummy = new THREE.Object3D();
    windowPositions.forEach((position, index) => { windowDummy.position.copy(position); windowDummy.updateMatrix(); windowInstances.setMatrixAt(index, windowDummy.matrix); });
    windowInstances.instanceMatrix.needsUpdate = true; scene.add(windowInstances);
    // Workshop landmark.
    buildingColliders.push({ x: -18, z: -44, halfW: 6.5, halfD: 8.5 });
    addBox(scene, -18, 3.3, -44, 13, 6.6, 17, 0xe1b26a);
    addBox(scene, -18, 5.2, -35.2, 8, 1.4, 0.2, 0x1d293b);
    addBox(scene, -18, 1.5, -35.15, 5.2, 3, 0.25, 0x3d4b5d);
    // Bridge landmark spanning the road.
    addBox(scene, 0, 10, -100, 70, 1.4, 5, 0x7a858e); addBox(scene, -32, 5, -100, 2, 10, 3, 0x6e777f); addBox(scene, 32, 5, -100, 2, 10, 3, 0x6e777f);
    const car = new THREE.Group();
    const fallback = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.62, 4.2), new THREE.MeshStandardMaterial({ color: paint, metalness: 0.48, roughness: 0.27 })); body.position.y = 0.78; fallback.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.65, 1.9), new THREE.MeshStandardMaterial({ color: 0x152a3d, metalness: 0.35, roughness: 0.25 })); cabin.position.set(0, 1.36, -0.25); fallback.add(cabin);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: style?.rimDesign ? style.rim : 0x7d8794, metalness: 0.8, roughness: 0.25 });
    for (const x of [-1.05, 1.05]) for (const z of [-1.35, 1.35]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12), tireMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.42, z); fallback.add(wheel); const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.255, 12), rimMat); rim.rotation.z = Math.PI / 2; rim.position.set(x * 1.015, 0.42, z); fallback.add(rim); }
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c2 });
    for (const x of [-0.72, 0.72]) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.08), lampMat); lamp.position.set(x, 0.85, -2.12); fallback.add(lamp); }
    const nitroFlame = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x4ce9ff, transparent: true, opacity: 0.92 });
    for (const fx of [-0.48, 0.48]) { const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.15, 7), flameMat); flame.rotation.x = Math.PI / 2; flame.position.set(fx, 0.62, 2.45); nitroFlame.add(flame); }
    nitroFlame.visible = false; car.add(nitroFlame);
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 3.5), new THREE.MeshBasicMaterial({ color: style?.glow ?? 0, transparent: true, opacity: 0.38, side: THREE.DoubleSide }));
    underglow.rotation.x = -Math.PI / 2; underglow.position.y = 0.12; underglow.visible = Boolean(style?.glow); car.add(underglow);
    car.add(fallback); car.position.set(0, 0, 5); scene.add(car);
    // Replace the placeholder with the player's actual garage car when its GLB is available.
    // The placeholder stays visible if loading fails, so free drive can still start immediately.
    const loadToken = ++carModelLoadRef.current;
    void (quality === 0 ? loadCarModel(`${carId}_lo`).then((m) => m ?? loadCarModel(carId)) : loadCarModel(carId)).then((model) => {
      if (!model || !alive.current || loadToken !== carModelLoadRef.current || !car.parent) return;
      const imported = new THREE.Group();
      const materialCache = new Map<any, THREE.Material>();
      for (const [name, part] of Object.entries(model.parts)) {
        const mats: THREE.Material[] = model.modern ? part.materials.map((desc) => {
          let mat = materialCache.get(desc);
          if (!mat) {
            const isPaint = /paint|body/i.test(desc.name) || (/^body$/i.test(name) && !/glass|window|light|rubber|tyre|tire/i.test(desc.name));
            const isRim = /rim/i.test(desc.name);
            const isGlass = /glass|window|windscreen|windshield/i.test(desc.name);
            const isLamp = /head.?light|tail.?light|lamp|reflector/i.test(desc.name);
            const finishRoughness = style?.finish === 2 ? 0.82 : style?.finish === 1 ? 0.48 : style?.finish === 3 ? 0.2 : 0.28;
            const tintOpacity = [1, 0.82, 0.58, 0.32][style?.tint ?? 0];
            const lampColor = LAMPS[style?.lamp ?? 0].hex;
            mat = new THREE.MeshStandardMaterial({
              color: isPaint ? paint : isRim && (style?.rimDesign ?? 0) > 0 ? (style?.rim ?? 0x7d8794) : isLamp ? lampColor : new THREE.Color(desc.color[0], desc.color[1], desc.color[2]),
              map: desc.map ?? undefined, metalness: Math.min(0.85, isPaint && (style?.finish === 3 || style?.finish === 4 || style?.finish === 5) ? 0.72 : desc.metallic), roughness: isPaint ? finishRoughness : Math.max(0.18, desc.roughness),
              transparent: desc.blend || desc.color[3] < 0.99 || (isGlass && (style?.tint ?? 0) > 0), opacity: isGlass ? tintOpacity : desc.color[3], side: desc.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
              emissive: isLamp ? new THREE.Color(lampColor) : new THREE.Color(desc.emissive[0], desc.emissive[1], desc.emissive[2]),
            });
            materialCache.set(desc, mat);
          }
          return mat;
        }) : [new THREE.MeshStandardMaterial({ color: /wheel/i.test(name) ? 0x17191e : (paint), metalness: 0.38, roughness: /wheel/i.test(name) ? 0.72 : 0.3 })];
        const mesh = new THREE.Mesh(part.geometry, mats.length > 1 ? mats : mats[0]);
        mesh.name = name; mesh.position.set(part.at[0], part.at[1], part.at[2]); imported.add(mesh);
      }
      const bounds = new THREE.Box3().setFromObject(imported);
      const size = new THREE.Vector3(); bounds.getSize(size);
      if (!Number.isFinite(size.z) || size.z < 0.1) return;
      const scale = 4.2 / size.z;
      imported.scale.setScalar(scale);
      imported.position.set(-((bounds.min.x + bounds.max.x) * 0.5) * scale, -bounds.min.y * scale, -((bounds.min.z + bounds.max.z) * 0.5) * scale);
      car.add(imported); fallback.visible = false;
    }).catch(() => undefined);
    // Lightweight traffic cars use the same simple mesh style to keep the prototype mobile-friendly.
    const traffic: Array<{ group: THREE.Group; x: number; z: number; direction: -1 | 1; speed: number; color: number }> = [];
    const makeTrafficCar = (x: number, z: number, direction: -1 | 1, speed: number, color: number) => {
      const group = new THREE.Group();
      const paintMat = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.42 });
      const shell = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.58, 3.7), paintMat); shell.position.y = 0.68; group.add(shell);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.48, 1.45), new THREE.MeshStandardMaterial({ color: 0x172c3e, roughness: 0.25 })); glass.position.set(0, 1.17, -0.12); group.add(glass);
      const wheels = new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.9 });
      for (const wx of [-0.9, 0.9]) for (const wz of [-1.1, 1.1]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.18, 10), wheels); wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.35, wz); group.add(wheel); }
      group.position.set(x, 0, z); group.rotation.y = direction === -1 ? 0 : Math.PI; scene.add(group);
      traffic.push({ group, x, z, direction, speed, color });
    };
    makeTrafficCar(-3.6, -28, -1, 12, 0xe8b83e);
    makeTrafficCar(-3.6, -116, -1, 15, 0xc74c46);
    makeTrafficCar(3.6, -72, 1, 10, 0x4d9ed8);
    makeTrafficCar(3.6, -184, 1, 13, 0xeeeeea);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x3dffbd, emissive: 0x0b9e73, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.2 });
    const rings: THREE.Mesh[] = [];
    CHECKPOINTS.forEach((cp, i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.3, 8, 28), ringMat.clone()); ring.position.set(cp.x, 2.1, cp.z); ring.rotation.x = Math.PI / 2; scene.add(ring); rings.push(ring); const label = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffc65c : 0x3dffbd })); label.position.set(cp.x, 4.6, cp.z); scene.add(label); });
    const clock = new THREE.Clock(); let raf = 0; let hudClock = 0; let collisionClock = 0;
    const animate = () => {
      if (!alive.current) return;
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04); const m = motion.current; const c = controls.current;
      // Traffic loops through the boulevard in both directions.
      traffic.forEach((npc) => {
        npc.z += npc.direction * npc.speed * dt;
        if (npc.z > 28) npc.z = -265;
        if (npc.z < -265) npc.z = 28;
        npc.group.position.z = npc.z;
      });
      let didCollide = false;
      if (m.checkpoints < CHECKPOINTS.length) {
        const previousX = m.x, previousZ = m.z;
        const accel = c.gas ? 24 : 0; const braking = c.brake ? 38 : 0;
        m.speed += (accel - braking - m.speed * (c.gas ? 0.45 : 1.25)) * dt;
        if (c.nitro && c.gas) m.speed += 18 * dt;
        m.speed = Math.max(0, Math.min(c.nitro ? 47 : 34, m.speed));
        const onRoad = [0, 42, -42, 84, -84].some((roadX) => Math.abs(m.x - roadX) < 7.6) || [-42, -105, -168].some((roadZ) => Math.abs(m.z - roadZ) < 7.6);
        if (!onRoad) m.speed = Math.max(0, m.speed - 10 * dt); // grass and sidewalks are drivable, but noticeably slower
        const steerPower = 1.5 * Math.min(1, m.speed / 9);
        m.heading += ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * steerPower * dt;
        m.x += Math.sin(m.heading) * m.speed * dt; m.z -= Math.cos(m.heading) * m.speed * dt; m.distance += m.speed * dt;
        // Keep the player within the connected district; sidewalks slow rather than hard-stop the car.
        if (Math.abs(m.x) > 100) { m.x = Math.sign(m.x) * 100; m.speed *= 0.72; }
        if (m.z > 18) { m.z = 18; m.speed *= 0.75; }
        // Solid building footprints stop the car entering facades; restore its previous position on impact.
        for (const obstacle of buildingColliders) {
          if (Math.abs(m.x - obstacle.x) < obstacle.halfW + 1.35 && Math.abs(m.z - obstacle.z) < obstacle.halfD + 1.9) {
            m.x = previousX; m.z = previousZ; m.speed *= 0.38; didCollide = true; break;
          }
        }
        // Basic traffic collision response: a close pass causes a noticeable speed loss and short knockback.
        for (const npc of traffic) {
          const dx = m.x - npc.x, dz = m.z - npc.z;
          if (dx * dx + dz * dz < 10.5) {
            m.speed *= 0.48; didCollide = true;
            m.x += dx === 0 ? (m.heading >= 0 ? 0.35 : -0.35) : Math.sign(dx) * 0.35;
            m.z += Math.sign(dz || 1) * 0.22;
          }
        }
        car.position.set(m.x, 0, m.z); car.rotation.y = m.heading; car.rotation.z = ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * -0.035;
        nitroFlame.visible = c.nitro && c.gas && m.speed > 5; nitroFlame.scale.setScalar(0.8 + Math.random() * 0.45);
        const cp = CHECKPOINTS[m.checkpoints];
        if (cp && Math.hypot(cp.x - m.x, cp.z - m.z) < 7) { m.checkpoints++; rings[m.checkpoints - 1]?.scale.setScalar(0.001); }
      }
      rings.forEach((ring, i) => { if (i >= m.checkpoints) ring.rotation.z += dt * (i === m.checkpoints ? 0.8 : 0.25); });
      const target = new THREE.Vector3(m.x + Math.sin(m.heading) * 10, 5.8, m.z + Math.cos(m.heading) * 10);
      camera.position.lerp(target, 0.11); camera.lookAt(m.x, 0.9, m.z - 8);
      renderer.render(scene, camera); (gl as any).endFrameEXP?.();
      collisionClock = didCollide ? 0.45 : Math.max(0, collisionClock - dt);
      hudClock += dt; if (hudClock > 0.12) { hudClock = 0; setHud({ speed: Math.round(m.speed * 3.6), checkpoints: m.checkpoints, banner: m.checkpoints >= CHECKPOINTS.length ? 'DISTRICT RUN COMPLETE' : CHECKPOINTS[m.checkpoints]?.label ?? 'EXPLORE LAGOS', nearWorkshop: Math.hypot(m.x + 18, m.z + 44) < 14, collision: collisionClock > 0 }); }
    };
    // Place the camera behind the starting car before the first frame.
    camera.position.set(0, 6, 16); camera.lookAt(0, 1, -5); animate();
    return () => { cancelAnimationFrame(raf); traffic.forEach((npc) => scene.remove(npc.group)); };
  }, [carId, paint, style]);

  useEffect(() => () => { alive.current = false; carModelLoadRef.current++; rendererRef.current?.dispose(); rendererRef.current = null; }, []);
  const control = (key: keyof Controls, value: boolean) => { controls.current[key] = value; };
  const hold = (key: keyof Controls) => ({ onPressIn: () => control(key, true), onPressOut: () => { if (key === 'gas' && autoGas) return; control(key, false); } });
  const btn = (key: keyof Controls, label: string, flex = 1, accent = false) => <Pressable key={key} {...hold(key)} style={({ pressed }) => [styles.btn, { flex }, accent && { borderColor: 'rgba(61,224,255,.6)' }, pressed && { backgroundColor: 'rgba(124,92,255,.8)' }]}><Text style={[styles.btnText, (key === 'left' || key === 'right') && { fontSize: 24 }]}>{label}</Text></Pressable>;
  const left = Math.max(insets.left, 14); const right = Math.max(insets.right, 14);
  return <View style={styles.root}>
    <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} onLayout={() => { setTimeout(() => { const g = glRef.current; if (g) resizeRef.current?.(g.drawingBufferWidth ?? 0, g.drawingBufferHeight ?? 0); }, 60); }} />
    <View pointerEvents="none" style={[styles.panel, { position: 'absolute', top: insets.top + 8, left, flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingHorizontal: 14, paddingVertical: 8 }]}>
      <View><Text style={styles.label}>SPEED</Text><Text style={styles.big}>{hud.speed}<Text style={styles.unit}> KM/H</Text></Text></View>
      <View><Text style={styles.label}>WAYPOINT</Text><Text style={styles.num}>{Math.min(hud.checkpoints + 1, 3)}/3</Text></View>
    </View>
    <View style={{ position: 'absolute', top: insets.top + 8, right, alignItems: 'flex-end', gap: 6, maxWidth: '42%' }}>
      <View pointerEvents="none" style={[styles.panel, { padding: 8 }]}><Text style={styles.missionTitle}>{hud.checkpoints >= 3 ? 'DISTRICT COMPLETE' : 'LAGOS FREE DRIVE'}</Text><Text style={styles.missionSub} numberOfLines={2}>{hud.banner}</Text></View>
      <Pressable onPress={onExit} style={[styles.panel, { paddingHorizontal: 12, paddingVertical: 6 }]}><Text style={styles.exitText}>✕  EXIT</Text></Pressable>
    </View>
    {hud.collision ? <View pointerEvents="none" style={{ position: 'absolute', top: '24%', left: 0, right: 0, alignItems: 'center' }}><Text style={styles.impact}>IMPACT · SPEED REDUCED</Text></View> : null}
    {hud.nearWorkshop && hud.checkpoints < 3 ? <Pressable onPress={onWorkshop} style={styles.workshopButton}><Text style={styles.workshopTitle}>TOMI’S WORKSHOP</Text><Text style={styles.workshopSub}>TAP TO OPEN YOUR GARAGE  →</Text></Pressable> : null}
    <View style={{ position: 'absolute', left, bottom: insets.bottom + 10, height: 60, width: 150, flexDirection: 'row', gap: 8 }}>{btn('left', '◀')}{btn('right', '▶')}</View>
    <View style={{ position: 'absolute', right, bottom: insets.bottom + 10, height: 60, width: autoGas ? 170 : 250, flexDirection: 'row', gap: 8 }}>{btn('brake', '■ BRAKE')}{btn('nitro', '⚡ NITRO')}{autoGas ? null : btn('gas', '▲ GAS', 1.1, true)}</View>
    {finished ? <View style={styles.completeOverlay}><Text style={styles.completeTitle}>LAGOS DISTRICT RUN COMPLETE</Text><Text style={styles.completeText}>You found the workshop, crossed the bridge, and reached the lookout.</Text><Pressable style={styles.completeButton} onPress={() => onComplete({ checkpoints: 3, coins: rewardClaimed ? 0 : 250, distance: Math.round(motion.current.distance) })}><Text style={styles.completeButtonText}>{rewardClaimed ? 'RETURN TO APEX' : 'CLAIM 250 COINS'}</Text></Pressable><Pressable onPress={onExit} style={{ padding: 12 }}><Text style={{ color: '#fff', fontWeight: '800' }}>RETURN TO APEX</Text></Pressable></View> : null}
  </View>;
}

const styles = StyleSheet.create({ panel: { backgroundColor: 'rgba(10,13,22,.76)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' }, label: { color: '#9aa3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1.6 }, big: { color: '#fff', fontSize: 34, fontWeight: '900', fontStyle: 'italic', lineHeight: 36 }, num: { color: '#fff', fontSize: 20, fontWeight: '900', fontStyle: 'italic' }, btn: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(10,14,30,.38)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' }, btnText: { color: '#fff', fontWeight: '900', fontSize: 12 }, root: { flex: 1, backgroundColor: '#121b32' }, topHud: { position: 'absolute', top: 42, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, eyebrow: { color: '#79e8d1', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }, speed: { color: '#fff', fontSize: 31, fontWeight: '900', fontStyle: 'italic' }, unit: { fontSize: 10, color: '#a9b8ce' }, mission: { maxWidth: '52%', backgroundColor: 'rgba(7,13,27,.82)', borderWidth: 1, borderColor: '#3b7f83', borderRadius: 13, padding: 10 }, missionTitle: { color: '#7fffd9', fontWeight: '900', fontSize: 11 }, missionSub: { color: '#fff', fontSize: 10, marginTop: 4, fontWeight: '700' }, leftControls: { position: 'absolute', bottom: 95, left: 18, flexDirection: 'row', gap: 10 }, rightControls: { position: 'absolute', bottom: 86, right: 18, gap: 8, alignItems: 'center' }, control: { minWidth: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,17,34,.76)', borderWidth: 1, borderColor: 'rgba(157,190,224,.65)' }, wideControl: { minWidth: 78, height: 43, borderRadius: 13, backgroundColor: 'rgba(25,81,120,.88)', borderColor: '#59c6e6' }, controlText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 }, footer: { position: 'absolute', left: 14, right: 14, bottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, exit: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, backgroundColor: 'rgba(10,15,29,.9)', borderWidth: 1, borderColor: '#53647b' }, exitText: { color: '#fff', fontSize: 10, fontWeight: '900' }, hint: { color: '#fff', fontSize: 9, fontWeight: '700', flex: 1, textAlign: 'right', textShadowColor: '#000', textShadowRadius: 4 }, completeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,12,25,.9)', alignItems: 'center', justifyContent: 'center', padding: 26 }, completeTitle: { color: '#7fffd9', fontWeight: '900', fontSize: 21, textAlign: 'center' }, completeText: { color: '#d5e1ef', textAlign: 'center', marginTop: 10, marginBottom: 20 }, impact: { color: '#ffb37a', fontSize: 14, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 }, workshopButton: { position: 'absolute', top: '43%', alignSelf: 'center', backgroundColor: 'rgba(6,19,31,.92)', borderColor: '#e6b45e', borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18 }, workshopTitle: { color: '#ffd17d', fontWeight: '900', fontSize: 12, textAlign: 'center' }, workshopSub: { color: '#fff', fontSize: 9, fontWeight: '800', marginTop: 4, textAlign: 'center' }, completeButton: { backgroundColor: '#1ab98b', paddingVertical: 15, paddingHorizontal: 24, borderRadius: 14 }, completeButtonText: { color: '#061a19', fontWeight: '900', letterSpacing: 0.7 } });
