import type { useIAP as RealUseIAP } from 'expo-iap';

// The store module only exists in a development or production build. In Expo Go it cannot load,
// so fall back to a stand-in that reports "not connected" instead of crashing the app.
let mod: { useIAP: typeof RealUseIAP } | null = null;
try { mod = require('expo-iap'); } catch { mod = null; }

const stub = ((): any => ({
  connected: false, products: [], availablePurchases: [],
  fetchProducts: async () => undefined, getAvailablePurchases: async () => undefined,
  finishTransaction: async () => undefined, requestPurchase: async () => undefined,
})) as unknown as typeof RealUseIAP;

export const useIAP: typeof RealUseIAP = mod?.useIAP ?? stub;
