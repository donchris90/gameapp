import * as SecureStore from 'expo-secure-store';
import { CarStyle, cleanStyle } from './style';
import { STORY_MISSIONS } from './story';

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
  storyCompleted: string[]; // completed Chapter 1 story missions; defaults safely for existing saves
  storyNeedsDone: string[]; // story needs already paid for (licence, fuel, papers, installed parts)
  europeInvitationSeen: boolean; // the Europe invitation scene has been shown once
  lagosDriveRewardClaimed: boolean; // the free-drive completion reward is a one-time claim
  africaRegionsCompleted: string[]; // completed regional free-drive tours; rewards are one-time
  africaBestTimes: Record<string, number>; // best elapsed seconds for each regional drive
  africaChampionshipPoints: Record<string, number>; // best medal points earned per regional event, 1-3
  storyFuel: number; // persistent story-car fuel, 0-100
  storyCondition: number; // persistent story-car condition, 0-100
  storyTrust: number; // crew trust, 0-100
  storyEvidence: string[]; // clues recovered during the campaign
  storyChoices: Record<string, string>; // saved decisions keyed by mission/scene
  storyApproach: 'balanced' | 'speed' | 'grip' | 'reliability';
}
const KEY = 'apex.settings';
const STYLE_KEY = 'apex.styles'; // kept apart so a growing wardrobe never pushes the main settings over the secure store's size limit
const TRACK_IDS = ['circuit', 'coast', 'dunes', 'city', 'pass'];
const KNOWN = ['cts', 'gt3', 'one1', 'chiron', 'mansory', 'senna'];
const DEFAULTS: ApexSettings = {
  tilt: true, invert: false, unlocked: 1, coins: 0,
  activeCar: 'cts', unlockedCars: ['cts'], paint: 0x2788ff,
  bodyTier: 0, completedRaces: 0, careerXP: 0, podiums: 0, cleanRaces: 0, bestLaps: {}, processedRaceKeys: [], upgrades: {}, track: 'circuit', laps: 3, roadLaps: 1, autoGas: true, quality: 2, styles: {}, storyNeedsDone: [], europeInvitationSeen: false, storyCompleted: [], lagosDriveRewardClaimed: false, africaRegionsCompleted: [], africaBestTimes: {}, africaChampionshipPoints: {}, storyFuel: 100, storyCondition: 100, storyTrust: 50, storyEvidence: [], storyChoices: {}, storyApproach: 'balanced',
};

const pct = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d);
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
      storyCompleted: Array.isArray(saved.storyCompleted) ? Array.from(new Set(saved.storyCompleted.filter((x: unknown) => typeof x === 'string' && STORY_MISSIONS.some((m) => m.id === x)))) as string[] : [],
      storyFuel: pct(saved.storyFuel, 100), storyCondition: pct(saved.storyCondition, 100), storyTrust: pct(saved.storyTrust, 50),
      storyEvidence: Array.isArray(saved.storyEvidence) ? Array.from(new Set(saved.storyEvidence.filter((x: unknown) => typeof x === 'string'))).slice(0, 200) as string[] : [],
      storyChoices: saved.storyChoices && typeof saved.storyChoices === 'object' && !Array.isArray(saved.storyChoices) ? Object.fromEntries(Object.entries(saved.storyChoices).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
      storyApproach: ['balanced', 'speed', 'grip', 'reliability'].includes(saved.storyApproach) ? saved.storyApproach : 'balanced',
      storyNeedsDone: Array.isArray(saved.storyNeedsDone) ? saved.storyNeedsDone.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [],
      europeInvitationSeen: typeof saved.europeInvitationSeen === 'boolean' ? saved.europeInvitationSeen : false,
      lagosDriveRewardClaimed: typeof saved.lagosDriveRewardClaimed === 'boolean' ? saved.lagosDriveRewardClaimed : false,
      africaRegionsCompleted: Array.isArray(saved.africaRegionsCompleted) ? Array.from(new Set(saved.africaRegionsCompleted.filter((x: unknown) => typeof x === 'string' && ['accra', 'abidjan', 'dakar', 'nairobi', 'cairo', 'atlas', 'namib', 'victoria', 'cape', 'johannesburg'].includes(x)))) : [],
      africaBestTimes: saved.africaBestTimes && typeof saved.africaBestTimes === 'object' && !Array.isArray(saved.africaBestTimes) ? Object.fromEntries(Object.entries(saved.africaBestTimes).filter(([k, v]) => ['accra', 'abidjan', 'dakar', 'nairobi', 'cairo', 'atlas', 'namib', 'victoria', 'cape', 'johannesburg'].includes(k) && typeof v === 'number' && Number.isFinite(v) && v > 0)) : {},
      africaChampionshipPoints: saved.africaChampionshipPoints && typeof saved.africaChampionshipPoints === 'object' && !Array.isArray(saved.africaChampionshipPoints) ? Object.fromEntries(Object.entries(saved.africaChampionshipPoints).filter(([k, v]) => ['accra', 'abidjan', 'dakar', 'nairobi', 'cairo', 'atlas', 'namib', 'victoria', 'cape', 'johannesburg'].includes(k) && typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 3).map(([k, v]) => [k, Math.floor(v as number)])) : {},
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
