import * as THREE from 'three';
import { makeRenderer } from './glfix';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarStyle, LAMPS } from './style';
import { loadCarModel, MODELS } from './model';
import { lookFor } from './cars';
import { makeHeroCar } from './scene';
import { buildLagosWorld } from './lagosWorld';
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
export function LagosDrive({ carId, paint = 0x2788ff, style, rewardClaimed = false, quality = 2, autoGas = true, upgrades = [], bodyTier = 0, onExit, onWorkshop, onComplete }: {
  carId: string; paint?: number; style?: CarStyle; rewardClaimed?: boolean; quality?: number; autoGas?: boolean; upgrades?: number[]; bodyTier?: number; onExit: () => void; onWorkshop: () => void; onComplete: (result: LagosDriveResult) => void;
}) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const carModelLoadRef = useRef(0);
  const insets = useSafeAreaInsets();
  const controls = useRef<Controls>({ left: false, right: false, gas: autoGas, brake: false, nitro: false });
  const motion = useRef({ x: 0, z: 0, heading: 0, speed: 0, distance: 0, checkpoints: 0 });
  const alive = useRef(true);
  const win = useWindowDimensions(); const wide = win.width > win.height;
  const [glReady, setGlReady] = useState(false);
  // Wait until the phone is really in landscape before creating the 3D view, or it keeps its portrait size.
  useEffect(() => { if (!wide) return; const id = setTimeout(() => setGlReady(true), 200); return () => clearTimeout(id); }, [wide]);
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
    const world = buildLagosWorld(scene, { road: ROAD, quality });
    const buildingColliders = world.colliders;
    const car = new THREE.Group(); car.position.set(0, 0, 5); scene.add(car);
    // The player's car is built exactly as in the race (same model, paint, rims, glass and lights).
    let heroFlame: THREE.Mesh | null = null; let heroGroup: THREE.Group | null = null;
    const putHero = (id: string) => {
      const hero = makeHeroCar(style?.paint ?? paint, bodyTier, id, { ...lookFor(upgrades), style });
      hero.head.emissiveIntensity = 1.3; hero.flame.visible = false;
      if (heroGroup) car.remove(heroGroup);
      heroGroup = hero.group; heroFlame = hero.flame; car.add(hero.group);
    };
    putHero(carId); // the built-in car shows at once if the model file is still loading
    const loadToken = ++carModelLoadRef.current;
    void (async () => {
      const lowId = `${carId}_lo`;
      try { if (quality === 0) await loadCarModel(lowId); await loadCarModel(carId); } catch { /* keep the built-in car */ }
      if (!alive.current || loadToken !== carModelLoadRef.current) return;
      putHero(quality === 0 && MODELS.byId[lowId] ? lowId : carId);
    })();
    // Traffic uses the race's own car models.
    const traffic: Array<{ group: THREE.Group; x: number; z: number; direction: -1 | 1; speed: number; color: number }> = [];
    const makeTrafficCar = (x: number, z: number, direction: -1 | 1, speed: number, color: number) => {
      const group = world.makeTraffic(color, traffic.length % 3);
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
        if (m.z < -258) { m.z = -258; m.speed *= 0.75; }
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
        if (heroFlame) { heroFlame.visible = c.nitro && c.gas && m.speed > 5; heroFlame.scale.setScalar(0.8 + Math.random() * 0.45); }
        const cp = CHECKPOINTS[m.checkpoints];
        if (cp && Math.hypot(cp.x - m.x, cp.z - m.z) < 7) { m.checkpoints++; rings[m.checkpoints - 1]?.scale.setScalar(0.001); }
      }
      rings.forEach((ring, i) => { if (i >= m.checkpoints) ring.rotation.z += dt * (i === m.checkpoints ? 0.8 : 0.25); });
      const target = new THREE.Vector3(m.x + Math.sin(m.heading) * 10, 5.8, m.z + Math.cos(m.heading) * 10);
      camera.position.lerp(target, 0.11); world.sky.position.set(camera.position.x, 0, camera.position.z); camera.lookAt(m.x, 0.9, m.z - 8);
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
    {glReady ? <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} onLayout={() => { setTimeout(() => { const g = glRef.current; if (g) resizeRef.current?.(g.drawingBufferWidth ?? 0, g.drawingBufferHeight ?? 0); }, 60); }} /> : null}
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
