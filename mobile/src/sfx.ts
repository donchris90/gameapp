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
const QUIET: Sound[] = ['drop', 'tap', 'pour', 'dice_roll', 'beep', 'go', 'nitro', 'engine', 'blowoff', 'pop'];

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
 * with a turbo whistle, wind, tyre squeal, a nitro whoosh, and the nearest rival's engine with a doppler shift as it passes.
 * Safe to call in any state: if audio is unavailable nothing happens.
 */
const LOOP_FILES = {
  lo: require('../assets/sfx/engine_lo.wav'), hi: require('../assets/sfx/engine_hi.wav'), rival: require('../assets/sfx/engine_hi.wav'),
  wind: require('../assets/sfx/wind.wav'), squeal: require('../assets/sfx/squeal.wav'), whoosh: require('../assets/sfx/whoosh.wav'), turbo: require('../assets/sfx/turbo.wav'),
};
type Loop = keyof typeof LOOP_FILES;
const loops: Partial<Record<Loop, AudioPlayer>> = {};
const TOPS = [0, 14, 25, 36, 47, 58, 95]; // top speed of each gear, in m/s
const box = { gear: 1, shift: 0, rpm: 1500, lastThr: 1, last: 0, rGear: 1, rShift: 0, rRpm: 1500, live: false };

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
    if (rate !== undefined) (p as any).playbackRate = Math.max(0.5, Math.min(2, rate));
  } catch { /* not supported */ }
}
function rpmOf(speed: number, thr: number, dt: number, rival = false): number {
  let g = 1; while (g < 6 && speed > TOPS[g]) g++;
  const gear = rival ? box.rGear : box.gear;
  if (g !== gear) { if (g > gear) { if (rival) box.rShift = 0.13; else box.shift = 0.13; } if (rival) box.rGear = g; else box.gear = g; }
  let target = 1800 + Math.min(1, speed / TOPS[g]) * 6400;
  if (thr < 0.3) target -= 500;
  if (speed < 3 && thr > 0.5) target = 5600; // revving on the line
  const cur = rival ? box.rRpm : box.rpm, next = cur + (target - cur) * Math.min(1, dt * (thr > 0.5 ? 9 : 4));
  if (rival) { box.rRpm = next; box.rShift = Math.max(0, box.rShift - dt); } else { box.rpm = next; box.shift = Math.max(0, box.shift - dt); }
  return Math.max(1200, next);
}

export function engineStart() {
  if (!enabled) return;
  try {
    (Object.keys(LOOP_FILES) as Loop[]).forEach((n) => { const p = loopOf(n); void p.seekTo(0); p.play(); });
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
  const rpm = rpmOf(i.speed, thr, dt), cut = box.shift > 0 ? 0.35 : 1;
  const mix = Math.max(0, Math.min(1, (rpm - 3600) / 1400)), base = (0.3 + 0.32 * thr) * cut;
  setLoop('lo', base * (1 - mix), rpm / 2500);
  setLoop('hi', base * mix, rpm / 6000);
  const k = Math.min(1, i.speed / 90);
  setLoop('wind', 0.03 + k * k * 0.55, 0.8 + k * 0.5);
  setLoop('squeal', i.speed > 14 ? Math.max(0, Math.min(1, (i.slip - 4.5) / 9)) * 0.32 : 0, 0.9 + Math.min(0.5, i.slip * 0.03));
  setLoop('whoosh', i.boost ? 0.4 : 0);
  setLoop('turbo', thr > 0.5 && rpm > 3500 ? 0.06 * (rpm / 8000) : 0, 0.7 + (rpm / 8000) * 0.9);
  if (box.lastThr > 0.6 && thr < 0.4 && i.speed > 30) { sfx('blowoff'); setTimeout(() => sfx('pop'), 90); setTimeout(() => sfx('pop'), 210); }
  box.lastThr = thr;
  if (i.rival && i.rival.dist < 90) {
    const dop = 1 + Math.max(-0.18, Math.min(0.18, i.rival.closing / 343 * 3));
    setLoop('rival', Math.pow(1 - i.rival.dist / 90, 1.6) * 0.32, (rpmOf(i.rival.speed, 0.8, dt, true) / 6000) * dop);
  } else setLoop('rival', 0);
}
export function engineStop() { box.live = false; (Object.keys(loops) as Loop[]).forEach((n) => { try { loops[n]?.pause(); } catch { /* ignore */ } }); }
