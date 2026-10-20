import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';

const FILES = {
  move: require('../assets/sfx/move.wav'),
  turn: require('../assets/sfx/turn.wav'),
  win: require('../assets/sfx/win.wav'),
  lose: require('../assets/sfx/lose.wav'),
  draw: require('../assets/sfx/draw.wav'),
  drop: require('../assets/sfx/drop.wav'),
  tap: require('../assets/sfx/tap.wav'),
  pack: require('../assets/sfx/pack.wav'),
  dice_roll: require('../assets/sfx/dice_roll.wav'),
  dice_land: require('../assets/sfx/dice_land.wav'),
  pour: require('../assets/sfx/pour.wav'),
  complete: require('../assets/sfx/complete.wav'),
  nomoves: require('../assets/sfx/nomoves.wav'),
  capture: require('../assets/sfx/capture.wav'),
  round: require('../assets/sfx/round.wav'),
  crash: require('../assets/sfx/crash.wav'),
  beep: require('../assets/sfx/beep.wav'),
  go: require('../assets/sfx/go.wav'),
  nitro: require('../assets/sfx/nitro.wav'),
  engine: require('../assets/sfx/engine.wav'),
  blowoff: require('../assets/sfx/blowoff.wav'),
  pop: require('../assets/sfx/pop.wav'),
  shift: require('../assets/sfx/shift.wav'),
};
export type Sound = keyof typeof FILES;

const KEY = 'sfx_on';
let enabled = true;
const players: Partial<Record<Sound, AudioPlayer>> = {};

export const soundOn = () => enabled;
const listeners = new Set<(on: boolean) => void>();
export const onSoundChange = (fn: (on: boolean) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export async function loadSoundSetting() {
  try { enabled = (await SecureStore.getItemAsync(KEY)) !== '0'; } catch { /* default on */ }
}
export async function setSoundOn(on: boolean) {
  enabled = on;
  listeners.forEach((f) => f(on));
  try { await SecureStore.setItemAsync(KEY, on ? '1' : '0'); } catch { /* not saved, still applies now */ }
}

/** Play a short effect and buzz. Never throws: a missing audio device must not break a game. */
/** Sounds that play many times a second must not buzz the phone each time. */
const QUIET: Sound[] = ['drop', 'tap', 'pour', 'dice_roll', 'beep', 'go', 'nitro', 'engine', 'blowoff', 'pop', 'shift'];

export function sfx(name: Sound) {
  if (!enabled) return;
  try {
    const p = (players[name] ??= createAudioPlayer(FILES[name]));
    void p.seekTo(0);
    p.play();
    if (name === 'win') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (name === 'lose') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (!QUIET.includes(name)) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* ignore */ }
}

/**
 * The Apex Run engine: a V8 made of looping samples whose pitch follows a gearbox (six gears, revs that climb and drop at each shift),
 * with wind, tyre squeal, a nitro whoosh, and the nearest rival's engine with a doppler shift as it passes.
 * Safe to call in any state: if audio is unavailable nothing happens.
 */
// Every car has its own engine: a supercharged V8, a flat-six, an electric whine, and two W16s. Five loops each, at rising revs.
const ENGINE_SETS: Record<string, number[]> = {
  cts: [require('../assets/sfx/engine_cts_1.wav'), require('../assets/sfx/engine_cts_2.wav'), require('../assets/sfx/engine_cts_3.wav'), require('../assets/sfx/engine_cts_4.wav'), require('../assets/sfx/engine_cts_5.wav')],
  gt3: [require('../assets/sfx/engine_gt3_1.wav'), require('../assets/sfx/engine_gt3_2.wav'), require('../assets/sfx/engine_gt3_3.wav'), require('../assets/sfx/engine_gt3_4.wav'), require('../assets/sfx/engine_gt3_5.wav')],
  one1: [require('../assets/sfx/engine_one1_1.wav'), require('../assets/sfx/engine_one1_2.wav'), require('../assets/sfx/engine_one1_3.wav'), require('../assets/sfx/engine_one1_4.wav'), require('../assets/sfx/engine_one1_5.wav')],
  chiron: [require('../assets/sfx/engine_chiron_1.wav'), require('../assets/sfx/engine_chiron_2.wav'), require('../assets/sfx/engine_chiron_3.wav'), require('../assets/sfx/engine_chiron_4.wav'), require('../assets/sfx/engine_chiron_5.wav')],
  mansory: [require('../assets/sfx/engine_mansory_1.wav'), require('../assets/sfx/engine_mansory_2.wav'), require('../assets/sfx/engine_mansory_3.wav'), require('../assets/sfx/engine_mansory_4.wav'), require('../assets/sfx/engine_mansory_5.wav')],
};
const LOOP_FILES = {
  e1: ENGINE_SETS.cts[0], e2: ENGINE_SETS.cts[1], e3: ENGINE_SETS.cts[2], e4: ENGINE_SETS.cts[3], e5: ENGINE_SETS.cts[4],
  rival: ENGINE_SETS.cts[2],
  wind: require('../assets/sfx/wind.wav'), squeal: require('../assets/sfx/squeal.wav'), whoosh: require('../assets/sfx/whoosh.wav'),
};
const ENGINE_AT = [1800, 3200, 5000, 6800, 8600]; // the revs each engine loop was recorded at
type Loop = keyof typeof LOOP_FILES;
const loops: Partial<Record<Loop, AudioPlayer>> = {};
const lastRate: Partial<Record<Loop, number>> = {};
const TOPS = [0, 14, 25, 36, 47, 58, 95]; // top speed of each gear, in m/s
type EngineProfile = { idle: number; redline: number; launch: number; pitch: number; volume: number };
const ENGINE_PROFILES: Record<string, EngineProfile> = {
  cts: { idle: 1050, redline: 6500, launch: 5000, pitch: 0.92, volume: 0.94 },
  gt3: { idle: 1550, redline: 7900, launch: 6100, pitch: 1.04, volume: 0.9 },
  one1: { idle: 1350, redline: 8500, launch: 6500, pitch: 1.1, volume: 0.88 },
  chiron: { idle: 950, redline: 6800, launch: 5400, pitch: 0.98, volume: 1 },
  mansory: { idle: 1050, redline: 7200, launch: 5800, pitch: 1.02, volume: 1 },
};
const DEFAULT_PROFILE: EngineProfile = { idle: 1200, redline: 7600, launch: 5600, pitch: 1, volume: 0.95 };
const box = { gear: 1, shift: 0, rpm: 1500, lastThr: 1, last: 0, rGear: 1, rShift: 0, rRpm: 1500, live: false, profile: DEFAULT_PROFILE, car: '' };

function loopOf(name: Loop): AudioPlayer {
  let p = loops[name];
  if (!p) {
    p = createAudioPlayer(LOOP_FILES[name]);
    p.loop = true; p.volume = 0;
    try { (p as any).shouldCorrectPitch = false; } catch { /* default */ }
    loops[name] = p;
  }
  return p;
}
function setLoop(name: Loop, volume: number, rate?: number) {
  const p = loops[name]; if (!p) return;
  try {
    p.volume = Math.max(0, Math.min(1, volume));
    if (rate !== undefined) {
      // On Android `playbackRate` is read-only, so assigning it changes nothing and the engine pitch never follows the car.
      // setPlaybackRate() is the call that works on both platforms. Skip tiny changes: each call is a message to the audio thread.
      const r = Math.max(0.5, Math.min(2, rate));
      if (Math.abs(r - (lastRate[name] ?? 0)) > 0.008) {
        lastRate[name] = r;
        if (typeof (p as any).setPlaybackRate === 'function') (p as any).setPlaybackRate(r);
        else (p as any).playbackRate = r;
      }
    }
  } catch { /* not supported */ }
}
function rpmOf(speed: number, thr: number, dt: number, rival = false): number {
  let g = 1; while (g < 6 && speed > TOPS[g]) g++;
  const gear = rival ? box.rGear : box.gear;
  if (g !== gear) { if (g > gear) { if (rival) box.rShift = 0.13; else box.shift = 0.13; } if (rival) box.rGear = g; else box.gear = g; }
  const profile = rival ? DEFAULT_PROFILE : box.profile;
  let target = profile.idle + Math.min(1, speed / TOPS[g]) * (profile.redline - profile.idle);
  if (thr < 0.3) target -= 420;
  if (speed < 3 && thr > 0.5) target = profile.launch; // controlled launch revs
  const cur = rival ? box.rRpm : box.rpm, next = cur + (target - cur) * Math.min(1, dt * (thr > 0.5 ? 9 : 4));
  if (rival) { box.rRpm = next; box.rShift = Math.max(0, box.rShift - dt); } else { box.rpm = next; box.shift = Math.max(0, box.shift - dt); }
  return Math.max(1200, next);
}

export function engineStart(carId = 'gt3') {
  if (!enabled) return;
  box.profile = ENGINE_PROFILES[carId] ?? DEFAULT_PROFILE;
  try {
    const set = ENGINE_SETS[carId] ?? ENGINE_SETS.cts;
    (Object.keys(LOOP_FILES) as Loop[]).forEach((n) => {
      const p = loopOf(n);
      const j = ['e1', 'e2', 'e3', 'e4', 'e5'].indexOf(n);
      if (j >= 0 && box.car !== carId) { try { p.replace(set[j]); p.loop = true; (p as any).shouldCorrectPitch = false; delete lastRate[n]; } catch { /* keep the old sound */ } }
      void p.seekTo(0); p.play();
    });
    box.car = carId;
    Object.assign(box, { gear: 1, shift: 0, rpm: 1500, lastThr: 1, last: Date.now(), rGear: 1, rShift: 0, rRpm: 1500, live: true });
  } catch { /* no audio */ }
}
export interface EngineIn {
  speed: number; // m/s
  braking: boolean;
  boost: boolean; // nitro or a pad
  slip: number; // how hard the tyres are working, about 0 to 15
  rival?: { dist: number; speed: number; closing: number }; // the nearest rival, metres and m/s (closing > 0 when getting nearer)
}
export function engineUpdate(i: EngineIn) {
  if (!box.live || !enabled) return;
  const now = Date.now(), dt = Math.min(0.25, Math.max(0.01, (now - box.last) / 1000)); box.last = now;
  const thr = i.braking ? 0 : 1;
  const previousGear = box.gear;
  const rpm = rpmOf(i.speed, thr, dt), cut = box.shift > 0 ? 0.32 : 1;
  if (box.gear > previousGear) sfx('shift');
  const base = (0.38 + 0.34 * thr) * cut * box.profile.volume;
  // One loop at a time, with a short crossfade only in the middle of the gap between two loops. Two loops sounding together at slightly
  // different pitches beat against each other and turn into noise, so they overlap as little as possible (equal-power so there is no dip).
  let lower = 0, upper = 0, mix = 0;
  if (rpm <= ENGINE_AT[0]) { lower = upper = 0; }
  else if (rpm >= ENGINE_AT[ENGINE_AT.length - 1]) { lower = upper = ENGINE_AT.length - 1; }
  else {
    for (let j = 0; j < ENGINE_AT.length - 1; j++) if (rpm >= ENGINE_AT[j] && rpm <= ENGINE_AT[j + 1]) {
      lower = j; upper = j + 1; mix = Math.max(0, Math.min(1, ((rpm - ENGINE_AT[j]) / (ENGINE_AT[j + 1] - ENGINE_AT[j]) - 0.35) / 0.3)); break;
    }
  }
  ENGINE_AT.forEach((at, j) => {
    const w = lower === upper ? (j === lower ? 1 : 0) : (j === lower ? Math.cos(mix * Math.PI / 2) : j === upper ? Math.sin(mix * Math.PI / 2) : 0);
    setLoop(`e${j + 1}` as Loop, base * w, (rpm / at) * box.profile.pitch);
  });
  const k = Math.min(1, i.speed / 90);
  setLoop('wind', 0.025 + k * k * 0.46, 0.82 + k * 0.42);
  setLoop('squeal', i.speed > 14 ? Math.max(0, Math.min(1, (i.slip - 4.5) / 9)) * 0.32 : 0, 0.9 + Math.min(0.5, i.slip * 0.03));
  setLoop('whoosh', i.boost ? 0.4 : 0);
  if (box.lastThr > 0.6 && thr < 0.4 && i.speed > 30) { sfx('blowoff'); setTimeout(() => sfx('pop'), 100); }
  box.lastThr = thr;
  if (i.rival && i.rival.dist < 90) {
    const dop = 1 + Math.max(-0.18, Math.min(0.18, i.rival.closing / 343 * 3));
    setLoop('rival', Math.pow(1 - i.rival.dist / 90, 1.6) * 0.45, (rpmOf(i.rival.speed, 0.8, dt, true) / 4800) * dop);
  } else setLoop('rival', 0);
}
export function engineStop() { box.live = false; (Object.keys(lastRate) as Loop[]).forEach((n) => { delete lastRate[n]; }); (Object.keys(loops) as Loop[]).forEach((n) => { try { loops[n]?.pause(); } catch { /* ignore */ } }); }
