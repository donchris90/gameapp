import * as THREE from 'three';
import { makeRenderer } from './glfix';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CarStyle } from './style';
import { loadCarModel, MODELS } from './model';
import { lookFor } from './cars';
import { makeHeroCar } from './scene';
import { RegionLook } from './regionLook';
import { buildLagosWorld } from './lagosWorld';
import { CATCH_SECONDS, collected, jobCoins, JobDef, jobKindLabel, jobOutcome, JobOutcome, JobState, newJob, nextPoint, START, stepJob, timeLeft } from './jobs';
import './cars';

type Controls = { left: boolean; right: boolean; gas: boolean; brake: boolean; nitro: boolean };
const ROAD = 14;

function addBox(scene: THREE.Scene, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.86 })); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
}

/**
 * Plays a story job (delivery, investigation, escape, chase, infiltration) on the Lagos street grid.
 * The rules are in jobs.ts; this file only draws them and feeds in the player's position and collisions.
 * `onFinish` is called exactly once, the moment the job is won or lost.
 */
export function DriveMission({ job, title, carId, paint = 0x2788ff, style, quality = 2, autoGas = true, upgrades = [], bodyTier = 0, region, onFinish, onExit, onContinue, onRetry }: {
  job: JobDef; title: string; carId: string; paint?: number; style?: CarStyle; quality?: number; autoGas?: boolean; upgrades?: number[]; bodyTier?: number; region?: RegionLook;
  onFinish: (o: JobOutcome) => void; onExit: () => void; onContinue: () => void; onRetry: () => void;
}) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const carModelLoadRef = useRef(0);
  const insets = useSafeAreaInsets();
  const controls = useRef<Controls>({ left: false, right: false, gas: autoGas, brake: false, nitro: false });
  const alive = useRef(true);
  const reported = useRef(false);
  const win = useWindowDimensions(); const wide = win.width > win.height;
  const [glReady, setGlReady] = useState(false);
  useEffect(() => { if (!wide) return; const id = setTimeout(() => setGlReady(true), 200); return () => clearTimeout(id); }, [wide]);
  const glRef = useRef<any>(null);
  const resizeRef = useRef<((w: number, h: number) => void) | null>(null);
  const [hud, setHud] = useState({ speed: 0, left: job.timeLimit ?? 0, got: 0, next: job.points[0]?.label ?? '', hits: 0, caught: 0, hold: 0, arrow: 0, status: 'run' as JobState['status'], reason: '', collision: false });
  const [outcome, setOutcome] = useState<JobOutcome | null>(null);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    alive.current = true;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientWidth: w, clientHeight: h, getContext: () => gl };
    const renderer = makeRenderer(gl, canvas, { antialias: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.setClearColor(0x121b32, 1); renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, w / Math.max(1, h), 0.1, 500); glRef.current = gl;
    resizeRef.current = (nw, nh) => { if (nw < 1 || nh < 1) return; renderer.setSize(nw, nh, false); camera.aspect = nw / nh; camera.updateProjectionMatrix(); };
    const world = buildLagosWorld(scene, { road: ROAD, quality, skin: region?.skin, look: region });
    const colliders = world.colliders;

    // player car: same model and look as in the race
    const car = new THREE.Group(); car.position.set(START.x, 0, START.z); scene.add(car);
    let heroFlame: THREE.Mesh | null = null; let heroGroup: THREE.Group | null = null;
    const putHero = (id: string) => {
      const hero = makeHeroCar(style?.paint ?? paint, bodyTier, id, { ...lookFor(upgrades), style });
      hero.head.emissiveIntensity = 1.3; hero.flame.visible = false;
      if (heroGroup) car.remove(heroGroup);
      heroGroup = hero.group; heroFlame = hero.flame; car.add(hero.group);
    };
    putHero(carId);
    const loadToken = ++carModelLoadRef.current;
    void (async () => {
      const lowId = `${carId}_lo`;
      try { if (quality === 0) await loadCarModel(lowId); await loadCarModel(carId); } catch { /* keep built-in car */ }
      if (!alive.current || loadToken !== carModelLoadRef.current) return;
      putHero(quality === 0 && MODELS.byId[lowId] ? lowId : carId);
    })();

    // job state and its actors
    const state = newJob(job);
    const yawOf = (dx: number, dz: number, prev: number) => (Math.abs(dx) + Math.abs(dz) < 1e-4 ? prev : Math.atan2(dx, -dz));
    type Actor = { group: THREE.Group; yaw: number; px: number; pz: number };
    const mk = (color: number, kind: number, x: number, z: number): Actor => { const group = world.makeTraffic(color, kind); group.position.set(x, 0, z); scene.add(group); return { group, yaw: 0, px: x, pz: z }; };
    const move = (a: Actor, x: number, z: number) => { a.yaw = yawOf(x - a.px, z - a.pz, a.yaw); a.px = x; a.pz = z; a.group.position.set(x, 0, z); a.group.rotation.y = a.yaw; };
    const pursuerActors = state.pursuers.map((p) => { const a = mk(0x20242e, 0, p.x, p.z); const light = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xff3b3b })); light.position.set(0, 1.9, 0); a.group.add(light); a.group.visible = false; return { a, light }; });
    const targetActor = state.target ? mk(job.kind === 'chase' && job.target!.decoys ? 0xd6d6cf : 0xc74c46, job.target!.decoys ? 1 : 0, state.target.x, state.target.z) : null;
    const marker = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 4), new THREE.MeshBasicMaterial({ color: 0xffd23f })); marker.rotation.x = Math.PI; if (targetActor) { marker.position.set(0, 5.4, 0); targetActor.group.add(marker); }
    const decoyActors = state.decoys.map((d) => mk(0xd6d6cf, 1, d.x, d.z));
    // ambient traffic, as in the free drive
    const ambient: Array<{ group: THREE.Group; x: number; z: number; dir: -1 | 1; speed: number }> = [];
    ([[-3.6, -28, -1, 12, 0xe8b83e], [-3.6, -116, -1, 15, 0xc74c46], [3.6, -72, 1, 10, 0x4d9ed8], [3.6, -184, 1, 13, 0xeeeeea]] as const).forEach(([x, z, dir, speed, color], i) => {
      const group = world.makeTraffic(color, i % 3); group.position.set(x, 0, z); group.rotation.y = dir === -1 ? 0 : Math.PI; scene.add(group); ambient.push({ group, x, z, dir, speed });
    });
    // point rings
    const rings = job.points.map((p, i) => {
      const color = p.clue ? 0xffd23f : 0x3dffbd;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.3, 8, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 }));
      ring.position.set(p.x, 2.1, p.z); ring.rotation.x = Math.PI / 2; scene.add(ring);
      const beam = addBox(scene, p.x, 7, p.z, 0.3, 14, 0.3, color); (beam.material as THREE.MeshStandardMaterial).emissive.setHex(color); (beam.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5; (beam.material as THREE.MeshStandardMaterial).transparent = true; (beam.material as THREE.MeshStandardMaterial).opacity = 0.4;
      void i; return { ring, beam };
    });

    // car handling, with the car's upgrades making a real difference
    const u = (k: number) => upgrades[k] ?? 0;
    const maxSpeed = 34 * (1 + 0.03 * u(0) + 0.02 * u(1)), accelBase = 24 * (1 + 0.05 * u(0)), steerBase = 1.5 * (1 + 0.04 * u(2)), offroad = 10 * (1 - 0.08 * u(2));
    const nitroTop = maxSpeed + 13 + 1.5 * u(3), nitroPush = 18 + 2 * u(3);
    const m = { x: START.x, z: START.z, heading: 0, speed: 0 };
    const clock = new THREE.Clock(); let raf = 0; let hudClock = 0; let hitCooldown = 0; let collisionFlash = 0;
    const animate = () => {
      if (!alive.current) return;
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04); const c = controls.current;
      ambient.forEach((n) => { n.z += n.dir * n.speed * dt; if (n.z > 28) n.z = -265; if (n.z < -265) n.z = 28; n.group.position.z = n.z; });
      let didCollide = false;
      if (state.status === 'run') {
        const px = m.x, pz = m.z;
        const accel = c.gas ? accelBase : 0; const braking = c.brake ? 38 : 0;
        m.speed += (accel - braking - m.speed * (c.gas ? 0.45 : 1.25)) * dt;
        if (c.nitro && c.gas) m.speed += nitroPush * dt;
        m.speed = Math.max(0, Math.min(c.nitro ? nitroTop : maxSpeed, m.speed));
        const onRoad = [0, 42, -42, 84, -84].some((rx) => Math.abs(m.x - rx) < 7.6) || [-42, -105, -168].some((rz) => Math.abs(m.z - rz) < 7.6);
        if (!onRoad) m.speed = Math.max(0, m.speed - offroad * dt);
        m.heading += ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * steerBase * Math.min(1, m.speed / 9) * dt;
        m.x += Math.sin(m.heading) * m.speed * dt; m.z -= Math.cos(m.heading) * m.speed * dt;
        if (Math.abs(m.x) > 100) { m.x = Math.sign(m.x) * 100; m.speed *= 0.72; }
        if (m.z > 18) { m.z = 18; m.speed *= 0.75; }
        if (m.z < -258) { m.z = -258; m.speed *= 0.75; }
        for (const o of colliders) {
          if (Math.abs(m.x - o.x) < o.halfW + 1.35 && Math.abs(m.z - o.z) < o.halfD + 1.9) { m.x = px; m.z = pz; m.speed *= 0.38; didCollide = true; break; }
        }
        const bump = (ax: number, az: number, r2: number) => { const dx = m.x - ax, dz = m.z - az; if (dx * dx + dz * dz < r2) { m.speed *= 0.5; didCollide = true; m.x += dx === 0 ? 0.35 : Math.sign(dx) * 0.35; m.z += Math.sign(dz || 1) * 0.22; } };
        ambient.forEach((n) => bump(n.x, n.z, 10.5));
        state.pursuers.forEach((p) => { if (p.active) bump(p.x, p.z, 8); });
        decoyActors.forEach((d) => bump(d.px, d.pz, 10.5));
        hitCooldown = Math.max(0, hitCooldown - dt);
        const hit = didCollide && hitCooldown <= 0; if (hit) { hitCooldown = 0.8; collisionFlash = 0.6; }
        stepJob(job, state, { x: m.x, z: m.z }, dt, hit);
        car.position.set(m.x, 0, m.z); car.rotation.y = m.heading; car.rotation.z = ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * -0.035;
        if (heroFlame) { heroFlame.visible = c.nitro && c.gas && m.speed > 5; heroFlame.scale.setScalar(0.8 + Math.random() * 0.45); }
      } else m.speed = Math.max(0, m.speed - 30 * dt);
      collisionFlash = Math.max(0, collisionFlash - dt);

      // actors
      state.pursuers.forEach((p, i) => { const pa = pursuerActors[i]; pa.a.group.visible = p.active; if (p.active) { move(pa.a, p.x, p.z); (pa.light.material as THREE.MeshBasicMaterial).color.setHex(Math.floor(state.t * 6) % 2 ? 0xff3b3b : 0x3b6bff); } });
      if (targetActor && state.target) { move(targetActor, state.target.x, state.target.z); marker.position.y = 5.4 + Math.sin(state.t * 4) * 0.4; marker.rotation.y += dt * 2; }
      state.decoys.forEach((d, i) => move(decoyActors[i], d.x, d.z));
      const next = job.ordered ? nextPoint(job, state) : -1;
      rings.forEach((r, i) => {
        const done = state.got[i]; r.ring.visible = !done; r.beam.visible = !done;
        const live = job.ordered ? i === next : !done; r.ring.rotation.z += dt * (live ? 0.9 : 0.2); r.ring.scale.setScalar(live ? 1 : 0.55); (r.beam.material as THREE.Material).opacity = live ? 0.4 : 0.15;
      });

      const target = new THREE.Vector3(m.x + Math.sin(m.heading) * 10, 5.8, m.z + Math.cos(m.heading) * 10);
      camera.position.lerp(target, 0.11); world.sky.position.set(camera.position.x, 0, camera.position.z); camera.lookAt(m.x, 0.9, m.z - 8);
      renderer.render(scene, camera); (gl as any).endFrameEXP?.();

      if (state.status !== 'run' && !reported.current) {
        reported.current = true; const o = jobOutcome(job, state); setOutcome(o); onFinishRef.current(o);
      }
      hudClock += dt;
      if (hudClock > 0.12 || state.status !== 'run') {
        hudClock = 0;
        const nextIdx = job.ordered ? nextPoint(job, state) : state.got.findIndex((g) => !g);
        let aim: { x: number; z: number } | null = null;
        if (job.target && state.target) aim = state.target; else if (nextIdx >= 0 && job.ordered) aim = job.points[nextIdx]; else if (nextIdx >= 0) { let best = Infinity; job.points.forEach((p, i) => { if (state.got[i]) return; const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < best) { best = d; aim = p; } }); }
        const arrow = aim ? Math.atan2(aim.x - m.x, -(aim.z - m.z)) - m.heading : 0;
        setHud({ speed: Math.round(m.speed * 3.6), left: Math.ceil(timeLeft(job, state)), got: collected(state), next: nextIdx >= 0 ? job.points[nextIdx].label : '', hits: state.hits, caught: state.caught / CATCH_SECONDS, hold: job.target ? state.hold / job.target.holdSeconds : 0, arrow, status: state.status, reason: state.reason, collision: collisionFlash > 0 });
      }
    };
    camera.position.set(0, 6, 16); camera.lookAt(0, 1, -5); animate();
    return () => { cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId, paint, style, job, region]);

  const onFinishRef = useRef(onFinish); onFinishRef.current = onFinish;
  useEffect(() => () => { alive.current = false; carModelLoadRef.current++; rendererRef.current?.dispose(); rendererRef.current = null; }, []);
  const control = (key: keyof Controls, value: boolean) => { controls.current[key] = value; };
  const hold = (key: keyof Controls) => ({ onPressIn: () => control(key, true), onPressOut: () => { if (key === 'gas' && autoGas) return; control(key, false); } });
  const btn = (key: keyof Controls, label: string, flex = 1, accent = false) => <Pressable key={key} {...hold(key)} style={({ pressed }) => [styles.btn, { flex }, accent && { borderColor: 'rgba(61,224,255,.6)' }, pressed && { backgroundColor: 'rgba(124,92,255,.8)' }]}><Text style={[styles.btnText, (key === 'left' || key === 'right') && { fontSize: 24 }]}>{label}</Text></Pressable>;
  const left = Math.max(insets.left, 14); const right = Math.max(insets.right, 14);
  const total = job.points.length;
  const timer = job.timeLimit === undefined ? '--' : `${Math.floor(hud.left / 60)}:${String(hud.left % 60).padStart(2, '0')}`;
  const objective = job.kind === 'chase' ? 'STAY ON THE TARGET' : job.kind === 'investigate' ? `CLUES ${hud.got}/${total}` : job.ordered ? `NEXT: ${hud.next || 'DONE'}` : `${hud.got}/${total}`;
  return <View style={styles.root}>
    {glReady ? <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} onLayout={() => { setTimeout(() => { const g = glRef.current; if (g) resizeRef.current?.(g.drawingBufferWidth ?? 0, g.drawingBufferHeight ?? 0); }, 60); }} /> : null}
    <View pointerEvents="none" style={[styles.panel, { position: 'absolute', top: insets.top + 8, left, flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingHorizontal: 14, paddingVertical: 8 }]}>
      <View><Text style={styles.label}>SPEED</Text><Text style={styles.big}>{hud.speed}<Text style={styles.unit}> KM/H</Text></Text></View>
      <View><Text style={styles.label}>TIME</Text><Text style={[styles.num, job.timeLimit !== undefined && hud.left <= 10 && { color: '#ff7a6b' }]}>{timer}</Text></View>
      <View><Text style={styles.label}>HITS</Text><Text style={[styles.num, hud.hits >= job.maxHits && { color: '#ffb37a' }]}>{hud.hits}/{job.maxHits}</Text></View>
    </View>
    <View style={{ position: 'absolute', top: insets.top + 8, right, alignItems: 'flex-end', gap: 6, maxWidth: '44%' }}>
      <View pointerEvents="none" style={[styles.panel, { padding: 8 }]}>
        <Text style={styles.missionTitle}>{jobKindLabel(job.kind)} · {title.toUpperCase()}</Text>{region ? <Text style={[styles.missionSub, { color: '#9aa3b8', marginTop: 1 }]}>{region.name}</Text> : null}
        <Text style={styles.missionSub} numberOfLines={2}>{job.goal}</Text>
        <Text style={[styles.missionSub, { color: '#ffd23f', marginTop: 3 }]}>{objective}</Text>
        {hud.caught > 0.02 ? <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, hud.caught * 100)}%`, backgroundColor: '#ff5d5d' }]} /></View> : null}
        {job.target && hud.hold > 0.02 ? <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, hud.hold * 100)}%`, backgroundColor: '#3dffbd' }]} /></View> : null}
      </View>
      <Pressable onPress={onExit} style={[styles.panel, { paddingHorizontal: 12, paddingVertical: 6 }]}><Text style={styles.exitText}>✕  EXIT</Text></Pressable>
    </View>
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 78, left: '50%', marginLeft: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(10,13,22,.6)', borderWidth: 1, borderColor: 'rgba(255,210,63,.7)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#ffd23f', fontSize: 22, fontWeight: '900', transform: [{ rotate: `${hud.arrow}rad` }] }}>▲</Text>
    </View>
    {hud.collision ? <View pointerEvents="none" style={{ position: 'absolute', top: '24%', left: 0, right: 0, alignItems: 'center' }}><Text style={styles.impact}>IMPACT</Text></View> : null}
    <View style={{ position: 'absolute', left, bottom: insets.bottom + 10, height: 60, width: 150, flexDirection: 'row', gap: 8 }}>{btn('left', '◀')}{btn('right', '▶')}</View>
    <View style={{ position: 'absolute', right, bottom: insets.bottom + 10, height: 60, width: autoGas ? 170 : 250, flexDirection: 'row', gap: 8 }}>{btn('brake', '■ BRAKE')}{btn('nitro', '⚡ NITRO')}{autoGas ? null : btn('gas', '▲ GAS', 1.1, true)}</View>
    {outcome ? <View style={styles.overlay}>
      <Text style={[styles.overTitle, !outcome.success && { color: '#ff8c7a' }]}>{outcome.success ? 'JOB COMPLETE' : 'JOB FAILED'}</Text>
      <Text style={styles.overText}>{outcome.success ? `${outcome.seconds}s · ${outcome.hits} hit${outcome.hits === 1 ? '' : 's'}${outcome.clues.length ? ` · ${outcome.clues.length} clue${outcome.clues.length === 1 ? '' : 's'} found` : ''}` : outcome.reason}</Text>
      {outcome.success ? <Text style={styles.overText}>+{jobCoins(job, outcome).toLocaleString()} coins</Text> : <Text style={styles.overText}>Fuel and condition were used. Try again.</Text>}
      <Pressable style={styles.overButton} onPress={outcome.success ? onContinue : onRetry}><Text style={styles.overButtonText}>{outcome.success ? 'CONTINUE STORY  →' : 'RETRY JOB  ↻'}</Text></Pressable>
      {!outcome.success ? <Pressable onPress={onContinue} style={{ padding: 12 }}><Text style={{ color: '#fff', fontWeight: '800' }}>BACK TO STORY</Text></Pressable> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121b32' },
  panel: { backgroundColor: 'rgba(10,13,22,.76)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' },
  label: { color: '#9aa3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  big: { color: '#fff', fontSize: 34, fontWeight: '900', fontStyle: 'italic', lineHeight: 36 },
  unit: { fontSize: 10, color: '#a9b8ce' },
  num: { color: '#fff', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(10,14,30,.38)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  missionTitle: { color: '#7fffd9', fontWeight: '900', fontSize: 11 },
  missionSub: { color: '#fff', fontSize: 10, marginTop: 4, fontWeight: '700' },
  exitText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  impact: { color: '#ffb37a', fontSize: 14, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.15)', marginTop: 5, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,12,25,.9)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  overTitle: { color: '#7fffd9', fontWeight: '900', fontSize: 24, textAlign: 'center' },
  overText: { color: '#d5e1ef', textAlign: 'center', marginTop: 8, fontWeight: '700' },
  overButton: { backgroundColor: '#1ab98b', paddingVertical: 15, paddingHorizontal: 24, borderRadius: 14, marginTop: 20 },
  overButtonText: { color: '#061a19', fontWeight: '900', letterSpacing: 0.7 },
});
