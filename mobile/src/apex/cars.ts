import { CARS, MAX_UPGRADE, UPGRADE_KINDS, UPGRADE_STEP, carStats } from './sim';
import { registerCarFile } from './model';

/**
 * The garage. Names are the game's own (change them here). Prices are in coins, `level` is the career level that unlocks the car.
 * `files` are the 3D models made by tools/car-pipeline: a detailed one for the player's own car, a light one for the computer drivers.
 * A car with no files yet is shown as "model coming" and cannot be bought.
 */
export interface CatalogCar { id: string; name: string; tag: string; blurb: string; price: number; level: number; ready: boolean; rival: boolean }

export const CATALOG: CatalogCar[] = [
  { id: 'cts', name: 'Vanta CT', tag: 'Touring racer', blurb: 'Your first ride: a tough, easy-to-drive touring race car.', price: 0, level: 0, ready: true, rival: true },
  { id: 'gt3', name: 'Apex GT3', tag: 'GT racing', blurb: 'A track-bred GT car with a big wing and sharp turn-in.', price: 4000, level: 3, ready: true, rival: true },
  { id: 'one1', name: 'Halcyon One', tag: 'Hypercar', blurb: 'Light, wild and very fast in a straight line.', price: 12000, level: 8, ready: true, rival: true },
  { id: 'chiron', name: 'Aurelia S', tag: 'Hypercar', blurb: 'Carbon-bodied grand tourer with huge top speed.', price: 20000, level: 12, ready: true, rival: false },
  { id: 'mansory', name: 'Aurelia Noir', tag: 'Hypercar+', blurb: 'The tuned, wide-body version: more grip, more power.', price: 32000, level: 18, ready: true, rival: false },
  { id: 'senna', name: 'Meteor 25', tag: 'Flagship', blurb: 'The flagship. Model arriving soon.', price: 50000, level: 26, ready: false, rival: false },
];
export const catalogCar = (id: string) => CATALOG.find((c) => c.id === id) ?? CATALOG[0];

// the 3D files (Metro needs each path written out in full)
registerCarFile('cts', () => require('../../assets/cars/cts_hi.glb')); registerCarFile('cts_lo', () => require('../../assets/cars/cts_lo.glb'));
registerCarFile('gt3', () => require('../../assets/cars/gt3_hi.glb')); registerCarFile('gt3_lo', () => require('../../assets/cars/gt3_lo.glb'));
registerCarFile('one1', () => require('../../assets/cars/one1_hi.glb')); registerCarFile('one1_lo', () => require('../../assets/cars/one1_lo.glb'));
registerCarFile('chiron', () => require('../../assets/cars/chiron_hi.glb')); registerCarFile('chiron_lo', () => require('../../assets/cars/chiron_lo.glb'));
registerCarFile('mansory', () => require('../../assets/cars/mansory_hi.glb')); registerCarFile('mansory_lo', () => require('../../assets/cars/mansory_lo.glb'));
registerCarFile('hero', () => require('../../assets/cars/one1_hi.glb')); registerCarFile('rival', () => require('../../assets/cars/one1_lo.glb'));

/** Which light models the computer drivers can use (the lighter ones only). */
export const RIVAL_MODELS = CATALOG.filter((c) => c.rival).map((c) => `${c.id}_lo`);

// ---- upgrades ----
export const UPGRADE_INFO: Record<(typeof UPGRADE_KINDS)[number], { label: string; icon: string; unit: string; per: string; look: string }> = {
  engine: { label: 'Engine', icon: '🔧', unit: 'km/h', per: `+${Math.round(UPGRADE_STEP.engine * 3.6)} km/h top speed`, look: 'exhaust flames' },
  turbo: { label: 'Turbo', icon: '🌀', unit: '', per: '+ faster launch and recovery', look: 'turbo glow' },
  tyres: { label: 'Tyres', icon: '🛞', unit: '', per: '+ sharper steering', look: 'rim colour' },
  nitro: { label: 'Nitro', icon: '⚡', unit: 's', per: `+${UPGRADE_STEP.nitro.toFixed(2)} s of nitro`, look: 'flame colour' },
};
const COST = [500, 900, 1500, 2400, 3600];
/** Pricier cars cost more to upgrade. */
const FACTOR: Record<string, number> = { cts: 1, gt3: 1.5, one1: 2.2, chiron: 3, mansory: 4, senna: 5.5 };
export const upgradeCost = (carId: string, nextLevel: number) => Math.round((COST[Math.max(0, Math.min(MAX_UPGRADE, nextLevel) - 1)] * (FACTOR[carId] ?? 1)) / 50) * 50;

/** What the upgrades change on the car's look: an underglow colour from the total, and a nitro flame colour from the nitro level. */
export function lookFor(levels: number[] = []) {
  const total = levels.reduce((s, n) => s + (n || 0), 0);
  const glow = total >= 20 ? 0xffffff : total >= 16 ? 0xffc83d : total >= 12 ? 0xff3dd0 : total >= 8 ? 0x8a5cff : total >= 4 ? 0x2ee6ff : 0;
  const n = levels[3] ?? 0;
  const flame = [0x66ccff, 0x66ccff, 0x9be4ff, 0xa070ff, 0xff5cd0, 0xffd34d][Math.min(5, n)];
  return { glow, flame };
}

/** Largest stat across all cars fully upgraded: bars in the garage are drawn against this. */
export const STAT_MAX = (() => {
  const all = CATALOG.map((c) => carStats(c.id, [5, 5, 5, 5]));
  return { vmax: Math.max(...all.map((s) => s.vmax)), accel: Math.max(...all.map((s) => s.accel)), handling: Math.max(...all.map((s) => s.handling)), nitro: Math.max(...all.map((s) => s.nitroSeconds)) };
})();
export { CARS };
