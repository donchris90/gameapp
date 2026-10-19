import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';

const FILES = {
  move: require('../assets/sfx/move.wav'),
  turn: require('../assets/sfx/turn.wav'),
  win: require('../assets/sfx/win.wav'),
  lose: require('../assets/sfx/lose.wav'),
  draw: require('../assets/sfx/draw.wav'),
};
export type Sound = keyof typeof FILES;

const KEY = 'sfx_on';
let enabled = true;
const players: Partial<Record<Sound, AudioPlayer>> = {};

export const soundOn = () => enabled;
export async function loadSoundSetting() {
  try { enabled = (await SecureStore.getItemAsync(KEY)) !== '0'; } catch { /* default on */ }
}
export async function setSoundOn(on: boolean) {
  enabled = on;
  try { await SecureStore.setItemAsync(KEY, on ? '1' : '0'); } catch { /* not saved, still applies now */ }
}

/** Play a short effect and buzz. Never throws: a missing audio device must not break a game. */
export function sfx(name: Sound) {
  if (!enabled) return;
  try {
    const p = (players[name] ??= createAudioPlayer(FILES[name]));
    void p.seekTo(0);
    p.play();
    if (name === 'win') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (name === 'lose') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* ignore */ }
}
