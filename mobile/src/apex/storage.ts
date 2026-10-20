import * as SecureStore from 'expo-secure-store';
import { CarStyle, cleanStyle } from './style';

export interface ApexSettings {
  tilt: boolean;
  invert: boolean;
  unlocked: number;
  coins: number;
  activeCar: string;
  unlockedCars: string[];
  paint: number;
  bodyTier: number;
  completedRaces: number;
  careerXP: number;
  podiums: number;
  cleanRaces: number;
  bestLaps: Record<string, number>;
  processedRaceKeys: string[]; // prevents a result callback from crediting the same local race twice
  track: string; // the track the next race runs on
  laps: number; // laps on the circuit
  roadLaps: number; // laps (rounds) on every other track: the level's road is split into this many equal laps
  upgrades: Record<string, number[]>; // per car: engine, turbo, tyres, nitro levels
  autoGas: boolean; // the throttle is held for you (on by default); off shows a GAS pedal
  quality: number; // 0 Low, 1 Medium, 2 High
  styles: Record<string, CarStyle>; // per car: how it looks (finish, colours, rims, tint, lights, ride height); saved under its own key
}
const KEY = 'apex.settings';
const STYLE_KEY = 'apex.styles'; // kept apart so a growing wardrobe never pushes the main settings over the secure store's size limit
const TRACK_IDS = ['circuit', 'coast', 'dunes', 'city', 'pass'];
const KNOWN = ['cts', 'gt3', 'one1', 'chiron', 'mansory', 'senna'];
const DEFAULTS: ApexSettings = {
  tilt: true, invert: false, unlocked: 1, coins: 0,
  activeCar: 'cts', unlockedCars: ['cts'], paint: 0x2788ff,
  bodyTier: 0, completedRaces: 0, careerXP: 0, podiums: 0, cleanRaces: 0, bestLaps: {}, processedRaceKeys: [], upgrades: {}, track: 'circuit', laps: 3, roadLaps: 1, autoGas: true, quality: 2, styles: {},
};

export async function loadApex(): Promise<ApexSettings> {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}');
    let savedStyles: Record<string, unknown> = {};
    try { savedStyles = JSON.parse((await SecureStore.getItemAsync(STYLE_KEY)) ?? '{}') ?? {}; } catch { savedStyles = {}; }
    return {
      ...DEFAULTS,
      ...saved,
      // cars from the very first build (starter, sport...) are gone: keep only cars that exist, and always own the first
      unlockedCars: Array.from(new Set(['cts', ...(Array.isArray(saved.unlockedCars) ? saved.unlockedCars : []).filter((id: string) => KNOWN.includes(id))])),
      activeCar: typeof saved.activeCar === 'string' && KNOWN.includes(saved.activeCar) ? saved.activeCar : DEFAULTS.activeCar,
      track: TRACK_IDS.includes(saved.track) ? saved.track : DEFAULTS.track,
      laps: [2, 3, 5].includes(saved.laps) ? saved.laps : DEFAULTS.laps,
      roadLaps: [1, 2, 3].includes(saved.roadLaps) ? saved.roadLaps : DEFAULTS.roadLaps,
      autoGas: typeof saved.autoGas === 'boolean' ? saved.autoGas : DEFAULTS.autoGas,
      quality: [0, 1, 2].includes(saved.quality) ? saved.quality : DEFAULTS.quality,
      upgrades: saved.upgrades && typeof saved.upgrades === 'object' ? saved.upgrades : {},
      coins: Number.isFinite(saved.coins) ? Math.max(0, saved.coins) : DEFAULTS.coins,
      paint: Number.isFinite(saved.paint) ? saved.paint : DEFAULTS.paint,
      bodyTier: Number.isFinite(saved.bodyTier) ? Math.max(0, Math.min(3, saved.bodyTier)) : DEFAULTS.bodyTier,
      completedRaces: Number.isFinite(saved.completedRaces) ? Math.max(0, saved.completedRaces) : DEFAULTS.completedRaces,
      careerXP: Number.isFinite(saved.careerXP) ? Math.max(0, Math.floor(saved.careerXP)) : DEFAULTS.careerXP,
      podiums: Number.isFinite(saved.podiums) ? Math.max(0, Math.floor(saved.podiums)) : DEFAULTS.podiums,
      cleanRaces: Number.isFinite(saved.cleanRaces) ? Math.max(0, Math.floor(saved.cleanRaces)) : DEFAULTS.cleanRaces,
      bestLaps: saved.bestLaps && typeof saved.bestLaps === 'object' && !Array.isArray(saved.bestLaps) ? saved.bestLaps : DEFAULTS.bestLaps,
      processedRaceKeys: Array.isArray(saved.processedRaceKeys) ? saved.processedRaceKeys.filter((x: unknown) => typeof x === 'string').slice(-250) : [],
      styles: Object.fromEntries(KNOWN.filter((id) => savedStyles[id]).map((id) => [id, cleanStyle(savedStyles[id], Number.isFinite(saved.paint) ? saved.paint : DEFAULTS.paint)])),
    };
  } catch { return DEFAULTS; }
}
// Serialize writes: fast consecutive purchases/rewards must not finish out of order and overwrite newer progress.
let saveQueue: Promise<void> = Promise.resolve();
export function saveApex(s: ApexSettings) {
  const { styles, ...rest } = s;
  const snapshot = JSON.stringify(rest), styleSnapshot = JSON.stringify(styles ?? {});
  saveQueue = saveQueue.then(() => SecureStore.setItemAsync(KEY, snapshot)).then(() => SecureStore.setItemAsync(STYLE_KEY, styleSnapshot)).then(() => undefined).catch(() => undefined);
  return saveQueue;
}
