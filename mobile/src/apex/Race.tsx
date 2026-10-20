import { Accelerometer } from 'expo-sensors';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';
import { engineStart, engineStop, engineUpdate, sfx } from '../sfx';
import { colors } from '../ui';
import { drive, newDriver } from './bot';
import { randomName } from './names';
import { loadCarModel } from './model';
import { CarStyle } from './style';
import { RIVAL_MODELS, lookFor } from './cars';
import { ApexScene, CameraMode, Frame } from './scene';
import { MiniMap } from './MiniMap';
import { trackPath, TrackPath } from './trackpath';
import { carStats, DT, driftAt, collideRacers, MAX_RACE_TICKS, Racer, clampSteer, makeWorld, newRacer, packInput, rng, step } from './sim';

export interface Standing { name: string; ticks: number; you: boolean }
export interface RaceResult { level: number; track: string; laps: number; bestLap: number; seed: number; standings: Standing[]; rank: number; ticks: number; hits: number; pedHits: number; inputs: number[] }

const hudLabel = { color: '#9aa3b8', fontSize: 10, fontWeight: '700' as const, letterSpacing: 1.6 };
const hudNum = { color: '#fff', fontSize: 20, fontWeight: '900' as const, fontStyle: 'italic' as const };
const FIELD = 6; // you and five computer drivers
const snap = (r: Racer) => ({ x: r.x, z: r.z, v: r.v });

interface Rival { id: number; name: string; r: Racer; prev: { x: number; z: number; v: number }; d: ReturnType<typeof newDriver> }


/**
 * The race: a 3D view, the rules from sim.ts running 30 times a second (drawing is smoothed in between),
 * tilt and button steering, the countdown, the HUD and the finish.
 */
export function Race({ level, track = 'straight', laps = 3, tilt, invert, carId = 'cts', paint = 0x2788ff, upgrades = [], bodyTier = 0, style, onDone, onFlip }: { level: number; track?: string; laps?: number; tilt: boolean; invert: boolean; carId?: string; paint?: number; upgrades?: number[]; bodyTier?: number; style?: CarStyle; onDone: (r: RaceResult) => void; onFlip?: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: sw, height: sh } = useWindowDimensions();
  const wide = sw > sh;
  const landRight = useRef(false);
  useEffect(() => {
    const read = () => ScreenOrientation.getOrientationAsync().then((o) => { landRight.current = o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT; }).catch(() => undefined);
    void read();
    const s = ScreenOrientation.addOrientationChangeListener(() => { void read(); });
    return () => ScreenOrientation.removeOrientationChangeListener(s);
  }, []);
  const keys = useRef({ left: false, right: false, brake: false, nitro: false });
  const tiltRef = useRef({ raw: 0, base: 0, value: 0, calibrated: false });
  const wideRef = useRef(wide); wideRef.current = wide;
  // wait until the phone has actually turned sideways before creating the 3D view, or it is made at the old size
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (wide) { const id = setTimeout(() => setReady(true), 150); return () => clearTimeout(id); }
    const id = setTimeout(() => setReady(true), 2000); return () => clearTimeout(id);
  }, [wide]);
  const glRef = useRef<any>(null);
  const viewRef = useRef<ApexScene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const car = carStats(carId, upgrades);
  const resizeRef = useRef<((w: number, h: number) => void) | null>(null);
  const alive = useRef(true);
  const finished = useRef(false);
  const [hud, setHud] = useState({ dots: [] as Array<{ z: number; color: string; r: number }>, banner: '', lap: 1, laps: 1, lapLen: 0, best: 0, count: 3, speed: 0, rank: 1, ahead: '', gap: 0, progress: 0, nitro: 1, time: 0, hits: 0, rivals: [] as number[], over: false });
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone;

  // A GL context can be recreated after navigation or a device/context reset. Release the old
  // scene and renderer first, and release them again when the race screen unmounts.
  useEffect(() => () => {
    alive.current = false;
    viewRef.current?.dispose();
    viewRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    engineStop();
  }, []);
  const pathRef = useRef<TrackPath | null>(null);

  useEffect(() => {
    alive.current = true;
    let sub: { remove: () => void } | null = null;
    if (tilt) {
      Accelerometer.setUpdateInterval(16);
      sub = Accelerometer.addListener(({ x, y }) => {
        const t = tiltRef.current;
        // landscape: the phone is a steering wheel, so the sideways lean shows up on the device's y axis
        const lean = (wideRef.current ? y * (landRight.current ? -1 : 1) : x);
        t.raw = t.raw * 0.7 + lean * 0.3;
        if (!t.calibrated) { t.base = t.raw; }
        const sign = (Platform.OS === 'ios' ? 1 : -1) * (invert ? -1 : 1);
        const v = (t.raw - t.base) * sign * 3.2;
        t.value = Math.abs(v) < 0.06 ? 0 : Math.max(-1, Math.min(1, v));
      });
    }
    return () => { alive.current = false; sub?.remove(); engineStop(); };
  }, [tilt, invert]);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    viewRef.current?.dispose();
    rendererRef.current?.dispose();
    viewRef.current = null;
    rendererRef.current = null;
    glRef.current = gl;
    await Promise.all([loadCarModel(carId), ...RIVAL_MODELS.map((m) => loadCarModel(m))]); // the real 3D cars (the built-in ones are used if a file cannot be read)
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientWidth: w, clientHeight: h, getContext: () => gl };
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: false });
    rendererRef.current = renderer;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; // a richer, more filmic picture

    const seed = Math.floor(Math.random() * 2_000_000_000);
    const world = makeWorld(seed, level, track, laps);
    pathRef.current = trackPath(world);
    setHud((s) => ({ ...s, laps: world.laps, lapLen: world.lapLength }));
    const view = new ApexScene(world, carId, bodyTier, style?.paint ?? paint, { ...lookFor(upgrades), style });
    view.setCameraMode(cameraMode); viewRef.current = view;
    view.resize(w, h);
    resizeRef.current = (nw, nh) => { renderer.setSize(nw, nh, false); view.resize(nw, nh); };

    const me = newRacer(world, car);
    let mePrev = snap(me);
    const inputs: number[] = [];
    const nameRng = rng(seed ^ 0x5bd1e995);
    const base = Math.max(0.1, Math.min(0.92, 0.12 + level * 0.022));
    const rivals: Rival[] = Array.from({ length: FIELD - 1 }, (_, i) => {
      const r = newRacer(world, car);
      const slot = [[-3.2, 0], [3.2, 0], [-1.6, -6], [1.6, -6], [0, -12]][i]; // a staggered grid: no two cars start on top of each other
      r.x = slot[0]; r.z = slot[1];
      return { id: i + 1, name: randomName(nameRng), r, prev: snap(r), d: newDriver(seed + 77 * (i + 1), base + (i - 2) * 0.06) };
    });

    let phase: 'count' | 'go' | 'done' = 'count';
    let countLeft = 3.2;
    let lastBeep = 4;
    let acc = 0, last = Date.now(), hudClock = 0;
    let shake = 0, flash = 0, steerNow = 0, frames = 0;
    let lapNow = 0, lapStartTick = 0, bestLap = Infinity, bannerTimer: ReturnType<typeof setTimeout> | null = null;
    const banner = (text: string) => { setHud((s) => ({ ...s, banner: text })); if (bannerTimer) clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { if (alive.current) setHud((s) => ({ ...s, banner: '' })); }, 1500); };

    const standingsNow = () => {
      const all = [{ id: 0, z: me.z, fin: me.finishedAt }, ...rivals.map((x) => ({ id: x.id, z: x.r.z, fin: x.r.finishedAt }))];
      all.sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.z - a.z));
      return all;
    };

    const finishRace = () => {
      if (finished.current) return;
      finished.current = true; phase = 'done';
      engineStop();
      // let the others finish at full speed so the table has real times
      for (let i = me.tick; i < MAX_RACE_TICKS; i++) {
        let open = false;
        for (const x of rivals) if (x.r.finishedAt === 0) { step(world, car, x.r, drive(world, car, x.r, x.d, [...rivals.filter((other) => other !== x).map((other) => other.r), me])); open = true; }
        if (!open) break;
      }
      const table: Standing[] = [{ name: 'You', ticks: me.finishedAt, you: true }, ...rivals.map((x) => ({ name: x.name, ticks: x.r.finishedAt, you: false }))];
      table.sort((a, b) => (a.ticks && b.ticks ? a.ticks - b.ticks : a.ticks ? -1 : b.ticks ? 1 : 0));
      const rank = table.findIndex((s) => s.you) + 1;
      setTimeout(() => { if (alive.current) onDoneRef.current({ level, track, laps: world.laps, bestLap: Number.isFinite(bestLap) ? bestLap : 0, seed, standings: table, rank, ticks: me.finishedAt, hits: me.hits, pedHits: me.pedHits, inputs }); }, 1600);
    };

    const advance = () => {
      let steer = 0;
      if (tilt) steer += tiltRef.current.value;
      if (keys.current.left) steer -= 1;
      if (keys.current.right) steer += 1;
      steerNow = clampSteer(steer);
      const input = { steer: steerNow, brake: keys.current.brake, nitro: keys.current.nitro };
      inputs.push(packInput(input));
      mePrev = snap(me);
      step(world, car, me, input);
      for (const x of rivals) { x.prev = snap(x.r); step(world, car, x.r, drive(world, car, x.r, x.d, [...rivals.filter((other) => other !== x).map((other) => other.r), me])); }
      collideRacers([me, ...rivals.map((x) => x.r)]);
      if (world.lapLength && me.finishedAt === 0) { // lap by lap
        const lap = Math.floor(me.z / world.lapLength);
        if (lap > lapNow) { bestLap = Math.min(bestLap, (me.tick - lapStartTick) * DT); lapStartTick = me.tick; lapNow = lap; if (lap < world.laps) { banner(lap + 1 === world.laps ? 'FINAL LAP' : `LAP ${lap + 1}`); sfx('beep'); } setHud((s) => ({ ...s, best: bestLap })); }
      }
      if (me.boost === 36) { banner('NITRO +'); sfx('nitro'); } // ran over a nitro pad
      if (me.hit) { sfx('crash'); shake = me.hit === 'ped' ? 1.6 : 1; flash = 12; }
      if (me.finishedAt > 0) finishRace();
      else if (me.tick >= MAX_RACE_TICKS) { me.finishedAt = 0; finishRace(); }
    };

    const loop = () => {
      if (!alive.current) return;
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      frames++;

      if (phase === 'count') {
        countLeft -= dt;
        const shown = Math.ceil(countLeft);
        if (shown < lastBeep && shown >= 1) { lastBeep = shown; sfx('beep'); setHud((s) => ({ ...s, count: shown })); }
        if (countLeft <= 0) { phase = 'go'; tiltRef.current.base = tiltRef.current.raw; tiltRef.current.calibrated = true; sfx('go'); engineStart(carId); setHud((s) => ({ ...s, count: 0 })); }
      } else if (phase === 'go' || phase === 'done') {
        acc += dt;
        let guard = 0;
        while (acc >= DT && guard++ < 6 && phase === 'go') { advance(); acc -= DT; }
        if (phase === 'done') acc = 0;
      }

      const alpha = phase === 'go' ? Math.min(1, acc / DT) : 1;
      const t = (me.tick + alpha) * DT;
      const lerp = (a: number, b: number) => a + (b - a) * alpha;
      const f: Frame = {
        t, speed: lerp(mePrev.v, me.v), steer: steerNow, nitroOn: me.nitroOn && phase === 'go', braking: keys.current.brake && phase === 'go',
        flash: flash > 0 ? flash : 0, shake, finished: me.finishedAt > 0,
        player: { id: 0, x: lerp(mePrev.x, me.x), z: lerp(mePrev.z, me.z) },
        others: rivals.map((x) => ({ id: x.id, x: lerp(x.prev.x, x.r.x), z: lerp(x.prev.z, x.r.z), model: RIVAL_MODELS[(x.id + seed) % RIVAL_MODELS.length] })),
        arrived: me.arrived,
      };
      if (flash > 0) flash--;
      shake = Math.max(0, shake - dt * 2.4);
      view.update(f);
      renderer.render(view.scene, view.camera);
      gl.endFrameEXP();

      if (phase === 'go' && frames % 3 === 0) {
        let near: { dist: number; speed: number; closing: number } | undefined;
        for (const x of rivals) { const dz = x.r.z - me.z, dist = Math.hypot(dz, x.r.x - me.x); if (!near || dist < near.dist) near = { dist, speed: x.r.v, closing: dz > 0 ? me.v - x.r.v : x.r.v - me.v }; }
        engineUpdate({ speed: me.v, braking: keys.current.brake, boost: me.nitroOn || me.boost > 0, slip: Math.abs(steerNow) * me.v * 0.1 + Math.abs(driftAt(world, me.z, me.v)) + (keys.current.brake && me.v > 22 ? 6 : 0), rival: near });
      }
      hudClock += dt;
      if (hudClock > 0.12) {
        hudClock = 0;
        const order = standingsNow();
        const pos = order.findIndex((o) => o.id === 0);
        const ahead = pos > 0 ? order[pos - 1] : null;
        const aheadRival = ahead ? rivals.find((x) => x.id === ahead.id) : null;
        setHud((s) => ({
          ...s, speed: Math.round(me.v * 3.6), rank: pos + 1, ahead: aheadRival ? aheadRival.name : '', gap: aheadRival ? Math.max(0, Math.round(aheadRival.r.z - me.z)) : 0,
          progress: Math.min(1, me.z / world.length), nitro: me.nitro / car.nitroSeconds, time: me.tick * DT, hits: me.hits,
          rivals: rivals.map((x) => Math.min(1, x.r.z / world.length)), over: me.finishedAt > 0,
          lap: Math.min(world.laps, Math.floor(Math.max(0, me.z) / (world.lapLength || world.length)) + 1),
          dots: [...rivals.map((x) => ({ z: x.r.z, color: '#9aa3c7', r: 3.5 })), { z: me.z, color: '#ff5a1f', r: 6 }],
        }));

      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  useEffect(() => { viewRef.current?.setCameraMode(cameraMode); }, [cameraMode]);

  const press = (k: 'left' | 'right' | 'brake' | 'nitro', down: boolean) => { keys.current[k] = down; };
  const btn = (k: 'left' | 'right' | 'brake' | 'nitro', label: string, style: object) => (
    <Pressable onPressIn={() => press(k, true)} onPressOut={() => press(k, false)} style={({ pressed }) => [{ alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: pressed ? 'rgba(124,92,255,.85)' : 'rgba(10,14,30,.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' }, style]}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: k === 'left' || k === 'right' ? 34 : 15 }}>{label}</Text>
    </Pressable>
  );
  const m = Math.floor(hud.time / 60), s = (hud.time % 60).toFixed(2).padStart(5, '0');
  const hudAheadShown = !!hud.ahead && !hud.over;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {ready ? <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} onLayout={() => { const g: any = glRef.current; if (g && resizeRef.current) setTimeout(() => resizeRef.current?.(g.drawingBufferWidth ?? 0, g.drawingBufferHeight ?? 0), 50); }} /> : null}

      {/* top left: position, lap and time (like the circuit page) */}
      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: Math.max(insets.left, 14) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, backgroundColor: 'rgba(10,13,22,.76)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#ff5a1f', fontSize: wide ? 40 : 34, fontWeight: '900', fontStyle: 'italic', lineHeight: wide ? 42 : 36 }}>{hud.rank}<Text style={{ fontSize: 16, color: '#9aa3b8', fontStyle: 'normal' }}>/{FIELD}</Text></Text>
          <View><Text style={hudLabel}>{hud.lapLen ? 'LAP' : 'ROAD'}</Text><Text style={hudNum}>{hud.lapLen ? `${hud.lap}/${hud.laps}` : `${Math.round(hud.progress * 100)}%`}</Text></View>
          <View><Text style={hudLabel}>TIME</Text><Text style={hudNum}>{m}:{s}</Text>{hud.lapLen ? <Text style={[hudLabel, { marginTop: 1 }]}>BEST {hud.best > 0 ? `${Math.floor(hud.best / 60)}:${(hud.best % 60).toFixed(2).padStart(5, '0')}` : '—'}</Text> : null}</View>
        </View>
        {hud.ahead && !hud.over ? <Text style={{ color: '#fff', marginTop: 6, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 }}>▲ {hud.ahead}  +{hud.gap} m</Text> : null}
      </View>

      {/* top right: the minimap */}
      {pathRef.current ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, right: Math.max(insets.right, 14), backgroundColor: 'rgba(10,13,22,.76)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', padding: 4 }}>
          <MiniMap path={pathRef.current} dots={hud.dots} size={wide ? 112 : 92} />
        </View>
      ) : null}

      {hud.count > 0 ? <View pointerEvents="none" style={{ position: 'absolute', top: wide ? '10%' : '30%', left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: wide ? 96 : 120, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 12 }}>{hud.count}</Text></View> : null}
      {hud.banner && !hud.over && hud.count === 0 ? <View pointerEvents="none" style={{ position: 'absolute', top: wide ? '16%' : '28%', left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: wide ? 56 : 48, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 14 }}>{hud.banner}</Text></View> : null}
      {hud.over ? <View pointerEvents="none" style={{ position: 'absolute', top: '26%', left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: 60, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#000', textShadowRadius: 14 }}>FINISH</Text></View> : null}

      {/* speed and nitro */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + (wide ? 12 : 148), alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: wide ? 58 : 50, fontWeight: '900', fontStyle: 'italic', lineHeight: wide ? 60 : 52, textShadowColor: '#000', textShadowRadius: 10 }}>{hud.speed}</Text>
        <Text style={[hudLabel, { letterSpacing: 3, marginBottom: 6 }]}>KM/H</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: hud.nitro < 0.25 ? '#ff5a5a' : '#3de0ff', fontSize: 11, fontWeight: '900', letterSpacing: 3 }}>⚡ NITRO</Text>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{Math.round(hud.nitro * 100)}%</Text>
        </View>
        <View style={{ width: wide ? 240 : 190, height: 14, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: hud.nitro < 0.25 ? '#ff5a5a' : 'rgba(61,224,255,.6)', marginTop: 4, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(hud.nitro * 100)}%`, height: 14, backgroundColor: hud.nitro < 0.25 ? '#ff5a5a' : '#3de0ff' }} />
        </View>
      </View>

      {/* controls */}
      {wide ? (
        <>
          <View style={{ position: 'absolute', left: Math.max(insets.left, 14), bottom: insets.bottom + 12, height: 92, width: 250, flexDirection: 'row', gap: 10 }}>
            {btn('left', '◀', { flex: 1 })}
            {btn('right', '▶', { flex: 1 })}
          </View>
          <View style={{ position: 'absolute', right: Math.max(insets.right, 14), bottom: insets.bottom + 12, height: 92, width: 250, flexDirection: 'row', gap: 10 }}>
            {btn('brake', '■ BRAKE', { flex: 1 })}
            {btn('nitro', '⚡ NITRO', { flex: 1 })}
          </View>
        </>
      ) : (
        <View style={{ position: 'absolute', left: 10, right: 10, bottom: insets.bottom + 10, height: 128, flexDirection: 'row', gap: 10 }}>
          {btn('left', '◀', { flex: 1.3 })}
          <View style={{ flex: 1, gap: 10 }}>
            {btn('nitro', '⚡ NITRO', { flex: 1 })}
            {btn('brake', '■ BRAKE', { flex: 1 })}
          </View>
          {btn('right', '▶', { flex: 1.3 })}
        </View>
      )}
      <Pressable onPress={() => setCameraMode((m) => m === 'chase' ? 'cockpit' : 'chase')} style={{ position: 'absolute', top: insets.top + (wide ? 92 : 92) + (hudAheadShown ? 22 : 0), left: Math.max(insets.left, 14), backgroundColor: 'rgba(10,14,30,.72)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(94,194,255,.6)' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{cameraMode === 'chase' ? '▣ Chase view' : '◉ Cockpit view'}</Text>
      </Pressable>
      {tilt && onFlip ? (
        <Pressable onPress={onFlip} style={{ position: 'absolute', top: insets.top + (wide ? 130 : 110), right: Math.max(insets.right, 14), backgroundColor: 'rgba(10,14,30,.6)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>⇄ Flip tilt</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
