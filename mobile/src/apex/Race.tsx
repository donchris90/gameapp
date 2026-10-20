import { Accelerometer } from 'expo-sensors';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';
import { engineSpeed, engineStart, engineStop, sfx } from '../sfx';
import { colors } from '../ui';
import { drive, newDriver } from './bot';
import { randomName } from './names';
import { ApexScene, Frame } from './scene';
import { CARS, DT, MAX_RACE_TICKS, Racer, clampSteer, makeWorld, newRacer, packInput, rng, step } from './sim';

export interface Standing { name: string; ticks: number; you: boolean }
export interface RaceResult { level: number; seed: number; standings: Standing[]; rank: number; ticks: number; hits: number; pedHits: number; inputs: number[] }

const FIELD = 6; // you and five computer drivers
const CAR = CARS.luxury;
const snap = (r: Racer) => ({ x: r.x, z: r.z, v: r.v });

interface Rival { id: number; name: string; r: Racer; prev: { x: number; z: number; v: number }; d: ReturnType<typeof newDriver> }

/**
 * The race: a 3D view, the rules from sim.ts running 30 times a second (drawing is smoothed in between),
 * tilt and button steering, the countdown, the HUD and the finish.
 */
export function Race({ level, tilt, invert, onDone }: { level: number; tilt: boolean; invert: boolean; onDone: (r: RaceResult) => void }) {
  const insets = useSafeAreaInsets();
  const keys = useRef({ left: false, right: false, brake: false, nitro: false });
  const tiltRef = useRef({ raw: 0, base: 0, value: 0, calibrated: false });
  const alive = useRef(true);
  const finished = useRef(false);
  const [hud, setHud] = useState({ count: 3, speed: 0, rank: 1, ahead: '', gap: 0, progress: 0, nitro: 1, time: 0, hits: 0, rivals: [] as number[], over: false });
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone;

  useEffect(() => {
    alive.current = true;
    let sub: { remove: () => void } | null = null;
    if (tilt) {
      Accelerometer.setUpdateInterval(16);
      sub = Accelerometer.addListener(({ x }) => {
        const t = tiltRef.current;
        t.raw = t.raw * 0.7 + x * 0.3;
        if (!t.calibrated) { t.base = t.raw; }
        const sign = (Platform.OS === 'ios' ? 1 : -1) * (invert ? -1 : 1);
        const v = (t.raw - t.base) * sign * 3.2;
        t.value = Math.abs(v) < 0.06 ? 0 : Math.max(-1, Math.min(1, v));
      });
    }
    return () => { alive.current = false; sub?.remove(); engineStop(); };
  }, [tilt, invert]);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas: any = { width: w, height: h, style: {}, addEventListener: () => undefined, removeEventListener: () => undefined, clientWidth: w, clientHeight: h, getContext: () => gl };
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);

    const seed = Math.floor(Math.random() * 2_000_000_000);
    const world = makeWorld(seed, level);
    const view = new ApexScene(world);
    view.resize(w, h);

    const me = newRacer(world, CAR);
    let mePrev = snap(me);
    const inputs: number[] = [];
    const nameRng = rng(seed ^ 0x5bd1e995);
    const base = Math.max(0.1, Math.min(0.92, 0.12 + level * 0.022));
    const rivals: Rival[] = Array.from({ length: FIELD - 1 }, (_, i) => {
      const r = newRacer(world, CAR);
      r.x = ((i % 3) - 1) * 3.2 + 1.6 - (i >= 3 ? 1.6 : 0); // a grid, not one stack
      return { id: i + 1, name: randomName(nameRng), r, prev: snap(r), d: newDriver(seed + 77 * (i + 1), base + (i - 2) * 0.06) };
    });

    let phase: 'count' | 'go' | 'done' = 'count';
    let countLeft = 3.2;
    let lastBeep = 4;
    let acc = 0, last = Date.now(), hudClock = 0;
    let shake = 0, flash = 0, steerNow = 0, frames = 0;

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
        for (const x of rivals) if (x.r.finishedAt === 0) { step(world, CAR, x.r, drive(world, CAR, x.r, x.d)); open = true; }
        if (!open) break;
      }
      const table: Standing[] = [{ name: 'You', ticks: me.finishedAt, you: true }, ...rivals.map((x) => ({ name: x.name, ticks: x.r.finishedAt, you: false }))];
      table.sort((a, b) => (a.ticks && b.ticks ? a.ticks - b.ticks : a.ticks ? -1 : b.ticks ? 1 : 0));
      const rank = table.findIndex((s) => s.you) + 1;
      setTimeout(() => { if (alive.current) onDoneRef.current({ level, seed, standings: table, rank, ticks: me.finishedAt, hits: me.hits, pedHits: me.pedHits, inputs }); }, 1600);
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
      step(world, CAR, me, input);
      for (const x of rivals) { x.prev = snap(x.r); step(world, CAR, x.r, drive(world, CAR, x.r, x.d)); }
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
        if (countLeft <= 0) { phase = 'go'; tiltRef.current.base = tiltRef.current.raw; tiltRef.current.calibrated = true; sfx('go'); engineStart(); setHud((s) => ({ ...s, count: 0 })); }
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
        others: rivals.map((x) => ({ id: x.id, x: lerp(x.prev.x, x.r.x), z: lerp(x.prev.z, x.r.z) })),
        arrived: me.arrived,
      };
      if (flash > 0) flash--;
      shake = Math.max(0, shake - dt * 2.4);
      view.update(f);
      renderer.render(view.scene, view.camera);
      gl.endFrameEXP();

      hudClock += dt;
      if (hudClock > 0.12) {
        hudClock = 0;
        const order = standingsNow();
        const pos = order.findIndex((o) => o.id === 0);
        const ahead = pos > 0 ? order[pos - 1] : null;
        const aheadRival = ahead ? rivals.find((x) => x.id === ahead.id) : null;
        setHud((s) => ({
          ...s, speed: Math.round(me.v * 3.6), rank: pos + 1, ahead: aheadRival ? aheadRival.name : '', gap: aheadRival ? Math.max(0, Math.round(aheadRival.r.z - me.z)) : 0,
          progress: Math.min(1, me.z / world.length), nitro: me.nitro / CAR.nitroSeconds, time: me.tick * DT, hits: me.hits,
          rivals: rivals.map((x) => Math.min(1, x.r.z / world.length)), over: me.finishedAt > 0,
        }));
        if (frames % 3 === 0) engineSpeed(me.v * 3.6);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const press = (k: 'left' | 'right' | 'brake' | 'nitro', down: boolean) => { keys.current[k] = down; };
  const btn = (k: 'left' | 'right' | 'brake' | 'nitro', label: string, style: object) => (
    <Pressable onPressIn={() => press(k, true)} onPressOut={() => press(k, false)} style={({ pressed }) => [{ alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: pressed ? 'rgba(124,92,255,.85)' : 'rgba(10,14,30,.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' }, style]}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: k === 'left' || k === 'right' ? 34 : 15 }}>{label}</Text>
    </Pressable>
  );
  const m = Math.floor(hud.time / 60), s = (hud.time % 60).toFixed(1).padStart(4, '0');

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />

      {/* top bar */}
      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(10,14,30,.6)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{hud.rank}<Text style={{ fontSize: 14, color: colors.dim }}>/{FIELD}</Text></Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, textShadowColor: '#000', textShadowRadius: 4 }}>{m}:{s}</Text>
          <View style={{ backgroundColor: 'rgba(10,14,30,.6)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: colors.gold, fontWeight: '900' }}>LVL {level}</Text>
          </View>
        </View>
        {/* progress along the road, with the rivals as dots */}
        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.2)', marginTop: 10 }}>
          {hud.rivals.map((p, i) => <View key={i} style={{ position: 'absolute', left: `${p * 96}%`, top: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#9aa3c7' }} />)}
          <View style={{ position: 'absolute', left: `${hud.progress * 96}%`, top: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' }} />
        </View>
        {hud.ahead && !hud.over ? <Text style={{ color: '#fff', marginTop: 8, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 }}>▲ {hud.ahead}  +{hud.gap} m</Text> : null}
      </View>

      {hud.count > 0 ? <View pointerEvents="none" style={{ position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: 120, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 10 }}>{hud.count}</Text></View> : null}
      {hud.over ? <View pointerEvents="none" style={{ position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' }}><Text style={{ color: colors.gold, fontSize: 56, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 10 }}>FINISH!</Text></View> : null}

      {/* speed and nitro */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 148, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 }}>{hud.speed}<Text style={{ fontSize: 14 }}> km/h</Text></Text>
        <View style={{ width: 140, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.25)', marginTop: 4 }}><View style={{ width: `${Math.round(hud.nitro * 100)}%`, height: 7, borderRadius: 4, backgroundColor: '#5ec2ff' }} /></View>
      </View>

      {/* controls */}
      <View style={{ position: 'absolute', left: 10, right: 10, bottom: insets.bottom + 10, height: 128, flexDirection: 'row', gap: 10 }}>
        {btn('left', '◀', { flex: 1.3 })}
        <View style={{ flex: 1, gap: 10 }}>
          {btn('nitro', '⚡ NITRO', { flex: 1 })}
          {btn('brake', '■ BRAKE', { flex: 1 })}
        </View>
        {btn('right', '▶', { flex: 1.3 })}
      </View>
    </View>
  );
}
