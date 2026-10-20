import * as SecureStore from 'expo-secure-store';

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
  upgrades: Record<string, number[]>; // per car: engine, turbo, tyres, nitro levels
}
const KEY = 'apex.settings';
const TRACK_IDS = ['circuit', 'coast', 'dunes', 'city', 'pass'];
const KNOWN = ['cts', 'gt3', 'one1', 'chiron', 'mansory', 'senna'];
const DEFAULTS: ApexSettings = {
  tilt: true, invert: false, unlocked: 1, coins: 0,
  activeCar: 'cts', unlockedCars: ['cts'], paint: 0x2788ff,
  bodyTier: 0, completedRaces: 0, careerXP: 0, podiums: 0, cleanRaces: 0, bestLaps: {}, processedRaceKeys: [], upgrades: {}, track: 'circuit', laps: 3,
};

export async function loadApex(): Promise<ApexSettings> {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}');
    return {
      ...DEFAULTS,
      ...saved,
      // cars from the very first build (starter, sport...) are gone: keep only cars that exist, and always own the first
      unlockedCars: Array.from(new Set(['cts', ...(Array.isArray(saved.unlockedCars) ? saved.unlockedCars : []).filter((id: string) => KNOWN.includes(id))])),
      activeCar: typeof saved.activeCar === 'string' && KNOWN.includes(saved.activeCar) ? saved.activeCar : DEFAULTS.activeCar,
      track: TRACK_IDS.includes(saved.track) ? saved.track : DEFAULTS.track,
      laps: [2, 3, 5].includes(saved.laps) ? saved.laps : DEFAULTS.laps,
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
    };
  } catch { return DEFAULTS; }
}
// Serialize writes: fast consecutive purchases/rewards must not finish out of order and overwrite newer progress.
let saveQueue: Promise<void> = Promise.resolve();
export function saveApex(s: ApexSettings) {
  const snapshot = JSON.stringify(s);
  saveQueue = saveQueue.then(() => SecureStore.setItemAsync(KEY, snapshot)).then(() => undefined).catch(() => undefined);
  return saveQueue;
}
