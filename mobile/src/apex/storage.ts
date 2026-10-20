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
  track: string; // the track the next race runs on
  upgrades: Record<string, number[]>; // per car: engine, turbo, tyres, nitro levels
}
const KEY = 'apex.settings';
const TRACK_IDS = ['coast', 'dunes', 'city', 'pass'];
const KNOWN = ['cts', 'gt3', 'one1', 'chiron', 'mansory', 'senna'];
const DEFAULTS: ApexSettings = {
  tilt: true, invert: false, unlocked: 1, coins: 0,
  activeCar: 'cts', unlockedCars: ['cts'], paint: 0x2788ff,
  bodyTier: 0, completedRaces: 0, upgrades: {}, track: 'coast',
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
      upgrades: saved.upgrades && typeof saved.upgrades === 'object' ? saved.upgrades : {},
      coins: Number.isFinite(saved.coins) ? Math.max(0, saved.coins) : DEFAULTS.coins,
      paint: Number.isFinite(saved.paint) ? saved.paint : DEFAULTS.paint,
      bodyTier: Number.isFinite(saved.bodyTier) ? Math.max(0, Math.min(3, saved.bodyTier)) : DEFAULTS.bodyTier,
      completedRaces: Number.isFinite(saved.completedRaces) ? Math.max(0, saved.completedRaces) : DEFAULTS.completedRaces,
    };
  } catch { return DEFAULTS; }
}
export async function saveApex(s: ApexSettings) { try { await SecureStore.setItemAsync(KEY, JSON.stringify(s)); } catch { /* kept in memory */ } }
