import * as SecureStore from 'expo-secure-store';

export interface ApexSettings { tilt: boolean; invert: boolean; unlocked: number }
const KEY = 'apex.settings';
const DEFAULTS: ApexSettings = { tilt: true, invert: false, unlocked: 1 };

export async function loadApex(): Promise<ApexSettings> {
  try { return { ...DEFAULTS, ...JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}') }; } catch { return DEFAULTS; }
}
export async function saveApex(s: ApexSettings) { try { await SecureStore.setItemAsync(KEY, JSON.stringify(s)); } catch { /* kept in memory */ } }
