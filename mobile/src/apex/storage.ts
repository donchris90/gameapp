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
}
const KEY = 'apex.settings';
const DEFAULTS: ApexSettings = {
  tilt: true, invert: false, unlocked: 1, coins: 0,
  activeCar: 'starter', unlockedCars: ['starter'], paint: 0x2788ff,
  bodyTier: 0, completedRaces: 0,
};

export async function loadApex(): Promise<ApexSettings> {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}');
    return {
      ...DEFAULTS,
      ...saved,
      unlockedCars: Array.isArray(saved.unlockedCars) ? saved.unlockedCars : DEFAULTS.unlockedCars,
      activeCar: typeof saved.activeCar === 'string' ? saved.activeCar : DEFAULTS.activeCar,
      coins: Number.isFinite(saved.coins) ? Math.max(0, saved.coins) : DEFAULTS.coins,
      paint: Number.isFinite(saved.paint) ? saved.paint : DEFAULTS.paint,
      bodyTier: Number.isFinite(saved.bodyTier) ? Math.max(0, Math.min(3, saved.bodyTier)) : DEFAULTS.bodyTier,
      completedRaces: Number.isFinite(saved.completedRaces) ? Math.max(0, saved.completedRaces) : DEFAULTS.completedRaces,
    };
  } catch { return DEFAULTS; }
}
export async function saveApex(s: ApexSettings) { try { await SecureStore.setItemAsync(KEY, JSON.stringify(s)); } catch { /* kept in memory */ } }
