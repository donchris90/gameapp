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
const QUIET: Sound[] = ['drop', 'tap', 'pour', 'dice_roll', 'beep', 'go', 'nitro', 'engine'];

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

/** The engine hum for Apex Run: loops, and pitch follows the speed. Safe to call in any state. */
let engine: AudioPlayer | null = null;
export function engineStart() {
  if (!enabled) return;
  try {
    engine ??= createAudioPlayer(FILES.engine);
    engine.loop = true; engine.volume = 0.5;
    engine.play();
  } catch { /* no audio */ }
}
export function engineSpeed(kmh: number) {
  try { if (engine) (engine as any).playbackRate = 0.75 + Math.min(1.1, kmh / 220); } catch { /* not supported */ }
}
export function engineStop() { try { engine?.pause(); } catch { /* ignore */ } }
